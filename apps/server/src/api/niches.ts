import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { listNiches } from "../tenants/niches.js";
import { slugify } from "./panel.js";

const starterService = z.object({
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).nullable(),
});
const starterHour = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((row) => row.closesAt > row.opensAt, "o fechamento deve ser depois da abertura");

const nicheBody = z.object({
  label: z.string().trim().min(1).max(60),
  place: z.string().trim().min(1).max(40),
  customerWord: z.enum(["cliente", "paciente"]),
  starterServices: z.array(starterService).max(20),
  starterHours: z.array(starterHour).max(14),
});

const itemParams = z.object({ id: z.string().uuid() });
const NICHE_COLUMNS = ["id", "slug", "label", "place", "customer_word", "starter_services", "starter_hours"];

/**
 * Niches (used to seed a new client's services/hours and to tell the
 * assistant how to talk about the place). The list is public (the panel
 * needs it for every tenant's "Nicho" field); creating, editing and
 * deleting is agency-only.
 */
export function registerNicheRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/niches", async () => listNiches(sql));

  app.post("/api/niches", { config: { adminOnly: true } }, async (request, reply) => {
    const body = nicheBody.parse(request.body);
    const base = slugify(body.label);
    const taken = new Set(
      (await sql<{ slug: string }[]>`select slug from niches where slug like ${`${base}%`}`).map((row) => row.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

    const [niche] = await sql`
      insert into niches (slug, label, place, customer_word, starter_services, starter_hours)
      values (${slug}, ${body.label}, ${body.place}, ${body.customerWord},
              ${sql.json(body.starterServices)}, ${sql.json(body.starterHours)})
      returning ${sql(NICHE_COLUMNS)}
    `;
    return reply.code(201).send(niche);
  });

  // Full body on purpose (like the FAQ edit): the slug never changes, since
  // tenants.business_type points at it.
  app.patch("/api/niches/:id", { config: { adminOnly: true } }, async (request, reply) => {
    const { id } = itemParams.parse(request.params);
    const body = nicheBody.parse(request.body);
    const [niche] = await sql`
      update niches
      set label = ${body.label}, place = ${body.place}, customer_word = ${body.customerWord},
          starter_services = ${sql.json(body.starterServices)}, starter_hours = ${sql.json(body.starterHours)}
      where id = ${id}
      returning ${sql(NICHE_COLUMNS)}
    `;
    return niche ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/niches/:id", { config: { adminOnly: true } }, async (request, reply) => {
    const { id } = itemParams.parse(request.params);
    try {
      const deleted = await sql`delete from niches where id = ${id} returning id`;
      return deleted.length ? { deleted: true } : reply.code(404).send({ error: "not_found" });
    } catch (error) {
      // Foreign key: some client still uses this niche.
      if ((error as { code?: string }).code === "23503") {
        return reply.code(409).send({
          error: "niche_in_use",
          message: "Tem negócio cadastrado com este nicho. Troque o nicho dele antes de excluir.",
        });
      }
      throw error;
    }
  });
}
