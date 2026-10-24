import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Tenant, type TimeOff } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDayLong, shiftDate, todayIn, zoned } from "@/format";
import { keys, useProfessionals } from "@/lib/queries";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background text-foreground [&>option]:bg-background [&>option]:text-foreground px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** "Folgas e feriados": closing days, a professional's absence or a blocked time. The Lia and the agenda respect them. */
export function TimeOffSection({ tenant }: { tenant: Tenant }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: keys.timeOff(tenant.id), queryFn: () => api<TimeOff[]>(`/tenants/${tenant.id}/time-off`) });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/tenants/${tenant.id}/time-off/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Bloqueio removido");
      void queryClient.invalidateQueries({ queryKey: keys.timeOff(tenant.id) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Folgas e feriados</h2>
          <p className="text-sm text-muted-foreground">Dias fechados, férias, folga de uma pessoa ou um horário bloqueado.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Novo bloqueio
        </Button>
      </div>

      <div className="mt-3 rounded-lg border">
        {list.isLoading ? (
          <Skeleton className="h-20" />
        ) : !list.data?.length ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum bloqueio marcado.</p>
        ) : (
          <ul className="divide-y">
            {list.data.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{describe(row, tenant.timezone)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.professionalName ?? "Negócio todo"}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                </div>
                <ConfirmDelete
                  title="Remover este bloqueio?"
                  description="Os horários voltam a ficar livres para agendar."
                  confirmLabel="Remover"
                  onConfirm={() => remove.mutate(row.id)}
                >
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Remover bloqueio">
                    <Trash2 />
                  </Button>
                </ConfirmDelete>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewTimeOffSheet tenant={tenant} open={open} onOpenChange={setOpen} />
    </section>
  );
}

/** Blocks that touch the given day ("AAAA-MM-DD", business timezone). */
export function blocksOnDay(blocks: TimeOff[] | undefined, day: string, timeZone: string): TimeOff[] {
  return (blocks ?? []).filter((row) => zoned(row.startsAt, timeZone).date <= day && day <= zoned(new Date(new Date(row.endsAt).getTime() - 1).toISOString(), timeZone).date);
}

/** True when the whole business is closed all day (no professional is bookable). */
export function closedAllDay(blocks: TimeOff[], day: string, timeZone: string): boolean {
  return blocks.some((row) => {
    if (row.professionalId) return false;
    const start = zoned(row.startsAt, timeZone);
    const end = zoned(row.endsAt, timeZone);
    return (start.date < day || start.time === "00:00") && (end.date > day || end.time === "00:00" || end.time > "23:59");
  });
}

/** One line per block on the day, above the agenda: "Fechado (Feriado)" / "Ana de folga, 12:00 às 14:00". */
export function TimeOffNotice({ blocks, day, timeZone }: { blocks: TimeOff[]; day: string; timeZone: string }) {
  if (!blocks.length) return null;
  return (
    <ul className="mb-3 space-y-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm" aria-label="Bloqueios do dia">
      {blocks.map((row) => {
        const start = zoned(row.startsAt, timeZone);
        const end = zoned(row.endsAt, timeZone);
        const partial = !(start.date < day || start.time === "00:00") || !(end.date > day || end.time === "00:00");
        const hours = partial ? `, ${start.date === day ? start.time : "00:00"} às ${end.date === day ? end.time : "24:00"}` : "";
        return (
          <li key={row.id} className="text-muted-foreground">
            <span className="font-medium text-foreground">{row.professionalName ? `${row.professionalName} fora` : "Fechado"}</span>
            {hours}
            {row.reason ? ` · ${row.reason}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

/** "sáb, 25 de outubro" / "25 a 28 de outubro" / "sexta, 24 de outubro, 14:00 às 16:00" */
function describe(row: TimeOff, timeZone: string): string {
  const start = zoned(row.startsAt, timeZone);
  const end = zoned(row.endsAt, timeZone);
  const allDay = start.time === "00:00" && end.time === "00:00";
  if (!allDay) return `${formatDayLong(start.date)}, ${start.time} às ${end.time}`;
  const lastDay = shiftDate(end.date, -1);
  return lastDay === start.date ? formatDayLong(start.date) : `${formatDayLong(start.date)} até ${formatDayLong(lastDay)}`;
}

function NewTimeOffSheet({ tenant, open, onOpenChange }: { tenant: Tenant; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const professionals = useProfessionals(tenant.id);
  const today = todayIn(tenant.timezone);
  const [who, setWho] = useState("all");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api<{ saved: number; affectedAppointments: number }>(`/tenants/${tenant.id}/time-off`, {
        method: "POST",
        body: {
          professionalId: who === "all" ? null : who,
          startDate,
          endDate,
          allDay,
          ...(allDay ? {} : { startTime, endTime }),
          reason: reason.trim() || null,
        },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.timeOff(tenant.id) });
      void queryClient.invalidateQueries({ queryKey: keys.allAppointments(tenant.id) });
      const n = result.affectedAppointments;
      if (n > 0) toast.warning(`Bloqueio salvo. Atenção: ${n} ${n === 1 ? "agendamento já marcado cai" : "agendamentos já marcados caem"} nesse período. Avise ${n === 1 ? "a cliente" : "as clientes"}.`, { duration: 10000 });
      else toast.success("Bloqueio salvo");
      setReason("");
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const invalid = endDate < startDate || (!allDay && endTime <= startTime);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo bloqueio"
      description="Nesse período ninguém consegue marcar horário, nem pela atendente."
      footer={
        <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
          {save.isPending ? "Salvando…" : "Salvar bloqueio"}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="space-y-1.5">
          <Label htmlFor="to-who">Quem</Label>
          <select id="to-who" className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Negócio todo (feriado, recesso)</option>
            {professionals.data
              ?.filter((p) => p.kind === "professional" && p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (folga ou ausência)
                </option>
              ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="to-start">De</Label>
            <Input
              id="to-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-end">Até</Label>
            <Input id="to-end" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} /> Dia inteiro
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="to-from">Das</Label>
              <Input id="to-from" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-until">Às</Label>
              <Input id="to-until" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">Vale para cada dia do período, nesse horário.</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="to-reason">Motivo (opcional)</Label>
          <Input id="to-reason" maxLength={120} placeholder="Ex.: Feriado, férias, médico" value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">A atendente pode citar o motivo para a cliente.</p>
        </div>
        {invalid && <p className="text-sm text-destructive">Confira as datas e os horários.</p>}
      </div>
    </ResponsiveSheet>
  );
}
