import { useEffect, useRef, useState } from "react";
import type { Appointment, BusinessHour, TimeOff } from "@/api";
import { PersonPhoto } from "@/components/person-photo";
import { STATUS_STYLES } from "@/components/status-badge";
import { parseISO } from "date-fns";
import { minutesOf, zoned } from "@/format";
import { cn } from "@/lib/utils";

/** The day always fits the screen height: minutes are scaled between these limits. */
const FIT_MIN = 0.55;
const FIT_MAX = 1.6;
const HEADER_PX = 52;
const label = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

type Column = { id: string; name: string };
type Placed = {
  a: Appointment;
  start: number;
  end: number;
  lane: number;
  lanes: number;
};

/** Side by side when two bookings of the same person overlap (a cancelled one shown with the new one, a fit-in). */
function placeInLanes(
  items: { a: Appointment; start: number; end: number }[],
): Placed[] {
  const sorted = [...items].sort((x, y) => x.start - y.start || y.end - x.end);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(...group.map((p) => p.lane)) + 1;
    group.forEach((p) => (p.lanes = lanes));
    placed.push(...group);
    group = [];
  };
  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) close();
    const used = new Set(
      group.filter((p) => p.end > item.start).map((p) => p.lane),
    );
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) close();
  return placed;
}

/**
 * Desktop "Grade por hora": the day on a time scale, one column per professional. Bookings take their
 * real size, closed hours are shaded, time off is drawn in the column, and a line marks the current time.
 * Click an empty spot to book at that time with that professional.
 */
export function TimeGrid(props: {
  timeZone: string;
  date: string;
  today: string;
  list: Appointment[];
  columns: Column[];
  colors: Map<string, string>;
  photos: Record<string, string>;
  /** Business hours (all weekdays); professionals with their own hours in `ownHours`. */
  hours: BusinessHour[];
  ownHours: Map<string, BusinessHour[]>;
  blocks: TimeOff[];
  fresh: Set<string>;
  onOpen: (a: Appointment) => void;
  onSlot: (professionalId: string, time: string) => void;
}) {
  const { timeZone, date } = props;
  const weekday = parseISO(date).getDay();
  const scroller = useRef<HTMLDivElement>(null);
  // Height of the visible area, to size the day so it fits without scrolling (the "fit" mode).
  const [viewHeight, setViewHeight] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewHeight(el.clientHeight));
    observer.observe(el);
    setViewHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const windowsOf = (professionalId: string) =>
    (props.ownHours.get(professionalId)?.length
      ? props.ownHours.get(professionalId)!
      : props.hours
    )
      .filter((h) => h.weekday === weekday)
      .map((h) => ({
        open: minutesOf(h.opensAt),
        close: minutesOf(h.closesAt),
      }));

  const items = props.list.map((a) => ({
    a,
    start: minutesOf(zoned(a.startsAt, timeZone).time),
    end: minutesOf(zoned(a.endsAt, timeZone).time) || 24 * 60,
  }));
  const allWindows = props.columns.flatMap((c) => windowsOf(c.id));
  // The visible range: opening hours plus anything booked outside them, in whole hours.
  const starts = [
    ...allWindows.map((w) => w.open),
    ...items.map((i) => i.start),
  ];
  const ends = [...allWindows.map((w) => w.close), ...items.map((i) => i.end)];
  // Closed day with nothing booked: a plain 08-18 so the grid is not empty.
  const dayStart =
    Math.floor((starts.length ? Math.min(...starts) : 8 * 60) / 60) * 60;
  const dayEnd = Math.min(
    Math.ceil((ends.length ? Math.max(...ends) : 18 * 60) / 60) * 60,
    24 * 60,
  );
  const range = Math.max(dayEnd - dayStart, 60);
  // 1 px of margin so rounding never makes the grid a hair taller than the screen.
  const fitPx = (viewHeight - HEADER_PX - 1) / range;
  const px = Math.min(FIT_MAX, Math.max(FIT_MIN, fitPx || FIT_MIN));
  // The day fits: no vertical bar. Only a very short window (below the minimum scale) scrolls.
  const scrollsVertically = fitPx < FIT_MIN;
  const height = (dayEnd - dayStart) * px;
  const y = (minutes: number) => (minutes - dayStart) * px;

  const nowMinutes = minutesOf(zoned(new Date().toISOString(), timeZone).time);
  const showNow =
    date === props.today && nowMinutes >= dayStart && nowMinutes <= dayEnd;

  const blockRanges = (columnId: string) =>
    props.blocks
      .filter((b) => b.professionalId === null || b.professionalId === columnId)
      .map((b) => {
        const s = zoned(b.startsAt, timeZone);
        const e = zoned(b.endsAt, timeZone);
        return {
          id: b.id,
          reason: b.reason,
          start: s.date < date ? 0 : minutesOf(s.time),
          end: e.date > date ? 24 * 60 : minutesOf(e.time),
        };
      })
      .map((r) => ({
        ...r,
        start: Math.max(r.start, dayStart),
        end: Math.min(r.end, dayEnd),
      }))
      .filter((r) => r.end > r.start);

  const hoursList = Array.from(
    { length: (dayEnd - dayStart) / 60 + 1 },
    (_, i) => dayStart + i * 60,
  );
  const gridColumns = `56px repeat(${props.columns.length}, minmax(${props.columns.length > 8 ? 120 : 0}px, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <div
        ref={scroller}
        className={cn(
          "min-h-0 flex-1 overflow-x-auto",
          scrollsVertically ? "overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        <div className="min-w-fit">
          {/* Who: sticky while scrolling the hours. */}
          <div
            className="sticky top-0 z-20 grid border-b bg-card"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <div className="sticky left-0 z-10 bg-card" />
            {props.columns.map((c) => {
              const count = props.list.filter(
                (a) => a.professionalId === c.id && a.status !== "cancelled",
              ).length;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2 border-l px-2.5"
                  style={{ height: HEADER_PX }}
                  title={`${c.name}: ${count} ${count === 1 ? "atendimento" : "atendimentos"}`}
                >
                  <PersonPhoto
                    name={c.name}
                    src={props.photos[c.id]}
                    className="size-8"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="relative grid"
            style={{ gridTemplateColumns: gridColumns, height }}
          >
            {/* Hour labels. */}
            <div className="sticky left-0 z-10 border-r bg-card">
              {hoursList.map((m) => (
                <div
                  key={m}
                  className={cn(
                    "absolute right-2 text-[11px] text-muted-foreground tabular-nums",
                    m === dayStart
                      ? "translate-y-0.5"
                      : m === dayEnd
                        ? "-translate-y-full"
                        : "-translate-y-1/2",
                  )}
                  style={{ top: y(m) }}
                >
                  {label(m)}
                </div>
              ))}
            </div>

            {props.columns.map((c) => {
              const windows = windowsOf(c.id);
              const placed = placeInLanes(
                items.filter((i) => i.a.professionalId === c.id),
              );
              return (
                <div
                  key={c.id}
                  className="relative cursor-copy border-l"
                  style={{
                    // Hour lines (solid) and half-hour lines (lighter).
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${30 * px}px), repeating-linear-gradient(to bottom, transparent 0 ${30 * px}px, color-mix(in oklab, var(--border) 45%, transparent) ${30 * px}px ${30 * px + 1}px, transparent ${30 * px + 1}px ${60 * px}px)`,
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const minutes =
                      dayStart +
                      Math.floor(e.nativeEvent.offsetY / px / 15) * 15;
                    props.onSlot(c.id, label(minutes));
                  }}
                  title="Clique num espaço livre para agendar"
                >
                  {/* Closed: before opening, between periods (lunch) and after closing. */}
                  {closedRanges(windows, dayStart, dayEnd).map((r) => (
                    <div
                      key={`closed-${r.start}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bg-muted/70"
                      style={{
                        top: y(r.start),
                        height: (r.end - r.start) * px,
                      }}
                    />
                  ))}
                  {blockRanges(c.id).map((r) => (
                    <div
                      key={r.id}
                      className="pointer-events-none absolute inset-x-1 flex items-start rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground"
                      style={{
                        top: y(r.start),
                        height: (r.end - r.start) * px,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, color-mix(in oklab, var(--muted-foreground) 12%, transparent) 0 6px, transparent 6px 12px)",
                      }}
                    >
                      {r.reason ?? "Bloqueado"}
                    </div>
                  ))}
                  {placed.map(({ a, start, end, lane, lanes }) => {
                    // What fits depends on the height: 3 lines, 2 lines or a single line.
                    const h = Math.max((end - start) * px - 2, 20);
                    const size: "full" | "two" | "one" =
                      h >= 68 ? "full" : h >= 42 ? "two" : "one";
                    const from = zoned(a.startsAt, timeZone).time;
                    const to = zoned(a.endsAt, timeZone).time;
                    const name = a.customerName ?? "Sem nome";
                    return (
                      <button
                        key={a.id}
                        onClick={() => props.onOpen(a)}
                        title={`${from}–${to} · ${name} · ${a.serviceName}`}
                        className={cn(
                          "absolute z-[1] overflow-hidden rounded-md border border-l-[3px] px-2 text-left text-xs leading-tight transition-colors duration-200 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring",
                          STATUS_STYLES[a.status],
                          a.status === "cancelled" &&
                            "opacity-60 line-through decoration-1",
                          props.fresh.has(a.id) && "ring-2 ring-primary/40",
                          size === "one"
                            ? "flex items-center gap-1.5"
                            : "flex flex-col justify-center gap-0.5",
                        )}
                        style={{
                          top: y(start) + 1,
                          height: h,
                          left: `calc(${(lane / lanes) * 100}% + 4px)`,
                          width: `calc(${100 / lanes}% - 8px)`,
                        }}
                      >
                        {size === "one" && (
                          <>
                            <span className="shrink-0 font-medium tabular-nums">
                              {from}
                            </span>
                            <span className="truncate font-semibold text-foreground">
                              {name}
                            </span>
                          </>
                        )}
                        {size === "two" && (
                          <>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="shrink-0 font-medium tabular-nums">
                                {from}
                              </span>
                              <span className="truncate font-semibold text-foreground">
                                {name}
                              </span>
                            </span>
                            <span className="truncate text-muted-foreground">
                              {a.serviceName}
                            </span>
                          </>
                        )}
                        {size === "full" && (
                          <>
                            <span className="truncate font-medium tabular-nums">
                              {from}–{to}
                            </span>
                            <span className="truncate text-sm font-semibold text-foreground">
                              {name}
                            </span>
                            <span className="truncate text-muted-foreground">
                              {a.serviceName}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {showNow && (
              <div
                aria-hidden
                className="pointer-events-none absolute right-0 left-[56px] z-[2] border-t-2 border-red-500"
                style={{ top: y(nowMinutes) }}
              >
                <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-red-500" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The gaps between opening windows inside [from, to]: closed time to shade. */
function closedRanges(
  windows: { open: number; close: number }[],
  from: number,
  to: number,
) {
  const sorted = [...windows].sort((x, y) => x.open - y.open);
  const ranges: { start: number; end: number }[] = [];
  let cursor = from;
  for (const w of sorted) {
    if (w.open > cursor) ranges.push({ start: cursor, end: w.open });
    cursor = Math.max(cursor, w.close);
  }
  if (cursor < to) ranges.push({ start: cursor, end: to });
  return ranges;
}
