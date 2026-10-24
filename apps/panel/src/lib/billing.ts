import { useQuery } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { api, type BillingCycle, type Plan, type Subscription } from "@/api";

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensal",
  annual: "Anual",
  lifetime: "Definitivo",
};

/** Same rule as the server: 12 months use the yearly price when there is one. */
export function quote(plan: Pick<Plan, "priceCentsMonthly" | "priceCentsYearly">, months: number): number | null {
  if (months === 12 && plan.priceCentsYearly !== null) return plan.priceCentsYearly;
  if (plan.priceCentsMonthly === null) return null;
  return plan.priceCentsMonthly * months;
}

/** End of access after paying `months` now: from the current end when still paid, else from today. */
export function paidUntilAfter(paidUntil: string | null, months: number, now = new Date()): Date {
  const current = paidUntil ? new Date(paidUntil) : null;
  return addMonths(current && current > now ? current : now, months);
}

export type AccessTone = "ok" | "soon" | "expired" | "lifetime";

/** "Em dia · 23 dias", "Vence em 3 dias", "Venceu há 5 dias", "Definitivo". */
export function accessStatus(cycle: BillingCycle, paidUntil: string | null, now = new Date()): { tone: AccessTone; label: string; days: number | null } {
  if (cycle === "lifetime") return { tone: "lifetime", label: "Definitivo", days: null };
  if (!paidUntil) return { tone: "expired", label: "Sem pagamento", days: null };
  const days = Math.ceil((new Date(paidUntil).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) {
    const ago = Math.max(-days, 0);
    return { tone: "expired", label: ago === 0 ? "Venceu hoje" : `Venceu há ${ago} ${ago === 1 ? "dia" : "dias"}`, days };
  }
  if (days <= 7) return { tone: "soon", label: `Vence em ${days} ${days === 1 ? "dia" : "dias"}`, days };
  return { tone: "ok", label: `Em dia · ${days} dias`, days };
}

/** Reuses the agenda's status colors: green paid, amber expiring, red expired. */
export const TONE_STYLES: Record<AccessTone, string> = {
  ok: "bg-status-confirmed-bg text-status-confirmed border-status-confirmed-border",
  soon: "bg-status-pending-bg text-status-pending border-status-pending-border",
  expired: "bg-status-cancelled-bg text-status-cancelled border-status-cancelled-border",
  lifetime: "bg-status-done-bg text-status-done border-status-done-border",
};

export const formatDate = (iso: string | Date) => format(typeof iso === "string" ? new Date(iso) : iso, "dd/MM/yyyy");

export const subscriptionKey = (tenantId: string) => ["subscription", tenantId] as const;

/**
 * While blocked, checks often so the panel opens by itself once paid: every 4 s with a
 * Mercado Pago Pix open (it confirms by itself), every 15 s otherwise.
 */
export const useSubscription = (tenantId: string) =>
  useQuery({
    queryKey: subscriptionKey(tenantId),
    queryFn: () => api<Subscription>(`/tenants/${tenantId}/subscription`),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.expired) return 5 * 60_000;
      return data.pending?.automatic ? 4_000 : 15_000;
    },
  });
