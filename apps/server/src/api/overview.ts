import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { addDays, isValidDate, zonedToUtc } from "../lib/time.js";
import { getTenant } from "../scheduling/service.js";

const params = z.object({ tenantId: z.string().uuid() });
const date = z.string().refine(isValidDate, "data no formato AAAA-MM-DD");
const MAX_RANGE_DAYS = 100;

/** "Início": the numbers of a period, the Lia's share of the work and what is still missing to set up. */
export function registerOverviewRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/overview", async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const { from, to } = z.object({ from: date, to: date }).parse(request.query);
    if (to < from || to > addDays(from, MAX_RANGE_DAYS)) {
      return reply.code(400).send({ error: "invalid_range", message: `Período de até ${MAX_RANGE_DAYS} dias.` });
    }
    const tenant = await getTenant(sql, tenantId);
    if (!tenant) return reply.code(404).send({ error: "not_found" });
    const start = zonedToUtc(from, "00:00", tenant.timezone);
    const end = zonedToUtc(addDays(to, 1), "00:00", tenant.timezone);

    const [appointments] = await sql<
      {
        total: number;
        scheduled: number;
        confirmed: number;
        completed: number;
        noShow: number;
        cancelled: number;
        valueCents: number;
      }[]
    >`
      select count(*)::int as total,
             count(*) filter (where a.status = 'scheduled')::int as scheduled,
             count(*) filter (where a.status = 'confirmed')::int as confirmed,
             count(*) filter (where a.status = 'completed')::int as completed,
             count(*) filter (where a.status = 'no_show')::int as no_show,
             count(*) filter (where a.status = 'cancelled')::int as cancelled,
             coalesce(sum(s.price_cents) filter (where a.status = 'completed'), 0)::int as value_cents
      from appointments a
      join services s on s.id = a.service_id
      where a.tenant_id = ${tenantId} and a.starts_at >= ${start} and a.starts_at < ${end}
    `;

    const [assistant] = await sql<{ booked: number; conversations: number; withTeam: number }[]>`
      select (select count(*)::int from appointments
              where tenant_id = ${tenantId} and source = 'whatsapp' and created_at >= ${start} and created_at < ${end}) as booked,
             (select count(distinct conversation_id)::int from messages
              where tenant_id = ${tenantId} and created_at >= ${start} and created_at < ${end}) as conversations,
             (select count(*)::int from conversations where tenant_id = ${tenantId} and state = 'human') as with_team
    `;

    const [customers] = await sql<{ total: number; added: number }[]>`
      select count(*)::int as total, count(*) filter (where created_at >= ${start} and created_at < ${end})::int as added
      from customers where tenant_id = ${tenantId}
    `;

    const [pending] = await sql<{ count: number }[]>`
      select count(*)::int as count from appointments
      where tenant_id = ${tenantId} and status = 'scheduled' and starts_at > now()
    `;

    // What is still missing to start (the checklist disappears when everything is done).
    const [setup] = await sql<{ services: number; professionals: number; hours: number; appointments: number; whatsapp: boolean }[]>`
      select (select count(*)::int from services where tenant_id = ${tenantId} and active and archived_at is null) as services,
             (select count(*)::int from professionals where tenant_id = ${tenantId} and active and kind = 'professional') as professionals,
             (select count(*)::int from business_hours where tenant_id = ${tenantId}) as hours,
             (select count(*)::int from appointments where tenant_id = ${tenantId}) as appointments,
             (select whatsapp_number is not null from tenants where id = ${tenantId}) as whatsapp
    `;

    return { appointments, assistant, customers, pending: pending?.count ?? 0, setup };
  });
}
