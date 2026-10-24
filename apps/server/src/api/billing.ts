import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { cardQuote, confirmPayment, getSubscription, isExpired, PLAN_COLUMNS, quote } from "../billing/billing.js";
import { cardSync, liveCardSubscription } from "../billing/card.js";
import { MercadoPagoClient, MercadoPagoError, MercadoPagoSubscriptions, validWebhookSignature } from "../billing/mercadopago.js";
import { pixCopyPaste, readPixCode, type PixReceiver } from "../billing/pix.js";
import { TERMS_VERSION } from "../billing/terms.js";
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

/** The renewal reminder shows up this many days before access ends (Pix payers only). */
const REMIND_DAYS = 3;

/** Shown in Configurações > Cobrança ("Visa final 1234"); sent by the card form, never the card number. */
const cardDisplay = {
  cardBrand: z.string().trim().max(30).regex(/^[a-z_]+$/).optional(),
  lastFour: z.string().regex(/^\d{4}$/).optional(),
};

export type MercadoPagoSetup = {
  client: MercadoPagoClient;
  webhookSecret?: string;
  /** Automatic card debit; needs the Public Key for Mercado Pago's secure card fields. */
  subscriptions?: MercadoPagoSubscriptions;
  publicKey?: string;
  /** Where Mercado Pago sends the business back after card checks (https in production). */
  publicUrl: string;
};

/**
 * Plans and subscriptions.
 * Agency: plan prices, each business's plan/cycle/paid-until, payments to confirm.
 * Business: its subscription and the payment page (also reachable when expired).
 * With Mercado Pago: each payment is a Pix charge there, confirmed by itself when paid.
 */
export function registerBillingRoutes(app: FastifyInstance, sql: Sql, options: { log: FastifyBaseLogger; mercadoPago?: MercadoPagoSetup }) {
  const { log, mercadoPago } = options;
  const card = mercadoPago?.subscriptions && mercadoPago.publicKey ? cardSync(sql, log, mercadoPago.subscriptions) : undefined;

  const acceptTerms = (tenantId: string) =>
    sql`update tenants set terms_version = ${TERMS_VERSION}, terms_accepted_at = now() where id = ${tenantId}`;

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
      const remote = await mercadoPago.client.getOrder(providerPaymentId);
      if (!remote.paid) return;
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
             (select max(p.paid_at) from payments p where p.tenant_id = t.id and p.status = 'paid') as last_paid_at,
             (select c.status from card_subscriptions c
              where c.tenant_id = t.id and c.status in ('pending', 'authorized', 'paused')) as auto_debit
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
    let subscription = await getSubscription(sql, tenantId);
    if (!subscription) return undefined;
    // Automatic debit about to renew (or just renewed): check its charges here too.
    let auto = await liveCardSubscription(sql, tenantId);
    const ending = subscription.paidUntil ? subscription.paidUntil.getTime() - Date.now() < 24 * 60 * 60 * 1000 : true;
    if (auto && card && ending) {
      await card.sync(auto);
      subscription = (await getSubscription(sql, tenantId))!;
      auto = await liveCardSubscription(sql, tenantId);
    }
    const { plan } = subscription;
    const pix = await receiver();
    const expired = isExpired(subscription);
    const daysLeft =
      subscription.billingCycle === "lifetime" || !subscription.paidUntil
        ? null
        : Math.ceil((subscription.paidUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const [terms] = await sql<{ termsVersion: string | null; billingEmail: string | null }[]>`
      select terms_version, billing_email from tenants where id = ${tenantId}
    `;
    return {
      tenantName: subscription.tenantName,
      plan: {
        id: plan.id,
        name: plan.name,
        includesAssistant: plan.includesAssistant,
        priceCentsMonthly: plan.priceCentsMonthly,
        priceCentsYearly: plan.priceCentsYearly,
      },
      // What each choice costs right now: 12 months = 10 (two free); card = same as Pix.
      prices: {
        pix: { 1: quote(plan, 1), 3: quote(plan, 3), 6: quote(plan, 6), 12: quote(plan, 12) },
        card: { 1: cardQuote(plan, 1), 12: cardQuote(plan, 12) },
      },
      billingCycle: subscription.billingCycle,
      paidUntil: subscription.paidUntil,
      expired,
      daysLeft,
      // Pix payers get a heads-up a few days before it ends; automatic debit renews by itself.
      renewSoon: !expired && !auto && daysLeft !== null && daysLeft <= REMIND_DAYS,
      pending: pending ? withPix(pending, pix) : null,
      pixAvailable: Boolean(pix) || Boolean(mercadoPago),
      autoDebit: auto
        ? {
            status: auto.status,
            frequencyMonths: auto.frequencyMonths,
            amountCents: auto.amountCents,
            payerEmail: auto.payerEmail,
            since: auto.createdAt,
            cardBrand: auto.cardBrand,
            cardLastFour: auto.cardLastFour,
          }
        : null,
      cardAvailable: Boolean(card),
      mercadoPagoPublicKey: card ? mercadoPago!.publicKey! : null,
      billingEmail: terms?.billingEmail ?? null,
      termsVersion: TERMS_VERSION,
      termsAccepted: terms?.termsVersion === TERMS_VERSION,
    };
  }

  app.get("/api/tenants/:tenantId/subscription", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    return (await subscriptionView(tenantId)) ?? notFound(reply);
  });

  // The business picks how many months to pay: one open request at a time (a new choice replaces it).
  app.post("/api/tenants/:tenantId/subscription/checkout", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = z.object({ months, acceptTerms: z.literal(true, { message: "Aceite os Termos de Uso e a Política de Privacidade." }) }).parse(request.body);
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return notFound(reply);
    const amount = quote(subscription.plan, body.months);
    if (amount === null) {
      return reply.code(409).send({ error: "no_price", message: "Este plano ainda não tem preço. Fale com a gente pelo WhatsApp." });
    }
    await acceptTerms(tenantId);
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
          externalReference: payment.id,
          // Mercado Pago asks for a payer e-mail; the business pays from any bank, so ours stands in.
          payerEmail: `assinatura+${payment.id.slice(0, 8)}@chamalia.com.br`,
          hours: CHARGE_HOURS,
        });
        const expiresAt = new Date(Date.now() + CHARGE_HOURS * 60 * 60 * 1000);
        await sql`
          update payments set provider_payment_id = ${charge.id}, provider_qr_code = ${charge.qrCode}, expires_at = ${expiresAt}
          where id = ${payment.id}
        `;
      } catch (error) {
        // Falls back to the agency's own Pix (confirmed by hand), so the business can still pay.
        log.error({ err: error, paymentId: payment.id }, "mercado pago charge failed");
      }
    }
    return reply.code(201).send(await subscriptionView(tenantId));
  });

  // Automatic card debit. The card is typed into Mercado Pago's secure fields in the browser;
  // only the one-time token comes here, and only Mercado Pago keeps the card.
  app.post("/api/tenants/:tenantId/subscription/card", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = z
      .object({
        cardToken: z.string().trim().min(8).max(200),
        email: z.string().trim().toLowerCase().email("E-mail inválido").max(254),
        frequencyMonths: z.union([z.literal(1), z.literal(12)]),
        acceptTerms: z.literal(true, { message: "Aceite os Termos de Uso e a Política de Privacidade." }),
        ...cardDisplay,
      })
      .parse(request.body);
    if (!card || !mercadoPago?.subscriptions) {
      return reply.code(409).send({ error: "card_unavailable", message: "Pagamento no cartão indisponível no momento. Use o Pix." });
    }
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return notFound(reply);
    if (await liveCardSubscription(sql, tenantId)) {
      return reply.code(409).send({ error: "already_active", message: "O débito automático já está ativo." });
    }
    const amount = cardQuote(subscription.plan, body.frequencyMonths);
    if (!amount) return reply.code(409).send({ error: "no_price", message: "Este plano ainda não tem preço. Fale com a gente pelo WhatsApp." });

    const id = randomUUID();
    let created;
    try {
      created = await mercadoPago.subscriptions.create({
        cardToken: body.cardToken,
        payerEmail: body.email,
        amountCents: amount,
        frequencyMonths: body.frequencyMonths,
        reason: `Chama Lia · ${subscription.plan.name} · ${body.frequencyMonths === 1 ? "mensal" : "anual"}`,
        externalReference: id,
        backUrl: mercadoPago.publicUrl,
      });
    } catch (error) {
      log.warn({ err: error, tenantId }, "card subscription refused");
      const message =
        error instanceof MercadoPagoError && error.message.startsWith("Mercado Pago 4")
          ? "O cartão foi recusado. Confira os dados ou use outro cartão."
          : "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.";
      return reply.code(400).send({ error: "card_refused", message });
    }
    await acceptTerms(tenantId);
    await sql`
      insert into card_subscriptions (id, tenant_id, provider_id, status, frequency_months, amount_cents, payer_email, card_brand, card_last_four)
      values (${id}, ${tenantId}, ${created.id}, ${created.status === "authorized" ? "authorized" : "pending"},
              ${body.frequencyMonths}, ${amount}, ${body.email}, ${body.cardBrand ?? null}, ${body.lastFour ?? null})
    `;
    await sql`update tenants set billing_email = ${body.email} where id = ${tenantId}`;
    // The first charge usually happens right away.
    const sub = await liveCardSubscription(sql, tenantId);
    if (sub) await card.sync(sub, true);
    return reply.code(201).send(await subscriptionView(tenantId));
  });

  // New card for the automatic debit (expired card, another card...). Also revives a debit paused
  // by refused charges.
  app.post("/api/tenants/:tenantId/subscription/card/update", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = z.object({ cardToken: z.string().trim().min(8).max(200), ...cardDisplay }).parse(request.body);
    const sub = await liveCardSubscription(sql, tenantId);
    if (!sub || !mercadoPago?.subscriptions || !card) {
      return reply.code(409).send({ error: "not_active", message: "Não há débito automático ativo." });
    }
    let updated;
    try {
      updated = await mercadoPago.subscriptions.updateCard(sub.providerId, body.cardToken, sub.status === "paused");
    } catch (error) {
      log.warn({ err: error, tenantId }, "card update refused");
      return reply.code(400).send({ error: "card_refused", message: "O cartão foi recusado. Confira os dados ou use outro cartão." });
    }
    await sql`
      update card_subscriptions
      set card_brand = ${body.cardBrand ?? null}, card_last_four = ${body.lastFour ?? null},
          status = ${updated.status === "authorized" ? "authorized" : sub.status}
      where id = ${sub.id}
    `;
    log.info({ tenantId }, "automatic debit card replaced");
    // A paused debit retries with the new card; check whether that charge already went through.
    const fresh = await liveCardSubscription(sql, tenantId);
    if (fresh) await card.sync(fresh, true);
    return subscriptionView(tenantId);
  });

  // E-mail that receives Mercado Pago's receipts and our notices about the subscription.
  app.patch("/api/tenants/:tenantId/subscription/billing-email", { config: { allowExpired: true } }, async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const { email } = z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido").max(254) }).parse(request.body);
    await sql`update tenants set billing_email = ${email} where id = ${tenantId}`;
    return subscriptionView(tenantId);
  });

  // The business's own payment history (Configurações > Cobrança).
  app.get("/api/tenants/:tenantId/subscription/payments", { config: { allowExpired: true } }, async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select p.id, p.months, p.amount_cents, p.status, p.method, p.created_at, p.paid_at, pl.name as plan_name
      from payments p join plans pl on pl.id = p.plan_id
      where p.tenant_id = ${tenantId} and (p.status = 'paid' or (p.status = 'pending' and p.created_at > now() - interval '2 days'))
      order by coalesce(p.paid_at, p.created_at) desc
      limit 36
    `;
  });

  // Cancelling is one click, as easy as subscribing: no fee, access already paid stays until it ends.
  app.post("/api/tenants/:tenantId/subscription/card/cancel", { config: { allowExpired: true } }, async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const sub = await liveCardSubscription(sql, tenantId);
    if (!sub) return reply.code(409).send({ error: "not_active", message: "Não há débito automático ativo." });
    if (mercadoPago?.subscriptions) {
      try {
        await mercadoPago.subscriptions.cancel(sub.providerId);
      } catch (error) {
        log.error({ err: error, tenantId }, "card subscription cancel failed");
        return reply.code(502).send({ error: "cancel_failed", message: "Não foi possível cancelar agora. Tente de novo em alguns minutos." });
      }
    }
    await sql`update card_subscriptions set status = 'cancelled', cancelled_at = now() where id = ${sub.id}`;
    log.info({ tenantId }, "automatic card debit cancelled");
    return subscriptionView(tenantId);
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

  // Mercado Pago tells us something changed (topics set up in the app's Webhooks page):
  // "order" = a Pix; "subscription_authorized_payment" = a card charge; "subscription_preapproval" =
  // the automatic debit itself. Only reading it back from the API can release access.
  const HANDLED = ["order", "subscription_authorized_payment", "subscription_preapproval"];
  app.post("/webhooks/mercadopago", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const body = (request.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number } };
    const dataId = String(query["data.id"] ?? body.data?.id ?? query.id ?? "");
    const type = query.type ?? query.topic ?? body.type ?? body.topic ?? "order";
    if (!mercadoPago || !dataId || !HANDLED.includes(type)) return { ignored: true };

    const signature = request.headers["x-signature"];
    if (mercadoPago.webhookSecret && typeof signature === "string") {
      const requestId = String(request.headers["x-request-id"] ?? "");
      if (!validWebhookSignature({ signature, requestId, dataId, secret: mercadoPago.webhookSecret })) {
        log.warn("mercado pago webhook with an invalid signature");
        return reply.code(401).send({ error: "invalid_signature" });
      }
    }
    try {
      if (type === "order") await syncCharge(dataId, true);
      else if (type === "subscription_authorized_payment") await card?.onInvoice(dataId);
      else await card?.onSubscription(dataId);
    } catch (error) {
      // Mercado Pago retries failed notifications; the payment page also checks by itself.
      log.warn({ err: error, type }, "mercado pago notification not processed");
      return reply.code(500).send({ error: "retry" });
    }
    return { received: true };
  });
}
