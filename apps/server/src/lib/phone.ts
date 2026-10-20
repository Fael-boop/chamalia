/**
 * Keeps only digits. Accepts "+55 (11) 98765-4321" or WhatsApp JIDs like
 * "5511987654321@s.whatsapp.net".
 */
export function normalizePhone(raw: string): string {
  return raw.split("@")[0]!.replace(/\D/g, "");
}

/**
 * Digits only; a Brazilian number typed without country code (10 or 11
 * digits) gets 55 in front, as WhatsApp expects.
 */
export function withCountryCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/**
 * Phone numbers must never be logged in full. Keeps the country/area prefix
 * and the last 4 digits: "5511987654321" -> "5511*****4321".
 */
export function maskPhone(raw: string): string {
  const digits = normalizePhone(raw);
  if (digits.length <= 4) return "*".repeat(digits.length);
  const head = digits.length > 8 ? digits.slice(0, 4) : "";
  const tail = digits.slice(-4);
  return head + "*".repeat(digits.length - head.length - tail.length) + tail;
}
