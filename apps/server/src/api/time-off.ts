import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { addDays, isValidDate, utcToZoned, zonedToUtc } from "../lib/time.js";
import { getTenant } from "../scheduling/service.js";

const tenantParams = z.object({ tenantId: z.string().uuid() });
const itemParams = tenantParams.extend({ id: z.string().uuid() });
const date = z.string().refine(isValidDate, "data inválida");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato HH:MM");

const body = z
  .object({
    /** null = the whole business. */
    professionalId: z.string().uuid().nullable(),
    startDate: date,
    endDate: date,
    /** All day: from the start of startDate to the end of endDate. Otherwise the times apply to every day of the range. */
    allDay: z.boolean(),
    startTime: time.optional(),
    endTime: time.optional(),
    reason: z.string().trim().max(120).nullable().optional(),
  })
  .refine((row) => row.endDate >= row.startDate, { message: "a data final deve ser igual ou depois da inicial", path: ["endDate"] })
  .refine((row) => row.allDay || (row.startTime && row.endTime && row.endTime > row.startTime), {
    message: "informe o horário de início e um fim depois dele",
    path: ["endTime"],
  });

/** Closures, holidays and a professional's absences ("Folgas e feriados"). The availability search already skips them. */
export function registerTimeOffRoutes(app: FastifyInstance, sql: Sql) {
  // Current and future blocks (what is already over is not worth listing).
  app.get("/api/tenants/:tenantId/time-off", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select t.id, t.professional_id, p.name as professional_name, t.starts_at, t.ends_at, t.reason
      from time_off t
      left join professionals p on p.id = t.professional_id and p.tenant_id = t.tenant_id
      where t.tenant_id = ${tenantId} and t.ends_at > now()
      order by t.starts_at
    `;
  });

  app.post("/api/tenants/:tenantId/time-off", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const input = body.parse(request.body);
    const tenant = await getTenant(sql, tenantId);
    if (!tenant) return reply.code(404).send({ error: "not_found" });

    if (input.professionalId) {
      const [found] = await sql`select 1 from professionals where id = ${input.professionalId} and tenant_id = ${tenantId} and kind = 'professional'`;
      if (!found) return reply.code(400).send({ error: "invalid", message: "Profissional não encontrado." });
    }

    // A range of days with times (e.g. 14h-16h from Mon to Wed) becomes one block per day.
    const blocks: { startsAt: Date; endsAt: Date }[] = [];
    if (input.allDay) {
      blocks.push({
        startsAt: zonedToUtc(input.startDate, "00:00", tenant.timezone),
        endsAt: zonedToUtc(addDays(input.endDate, 1), "00:00", tenant.timezone),
      });
    } else {
      for (let day = input.startDate; day <= input.endDate; day = addDays(day, 1)) {
        blocks.push({
          startsAt: zonedToUtc(day, input.startTime!, tenant.timezone),
          endsAt: zonedToUtc(day, input.endTime!, tenant.timezone),
        });
        if (blocks.length > 60) return reply.code(400).send({ error: "invalid", message: "No máximo 60 dias de uma vez." });
      }
    }

    const created = await sql.begin(async (tx) => {
      await tx`
        insert into time_off ${tx(
          blocks.map((block) => ({ tenantId, professionalId: input.professionalId, ...block, reason: input.reason || null })),
          "tenantId",
          "professionalId",
          "startsAt",
          "endsAt",
          "reason",
        )}
      `;
      // Appointments already inside the block stay (the owner decides); the panel warns about them.
      let affected = 0;
      for (const block of blocks) {
        const [row] = await tx<{ count: number }[]>`
          select count(*)::int as count from appointments
          where tenant_id = ${tenantId} and status in ('scheduled', 'confirmed')
            and starts_at < ${block.endsAt} and ends_at > ${block.startsAt}
            ${input.professionalId ? tx`and professional_id = ${input.professionalId}` : tx``}
        `;
        affected += row?.count ?? 0;
      }
      return affected;
    });
    reply.code(201);
    return { saved: blocks.length, affectedAppointments: created, firstDate: utcToZoned(blocks[0]!.startsAt, tenant.timezone).date };
  });

  app.delete("/api/tenants/:tenantId/time-off/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const rows = await sql`delete from time_off where id = ${id} and tenant_id = ${tenantId} returning id`;
    if (rows.length === 0) return reply.code(404).send({ error: "not_found" });
    return { deleted: true };
  });
}
