// Timezone helpers on top of Intl, so we don't need a date library.
// Dates are "YYYY-MM-DD" and times "HH:MM", always in the tenant's timezone.

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(at: Date, timeZone: string) {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(at)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMinutes(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Local date + time in `timeZone` -> UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = offsetMinutes(new Date(guess), timeZone);
  let result = guess - offset * 60000;
  // Second pass handles instants right next to a DST change.
  const correctedOffset = offsetMinutes(new Date(result), timeZone);
  if (correctedOffset !== offset) result = guess - correctedOffset * 60000;
  return new Date(result);
}

/** UTC instant -> local date/time/weekday in `timeZone` (weekday 0 = Sunday). */
export function utcToZoned(at: Date, timeZone: string) {
  const p = zonedParts(at, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return { date, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday: weekdayOf(date) };
}

export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return addDays(date, 0) === date;
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return hour * 60 + minute;
}

const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "";
}

/** "terça, 21/10 às 14:00" */
export function formatDateTimePtBr(at: Date, timeZone: string): string {
  const local = utcToZoned(at, timeZone);
  const [, month, day] = local.date.split("-");
  return `${weekdayName(local.weekday)}, ${day}/${month} às ${local.time}`;
}
