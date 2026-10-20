import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Check, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Appointment, type AppointmentStatus, type Slot, type Tenant } from "@/api";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDayLong, formatDuration, formatPhone, formatPrice, minutesOf, todayIn, zoned } from "@/format";
import { keys, useProfessionals } from "@/lib/queries";
import { cn } from "@/lib/utils";

const STATUS_TOAST: Partial<Record<AppointmentStatus, string>> = {
  confirmed: "Agendamento aprovado",
  cancelled: "Agendamento cancelado",
  completed: "Marcado como concluído",
  no_show: "Marcado como falta",
};

export function useUpdateStatus(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api(`/tenants/${tenantId}/appointments/${id}`, { method: "PATCH", body: { status } }),
    // Optimistic: the color changes right away (with a CSS transition).
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: keys.allAppointments(tenantId) });
      const snapshot = queryClient.getQueriesData<Appointment[]>({ queryKey: keys.allAppointments(tenantId) });
      queryClient.setQueriesData<Appointment[]>({ queryKey: keys.allAppointments(tenantId) }, (list) =>
        list?.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error((error as Error).message);
    },
    onSuccess: (_data, { status }) => {
      const message = STATUS_TOAST[status];
      if (message) toast.success(message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.allAppointments(tenantId) }),
  });
}

export function AppointmentSheet({
  tenant,
  appointment,
  open,
  onClose,
}: {
  tenant: Tenant;
  /** Kept after closing so the panel can animate out with its content. */
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const updateStatus = useUpdateStatus(tenant.id);

  useEffect(() => setMode("view"), [appointment?.id]);

  if (!appointment) return null;

  const start = zoned(appointment.startsAt, tenant.timezone);
  const end = zoned(appointment.endsAt, tenant.timezone);
  const active = appointment.status === "scheduled" || appointment.status === "confirmed";
  const setStatus = (status: AppointmentStatus) => updateStatus.mutate({ id: appointment.id, status });

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={(open) => !open && onClose()}
        title={mode === "view" ? (appointment.customerName ?? "Cliente sem nome") : "Remarcar"}
        description={
          mode === "view"
            ? `${appointment.serviceName} · ${appointment.professionalName}`
            : `${appointment.customerName ?? "Cliente"} · ${appointment.serviceName}`
        }
        footer={
          mode === "view" && active ? (
            <div className="grid w-full gap-2">
              {appointment.status === "scheduled" && (
                <Button size="lg" onClick={() => setStatus("confirmed")}>
                  <Check /> Aprovar
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={() => setMode("reschedule")}>
                  <CalendarClock /> Remarcar
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmCancel(true)}
                >
                  <X /> Cancelar
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {mode === "view" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusBadge status={appointment.status} className="h-6 px-2.5 text-xs" />
              <span className="text-xs text-muted-foreground">
                via {appointment.source === "whatsapp" ? `WhatsApp (${tenant.assistantName})` : "painel"}
              </span>
            </div>

            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Data</dt>
              <dd className="capitalize">{formatDayLong(start.date)}</dd>
              <dt className="text-muted-foreground">Horário</dt>
              <dd>
                {start.time} – {end.time}{" "}
                <span className="text-muted-foreground">
                  ({formatDuration(minutesOf(end.time) - minutesOf(start.time))})
                </span>
              </dd>
              <dt className="text-muted-foreground">Serviço</dt>
              <dd>{appointment.serviceName}</dd>
              <dt className="text-muted-foreground">Profissional</dt>
              <dd>{appointment.professionalName}</dd>
              <dt className="text-muted-foreground">Valor</dt>
              <dd>{formatPrice(appointment.priceCents)}</dd>
              <dt className="text-muted-foreground">Telefone</dt>
              <dd>
                <a
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  href={`https://wa.me/${appointment.customerPhone}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-3.5" />
                  {formatPhone(appointment.customerPhone)}
                </a>
              </dd>
            </dl>

            {appointment.status === "confirmed" && (
              <div className="flex gap-2 border-t pt-4">
                <Button variant="ghost" size="sm" onClick={() => setStatus("completed")}>
                  Marcar como concluído
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStatus("no_show")}>
                  Faltou
                </Button>
              </div>
            )}
            {!active && <p className="text-xs text-muted-foreground">Este agendamento não pode mais ser alterado.</p>}
          </div>
        ) : (
          <Reschedule tenant={tenant} appointment={appointment} onDone={() => setMode("view")} />
        )}
      </ResponsiveSheet>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {appointment.customerName ?? "Cliente"} · {appointment.serviceName} · {start.time}. O horário fica livre
              para outras clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setStatus("cancelled");
                onClose();
              }}
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Reschedule({ tenant, appointment, onDone }: { tenant: Tenant; appointment: Appointment; onDone: () => void }) {
  const queryClient = useQueryClient();
  const today = todayIn(tenant.timezone);
  const [date, setDate] = useState(() => {
    const current = zoned(appointment.startsAt, tenant.timezone).date;
    return current < today ? today : current;
  });
  const [professionalId, setProfessionalId] = useState(appointment.professionalId);
  const [time, setTime] = useState<string | null>(null);
  const professionals = useProfessionals(tenant.id);
  const eligible = (professionals.data ?? []).filter((p) => p.active && p.serviceIds.includes(appointment.serviceId));

  const slots = useQuery({
    queryKey: ["availability", tenant.id, appointment.id, date, professionalId],
    queryFn: () =>
      api<Slot[]>(
        `/tenants/${tenant.id}/availability?serviceId=${appointment.serviceId}&date=${date}&professionalId=${professionalId}&excludeAppointmentId=${appointment.id}`,
      ),
  });

  const reschedule = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant.id}/appointments/${appointment.id}/reschedule`, {
        method: "POST",
        body: { date, time, professionalId },
      }),
    onSuccess: () => {
      toast.success(`Remarcado para ${format(parseISO(date), "dd/MM")} às ${time}`);
      void queryClient.invalidateQueries({ queryKey: keys.allAppointments(tenant.id) });
      onDone();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-sm font-medium">Profissional</div>
        <Select
          value={professionalId}
          onValueChange={(value) => {
            setProfessionalId(value);
            setTime(null);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eligible.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Dia</div>
        <Calendar
          mode="single"
          locale={ptBR}
          selected={parseISO(date)}
          onSelect={(day) => {
            if (!day) return;
            setDate(format(day, "yyyy-MM-dd"));
            setTime(null);
          }}
          disabled={[{ before: parseISO(today) }, { after: addDays(parseISO(today), tenant.bookingHorizonDays) }]}
          className="rounded-md border p-2"
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Horário</div>
        {slots.isLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : slots.data && slots.data.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {slots.data.map((slot) => (
              <button
                key={slot.time}
                onClick={() => setTime(slot.time)}
                className={cn(
                  "h-10 rounded-md border text-sm font-medium tabular-nums transition-colors duration-150 active:scale-[0.97]",
                  time === slot.time
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:border-primary/50 hover:bg-accent",
                )}
              >
                {slot.time}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {slots.error ? (slots.error as Error).message : "Nenhum horário livre neste dia. Escolha outro dia."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" size="lg" onClick={onDone}>
          Voltar
        </Button>
        <Button size="lg" disabled={!time || reschedule.isPending} onClick={() => reschedule.mutate()}>
          {reschedule.isPending ? "Remarcando…" : time ? `Remarcar ${time}` : "Escolha o horário"}
        </Button>
      </div>
    </div>
  );
}
