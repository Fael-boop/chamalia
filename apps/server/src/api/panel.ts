import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { addDays, isValidDate, zonedToUtc } from "../lib/time.js";
import { getTenant, type Tenant } from "../scheduling/service.js";

const uuid = z.string().uuid();
const phone = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,15}$/, "telefone com DDI e DDD, só números"));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato HH:MM");

const tenantParams = z.object({ tenantId: uuid });
const itemParams = tenantParams.extend({ id: uuid });

const tenantPatch = z
  .object({
    name: z.string().trim().min(1),
    assistantName: z.string().trim().min(1).max(40),
    ownerName: z.string().trim().max(80).nullable(),
    ownerPhone: phone.nullable(),
  })
  .partial();

const serviceBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().default(null),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).nullable().default(null),
  active: z.boolean().default(true),
});

const hoursBody = z.array(
  z
    .object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time })
    .refine((row) => row.closesAt > row.opensAt, "o fechamento deve ser depois da abertura"),
);

const appointmentPatch = z.object({
  status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]),
});

export function registerPanelRoutes(app: FastifyInstance, sql: Sql) {
  async function loadTenant(tenantId: string, reply: FastifyReply): Promise<Tenant | undefined> {
    const tenant = await getTenant(sql, tenantId);
    if (!tenant) void reply.code(404).send({ error: "not_found", message: "Cliente não encontrado." });
    return tenant;
  }

  app.get("/api/tenants", async () => {
    return sql`select id, slug, name from tenants order by name`;
  });

  app.get("/api/tenants/:tenantId", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    return loadTenant(tenantId, reply);
  });

  app.patch("/api/tenants/:tenantId", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const changes = tenantPatch.parse(request.body);
    if (Object.keys(changes).length === 0) return loadTenant(tenantId, reply);
    const [tenant] = await sql`
      update tenants set ${sql(changes)} where id = ${tenantId}
      returning id, slug, name, assistant_name, business_type, timezone, owner_name, owner_phone, active
    `;
    return tenant ?? reply.code(404).send({ error: "not_found" });
  });

  app.get("/api/tenants/:tenantId/services", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select id, name, description, duration_minutes, price_cents, active
      from services where tenant_id = ${tenantId} order by active desc, name
    `;
  });

  app.post("/api/tenants/:tenantId/services", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = serviceBody.parse(request.body);
    const service = await sql.begin(async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        insert into services ${tx({ tenantId, ...body })}
        returning id, name, description, duration_minutes, price_cents, active
      `;
      // New services are offered by every active professional for now.
      await tx`
        insert into professional_services (tenant_id, professional_id, service_id)
        select ${tenantId}, id, ${created!.id} from professionals where tenant_id = ${tenantId} and active
      `;
      return created;
    });
    return reply.code(201).send(service);
  });

  app.patch("/api/tenants/:tenantId/services/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const changes = serviceBody.partial().parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [service] = await sql`
      update services set ${sql(changes)} where tenant_id = ${tenantId} and id = ${id}
      returning id, name, description, duration_minutes, price_cents, active
    `;
    return service ?? reply.code(404).send({ error: "not_found" });
  });

  app.get("/api/tenants/:tenantId/professionals", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`select id, name, active from professionals where tenant_id = ${tenantId} order by name`;
  });

  app.get("/api/tenants/:tenantId/business-hours", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select weekday, to_char(opens_at, 'HH24:MI') as opens_at, to_char(closes_at, 'HH24:MI') as closes_at
      from business_hours where tenant_id = ${tenantId} and professional_id is null
      order by weekday, opens_at
    `;
  });

  // Replaces the whole weekly schedule of the business (not per professional).
  app.put("/api/tenants/:tenantId/business-hours", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const rows = hoursBody.parse(request.body);
    await sql.begin(async (tx) => {
      await tx`delete from business_hours where tenant_id = ${tenantId} and professional_id is null`;
      if (rows.length > 0) {
        await tx`
          insert into business_hours ${tx(
            rows.map((row) => ({ tenantId, ...row })),
            "tenantId",
            "weekday",
            "opensAt",
            "closesAt",
          )}
        `;
      }
    });
    return { saved: rows.length };
  });

  app.get("/api/tenants/:tenantId/appointments", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { date } = z.object({ date: z.string().refine(isValidDate, "data no formato AAAA-MM-DD") }).parse(
      request.query,
    );
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    const dayStart = zonedToUtc(date, "00:00", tenant.timezone);
    const dayEnd = zonedToUtc(addDays(date, 1), "00:00", tenant.timezone);
    return sql`
      select a.id, a.starts_at, a.ends_at, a.status, a.source, a.notes,
             c.name as customer_name, c.phone as customer_phone,
             s.name as service_name, p.name as professional_name
      from appointments a
      join customers c on c.id = a.customer_id
      join services s on s.id = a.service_id
      join professionals p on p.id = a.professional_id
      where a.tenant_id = ${tenantId} and a.starts_at >= ${dayStart} and a.starts_at < ${dayEnd}
      order by a.starts_at, p.name
    `;
  });

  app.patch("/api/tenants/:tenantId/appointments/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const { status } = appointmentPatch.parse(request.body);
    try {
      const [appointment] = await sql`
        update appointments
        set status = ${status}, cancelled_at = ${status === "cancelled" ? sql`now()` : null}
        where tenant_id = ${tenantId} and id = ${id}
        returning id, status
      `;
      return appointment ?? reply.code(404).send({ error: "not_found" });
    } catch (error) {
      // Reactivating a cancelled appointment whose slot was taken meanwhile.
      if ((error as { code?: string }).code === "23P01") {
        return reply.code(409).send({ error: "slot_taken", message: "Esse horário já foi ocupado por outro agendamento." });
      }
      throw error;
    }
  });
}
