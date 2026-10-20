import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { addDays, isValidDate, utcToZoned, zonedToUtc } from "../lib/time.js";
import {
  findAvailableSlots,
  getTenant,
  rescheduleAppointment,
  SchedulingError,
  type Tenant,
} from "../scheduling/service.js";

const uuid = z.string().uuid();
const date = z.string().refine(isValidDate, "data no formato AAAA-MM-DD");
const tenantParams = z.object({ tenantId: uuid });
const itemParams = tenantParams.extend({ id: uuid });
const MAX_RANGE_DAYS = 42;

/** Agenda (range), free slots, rescheduling and the business's customers. */
export function registerAgendaRoutes(app: FastifyInstance, sql: Sql) {
  async function loadTenant(tenantId: string, reply: FastifyReply): Promise<Tenant | undefined> {
    const tenant = await getTenant(sql, tenantId);
    if (!tenant) void reply.code(404).send({ error: "not_found", message: "Cliente não encontrado." });
    return tenant;
  }

  const schedulingError = (reply: FastifyReply, error: unknown) => {
    if (error instanceof SchedulingError) {
      const status = error.code === "appointment_not_found" || error.code === "service_not_found" ? 404 : 409;
      return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
  };

  // ?date=AAAA-MM-DD for one day, or ?from=…&to=… (inclusive) for a range.
  app.get("/api/tenants/:tenantId/appointments", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const query = z
      .object({ date: date.optional(), from: date.optional(), to: date.optional() })
      .refine((q) => q.date || (q.from && q.to), "informe date, ou from e to")
      .parse(request.query);
    const from = query.date ?? query.from!;
    const to = query.date ?? query.to!;
    if (to < from || to > addDays(from, MAX_RANGE_DAYS)) {
      return reply.code(400).send({ error: "invalid_range", message: `Período de até ${MAX_RANGE_DAYS} dias.` });
    }
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    const start = zonedToUtc(from, "00:00", tenant.timezone);
    const end = zonedToUtc(addDays(to, 1), "00:00", tenant.timezone);
    return sql`
      select a.id, a.starts_at, a.ends_at, a.status, a.source, a.notes, a.created_at,
             a.customer_id, c.name as customer_name, c.phone as customer_phone,
             a.service_id, s.name as service_name, s.price_cents,
             a.professional_id, p.name as professional_name
      from appointments a
      join customers c on c.id = a.customer_id
      join services s on s.id = a.service_id
      join professionals p on p.id = a.professional_id
      where a.tenant_id = ${tenantId} and a.starts_at >= ${start} and a.starts_at < ${end}
      order by a.starts_at, p.name
    `;
  });

  app.get("/api/tenants/:tenantId/availability", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const query = z
      .object({ serviceId: uuid, date, professionalId: uuid.optional(), excludeAppointmentId: uuid.optional() })
      .parse(request.query);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    try {
      const { slots } = await findAvailableSlots(sql, tenant, query);
      return slots.map((slot) => ({
        time: utcToZoned(slot.startsAt, tenant.timezone).time,
        startsAt: slot.startsAt,
        professionals: slot.professionals,
      }));
    } catch (error) {
      return schedulingError(reply, error);
    }
  });

  app.post("/api/tenants/:tenantId/appointments/:id/reschedule", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = z
      .object({ date, time: z.string().regex(/^\d{2}:\d{2}$/), professionalId: uuid })
      .parse(request.body);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    try {
      return await rescheduleAppointment(sql, tenant, { appointmentId: id, ...body });
    } catch (error) {
      return schedulingError(reply, error);
    }
  });

  // --- Customers of the business ---

  app.get("/api/tenants/:tenantId/customers", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { search } = z.object({ search: z.string().trim().max(80).optional() }).parse(request.query);
    const digits = search?.replace(/\D/g, "");
    // Name contains the text, or phone contains the digits typed.
    const filter = search
      ? sql`and (c.name ilike ${`%${search}%`} ${digits ? sql`or c.phone like ${`%${digits}%`}` : sql``})`
      : sql``;
    return sql`
      select c.id, c.name, c.phone, c.created_at,
             count(a.id) filter (where a.status in ('completed', 'confirmed', 'scheduled') and a.starts_at < now())::int as visits,
             max(a.starts_at) filter (where a.starts_at < now() and a.status <> 'cancelled') as last_visit,
             min(a.starts_at) filter (where a.starts_at >= now() and a.status in ('scheduled', 'confirmed')) as next_appointment
      from customers c
      left join appointments a on a.customer_id = c.id
      where c.tenant_id = ${tenantId} ${filter}
      group by c.id
      order by next_appointment nulls last, last_visit desc nulls last, c.name
      limit 200
    `;
  });

  app.get("/api/tenants/:tenantId/customers/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const [customer] = await sql`
      select id, name, phone, created_at from customers where tenant_id = ${tenantId} and id = ${id}
    `;
    if (!customer) return reply.code(404).send({ error: "not_found" });
    const appointments = await sql`
      select a.id, a.starts_at, a.ends_at, a.status, s.name as service_name, p.name as professional_name
      from appointments a
      join services s on s.id = a.service_id
      join professionals p on p.id = a.professional_id
      where a.tenant_id = ${tenantId} and a.customer_id = ${id}
      order by a.starts_at desc limit 50
    `;
    return { ...customer, appointments };
  });
}
