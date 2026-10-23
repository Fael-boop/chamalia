import { format, parseISO, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Appointment, Tenant } from "@/api";
import { PageHeader } from "@/components/page-header";
import { STATUS_STYLES, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDayLong, formatWeekdayShort, minutesOf, shiftDate, todayIn, zoned } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppointments, useProfessionals } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AppointmentSheet } from "./AppointmentSheet";
import { NewAppointmentSheet } from "./NewAppointmentSheet";

const MAX_PX_PER_MIN = 1.4;
const MIN_PX_PER_MIN = 0.9;
/** Space taken by the page header, week strip and column titles above the grid. */
const GRID_CHROME_PX = 330;
const HIGHLIGHT_MS = 4000;

function useViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
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
    const added = list.filter((a) => !seen.current!.ids.has(a.id)).map((a) => a.id);
    list.forEach((a) => seen.current!.ids.add(a.id));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [list, weekStart]);
  return fresh;
}

export function AgendaPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const today = todayIn(tenant.timezone);
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [professionalFilter, setProfessionalFilter] = useState<string | null>(null);

  const weekStart = format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const appointments = useAppointments(tenant.id, weekStart, weekDays[6]!);
  const professionals = useProfessionals(tenant.id);
  const fresh = useNewIds(appointments.data, weekStart);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments.data ?? []) {
      const day = zoned(a.startsAt, tenant.timezone).date;
      map.set(day, [...(map.get(day) ?? []), a]);
    }
    return map;
  }, [appointments.data, tenant.timezone]);

  const dayList = byDay.get(date) ?? [];
  // Keep the sheet's appointment fresh after refetches/optimistic updates.
  const current = selected ? ((appointments.data ?? []).find((a) => a.id === selected.id) ?? selected) : null;

  const go = (target: string) => {
    setDirection(target > date ? 1 : -1);
    setDate(target);
  };
  const open = (appointment: Appointment) => {
    setSelected(appointment);
    setSheetOpen(true);
  };

  // A booking made by the assistant may land outside the screen or on another day: say so out loud.
  useEffect(() => {
    if (fresh.size === 0) return;
    const added = (appointments.data ?? []).filter((a) => fresh.has(a.id) && a.source === "whatsapp");
    const first = added[0];
    if (!first) return;
    const when = zoned(first.startsAt, tenant.timezone);
    toast.info(
      added.length === 1
        ? `Novo agendamento: ${first.customerName ?? "cliente"}, ${when.date.slice(8)}/${when.date.slice(5, 7)} às ${when.time}`
        : `${added.length} novos agendamentos`,
      {
        duration: 12_000,
        action: {
          label: "Ver",
          onClick: () => {
            go(when.date);
            open(first);
          },
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  const pending = dayList.filter((a) => a.status === "scheduled").length;
  const activeCount = dayList.filter((a) => a.status !== "cancelled").length;

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Agenda"
          description={`${formatDayLong(date)} · ${activeCount} ${activeCount === 1 ? "agendamento" : "agendamentos"}${pending ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}`}
          actions={
            <>
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Novo agendamento
              </Button>
              <Button variant="outline" size="icon" onClick={() => go(shiftDate(date, -7))} aria-label="Semana anterior">
                <ChevronLeft />
              </Button>
              <Button variant="outline" onClick={() => go(today)} disabled={date === today}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={() => go(shiftDate(date, 7))} aria-label="Próxima semana">
                <ChevronRight />
              </Button>
            </>
          }
        />
      )}

      {mobile && (
        <Button size="lg" className="mb-3 w-full" onClick={() => setNewOpen(true)}>
          <Plus /> Novo agendamento
        </Button>
      )}

      <WeekStrip days={weekDays} selected={date} today={today} counts={byDay} onSelect={go} compact={mobile} />

      {mobile ? (
        <MobileDay
          tenant={tenant}
          date={date}
          today={today}
          direction={direction}
          loading={appointments.isLoading}
          list={professionalFilter ? dayList.filter((a) => a.professionalId === professionalFilter) : dayList}
          fresh={fresh}
          professionals={(professionals.data ?? []).filter((p) => p.active && p.kind === "professional")}
          professionalFilter={professionalFilter}
          onFilter={setProfessionalFilter}
          onPrev={() => go(shiftDate(date, -1))}
          onNext={() => go(shiftDate(date, 1))}
          onOpen={open}
          summary={`${activeCount} ${activeCount === 1 ? "agendamento" : "agendamentos"}${pending ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}`}
        />
      ) : (
        <DayGrid
          tenant={tenant}
          date={date}
          today={today}
          loading={appointments.isLoading || professionals.isLoading}
          list={dayList}
          fresh={fresh}
          professionals={(professionals.data ?? []).filter((p) => p.active && p.kind === "professional")}
          onOpen={open}
        />
      )}

      <AppointmentSheet tenant={tenant} appointment={current} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <NewAppointmentSheet tenant={tenant} open={newOpen} initialDate={date} onClose={() => setNewOpen(false)} />
    </>
  );
}

function WeekStrip(props: {
  days: string[];
  selected: string;
  today: string;
  counts: Map<string, Appointment[]>;
  onSelect: (day: string) => void;
  compact: boolean;
}) {
  return (
    <div className={cn("mb-4 grid grid-cols-7 gap-1.5", props.compact && "gap-1")}>
      {props.days.map((day) => {
        const selected = day === props.selected;
        const count = (props.counts.get(day) ?? []).filter((a) => a.status !== "cancelled").length;
        const waiting = (props.counts.get(day) ?? []).filter((a) => a.status === "scheduled").length;
        return (
          <button
            key={day}
            onClick={() => props.onSelect(day)}
            aria-current={selected ? "date" : undefined}
            aria-label={waiting ? `${day.slice(8)}, ${count} agendamentos, ${waiting} pendentes` : undefined}
            className={cn(
              "relative flex flex-col items-center rounded-lg border py-2 transition-colors duration-150 active:scale-[0.97]",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40",
            )}
          >
            <span className={cn("text-[11px] capitalize", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {formatWeekdayShort(day)}
            </span>
            <span className={cn("text-base font-semibold tabular-nums", !selected && day === props.today && "text-primary")}>
              {day.slice(8)}
            </span>
            <span className={cn("text-[10px] tabular-nums", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {count ? `${count}` : "–"}
            </span>
            {waiting > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function blockClasses(a: Appointment) {
  return cn(
    "border border-l-[3px] transition-colors duration-200",
    STATUS_STYLES[a.status],
    a.status === "cancelled" && "opacity-60 line-through decoration-1",
  );
}

/** Desktop: one column per professional, blocks positioned by time. */
function DayGrid(props: {
  tenant: Tenant;
  date: string;
  today: string;
  loading: boolean;
  list: Appointment[];
  fresh: Set<string>;
  professionals: { id: string; name: string }[];
  onOpen: (a: Appointment) => void;
}) {
  const reduceMotion = useReducedMotion();
  const tz = props.tenant.timezone;
  const items = props.list.map((a) => ({
    a,
    start: minutesOf(zoned(a.startsAt, tz).time),
    end: minutesOf(zoned(a.endsAt, tz).time),
  }));
  // Only the hours that matter (first to last appointment, at least 6 h), scaled to fit the screen
  // so the whole day is visible without scrolling.
  const firstHour = items.length ? Math.min(...items.map((i) => Math.floor(i.start / 60))) : 9;
  const lastHour = items.length ? Math.max(...items.map((i) => Math.ceil(i.end / 60))) : 18;
  const spanHours = Math.max(lastHour - firstHour, 6);
  const dayStart = Math.min(firstHour, 24 - spanHours) * 60;
  const dayEnd = dayStart + spanHours * 60;
  const viewportHeight = useViewportHeight();
  const pxPerMin = Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, (viewportHeight - GRID_CHROME_PX) / (dayEnd - dayStart)));
  const hours = Array.from({ length: (dayEnd - dayStart) / 60 }, (_, i) => dayStart + i * 60);
  const height = (dayEnd - dayStart) * pxPerMin;
  const nowMinutes = props.date === props.today ? minutesOf(zoned(new Date().toISOString(), tz).time) : null;
  const columns = props.professionals.length || 1;

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

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]" style={{ display: "grid", gridTemplateColumns: `56px repeat(${columns}, minmax(170px, 1fr))` }}>
          <div className="sticky top-0 z-10 border-b bg-card" />
          {props.professionals.map((p) => {
            const count = props.list.filter((a) => a.professionalId === p.id && a.status !== "cancelled").length;
            return (
              <div key={p.id} className="sticky top-0 z-10 border-b border-l bg-card px-3 py-2.5">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {count} {count === 1 ? "atendimento" : "atendimentos"}
                </div>
              </div>
            );
          })}

          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
                style={{ top: (h - dayStart) * pxPerMin }}
              >
                {h > dayStart && `${String(h / 60).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {props.professionals.map((p) => (
            <div key={p.id} className="relative border-l" style={{ height }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: (h - dayStart) * pxPerMin }}>
                  <div className="absolute inset-x-0 border-t border-dashed border-border/40" style={{ top: 30 * pxPerMin }} />
                </div>
              ))}
              {items
                .filter((i) => i.a.professionalId === p.id)
                .map(({ a, start, end }) => {
                  const isNew = props.fresh.has(a.id);
                  const blockHeight = Math.max((end - start) * pxPerMin - 3, 22);
                  return (
                    <motion.button
                      key={a.id}
                      initial={isNew && !reduceMotion ? { opacity: 0, scale: 0.97 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.22 }}
                      onClick={() => props.onOpen(a)}
                      className={cn(
                        "absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
                        blockClasses(a),
                        isNew && "ring-2 ring-primary/40",
                      )}
                      style={{ top: (start - dayStart) * pxPerMin + 1, height: blockHeight }}
                    >
                      {blockHeight < 40 ? (
                        // Short block: time and name share one line so nobody is hidden.
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-medium tabular-nums">{zoned(a.startsAt, props.tenant.timezone).time}</span>
                          <span className="truncate font-semibold text-foreground">{a.customerName ?? "Sem nome"}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium tabular-nums">{zoned(a.startsAt, props.tenant.timezone).time}</span>
                            {a.status === "scheduled" && <span className="text-[10px]">Pendente</span>}
                          </div>
                          <div className="truncate font-semibold text-foreground">{a.customerName ?? "Sem nome"}</div>
                        </>
                      )}
                      {blockHeight > 52 && <div className="truncate text-muted-foreground">{a.serviceName}</div>}
                    </motion.button>
                  );
                })}
              {nowMinutes !== null && nowMinutes > dayStart && nowMinutes < dayEnd && (
                <div className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-primary" style={{ top: (nowMinutes - dayStart) * pxPerMin }} />
              )}
            </div>
          ))}
        </div>
      </div>
      {props.list.length === 0 && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Nenhum agendamento neste dia.</p>
      )}
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
        <Button variant="outline" size="icon" className="size-11" onClick={props.onPrev} aria-label="Dia anterior">
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold capitalize">
            {props.date === props.today ? "Hoje" : formatDayLong(props.date)}
          </div>
          <div className="text-xs text-muted-foreground">{props.summary}</div>
        </div>
        <Button variant="outline" size="icon" className="size-11" onClick={props.onNext} aria-label="Próximo dia">
          <ChevronRight />
        </Button>
      </div>

      {props.professionals.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: null, name: "Todas" } as { id: string | null; name: string }, ...props.professionals].map((p) => (
            <button
              key={p.id ?? "all"}
              onClick={() => props.onFilter(p.id)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm transition-colors duration-150",
                props.professionalFilter === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={props.direction}>
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
              else if (info.offset.x > 60 || info.velocity.x > 400) props.onPrev();
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
              <p className="py-16 text-center text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {props.list.map((a) => (
                  <li key={a.id}>
                    <motion.button
                      initial={props.fresh.has(a.id) && !reduceMotion ? { backgroundColor: "var(--accent)" } : false}
                      animate={{ backgroundColor: "rgba(0,0,0,0)" }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      onClick={() => props.onOpen(a)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 border-l-[3px] border-l-transparent px-3 py-1.5 text-left active:bg-muted",
                        a.status === "scheduled" && "border-l-amber-500 bg-amber-500/5",
                        a.status === "cancelled" && "opacity-60",
                      )}
                    >
                      <div className="w-12 shrink-0 tabular-nums">
                        <div className="text-sm font-semibold">{zoned(a.startsAt, props.tenant.timezone).time}</div>
                        <div className="text-[11px] text-muted-foreground">{zoned(a.endsAt, props.tenant.timezone).time}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-sm font-medium", a.status === "cancelled" && "line-through")}>
                          {a.customerName ?? "Sem nome"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
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
