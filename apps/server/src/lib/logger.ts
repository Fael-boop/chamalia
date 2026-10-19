import type { LoggerOptions } from "pino";
import { maskPhone } from "./phone.js";

// Any field with one of these names is masked before it reaches the log,
// at the top level or one level deep (e.g. { customer: { phone } }).
const PHONE_FIELDS = ["phone", "remoteJid", "ownerPhone", "customerPhone", "number", "to", "from"];

export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: {
      paths: [...PHONE_FIELDS, ...PHONE_FIELDS.map((field) => `*.${field}`)],
      censor: (value) => (typeof value === "string" ? maskPhone(value) : "[redacted]"),
    },
  };
}
