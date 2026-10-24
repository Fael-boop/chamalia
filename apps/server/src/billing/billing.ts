import type { Sql } from "../db/client.js";

export type BillingCycle = "monthly" | "annual" | "lifetime";

export type Plan = {
  id: string;
  slug: string;
  name: string;
  includesAssistant: boolean;
  priceCentsMonthly: number | null;
  priceCentsYearly: number | null;
  active: boolean;
};

export type Subscription = {
  tenantId: string;
  tenantName: string;
  plan: Plan;
  billingCycle: BillingCycle;
  paidUntil: Date | null;
};

export const PLAN_COLUMNS = ["id", "slug", "name", "includes_assistant", "price_cents_monthly", "price_cents_yearly", "active"];

/** Lifetime never expires; otherwise access lasts until paid_until (never paid = expired). */
export function isExpired(subscription: Pick<Subscription, "billingCycle" | "paidUntil">, now = new Date()): boolean {
  if (subscription.billingCycle === "lifetime") return false;
  return !subscription.paidUntil || subscription.paidUntil.getTime() <= now.getTime();
}

/** Price of `months` months: 12 months use the yearly price when there is one. null = plan not for sale. */
export function quote(plan: Pick<Plan, "priceCentsMonthly" | "priceCentsYearly">, months: number): number | null {
  if (months === 12 && plan.priceCentsYearly !== null) return plan.priceCentsYearly;
  if (plan.priceCentsMonthly === null) return null;
  return plan.priceCentsMonthly * months;
}

/**
 * New paid_until after paying `months`: counted from the current end when still paid
 * (paying early never loses days), or from now when already expired. Calendar months:
 * 31/01 + 1 month = 28/02 (or 29/02), never 03/03.
 */
export function extendPaidUntil(current: Date | null, months: number, now = new Date()): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  const next = new Date(base);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export async function getSubscription(sql: Sql, tenantId: string): Promise<Subscription | undefined> {
  const [row] = await sql<
    {
      tenantId: string;
      tenantName: string;
      billingCycle: BillingCycle;
      paidUntil: Date | null;
      planId: string;
      slug: string;
      name: string;
      includesAssistant: boolean;
      priceCentsMonthly: number | null;
      priceCentsYearly: number | null;
      planActive: boolean;
    }[]
  >`
    select t.id as tenant_id, t.name as tenant_name, t.billing_cycle, t.paid_until,
           p.id as plan_id, p.slug, p.name, p.includes_assistant, p.price_cents_monthly, p.price_cents_yearly,
           p.active as plan_active
    from tenants t join plans p on p.id = t.plan_id
    where t.id = ${tenantId}
  `;
  if (!row) return undefined;
  return {
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    billingCycle: row.billingCycle,
    paidUntil: row.paidUntil,
    plan: {
      id: row.planId,
      slug: row.slug,
      name: row.name,
      includesAssistant: row.includesAssistant,
      priceCentsMonthly: row.priceCentsMonthly,
      priceCentsYearly: row.priceCentsYearly,
      active: row.planActive,
    },
  };
}

/**
 * SQL condition: the business may use the WhatsApp assistant right now
 * (its plan includes it and the subscription is not expired). `t` = the tenants row.
 */
export const ASSISTANT_ALLOWED = `((t.billing_cycle = 'lifetime' or t.paid_until > now())
  and exists (select 1 from plans plan where plan.id = t.plan_id and plan.includes_assistant))`;

/**
 * Marks a pending payment as paid and moves the business's paid_until forward, in one transaction.
 * Returns undefined when the payment does not exist or is no longer pending.
 */
export async function confirmPayment(sql: Sql, paymentId: string, now = new Date()) {
  return sql.begin(async (tx) => {
    const [payment] = await tx<{ id: string; tenantId: string; planId: string; months: number }[]>`
      select id, tenant_id, plan_id, months from payments where id = ${paymentId} and status = 'pending' for update
    `;
    if (!payment) return undefined;
    const [tenant] = await tx<{ paidUntil: Date | null }[]>`
      select paid_until from tenants where id = ${payment.tenantId} for update
    `;
    const paidUntil = extendPaidUntil(tenant!.paidUntil, payment.months, now);
    // The cycle (monthly/annual/lifetime) is the agency's choice and does not change here.
    await tx`update tenants set paid_until = ${paidUntil}, plan_id = ${payment.planId} where id = ${payment.tenantId}`;
    await tx`update payments set status = 'paid', paid_at = ${now} where id = ${payment.id}`;
    return { tenantId: payment.tenantId, paidUntil };
  });
}
