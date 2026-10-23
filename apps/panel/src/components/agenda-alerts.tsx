import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Tenant } from "@/api";
import { shiftDate, todayIn, zoned } from "@/format";
import { useAgendaAlertsEnabled } from "@/lib/agenda-alerts";
import { useAppointments } from "@/lib/queries";

/**
 * Tells the team about the agenda without them having to look at it: once when the panel opens
 * (pending bookings waiting) and whenever the assistant books a new time. Works on any screen.
 * Renders nothing. Turned off per device in Configurações.
 */
export function AgendaAlerts({ tenant, onOpen }: { tenant: Tenant; onOpen: (date: string) => void }) {
  const enabled = useAgendaAlertsEnabled();
  const from = todayIn(tenant.timezone);
  const list = useAppointments(tenant.id, from, shiftDate(from, 28));
  const seen = useRef<Set<string> | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const data = list.data;
    if (!data || list.isPlaceholderData) return;

    // First load: remember what is already there and report what is waiting for approval.
    if (!seen.current) {
      seen.current = new Set(data.map((a) => a.id));
      const waiting = data.filter((a) => a.status === "scheduled" && new Date(a.startsAt) > new Date());
      if (enabled && waiting.length > 0) {
        const first = waiting[0]!;
        toast.info(waiting.length === 1 ? "Você tem 1 agendamento pendente" : `Você tem ${waiting.length} agendamentos pendentes`, {
          duration: 12_000,
          action: { label: "Ver", onClick: () => onOpenRef.current(zoned(first.startsAt, tenant.timezone).date) },
        });
      }
      return;
    }

    const added = data.filter((a) => !seen.current!.has(a.id));
    added.forEach((a) => seen.current!.add(a.id));
    const booked = added.filter((a) => a.source === "whatsapp" && a.status !== "cancelled");
    const first = booked[0];
    if (!enabled || !first) return;
    const when = zoned(first.startsAt, tenant.timezone);
    toast.info(
      booked.length === 1
        ? `Novo agendamento: ${first.customerName ?? "cliente"}, ${when.date.slice(8)}/${when.date.slice(5, 7)} às ${when.time}`
        : `${booked.length} novos agendamentos`,
      { duration: 12_000, action: { label: "Ver", onClick: () => onOpenRef.current(when.date) } },
    );
  }, [list.data, list.isPlaceholderData, enabled, tenant.timezone]);

  return null;
}
