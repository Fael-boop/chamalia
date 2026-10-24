import { Bell, CircleHelp } from "lucide-react";
import { useState } from "react";
import type { Tenant } from "@/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shiftDate, todayIn, zoned } from "@/format";
import { useAppointments } from "@/lib/queries";
import { cn } from "@/lib/utils";

const SUPPORT_URL = `https://wa.me/556294737276?text=${encodeURIComponent("Oi! Preciso de ajuda com a Chama Lia.")}`;

/** Help: talks to the Chama Lia on WhatsApp. */
export function HelpButton({ className }: { className?: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className={className}>
      <a href={SUPPORT_URL} target="_blank" rel="noreferrer" aria-label="Ajuda pelo WhatsApp" title="Ajuda pelo WhatsApp">
        <CircleHelp />
      </a>
    </Button>
  );
}

/**
 * The bell: bookings waiting for approval in the next 4 weeks, so none goes unnoticed.
 * Same data (and query) as the agenda alerts, refreshed every few seconds.
 */
export function NotificationsButton({ tenant, onOpenDay, className }: { tenant: Tenant; onOpenDay: (date: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const from = todayIn(tenant.timezone);
  const appointments = useAppointments(tenant.id, from, shiftDate(from, 28));
  const now = Date.now();
  const pending = (appointments.data ?? []).filter((a) => a.status === "scheduled" && new Date(a.startsAt).getTime() > now);
  const count = pending.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label={count ? `Avisos: ${count} pendentes` : "Avisos"} title="Avisos">
          <Bell />
          {count > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Pendentes de aprovação</p>
          <p className="text-xs text-muted-foreground">Agendamentos dos próximos 28 dias que esperam o seu ok.</p>
        </div>
        {count === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada pendente. Tudo em dia.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {pending.slice(0, 12).map((a) => {
              const when = zoned(a.startsAt, tenant.timezone);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenDay(when.date);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {when.date.slice(8)}/{when.date.slice(5, 7)}
                      <span className="block font-medium text-foreground">{when.time}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.customerName ?? "Sem nome"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.serviceName} · {a.professionalName}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
