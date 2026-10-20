import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { connectTenantWhatsapp, type WhatsappSetup } from "../channels/evolution-setup.js";
import type { Sql } from "../db/client.js";
import { isOwner } from "./auth.js";
import { getTenant, TENANT_COLUMNS, type Tenant } from "../scheduling/service.js";
import { BUSINESS_TYPES, NICHES, nicheOf, STARTER_HOURS } from "../tenants/niches.js";

const uuid = z.string().uuid();
const phone = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,15}$/, "telefone com DDI e DDD, só números"));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato HH:MM");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

const tenantParams = z.object({ tenantId: uuid });
const itemParams = tenantParams.extend({ id: uuid });

const tenantFields = z.object({
  name: z.string().trim().min(1).max(80),
  businessType: z.enum(BUSINESS_TYPES),
  assistantName: z.string().trim().min(1).max(40),
  ownerName: optionalText(80),
  ownerPhone: phone.nullable(),
  address: optionalText(200),
  tone: z.enum(["friendly", "formal"]),
  useEmoji: z.boolean(),
  extraInfo: optionalText(2000),
  handoffRules: optionalText(1000),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingHorizonDays: z.number().int().min(1).max(365),
  active: z.boolean(),
});

const tenantCreate = tenantFields
  .pick({ name: true, businessType: true, assistantName: true, ownerName: true, ownerPhone: true, address: true })
  .partial({ assistantName: true, ownerName: true, ownerPhone: true, address: true });

const serviceBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().default(null),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).nullable().default(null),
  active: z.boolean().default(true),
});

const professionalBody = z.object({ name: z.string().trim().min(1).max(80), active: z.boolean().default(true) });

const hoursQuery = z.object({ professionalId: uuid.optional() });
const hoursBody = z.array(
  z
    .object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time })
    .refine((row) => row.closesAt > row.opensAt, "o fechamento deve ser depois da abertura"),
);

const appointmentPatch = z.object({
  status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]),
});

/** "Salão da Ana!" -> "salao-da-ana" */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cliente"
  );
}

export function registerPanelRoutes(app: FastifyInstance, sql: Sql, whatsapp?: WhatsappSetup) {
  async function loadTenant(tenantId: string, reply: FastifyReply): Promise<Tenant | undefined> {
    const tenant = await getTenant(sql, tenantId);
    if (!tenant) void reply.code(404).send({ error: "not_found", message: "Cliente não encontrado." });
    return tenant;
  }

  app.get("/api/niches", async () =>
    BUSINESS_TYPES.map((value) => ({ value, label: NICHES[value].label })),
  );

  // --- Clients (tenants) ---

  app.get("/api/tenants", { config: { adminOnly: true } }, async () => {
    return sql`
      select t.id, t.slug, t.name, t.business_type, t.owner_name, t.active, t.whatsapp_instance,
             (select count(*)::int from appointments a
              where a.tenant_id = t.id and a.status in ('scheduled', 'confirmed') and a.starts_at > now()) as upcoming
      from tenants t order by t.active desc, t.name
    `;
  });

  // New client with the niche's starter services, one professional and starter hours.
  app.post("/api/tenants", { config: { adminOnly: true } }, async (request, reply) => {
    const body = tenantCreate.parse(request.body);
    const niche = nicheOf(body.businessType);
    const tenant = await sql.begin(async (tx) => {
      const base = slugify(body.name);
      const taken = new Set(
        (await tx<{ slug: string }[]>`select slug from tenants where slug like ${`${base}%`}`).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      const [created] = await tx<{ id: string }[]>`
        insert into tenants ${tx({
          slug,
          name: body.name,
          businessType: body.businessType,
          assistantName: body.assistantName ?? "Lia",
          ownerName: body.ownerName ?? null,
          ownerPhone: body.ownerPhone ?? null,
          address: body.address ?? null,
        })}
        returning id
      `;
      const tenantId = created!.id;

      const [professional] = await tx<{ id: string }[]>`
        insert into professionals (tenant_id, name) values (${tenantId}, ${body.ownerName || "Profissional 1"})
        returning id
      `;
      if (niche.services.length > 0) {
        const services = await tx<{ id: string }[]>`
          insert into services ${tx(
            niche.services.map((service) => ({ tenantId, ...service })),
            "tenantId",
            "name",
            "durationMinutes",
            "priceCents",
          )}
          returning id
        `;
        await tx`
          insert into professional_services ${tx(
            services.map((service) => ({ tenantId, professionalId: professional!.id, serviceId: service.id })),
            "tenantId",
            "professionalId",
            "serviceId",
          )}
        `;
      }
      await tx`
        insert into business_hours ${tx(
          STARTER_HOURS.map((row) => ({ tenantId, ...row })),
          "tenantId",
          "weekday",
          "opensAt",
          "closesAt",
        )}
      `;
      return getTenant(tx as unknown as Sql, tenantId);
    });
    return reply.code(201).send(tenant);
  });

  app.get("/api/tenants/:tenantId", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    return loadTenant(tenantId, reply);
  });

  app.patch("/api/tenants/:tenantId", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const changes = tenantFields.partial().parse(request.body);
    // Only the agency turns a client on or off.
    if (isOwner(request)) delete changes.active;
    if (Object.keys(changes).length === 0) return loadTenant(tenantId, reply);
    const [tenant] = await sql`
      update tenants set ${sql(changes)} where id = ${tenantId} returning ${sql(TENANT_COLUMNS)}
    `;
    return tenant ?? reply.code(404).send({ error: "not_found" });
  });

  // --- Services ---

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
      // New services start offered by every active professional; adjust in "Profissionais".
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

  // --- Professionals ---

  app.get("/api/tenants/:tenantId/professionals", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select p.id, p.name, p.active,
             coalesce(array_agg(ps.service_id) filter (where ps.service_id is not null), '{}') as service_ids
      from professionals p
      left join professional_services ps on ps.professional_id = p.id
      where p.tenant_id = ${tenantId}
      group by p.id order by p.active desc, p.name
    `;
  });

  app.post("/api/tenants/:tenantId/professionals", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = professionalBody.parse(request.body);
    const professional = await sql.begin(async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        insert into professionals ${tx({ tenantId, ...body })} returning id, name, active
      `;
      // Starts doing every active service; adjust with the checkboxes.
      await tx`
        insert into professional_services (tenant_id, professional_id, service_id)
        select ${tenantId}, ${created!.id}, id from services where tenant_id = ${tenantId} and active
      `;
      return created;
    });
    return reply.code(201).send(professional);
  });

  app.patch("/api/tenants/:tenantId/professionals/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const changes = professionalBody.partial().parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [professional] = await sql`
      update professionals set ${sql(changes)} where tenant_id = ${tenantId} and id = ${id}
      returning id, name, active
    `;
    return professional ?? reply.code(404).send({ error: "not_found" });
  });

  // Replaces which services this professional performs.
  app.put("/api/tenants/:tenantId/professionals/:id/services", async (request) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const serviceIds = z.array(uuid).parse(request.body);
    await sql.begin(async (tx) => {
      await tx`delete from professional_services where tenant_id = ${tenantId} and professional_id = ${id}`;
      if (serviceIds.length > 0) {
        await tx`
          insert into professional_services (tenant_id, professional_id, service_id)
          select ${tenantId}, ${id}, s.id from services s where s.tenant_id = ${tenantId} and s.id in ${tx(serviceIds)}
        `;
      }
    });
    return { saved: serviceIds.length };
  });

  // --- Business hours ---

  // Without professionalId: the business schedule. With it: that professional's own
  // schedule; empty means she follows the business schedule.
  app.get("/api/tenants/:tenantId/business-hours", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { professionalId } = hoursQuery.parse(request.query);
    return sql`
      select weekday, to_char(opens_at, 'HH24:MI') as opens_at, to_char(closes_at, 'HH24:MI') as closes_at
      from business_hours
      where tenant_id = ${tenantId}
        and ${professionalId ? sql`professional_id = ${professionalId}` : sql`professional_id is null`}
      order by weekday, opens_at
    `;
  });

  // Replaces the whole weekly schedule (of the business or of one professional).
  app.put("/api/tenants/:tenantId/business-hours", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { professionalId = null } = hoursQuery.parse(request.query);
    const rows = hoursBody.parse(request.body);
    await sql.begin(async (tx) => {
      await tx`
        delete from business_hours
        where tenant_id = ${tenantId}
          and ${professionalId ? tx`professional_id = ${professionalId}` : tx`professional_id is null`}
      `;
      if (rows.length > 0) {
        await tx`
          insert into business_hours ${tx(
            rows.map((row) => ({ tenantId, professionalId, ...row })),
            "tenantId",
            "professionalId",
            "weekday",
            "opensAt",
            "closesAt",
          )}
        `;
      }
    });
    return { saved: rows.length };
  });

  // --- Agenda ---

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

  // --- WhatsApp (Evolution) ---

  app.get("/api/tenants/:tenantId/whatsapp", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    if (!whatsapp) return { available: false, instance: tenant.whatsappInstance, state: "unknown" };
    if (!tenant.whatsappInstance) return { available: true, instance: null, state: "close" };
    try {
      const state = await whatsapp.evolution.connectionState(tenant.whatsappInstance);
      return { available: true, instance: tenant.whatsappInstance, state };
    } catch (error) {
      request.log.warn({ err: error, tenantId }, "evolution unreachable");
      return { available: false, instance: tenant.whatsappInstance, state: "unknown" };
    }
  });

  // Creates/updates the instance and returns the QR code while not connected.
  app.post("/api/tenants/:tenantId/whatsapp/connect", { config: { adminOnly: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    if (!whatsapp) {
      return reply.code(503).send({
        error: "whatsapp_unavailable",
        message: "Evolution não configurada. Confira o .env e se o Docker está rodando.",
      });
    }
    return connectTenantWhatsapp(sql, whatsapp, tenant);
  });
}
