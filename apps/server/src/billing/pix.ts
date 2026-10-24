/**
 * Static Pix "copia e cola" (BR Code, EMV format from the Banco Central manual) with the amount
 * filled in. Any bank app reads it; no payment provider involved. Confirmation is manual.
 */
export type PixReceiver = { key: string; name: string; city: string };

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** Bank apps reject accents and long names in these fields. */
const plain = (text: string, max: number) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .trim()
    .slice(0, max);

/** CRC16-CCITT (poly 0x1021, start 0xFFFF), as the BR Code requires. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Top-level fields of an EMV code: id -> value. undefined when the text is not one. */
function readFields(text: string): Map<string, string> | undefined {
  const fields = new Map<string, string>();
  for (let i = 0; i < text.length; ) {
    const id = text.slice(i, i + 2);
    const length = Number(text.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(length) || i + 4 + length > text.length) return undefined;
    fields.set(id, text.slice(i + 4, i + 4 + length));
    i += 4 + length;
  }
  return fields;
}

export type PixReadError = "not_pix" | "bad_checksum" | "no_key";

/**
 * Reads the receiver out of a Pix code copied (or scanned) from a bank app.
 * Codes with a single-use charge (a URL instead of a key) have no key to reuse: "no_key".
 */
export function readPixCode(input: string): PixReceiver | PixReadError {
  const code = input.trim();
  const fields = readFields(code);
  if (!fields || fields.get("00") !== "01") return "not_pix";
  if (crc16(code.slice(0, -4)) !== code.slice(-4).toUpperCase()) return "bad_checksum";
  const account = [...fields].find(([id, value]) => Number(id) >= 26 && Number(id) <= 51 && /br\.gov\.bcb\.pix/i.test(value));
  const key = account && readFields(account[1])?.get("01");
  if (!key) return "no_key";
  return { key, name: fields.get("59") ?? "", city: fields.get("60") ?? "" };
}

/** `reference` shows up in the bank statement (letters and digits, up to 25). */
export function pixCopyPaste(receiver: PixReceiver, amountCents: number, reference: string): string {
  const txid = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    field("00", "01") +
    field("26", field("00", "br.gov.bcb.pix") + field("01", receiver.key.trim())) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", plain(receiver.name, 25)) +
    field("60", plain(receiver.city, 15)) +
    field("62", field("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
