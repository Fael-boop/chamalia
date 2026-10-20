import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppointmentStatus } from "./api";

/**
 * Dates are shown in the business's timezone. Every tenant today is in
 * America/Sao_Paulo; Intl does the conversion, date-fns does the wording.
 */
const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/** UTC ISO -> { date: "AAAA-MM-DD", time: "HH:MM" } in the business timezone. */
export function zoned(iso: string, timeZone: string) {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export const todayIn = (timeZone: string) => zoned(new Date().toISOString(), timeZone).date;

/** Day arithmetic on "AAAA-MM-DD" strings (no timezone involved). */
export const shiftDate = (date: string, days: number) => format(addDays(parseISO(date), days), "yyyy-MM-dd");

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export const formatTime = (iso: string, timeZone: string) => zoned(iso, timeZone).time;

/** "segunda, 20 de outubro" */
export const formatDayLong = (date: string) => format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR });
/** "seg" */
export const formatWeekdayShort = (date: string) => format(parseISO(date), "EEE", { locale: ptBR }).replace(".", "");
/** "20/10" */
export const formatDayShort = (date: string) => format(parseISO(date), "dd/MM");
/** "20/10/2026 às 14:30" */
export function formatDateTime(iso: string, timeZone: string) {
  const { date, time } = zoned(iso, timeZone);
  return `${format(parseISO(date), "dd/MM/yyyy")} às ${time}`;
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function formatPrice(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "45,50" -> 4550; empty -> null (price "sob consulta"). */
export const toCents = (price: string): number | null =>
  price.trim() === "" ? null : Math.round(Number(price.trim().replace(",", ".")) * 100);

/** 4550 -> "45,50"; null -> "". */
export const fromCents = (cents: number | null): string => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** 5511987654321 -> (11) 98765-4321 */
export function formatPhone(phone: string): string {
  const match = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`) : `${m} min`;
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Faltou",
};

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}
