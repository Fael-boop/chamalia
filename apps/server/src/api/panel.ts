import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { EvolutionError } from "../channels/evolution.js";
import { connectTenantWhatsapp, syncConnectedNumber, type WhatsappSetup } from "../channels/evolution-setup.js";
import type { Sql } from "../db/client.js";
import { withCountryCode } from "../lib/phone.js";
import { isOwner } from "./auth.js";
import { getTenant, TENANT_COLUMNS, type Tenant } from "../scheduling/service.js";
import { getNicheBySlug } from "../tenants/niches.js";

const uuid = z.string().uuid();
const phone = z
  .string()
  // A Brazilian number typed without 55 gets it, so WhatsApp notices reach it.
  .transform(withCountryCode)
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
  businessType: z.string().trim().min(1).max(60),
  assistantName: z.string().trim().min(1).max(40),
  ownerName: optionalText(80),
  ownerPhone: phone.nullable(),
  address: optionalText(200),
  addressNeighborhood: optionalText(80),
  addressCity: optionalText(80),
  locationUrl: optionalText(500).refine((v) => !v || /^https?:\/\//.test(v), "link precisa começar com http:// ou https://"),
  tone: z.enum(["friendly", "formal"]),
  useEmoji: z.boolean(),
  extraInfo: optionalText(2000),
  defaultHandoffProfessionalId: uuid.nullable(),
  handoffReturnHours: z.number().int().min(1).max(168),
  minNoticeMinutes: z.number().int().min(0).max(10080),
  bookingHorizonDays: z.number().int().min(1).max(365),
  active: z.boolean(),
});

const tenantCreate = tenantFields
  .pick({
    name: true,
    businessType: true,
    assistantName: true,
    ownerName: true,
    ownerPhone: true,
    address: true,
    addressNeighborhood: true,
    addressCity: true,
  })
  .partial({ assistantName: true, ownerName: true, ownerPhone: true, address: true, addressNeighborhood: true, addressCity: true });

// No defaults here: a PATCH must only touch the fields it sends.
const serviceFields = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).nullable(),
  active: z.boolean(),
  handoff: z.boolean(),
  handoffReason: optionalText(300),
  handoffProfessionalId: uuid.nullable(),
});
const serviceCreate = serviceFields.partial({
  description: true,
  priceCents: true,
  active: true,
  handoff: true,
  handoffReason: true,
  handoffProfessionalId: true,
});

const faqBody = z.object({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(1000) });

const topicBody = z.object({
  topic: z.string().trim().min(1).max(200),
  reason: optionalText(300),
  professionalId: uuid.nullable().default(null),
});

// No defaults: a PATCH must only touch the fields it sends.
const professionalFields = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  kind: z.enum(["professional", "reception"]),
  notifyPhone: phone.nullable(),
});
const professionalCreate = professionalFields.partial({ active: true, kind: true, notifyPhone: true });

const SERVICE_COLUMNS = [
  "id",
  "name",
  "description",
  "duration_minutes",
  "price_cents",
  "active",
  "handoff",
  "handoff_reason",
  "handoff_professional_id",
];
const PROFESSIONAL_COLUMNS = ["id", "name", "active", "kind", "notify_phone"];

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
    const niche = await getNicheBySlug(sql, body.businessType);
    if (!niche) return reply.code(400).send({ error: "invalid_niche", message: "Nicho inválido." });
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
      if (niche.starterServices.length > 0) {
        const services = await tx<{ id: string }[]>`
          insert into services ${tx(
            niche.starterServices.map((service) => ({ tenantId, ...service })),
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
          niche.starterHours.map((row) => ({ tenantId, ...row })),
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
      select ${sql(SERVICE_COLUMNS)}
      from services where tenant_id = ${tenantId} and archived_at is null order by active desc, name
    `;
  });

  app.post("/api/tenants/:tenantId/services", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = serviceCreate.parse(request.body);
    const service = await sql.begin(async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        insert into services ${tx({ tenantId, ...body })}
        returning ${tx(SERVICE_COLUMNS)}
      `;
      // New services start offered by every active professional; adjust in "Profissionais".
      await tx`
        insert into professional_services (tenant_id, professional_id, service_id)
        select ${tenantId}, id, ${created!.id} from professionals
        where tenant_id = ${tenantId} and active and kind = 'professional'
      `;
      return created;
    });
    return reply.code(201).send(service);
  });

  app.patch("/api/tenants/:tenantId/services/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const changes = serviceFields.partial().parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [service] = await sql`
      update services set ${sql(changes)} where tenant_id = ${tenantId} and id = ${id} and archived_at is null
      returning ${sql(SERVICE_COLUMNS)}
    `;
    return service ?? reply.code(404).send({ error: "not_found" });
  });

  // Deletes for good when nothing points to it; otherwise hides it (old
  // appointments keep showing its name).
  app.delete("/api/tenants/:tenantId/services/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const result = await sql.begin(async (tx) => {
      const [used] = await tx`select 1 from appointments where tenant_id = ${tenantId} and service_id = ${id} limit 1`;
      if (used) {
        const archived = await tx`
          update services set archived_at = now(), active = false
          where tenant_id = ${tenantId} and id = ${id} and archived_at is null returning id
        `;
        return archived.length ? { deleted: true } : null;
      }
      const deleted = await tx`delete from services where tenant_id = ${tenantId} and id = ${id} returning id`;
      return deleted.length ? { deleted: true } : null;
    });
    return result ?? reply.code(404).send({ error: "not_found" });
  });

  // --- Ready answers (FAQ) ---

  app.get("/api/tenants/:tenantId/faq", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`select id, question, answer from faq_entries where tenant_id = ${tenantId} order by created_at`;
  });

  app.post("/api/tenants/:tenantId/faq", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = faqBody.parse(request.body);
    const [entry] = await sql`insert into faq_entries ${sql({ tenantId, ...body })} returning id, question, answer`;
    return reply.code(201).send(entry);
  });

  app.patch("/api/tenants/:tenantId/faq/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = faqBody.parse(request.body);
    const [entry] = await sql`
      update faq_entries set ${sql(body)} where tenant_id = ${tenantId} and id = ${id} returning id, question, answer
    `;
    return entry ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/tenants/:tenantId/faq/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const deleted = await sql`delete from faq_entries where tenant_id = ${tenantId} and id = ${id} returning id`;
    return deleted.length ? { deleted: true } : reply.code(404).send({ error: "not_found" });
  });

  // --- Subjects always handed over to the owner ---

  app.get("/api/tenants/:tenantId/handoff-topics", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`select id, topic, reason, professional_id from handoff_topics where tenant_id = ${tenantId} order by created_at`;
  });

  app.post("/api/tenants/:tenantId/handoff-topics", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = topicBody.parse(request.body);
    const [topic] = await sql`
      insert into handoff_topics ${sql({ tenantId, ...body })} returning id, topic, reason, professional_id
    `;
    return reply.code(201).send(topic);
  });

  app.patch("/api/tenants/:tenantId/handoff-topics/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = topicBody.parse(request.body);
    const [topic] = await sql`
      update handoff_topics set ${sql(body)} where tenant_id = ${tenantId} and id = ${id} returning id, topic, reason, professional_id
    `;
    return topic ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/tenants/:tenantId/handoff-topics/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const deleted = await sql`delete from handoff_topics where tenant_id = ${tenantId} and id = ${id} returning id`;
    return deleted.length ? { deleted: true } : reply.code(404).send({ error: "not_found" });
  });

  // --- Professionals ---

  app.get("/api/tenants/:tenantId/professionals", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select p.id, p.name, p.active, p.kind, p.notify_phone,
             coalesce(array_agg(ps.service_id) filter (where ps.service_id is not null), '{}') as service_ids
      from professionals p
      left join professional_services ps on ps.professional_id = p.id
      where p.tenant_id = ${tenantId} and p.archived_at is null
      group by p.id order by p.active desc, p.kind, p.name
    `;
  });

  app.post("/api/tenants/:tenantId/professionals", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = professionalCreate.parse(request.body);
    const professional = await sql.begin(async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        insert into professionals ${tx({ tenantId, ...body })} returning ${tx(PROFESSIONAL_COLUMNS)}
      `;
      if (body.kind === "reception") {
        // The first reception becomes the default for everything nobody configured.
        await tx`
          update tenants set default_handoff_professional_id = ${created!.id}
          where id = ${tenantId} and default_handoff_professional_id is null
        `;
        return created;
      }
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
    const changes = professionalFields.omit({ kind: true }).partial().parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [professional] = await sql`
      update professionals set ${sql(changes)} where tenant_id = ${tenantId} and id = ${id}
      returning ${sql(PROFESSIONAL_COLUMNS)}
    `;
    return professional ?? reply.code(404).send({ error: "not_found" });
  });

  // Deletes for good when nothing points to her; otherwise hides her (past
  // appointments keep showing her name). Archived people are also inactive, so
  // the assistant never offers them. Services/topics/default handoff that named
  // her fall back to the owner (foreign keys set null).
  app.delete("/api/tenants/:tenantId/professionals/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const result = await sql.begin(async (tx) => {
      const [used] = await tx`select 1 from appointments where tenant_id = ${tenantId} and professional_id = ${id} limit 1`;
      if (used) {
        const archived = await tx`
          update professionals set archived_at = now(), active = false
          where tenant_id = ${tenantId} and id = ${id} and archived_at is null returning id
        `;
        if (archived.length) {
          // Drop her from services/topics now: the FK only clears on a real delete.
          await tx`update services set handoff_professional_id = null where tenant_id = ${tenantId} and handoff_professional_id = ${id}`;
          await tx`update handoff_topics set professional_id = null where tenant_id = ${tenantId} and professional_id = ${id}`;
          await tx`update tenants set default_handoff_professional_id = null where id = ${tenantId} and default_handoff_professional_id = ${id}`;
        }
        return archived.length ? { deleted: true } : null;
      }
      const deleted = await tx`delete from professionals where tenant_id = ${tenantId} and id = ${id} returning id`;
      return deleted.length ? { deleted: true } : null;
    });
    return result ?? reply.code(404).send({ error: "not_found" });
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
          select ${tenantId}, ${id}, s.id from services s
          where s.tenant_id = ${tenantId} and s.id in ${tx(serviceIds)}
            -- Reception performs no service.
            and exists (select 1 from professionals p where p.id = ${id} and p.tenant_id = ${tenantId} and p.kind = 'professional')
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
      const number =
        state === "open" ? await syncConnectedNumber(sql, whatsapp, tenantId, tenant.whatsappInstance) : undefined;
      return { available: true, instance: tenant.whatsappInstance, state, number };
    } catch (error) {
      request.log.warn({ err: error, tenantId }, "evolution unreachable");
      return { available: false, instance: tenant.whatsappInstance, state: "unknown" };
    }
  });

  // Creates/updates the instance and returns the QR code (or a pairing code when a
  // phone is given) while not connected. The owner can do this for her own business.
  app.post("/api/tenants/:tenantId/whatsapp/connect", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    if (!whatsapp) {
      return reply.code(503).send({
        error: "whatsapp_unavailable",
        message: "Evolution não configurada. Confira o .env e se o Docker está rodando.",
      });
    }
    const { phone: pairingPhone } = z.object({ phone: phone.optional() }).parse(request.body ?? {});
    return connectTenantWhatsapp(sql, whatsapp, tenant, { pairingPhone });
  });

  // Unpairs the current number so another one can be connected. The assistant
  // stops answering until a number is connected again.
  app.post("/api/tenants/:tenantId/whatsapp/disconnect", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const tenant = await loadTenant(tenantId, reply);
    if (!tenant) return;
    if (!whatsapp || !tenant.whatsappInstance) return { disconnected: false };
    try {
      await whatsapp.evolution.logout(tenant.whatsappInstance);
    } catch (error) {
      // Already logged out is fine; anything else is reported.
      if (!(error instanceof EvolutionError && (error.status === 400 || error.status === 404))) throw error;
    }
    await sql`update tenants set whatsapp_number = null where id = ${tenantId}`;
    request.log.info({ tenantId }, "whatsapp disconnected from the panel");
    return { disconnected: true };
  });
}
