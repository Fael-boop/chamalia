import type { FastifyBaseLogger } from "fastify";
import type { Sql } from "../db/client.js";

/**
 * Keeps personal data only as long as needed (LGPD, art. 15 and 16), as promised in the
 * Privacy Policy:
 * - WhatsApp messages: 12 months (the assistant only uses recent ones).
 * - Login records (Marco Civil da Internet requires 6 months): removed after 12 months.
 */
export const MESSAGE_RETENTION_DAYS = 365;
export const ACCESS_LOG_RETENTION_DAYS = 365;
const EVERY_MS = 24 * 60 * 60 * 1000;

export async function purgeOldData(sql: Sql) {
  const messages = await sql`delete from messages where created_at < now() - make_interval(days => ${MESSAGE_RETENTION_DAYS})`;
  const logins = await sql`delete from access_logs where created_at < now() - make_interval(days => ${ACCESS_LOG_RETENTION_DAYS})`;
  return { messages: messages.count, logins: logins.count };
}

/** Runs once a day (first a few minutes after start). Returns a stop function. */
export function startRetentionJob({ sql, log }: { sql: Sql; log: FastifyBaseLogger }) {
  const run = async () => {
    try {
      const removed = await purgeOldData(sql);
      if (removed.messages || removed.logins) log.info(removed, "old personal data removed");
    } catch (error) {
      log.error({ err: error }, "retention job failed");
    }
  };
  const first = setTimeout(run, 5 * 60 * 1000);
  const timer = setInterval(run, EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
