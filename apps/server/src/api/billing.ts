import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { confirmPayment, getSubscription, isExpired, PLAN_COLUMNS, quote } from "../billing/billing.js";
import { MercadoPagoClient, validWebhookSignature } from "../billing/mercadopago.js";
import { pixCopyPaste, readPixCode, type PixReceiver } from "../billing/pix.js";
import type { Sql } from "../db/client.js";

const uuid = z.string().uuid();
const tenantParams = z.object({ tenantId: uuid });
const idParams = z.object({ id: uuid });
const months = z.number().int().min(1).max(36);
const cents = z.number().int().min(0).max(100_000_000);

const PAYMENT_COLUMNS = [
  "id",
  "plan_id",
  "months",
  "amount_cents",
  "status",
  "method",
  "reported_at",
  "paid_at",
  "note",
  "created_at",
  "provider_payment_id",
  "provider_qr_code",
  "expires_at",
];

type Payment = {
  id: string;
  tenantId?: string;
  amountCents: number;
  status: string;
  providerPaymentId: string | null;
  providerQrCode: string | null;
  expiresAt: Date | null;
};

/** A Mercado Pago Pix is valid for this long; a new choice of months creates another. */
const CHARGE_HOURS = 24;
/** The payment page asks every few seconds; Mercado Pago is checked at most this often per payment. */
const CHECK_EVERY_MS = 8_000;

export type MercadoPagoSetup = { client: MercadoPagoClient; webhookSecret?: string; publicUrl: string };

/**
 * Plans and subscriptions.
 * Agency: plan prices, each business's plan/cycle/paid-until, payments to confirm.
 * Business: its subscription and the payment page (also reachable when expired).
 * With Mercado Pago: each payment is a Pix charge there, confirmed by itself when paid.
 */
export function registerBillingRoutes(app: FastifyInstance, sql: Sql, options: { log: FastifyBaseLogger; mercadoPago?: MercadoPagoSetup }) {
  const { log, mercadoPago } = options;

  /** The agency's Pix, read from its bank's QR code in Planos. undefined = not set up yet. */
  async function receiver(): Promise<PixReceiver | undefined> {
    const [row] = await sql<{ pixKey: string | null; pixReceiverName: string | null; pixCity: string | null }[]>`
      select pix_key, pix_receiver_name, pix_city from agency_settings
    `;
    return row?.pixKey ? { key: row.pixKey, name: row.pixReceiverName || "Chama Lia", city: row.pixCity || "Brasil" } : undefined;
  }

  // Mercado Pago charge first (paid = released by itself); otherwise the agency's own Pix (confirmed by hand).
  const withPix = <T extends Payment>({ providerQrCode, providerPaymentId, tenantId: _tenantId, ...payment }: T, pix: PixReceiver | undefined) => {
    const open = payment.status === "pending" && payment.amountCents > 0;
    return {
      ...payment,
      providerPaymentId,
      automatic: Boolean(providerPaymentId),
      pixCode: !open
        ? null
        : providerQrCode
          ? providerQrCode
          : pix
            ? pixCopyPaste(pix, payment.amountCents, `CL${payment.id.replace(/-/g, "").slice(0, 20)}`)
            : null,
    };
  };

  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "not_found", message: "Não encontrado." });

  /**
   * Reads a Mercado Pago charge back and, when it is approved with our reference and amount,
   * confirms the payment. A notification by itself proves nothing; this check does.
   */
  const lastCheck = new Map<string, number>();
  async function syncCharge(providerPaymentId: string, force = false): Promise<void> {
    if (!mercadoPago) return;
    const now = Date.now();
    if (!force && now - (lastCheck.get(providerPaymentId) ?? 0) < CHECK_EVERY_MS) return;
    lastCheck.set(providerPaymentId, now);
    const [local] = await sql<{ id: string; amountCents: number; status: string }[]>`
      select id, amount_cents, status from payments where provider_payment_id = ${providerPaymentId}
    `;
    if (!local || local.status === "paid") return;
    try {
      const remote = await mercadoPago.client.getPayment(providerPaymentId);
      if (remote.status !== "approved") return;
      if (remote.externalReference !== local.id || remote.amountCents !== local.amountCents) {
        log.error({ paymentId: local.id }, "mercado pago charge does not match the local payment");
        return;
      }
      // Paid after a new choice replaced it: the money arrived, so it still counts.
      await sql`update payments set status = 'pending' where id = ${local.id} and status = 'cancelled'`;
      const done = await confirmPayment(sql, local.id);
      if (done) log.info({ tenantId: done.tenantId, paymentId: local.id }, "subscription paid via mercado pago");
      lastCheck.delete(providerPaymentId);
    } catch (error) {
      log.warn({ err: error, paymentId: local.id }, "mercado pago check failed");
    }
  }

  // --- Agency ---

  app.get("/api/billing", { config: { adminOnly: true } }, async () => {
    const plans = await sql`
      select ${sql(PLAN_COLUMNS)}, (select count(*)::int from tenants t where t.plan_id = plans.id) as tenants
      from plans order by sort_order, name
    `;
    const tenants = await sql`
      select t.id, t.name, t.active, t.plan_id, t.billing_cycle, t.paid_until,
             (select count(*)::int from payments p where p.tenant_id = t.id and p.status = 'pending') as pending_payments,
             (select count(*)::int from payments p where p.tenant_id = t.id and p.status = 'pending' and p.reported_at is not null) as reported_payments,
             (select max(p.paid_at) from payments p where p.tenant_id = t.id and p.status = 'paid') as last_paid_at
      from tenants t order by t.name
    `;
    return { plans, tenants, mercadoPago: Boolean(mercadoPago) };
  });

  app.patch("/api/plans/:id", { config: { adminOnly: true } }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const changes = z
      .object({
        name: z.string().trim().min(1).max(60),
        priceCentsMonthly: cents.nullable(),
        priceCentsYearly: cents.nullable(),
        active: z.boolean(),
      })
      .partial()
      .parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [plan] = await sql`update plans set ${sql(changes)} where id = ${id} returning ${sql(PLAN_COLUMNS)}`;
    return plan ?? notFound(reply);
  });

  app.patch("/api/tenants/:tenantId/subscription", { config: { adminOnly: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const changes = z
      .object({
        planId: uuid,
        billingCycle: z.enum(["monthly", "annual", "lifetime"]),
        paidUntil: z.coerce.date().nullable(),
      })
      .partial()
      .parse(request.body);
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    if (changes.planId) {
      const [plan] = await sql`select id from plans where id = ${changes.planId}`;
      if (!plan) return reply.code(400).send({ error: "invalid_plan", message: "Plano inválido." });
    }
    const [tenant] = await sql`update tenants set ${sql(changes)} where id = ${tenantId} returning id`;
    return tenant ? subscriptionView(tenantId) : notFound(reply);
  });

  app.get("/api/tenants/:tenantId/payments", { config: { adminOnly: true } }, async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const rows = await sql<Payment[]>`
      select ${sql(PAYMENT_COLUMNS)} from payments where tenant_id = ${tenantId} order by created_at desc limit 50
    `;
    const pix = await receiver();
    return rows.map((row) => withPix(row, pix));
  });

  // Pix that receives the subscriptions, set up from the QR code (or copy-and-paste) of the bank app.
  app.get("/api/billing/pix", { config: { adminOnly: true } }, async () => {
    const pix = await receiver();
    return { configured: Boolean(pix), key: pix?.key ?? null, name: pix?.name ?? null, city: pix?.city ?? null };
  });

  app.put("/api/billing/pix", { config: { adminOnly: true } }, async (request, reply) => {
    const { code } = z.object({ code: z.string().trim().min(10).max(1000) }).parse(request.body);
    const read = readPixCode(code);
    if (typeof read === "string") {
      const message = {
        not_pix: "Isso não é um QR code de Pix. Use o QR de receber do app do seu banco.",
        bad_checksum: "O código veio incompleto. Copie de novo ou envie outra foto.",
        no_key: "Esse QR é de uma cobrança só e não serve para outras. No app do banco, use 'Receber' sem valor.",
      }[read];
      return reply.code(400).send({ error: read, message });
    }
    await sql`
      update agency_settings
      set pix_key = ${read.key}, pix_receiver_name = ${read.name.slice(0, 25) || null}, pix_city = ${read.city.slice(0, 15) || null},
          updated_at = now()
    `;
    return { configured: true, key: read.key, name: read.name || null, city: read.city || null };
  });

  // Payment received outside the payment page (cash, transfer): recorded as paid right away.
  app.post("/api/tenants/:tenantId/payments", { config: { adminOnly: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = z
      .object({ months, amountCents: cents.optional(), note: z.string().trim().max(300).optional() })
      .parse(request.body);
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return notFound(reply);
    const amount = body.amountCents ?? quote(subscription.plan, body.months) ?? 0;
    const [payment] = await sql<{ id: string }[]>`
      insert into payments (tenant_id, plan_id, months, amount_cents, method, note)
      values (${tenantId}, ${subscription.plan.id}, ${body.months}, ${amount}, 'manual', ${body.note || null})
      returning id
    `;
    await confirmPayment(sql, payment!.id);
    return reply.code(201).send(await subscriptionView(tenantId));
  });

  app.post("/api/payments/:id/confirm", { config: { adminOnly: true } }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const done = await confirmPayment(sql, id);
    if (!done) return reply.code(409).send({ error: "not_pending", message: "Esse pagamento não está mais pendente." });
    return subscriptionView(done.tenantId);
  });

  app.post("/api/payments/:id/cancel", { config: { adminOnly: true } }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const [payment] = await sql`
      update payments set status = 'cancelled' where id = ${id} and status = 'pending' returning id
    `;
    return payment ? { ok: true } : reply.code(409).send({ error: "not_pending", message: "Esse pagamento não está mais pendente." });
  });

  // --- Business (also when expired) ---

  async function pendingOf(tenantId: string) {
    const [pending] = await sql<Payment[]>`
      select ${sql(PAYMENT_COLUMNS)} from payments
      where tenant_id = ${tenantId} and status = 'pending' order by created_at desc limit 1
    `;
    return pending;
  }

  async function subscriptionView(tenantId: string) {
    let pending = await pendingOf(tenantId);
    // The payment page polls this: a paid Mercado Pago charge is confirmed here even if the webhook is late.
    if (pending?.providerPaymentId) {
      await syncCharge(pending.providerPaymentId);
      pending = await pendingOf(tenantId);
    }
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return undefined;
    const { plan } = subscription;
    const pix = await receiver();
    return {
      tenantName: subscription.tenantName,
      plan: {
        id: plan.id,
        name: plan.name,
        includesAssistant: plan.includesAssistant,
        priceCentsMonthly: plan.priceCentsMonthly,
        priceCentsYearly: plan.priceCentsYearly,
      },
      billingCycle: subscription.billingCycle,
      paidUntil: subscription.paidUntil,
      expired: isExpired(subscription),
      pending: pending ? withPix(pending, pix) : null,
      pixAvailable: Boolean(pix) || Boolean(mercadoPago),
    };
  }

  app.get("/api/tenants/:tenantId/subscription", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    return (await subscriptionView(tenantId)) ?? notFound(reply);
  });

  // The business picks how many months to pay: one open request at a time (a new choice replaces it).
  app.post("/api/tenants/:tenantId/subscription/checkout", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = z.object({ months }).parse(request.body);
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return notFound(reply);
    const amount = quote(subscription.plan, body.months);
    if (amount === null) {
      return reply.code(409).send({ error: "no_price", message: "Este plano ainda não tem preço. Fale com a gente pelo WhatsApp." });
    }
    const payment = await sql.begin(async (tx) => {
      await tx`
        update payments set status = 'cancelled'
        where tenant_id = ${tenantId} and status = 'pending' and reported_at is null
      `;
      const [created] = await tx<{ id: string }[]>`
        insert into payments (tenant_id, plan_id, months, amount_cents)
        values (${tenantId}, ${subscription.plan.id}, ${body.months}, ${amount})
        returning id
      `;
      return created!;
    });

    if (mercadoPago && amount > 0) {
      try {
        const charge = await mercadoPago.client.createPixCharge({
          amountCents: amount,
          description: `Chama Lia · ${subscription.plan.name} · ${body.months} ${body.months === 1 ? "mês" : "meses"}`,
          externalReference: payment.id,
          // Mercado Pago asks for a payer e-mail; the business pays from any bank, so ours stands in.
          payerEmail: `assinatura+${payment.id.slice(0, 8)}@chamalia.com.br`,
          notificationUrl: mercadoPago.publicUrl.startsWith("https://") ? `${mercadoPago.publicUrl}/webhooks/mercadopago` : undefined,
          expiresAt: new Date(Date.now() + CHARGE_HOURS * 60 * 60 * 1000),
        });
        await sql`
          update payments set provider_payment_id = ${charge.id}, provider_qr_code = ${charge.qrCode}, expires_at = ${charge.expiresAt}
          where id = ${payment.id}
        `;
      } catch (error) {
        // Falls back to the agency's own Pix (confirmed by hand), so the business can still pay.
        log.error({ err: error, paymentId: payment.id }, "mercado pago charge failed");
      }
    }
    return reply.code(201).send(await subscriptionView(tenantId));
  });

  // "Já paguei": tells the agency to look for the transfer.
  app.post("/api/tenants/:tenantId/payments/:id/report", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId, id } = tenantParams.extend({ id: uuid }).parse(request.params);
    const [payment] = await sql`
      update payments set reported_at = coalesce(reported_at, now())
      where id = ${id} and tenant_id = ${tenantId} and status = 'pending'
      returning id
    `;
    return payment ? subscriptionView(tenantId) : reply.code(409).send({ error: "not_pending", message: "Esse pagamento não está mais pendente." });
  });

  // Mercado Pago tells us a charge changed. Only the read-back in syncCharge can release access.
  app.post("/webhooks/mercadopago", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const body = (request.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number } };
    const dataId = String(query["data.id"] ?? body.data?.id ?? query.id ?? "");
    const type = query.type ?? query.topic ?? body.type ?? body.topic;
    if (!mercadoPago || !dataId || (type && type !== "payment")) return { ignored: true };

    const signature = request.headers["x-signature"];
    if (mercadoPago.webhookSecret && typeof signature === "string") {
      const requestId = String(request.headers["x-request-id"] ?? "");
      if (!validWebhookSignature({ signature, requestId, dataId, secret: mercadoPago.webhookSecret })) {
        log.warn("mercado pago webhook with an invalid signature");
        return reply.code(401).send({ error: "invalid_signature" });
      }
    }
    await syncCharge(dataId, true);
    return { received: true };
  });
}
