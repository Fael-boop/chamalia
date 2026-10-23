import { createHmac, timingSafeEqual } from "node:crypto";

/** Times in milliseconds since epoch. */
export type Session =
  | { role: "admin"; issuedAt: number; expiresAt: number }
  | { role: "owner"; tenantId: string; userId: string; issuedAt: number; expiresAt: number };

export type SessionInput =
  | { role: "admin" }
  | { role: "owner"; tenantId: string; userId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const LIFETIME_MS = { admin: 7 * DAY_MS, owner: 30 * DAY_MS };
/** Without "lembrar de mim": one working day, and the panel keeps the token only until the browser closes. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * Signed, self-contained session token: "<payload>.<hmac>". The panel keeps it
 * and sends it as `Authorization: Bearer <token>`.
 */
export function signSession(input: SessionInput, secret: string, now = Date.now(), lifetimeMs = LIFETIME_MS[input.role]): string {
  const session = { ...input, issuedAt: now, expiresAt: now + lifetimeMs } as Session;
  const payload = encode(JSON.stringify(session));
  return `${payload}.${encode(createHmac("sha256", secret).update(payload).digest())}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): Session | undefined {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (typeof session.expiresAt !== "number" || session.expiresAt < now) return undefined;
    return session;
  } catch {
    return undefined;
  }
}
