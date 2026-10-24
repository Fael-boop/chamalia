import type { FastifyBaseLogger } from "fastify";
import type { Sql } from "../db/client.js";
import { confirmPayment } from "./billing.js";
import type { MercadoPagoSubscriptions, SubscriptionInvoice } from "./mercadopago.js";

export type CardSubscriptionRow = {
  id: string;
  tenantId: string;
  providerId: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  frequencyMonths: 1 | 12;
  amountCents: number;
  payerEmail: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cardBrand: string | null;
  cardLastFour: string | null;
};

export const CARD_COLUMNS = [
  "id",
  "tenant_id",
  "provider_id",
  "status",
  "frequency_months",
  "amount_cents",
  "payer_email",
  "created_at",
  "cancelled_at",
  "card_brand",
  "card_last_four",
];
const LIVE = ["pending", "authorized", "paused"];
/** Mercado Pago is asked at most this often per subscription when the page polls. */
const CHECK_EVERY_MS = 15_000;

export async function liveCardSubscription(sql: Sql, tenantId: string): Promise<CardSubscriptionRow | undefined> {
  const [row] = await sql<CardSubscriptionRow[]>`
    select ${sql(CARD_COLUMNS)} from card_subscriptions where tenant_id = ${tenantId} and status in ${sql(LIVE)}
  `;
  return row;
}

/**
 * Keeps automatic card debits in step with Mercado Pago. Every charge is read back from the API
 * before it extends access (a notification alone proves nothing), and is recorded once only.
 */
export function cardSync(sql: Sql, log: FastifyBaseLogger, subscriptions: MercadoPagoSubscriptions) {
  const lastCheck = new Map<string, number>();

  async function recordInvoice(invoice: SubscriptionInvoice): Promise<void> {
    if (!invoice.paid) return;
    const [sub] = await sql<CardSubscriptionRow[]>`
      select ${sql(CARD_COLUMNS)} from card_subscriptions where provider_id = ${invoice.preapprovalId}
    `;
    if (!sub) {
      log.warn({ invoiceId: invoice.id }, "card charge for an unknown subscription");
      return;
    }
    if (invoice.amountCents !== sub.amountCents) {
      log.error({ tenantId: sub.tenantId, invoiceId: invoice.id }, "card charge amount does not match the subscription");
      return;
    }
    // provider_payment_id is unique: a charge seen twice (webhook + polling) is recorded once.
    const [payment] = await sql<{ id: string }[]>`
      insert into payments (tenant_id, plan_id, months, amount_cents, method, provider_payment_id)
      select ${sub.tenantId}, t.plan_id, ${sub.frequencyMonths}, ${invoice.amountCents}, 'card', ${`inv:${invoice.id}`}
      from tenants t where t.id = ${sub.tenantId}
      on conflict (provider_payment_id) where provider_payment_id is not null do nothing
      returning id
    `;
    if (!payment) return;
    const done = await confirmPayment(sql, payment.id);
    if (done) log.info({ tenantId: sub.tenantId, paymentId: payment.id }, "subscription paid by automatic card debit");
  }

  /** Status of the debit at Mercado Pago (paused after failed charges, cancelled...) and its paid charges. */
  async function sync(sub: CardSubscriptionRow, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - (lastCheck.get(sub.providerId) ?? 0) < CHECK_EVERY_MS) return;
    lastCheck.set(sub.providerId, now);
    try {
      const remote = await subscriptions.get(sub.providerId);
      const status = remote.status === "canceled" ? "cancelled" : remote.status;
      if (status !== sub.status && ["pending", "authorized", "paused", "cancelled"].includes(status)) {
        await sql`
          update card_subscriptions
          set status = ${status}, cancelled_at = ${status === "cancelled" ? new Date() : null}
          where id = ${sub.id}
        `;
      }
      for (const invoice of await subscriptions.invoices(sub.providerId)) await recordInvoice(invoice);
    } catch (error) {
      log.warn({ err: error, tenantId: sub.tenantId }, "card subscription check failed");
    }
  }

  return {
    sync,
    /** Webhook "subscription_authorized_payment": one charge. */
    async onInvoice(invoiceId: string) {
      await recordInvoice(await subscriptions.invoice(invoiceId));
    },
    /** Webhook "subscription_preapproval": the debit itself changed. */
    async onSubscription(providerId: string) {
      const [sub] = await sql<CardSubscriptionRow[]>`
        select ${sql(CARD_COLUMNS)} from card_subscriptions where provider_id = ${providerId}
      `;
      if (sub) await sync(sub, true);
    },
  };
}
