export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Faltou",
};

/** Today as YYYY-MM-DD in the tenant's timezone. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatLongDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPrice(cents: number | null): string {
  return cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "45,50" or "45" -> 4550; empty -> null. */
export function parsePrice(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (normalized === "") return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : NaN;
}

/** 5511987654321 -> +55 (11) 98765-4321 */
export function formatPhone(phone: string): string {
  const match = phone.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}` : phone;
}
