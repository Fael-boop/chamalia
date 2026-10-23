import { stdSerializers, type LoggerOptions } from "pino";
import { maskPhone, maskPhonesInText } from "./phone.js";

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
    serializers: {
      // The Evolution webhook URL carries ?secret=...; keep it out of the log.
      req: (req: { method: string; url: string; host?: string; hostname?: string; ip?: string; socket?: { remotePort?: number } }) => ({
        method: req.method,
        url: req.url.replace(/([?&]secret=)[^&]+/, "$1***"),
        host: req.host ?? req.hostname,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
      // Provider errors quote the destination number (e.g. Evolution's "exists": false body).
      err: (error: Error) => {
        const out = stdSerializers.err(error);
        return { ...out, message: maskPhonesInText(out.message), stack: maskPhonesInText(out.stack) };
      },
    },
  };
}
