import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { confirmPayment, getSubscription, isExpired, PLAN_COLUMNS, quote } from "../billing/billing.js";
import { pixCopyPaste, type PixReceiver } from "../billing/pix.js";
import type { Sql } from "../db/client.js";

const uuid = z.string().uuid();
const tenantParams = z.object({ tenantId: uuid });
const idParams = z.object({ id: uuid });
const months = z.number().int().min(1).max(36);
const cents = z.number().int().min(0).max(100_000_000);

const PAYMENT_COLUMNS = ["id", "plan_id", "months", "amount_cents", "status", "method", "reported_at", "paid_at", "note", "created_at"];

type Payment = { id: string; amountCents: number; status: string };

/**
 * Plans and subscriptions.
 * Agency: plan prices, each business's plan/cycle/paid-until, payments to confirm.
 * Business: its subscription and the payment page (also reachable when expired).
 */
export function registerBillingRoutes(app: FastifyInstance, sql: Sql, pix?: PixReceiver) {
  const withPix = <T extends Payment>(payment: T) => ({
    ...payment,
    pixCode:
      pix && payment.status === "pending" && payment.amountCents > 0
        ? pixCopyPaste(pix, payment.amountCents, `CL${payment.id.replace(/-/g, "").slice(0, 20)}`)
        : null,
  });

  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "not_found", message: "Não encontrado." });

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
    return { plans, tenants };
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
    return rows.map(withPix);
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

  async function subscriptionView(tenantId: string) {
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return undefined;
    const [pending] = await sql<Payment[]>`
      select ${sql(PAYMENT_COLUMNS)} from payments
      where tenant_id = ${tenantId} and status = 'pending' order by created_at desc limit 1
    `;
    const { plan } = subscription;
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
      pending: pending ? withPix(pending) : null,
      pixAvailable: Boolean(pix),
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
    await sql.begin(async (tx) => {
      await tx`
        update payments set status = 'cancelled'
        where tenant_id = ${tenantId} and status = 'pending' and reported_at is null
      `;
      await tx`
        insert into payments (tenant_id, plan_id, months, amount_cents)
        values (${tenantId}, ${subscription.plan.id}, ${body.months}, ${amount})
      `;
    });
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
}
