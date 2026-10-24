import { format, parseISO, startOfWeek } from "date-fns";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type Appointment,
  type AppointmentStatus,
  type BusinessHour,
  type Tenant,
  type TimeOff,
} from "@/api";
import { PageHeader } from "@/components/page-header";
import { PersonPhoto, useProfessionalPhotos } from "@/components/person-photo";
import {
  blocksOnDay,
  closedAllDay,
  TimeOffNotice,
} from "@/components/time-off-section";
import { STATUS_STYLES, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDayLong,
  formatWeekdayShort,
  minutesOf,
  shiftDate,
  todayIn,
  zoned,
} from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useAppointments, useProfessionals } from "@/lib/queries";
import { professionalColors } from "@/lib/professional-color";
import { cn } from "@/lib/utils";
import { AgendaSidebar, type AgendaView } from "./AgendaSidebar";
import { AppointmentSheet } from "./AppointmentSheet";
import { TimeGrid } from "./TimeGrid";
import { NewAppointmentSheet } from "./NewAppointmentSheet";

const HIGHLIGHT_MS = 4000;
const DEFAULT_STATUSES: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
];

/** View preferences stay on this device (per business for the hidden professionals). */
function usePref<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const save = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
  };
  return [value, save];
}

/** Ids that appeared after the first load of this week (e.g. booked by the Lia just now). */
function useNewIds(list: Appointment[] | undefined, weekStart: string) {
  const seen = useRef<{ week: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!list) return;
    if (!seen.current || seen.current.week !== weekStart) {
      seen.current = { week: weekStart, ids: new Set(list.map((a) => a.id)) };
      return;
    }
    const added = list
      .filter((a) => !seen.current!.ids.has(a.id))
      .map((a) => a.id);
    list.forEach((a) => seen.current!.ids.add(a.id));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [list, weekStart]);
  return fresh;
}

export function AgendaPage({
  tenant,
  focus,
}: {
  tenant: Tenant;
  focus?: { date: string; key: number } | null;
}) {
  const mobile = useIsMobile();
  const today = todayIn(tenant.timezone);
  const [date, setDate] = useState(focus?.date ?? today);
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [professionalFilter, setProfessionalFilter] = useState<string | null>(
    null,
  );
  const [statuses, setStatuses] = useState<Set<AppointmentStatus>>(
    () => new Set(DEFAULT_STATUSES),
  );
  const [search, setSearch] = useState("");
  const [view, setView] = usePref<AgendaView>("chamalia.agendaView", "grid");
  const [sidebarOpen, setSidebarOpen] = usePref("chamalia.agendaSidebar", true);
  const [hiddenList, setHiddenList] = usePref<string[]>(
    `chamalia.agendaHidden.${tenant.id}`,
    [],
  );
  const hidden = new Set(hiddenList);
  const [slot, setSlot] = useState<{
    professionalId: string;
    time: string;
  } | null>(null);
  const showCancelled = statuses.has("cancelled");
  const toggleStatus = (status: AppointmentStatus) =>
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const weekStart = format(
    startOfWeek(parseISO(date), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const appointments = useAppointments(tenant.id, weekStart, weekDays[6]!);
  const professionals = useProfessionals(tenant.id);
  const photos = useProfessionalPhotos(tenant.id);
  const fresh = useNewIds(appointments.data, weekStart);
  const colors = useMemo(
    () =>
      professionalColors([
        ...(professionals.data ?? [])
          .filter((p) => p.kind === "professional")
          .map((p) => p.id),
        ...(appointments.data ?? []).map((a) => a.professionalId),
      ]),
    [professionals.data, appointments.data],
  );
  const timeOff = useQuery({
    queryKey: keys.timeOff(tenant.id),
    queryFn: () => api<TimeOff[]>(`/tenants/${tenant.id}/time-off`),
  });
  const dayBlocks = blocksOnDay(timeOff.data, date, tenant.timezone);
  const team = (professionals.data ?? []).filter(
    (p) => p.active && p.kind === "professional",
  );
  const businessHours = useQuery({
    queryKey: keys.hours(tenant.id),
    queryFn: () => api<BusinessHour[]>(`/tenants/${tenant.id}/business-hours`),
    enabled: !mobile,
  });
  const ownHoursQueries = useQueries({
    queries: team.map((p) => ({
      queryKey: keys.hours(tenant.id, p.id),
      queryFn: () =>
        api<BusinessHour[]>(
          `/tenants/${tenant.id}/business-hours?professionalId=${p.id}`,
        ),
      enabled: !mobile,
    })),
  });
  const ownHours = new Map(
    team.map((p, i) => [p.id, ownHoursQueries[i]?.data ?? []]),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments.data ?? []) {
      const day = zoned(a.startsAt, tenant.timezone).date;
      map.set(day, [...(map.get(day) ?? []), a]);
    }
    return map;
  }, [appointments.data, tenant.timezone]);

  const fullDay = byDay.get(date) ?? [];
  // Cancelled ones are noise by default (the time is free again); one tap brings them back.
  const cancelledCount = fullDay.filter((a) => a.status === "cancelled").length;
  const statusCounts = Object.fromEntries(
    (
      [
        "scheduled",
        "confirmed",
        "completed",
        "no_show",
        "cancelled",
      ] as AppointmentStatus[]
    ).map((st) => [st, fullDay.filter((a) => a.status === st).length]),
  ) as Record<AppointmentStatus, number>;
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const dayList = fullDay.filter(
    (a) =>
      statuses.has(a.status) &&
      (!term ||
        (a.customerName ?? "").toLowerCase().includes(term) ||
        (digits.length >= 3 && a.customerPhone.includes(digits))),
  );
  const visibleTeam = team.filter((p) => !hidden.has(p.id));
  // Keep the sheet's appointment fresh after refetches/optimistic updates.
  const current = selected
    ? ((appointments.data ?? []).find((a) => a.id === selected.id) ?? selected)
    : null;

  const go = (target: string) => {
    setDirection(target > date ? 1 : -1);
    setDate(target);
  };
  const open = (appointment: Appointment) => {
    setSelected(appointment);
    setSheetOpen(true);
  };

  // "Ver" on an agenda alert (AgendaAlerts) opens the agenda on the booking's day.
  useEffect(() => {
    if (focus) go(focus.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  const pending = dayList.filter((a) => a.status === "scheduled").length;
  const activeCount = dayList.filter((a) => a.status !== "cancelled").length;

  return (
    <div
      className={cn(
        !mobile && "flex h-[calc(100dvh-6rem)] min-h-[520px] flex-col",
      )}
    >
      {!mobile && (
        <PageHeader
          title="Agenda"
          description={`${formatDayLong(date)} · ${activeCount} ${activeCount === 1 ? "agendamento" : "agendamentos"}${pending ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}`}
          actions={
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label={
                  sidebarOpen ? "Esconder filtros" : "Mostrar filtros"
                }
                title={sidebarOpen ? "Esconder filtros" : "Mostrar filtros"}
              >
                {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
              </Button>
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Novo agendamento
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => go(shiftDate(date, -7))}
                aria-label="Semana anterior"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                onClick={() => go(today)}
                disabled={date === today}
              >
                Hoje
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => go(shiftDate(date, 7))}
                aria-label="Próxima semana"
              >
                <ChevronRight />
              </Button>
            </>
          }
        />
      )}

      {mobile && (
        <Button
          size="lg"
          className="mb-3 w-full"
          onClick={() => setNewOpen(true)}
        >
          <Plus /> Novo agendamento
        </Button>
      )}

      <div
        className={cn(
          !mobile && "min-h-0 flex-1",
          !mobile &&
            sidebarOpen &&
            "grid grid-cols-[208px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-5",
        )}
      >
        {!mobile && sidebarOpen && (
          <AgendaSidebar
            date={date}
            onDate={go}
            search={search}
            onSearch={setSearch}
            professionals={team}
            photos={photos.data ?? {}}
            colors={colors}
            hidden={hidden}
            onToggleProfessional={(id) =>
              setHiddenList(
                hidden.has(id)
                  ? hiddenList.filter((x) => x !== id)
                  : [...hiddenList, id],
              )
            }
            onShowAll={() => setHiddenList([])}
            statuses={statuses}
            onToggleStatus={toggleStatus}
            statusCounts={statusCounts}
            view={view}
            onView={setView}
          />
        )}
        <div className={cn("min-w-0", !mobile && "flex h-full flex-col")}>
          <WeekStrip
            days={weekDays}
            selected={date}
            today={today}
            counts={byDay}
            closed={
              new Set(
                weekDays.filter((d) =>
                  closedAllDay(
                    blocksOnDay(timeOff.data, d, tenant.timezone),
                    d,
                    tenant.timezone,
                  ),
                ),
              )
            }
            onSelect={go}
            compact={mobile}
            dense={!mobile}
          />
          <TimeOffNotice
            blocks={dayBlocks}
            day={date}
            timeZone={tenant.timezone}
          />

          {mobile ? (
            <MobileDay
              tenant={tenant}
              date={date}
              today={today}
              direction={direction}
              loading={appointments.isLoading}
              list={
                professionalFilter
                  ? dayList.filter(
                      (a) => a.professionalId === professionalFilter,
                    )
                  : dayList
              }
              fresh={fresh}
              colors={colors}
              photos={photos.data ?? {}}
              professionals={(professionals.data ?? []).filter(
                (p) => p.active && p.kind === "professional",
              )}
              professionalFilter={professionalFilter}
              onFilter={setProfessionalFilter}
              onPrev={() => go(shiftDate(date, -1))}
              onNext={() => go(shiftDate(date, 1))}
              onOpen={open}
              summary={`${activeCount} ${activeCount === 1 ? "agendamento" : "agendamentos"}${pending ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}`}
            />
          ) : view === "grid" ? (
            appointments.isLoading || professionals.isLoading ? (
              <Skeleton className="min-h-0 flex-1 rounded-lg" />
            ) : (
              <TimeGrid
                timeZone={tenant.timezone}
                date={date}
                today={today}
                list={dayList.filter((a) => !hidden.has(a.professionalId))}
                columns={[
                  ...visibleTeam,
                  // Someone no longer on the team but with a booking that day still gets a column.
                  ...dayList
                    .filter(
                      (a) =>
                        !team.some((p) => p.id === a.professionalId) &&
                        !hidden.has(a.professionalId),
                    )
                    .map((a) => ({
                      id: a.professionalId,
                      name: a.professionalName,
                    }))
                    .filter(
                      (c, i, all) => all.findIndex((x) => x.id === c.id) === i,
                    ),
                ]}
                colors={colors}
                photos={photos.data ?? {}}
                hours={businessHours.data ?? []}
                ownHours={ownHours}
                blocks={dayBlocks}
                fresh={fresh}
                onOpen={open}
                onSlot={(professionalId, time) => {
                  setSlot({ professionalId, time });
                  setNewOpen(true);
                }}
              />
            )
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DayTable
                tenant={tenant}
                loading={appointments.isLoading || professionals.isLoading}
                list={dayList.filter((a) => !hidden.has(a.professionalId))}
                fresh={fresh}
                colors={colors}
                photos={photos.data ?? {}}
                professionals={visibleTeam}
                onOpen={open}
                onNew={() => setNewOpen(true)}
              />
            </div>
          )}

          {cancelledCount > 0 && (mobile || !sidebarOpen) && (
            <div className="mt-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleStatus("cancelled")}
              >
                {showCancelled
                  ? "Esconder cancelados"
                  : `Mostrar cancelados (${cancelledCount})`}
              </Button>
            </div>
          )}
        </div>
      </div>

      <AppointmentSheet
        tenant={tenant}
        appointment={current}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
      <NewAppointmentSheet
        tenant={tenant}
        open={newOpen}
        initialDate={date}
        preferred={slot ?? undefined}
        onClose={() => {
          setNewOpen(false);
          setSlot(null);
        }}
      />
    </div>
  );
}

function WeekStrip(props: {
  days: string[];
  selected: string;
  today: string;
  counts: Map<string, Appointment[]>;
  /** Days the whole business is closed. */
  closed: Set<string>;
  onSelect: (day: string) => void;
  compact: boolean;
  /** Desktop: shorter cells, to leave the height to the day. */
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 grid-cols-7 gap-1.5",
        props.dense ? "mb-2" : "mb-4",
        props.compact && "gap-1",
      )}
    >
      {props.days.map((day) => {
        const selected = day === props.selected;
        const count = (props.counts.get(day) ?? []).filter(
          (a) => a.status !== "cancelled",
        ).length;
        const waiting = (props.counts.get(day) ?? []).filter(
          (a) => a.status === "scheduled",
        ).length;
        return (
          <button
            key={day}
            onClick={() => props.onSelect(day)}
            aria-current={selected ? "date" : undefined}
            aria-label={
              waiting
                ? `${formatWeekdayShort(day)} ${day.slice(8)}: ${count} ${count === 1 ? "agendamento" : "agendamentos"}, ${waiting} ${waiting === 1 ? "pendente" : "pendentes"}`
                : undefined
            }
            className={cn(
              "relative flex items-center rounded-lg border transition-colors duration-150 active:scale-[0.97]",
              // Desktop: one line ("Sáb 24 · 6"), to leave the height to the day.
              props.dense
                ? "h-10 flex-row justify-center gap-1.5"
                : "flex-col py-2",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "text-[11px] capitalize",
                selected
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground",
              )}
            >
              {formatWeekdayShort(day)}
            </span>
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                !selected && day === props.today && "text-primary",
              )}
            >
              {day.slice(8)}
            </span>
            <span
              className={cn(
                "text-[10px] tabular-nums",
                props.dense && "ml-1 text-[11px]",
                selected
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground",
              )}
            >
              {props.closed.has(day) ? "fechado" : count ? `${count}` : "–"}
            </span>
            {waiting > 0 && (
              <span
                className="absolute top-1 right-1 size-2 rounded-full bg-amber-500"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The professional's color, as a small dot; hidden from screen readers (the name is always written next to it). */
function Dot({
  color,
  small,
  className,
}: {
  color?: string;
  small?: boolean;
  className?: string;
}) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        small ? "size-2" : "size-2.5",
        className,
      )}
      style={{ backgroundColor: color }}
    />
  );
}

function blockClasses(a: Appointment) {
  return cn(
    "border border-l-[3px] transition-colors duration-200",
    STATUS_STYLES[a.status],
    a.status === "cancelled" && "opacity-60 line-through decoration-1",
  );
}

/**
 * Desktop: the day as a table. One row per start time that exists, one column per professional.
 * No hour scale, so nothing is squeezed, hidden or pushed below the fold: a day with 6 bookings
 * is 6 rows, whether they are at 09:00 or at 19:00. A booking that runs into the next rows spans them.
 */
function DayTable(props: {
  tenant: Tenant;
  loading: boolean;
  list: Appointment[];
  fresh: Set<string>;
  colors: Map<string, string>;
  photos: Record<string, string>;
  professionals: { id: string; name: string }[];
  onOpen: (a: Appointment) => void;
  onNew: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const tz = props.tenant.timezone;

  if (props.loading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (props.list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum agendamento neste dia.
        </p>
        <Button variant="outline" onClick={props.onNew}>
          <Plus /> Novo agendamento
        </Button>
      </div>
    );
  }

  const items = props.list.map((a) => ({
    a,
    start: minutesOf(zoned(a.startsAt, tz).time),
    end: minutesOf(zoned(a.endsAt, tz).time),
  }));
  const rows = [...new Set(items.map((i) => i.start))].sort((x, y) => x - y);
  // Active professionals, plus anyone with a booking that day who is no longer listed.
  const columns = [...props.professionals];
  for (const { a } of items) {
    if (!columns.some((p) => p.id === a.professionalId))
      columns.push({ id: a.professionalId, name: a.professionalName });
  }
  const label = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `64px repeat(${columns.length}, minmax(140px, 1fr))`,
            gridTemplateRows: `auto repeat(${rows.length}, minmax(64px, auto))`,
          }}
        >
          <div
            className="sticky left-0 z-[2] border-b bg-card"
            style={{ gridRow: 1, gridColumn: 1 }}
          />
          {columns.map((p, c) => {
            const count = props.list.filter(
              (a) => a.professionalId === p.id && a.status !== "cancelled",
            ).length;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-l px-3 py-2.5"
                style={{ gridRow: 1, gridColumn: c + 2 }}
              >
                <PersonPhoto
                  name={p.name}
                  src={props.photos[p.id]}
                  className="size-9"
                  ringColor={props.colors.get(p.id)}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {count} {count === 1 ? "atendimento" : "atendimentos"}
                  </div>
                </div>
              </div>
            );
          })}

          {rows.map((time, r) => (
            <div key={time} className="contents">
              <div
                className="sticky left-0 z-[2] border-t bg-card px-2 pt-2.5 text-right text-xs font-medium text-muted-foreground tabular-nums"
                style={{ gridRow: r + 2, gridColumn: 1 }}
              >
                {label(time)}
              </div>
              {columns.map((p, c) => (
                <div
                  key={p.id}
                  className="border-t border-l"
                  style={{ gridRow: r + 2, gridColumn: c + 2 }}
                />
              ))}
            </div>
          ))}

          {items.map(({ a, start, end }) => {
            const row = rows.indexOf(start);
            const column = columns.findIndex((p) => p.id === a.professionalId);
            const span = Math.max(
              rows.filter((time, j) => j >= row && time < end).length,
              1,
            );
            const isNew = props.fresh.has(a.id);
            return (
              <div
                key={a.id}
                className="z-[1] p-1"
                style={{
                  gridRow: `${row + 2} / span ${span}`,
                  gridColumn: column + 2,
                }}
              >
                <motion.button
                  initial={
                    isNew && !reduceMotion ? { opacity: 0, scale: 0.97 } : false
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.22 }}
                  onClick={() => props.onOpen(a)}
                  className={cn(
                    "flex h-full w-full flex-col justify-center overflow-hidden rounded-md px-2.5 py-1.5 text-left text-xs hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
                    blockClasses(a),
                    isNew && "ring-2 ring-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium tabular-nums">
                      <Dot color={props.colors.get(a.professionalId)} small />
                      {zoned(a.startsAt, tz).time}–{zoned(a.endsAt, tz).time}
                    </span>
                    {a.status === "scheduled" && (
                      <span className="text-[11px] font-medium">Pendente</span>
                    )}
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">
                    {a.customerName ?? "Sem nome"}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {a.serviceName}
                  </div>
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Phone: the day as a list; swipe sideways to change day. */
function MobileDay(props: {
  tenant: Tenant;
  date: string;
  today: string;
  direction: number;
  loading: boolean;
  list: Appointment[];
  fresh: Set<string>;
  colors: Map<string, string>;
  photos: Record<string, string>;
  professionals: { id: string; name: string }[];
  professionalFilter: string | null;
  onFilter: (id: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpen: (a: Appointment) => void;
  summary: string;
}) {
  const reduceMotion = useReducedMotion();
  const offset = reduceMotion ? 0 : 48;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={props.onPrev}
          aria-label="Dia anterior"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold first-letter:uppercase">
            {props.date === props.today ? "Hoje" : formatDayLong(props.date)}
          </div>
          <div className="text-xs text-muted-foreground">{props.summary}</div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={props.onNext}
          aria-label="Próximo dia"
        >
          <ChevronRight />
        </Button>
      </div>

      {props.professionals.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {[
            { id: null, name: "Todas" } as { id: string | null; name: string },
            ...props.professionals,
          ].map((p) => (
            <button
              key={p.id ?? "all"}
              onClick={() => props.onFilter(p.id)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm transition-colors duration-150",
                props.professionalFilter === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card",
              )}
            >
              {p.id ? (
                <PersonPhoto
                  name={p.name}
                  src={props.photos[p.id]}
                  className="mr-2 inline-flex size-5 align-middle text-[9px]"
                  ringColor={props.colors.get(p.id)}
                />
              ) : null}
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden">
        <AnimatePresence
          mode="popLayout"
          initial={false}
          custom={props.direction}
        >
          <motion.div
            key={props.date}
            custom={props.direction}
            initial={{ x: props.direction * offset, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -props.direction * offset, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            dragDirectionLock
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60 || info.velocity.x < -400) props.onNext();
              else if (info.offset.x > 60 || info.velocity.x > 400)
                props.onPrev();
            }}
            className="min-h-[50dvh] touch-pan-y"
          >
            {props.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : props.list.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nenhum agendamento neste dia.
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {props.list.map((a) => (
                  <li key={a.id}>
                    <motion.button
                      initial={
                        props.fresh.has(a.id) && !reduceMotion
                          ? { backgroundColor: "var(--accent)" }
                          : false
                      }
                      animate={{ backgroundColor: "rgba(0,0,0,0)" }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      onClick={() => props.onOpen(a)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 border-l-[3px] border-l-transparent px-3 py-1.5 text-left active:bg-muted",
                        a.status === "scheduled" &&
                          "border-l-amber-500 bg-amber-500/5",
                        a.status === "cancelled" && "opacity-60",
                      )}
                    >
                      <div className="w-12 shrink-0 tabular-nums">
                        <div className="text-sm font-semibold">
                          {zoned(a.startsAt, props.tenant.timezone).time}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {zoned(a.endsAt, props.tenant.timezone).time}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "truncate text-sm font-medium",
                            a.status === "cancelled" && "line-through",
                          )}
                        >
                          {a.customerName ?? "Sem nome"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          <Dot
                            color={props.colors.get(a.professionalId)}
                            small
                            className="mr-1.5"
                          />
                          {a.serviceName} · {a.professionalName}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </motion.button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
