import type { FastifyBaseLogger } from "fastify";
import { ASSISTANT_ALLOWED } from "../billing/billing.js";
import type { Channel } from "../channels/channel.js";
import { sendProactiveMessage } from "../conversation/engine.js";
import type { Sql } from "../db/client.js";
import { addDays, utcToZoned, weekdayName } from "../lib/time.js";

/** Stored in conversations.context while the customer may still answer the reminder. */
export type PendingReminder = { appointmentId: string; sentAt: string };

/** Reminders go out about a day before; closer than this, the customer just booked or is on her way. */
const REMIND_BEFORE_HOURS = 24;
const MIN_HOURS_BEFORE = 2;
/** Don't remind someone who booked a moment ago. */
const MIN_HOURS_SINCE_BOOKING = 2;
/** Local hours when reminders may be sent (no messages at night). */
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 21;
const RUN_EVERY_MS = 5 * 60_000;

export type DueReminder = {
  appointmentId: string;
  tenantId: string;
  timezone: string;
  whatsappInstance: string | null;
  customerPhone: string;
  customerName: string | null;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
};

const DUE_COLUMNS = (sql: Sql) => sql`
  a.id as appointment_id, a.tenant_id, t.timezone, t.whatsapp_instance,
  c.phone as customer_phone, c.name as customer_name,
  s.name as service_name, p.name as professional_name, a.starts_at
`;
const DUE_JOINS = (sql: Sql) => sql`
  from appointments a
  join tenants t on t.id = a.tenant_id
  join customers c on c.id = a.customer_id
  join services s on s.id = a.service_id
  join professionals p on p.id = a.professional_id
`;

/** "10h" or "10h30" */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":");
  return `${Number(hour)}h${minute === "00" ? "" : minute}`;
}

export function reminderText(reminder: DueReminder, now: Date): string {
  const local = utcToZoned(reminder.startsAt, reminder.timezone);
  const today = utcToZoned(now, reminder.timezone).date;
  const [, month, day] = local.date.split("-");
  const dayLabel =
    local.date === today
      ? "hoje"
      : local.date === addDays(today, 1)
        ? `amanhã (${weekdayName(local.weekday)}, ${day}/${month})`
        : `${weekdayName(local.weekday)} (${day}/${month})`;
  const firstName = reminder.customerName?.split(" ")[0];
  return (
    `Oi${firstName ? `, ${firstName}` : ""}! Passando para lembrar do seu horário ${dayLabel} às ${spokenTime(local.time)}: ` +
    `${reminder.serviceName} com ${reminder.professionalName}.\n` +
    `Já está confirmado. Se não puder vir, responda 2 que eu te ajudo a remarcar.`
  );
}

/**
 * Sends one reminder. The appointment is claimed first (reminder_24h_sent_at),
 * so two runs never send it twice, and becomes "confirmed": no answer means
 * the customer is coming. If sending fails the claim is undone for the next run.
 */
export async function sendReminder(
  deps: { sql: Sql; log: FastifyBaseLogger },
  channel: Channel,
  reminder: DueReminder,
  now = new Date(),
): Promise<boolean> {
  const { sql, log } = deps;
  const [claimed] = await sql<{ previousStatus: string }[]>`
    update appointments a
    set reminder_24h_sent_at = now(), status = 'confirmed'
    from appointments prev
    where a.id = ${reminder.appointmentId} and prev.id = a.id
      and a.reminder_24h_sent_at is null and a.status in ('scheduled', 'confirmed')
    returning prev.status as previous_status
  `;
  if (!claimed) return false;

  const pending: PendingReminder = { appointmentId: reminder.appointmentId, sentAt: now.toISOString() };
  const sent = await sendProactiveMessage(deps, channel, {
    tenantId: reminder.tenantId,
    toPhone: reminder.customerPhone,
    text: reminderText(reminder, now),
    context: { reminder: pending },
  });
  if (!sent) {
    await sql`
      update appointments set reminder_24h_sent_at = null, status = ${claimed.previousStatus}
      where id = ${reminder.appointmentId}
    `;
    log.warn({ tenantId: reminder.tenantId }, "reminder not sent; will retry");
    return false;
  }
  log.info({ tenantId: reminder.tenantId, to: reminder.customerPhone }, "reminder sent");
  return true;
}

export async function findDueReminders(sql: Sql): Promise<DueReminder[]> {
  return sql<DueReminder[]>`
    select ${DUE_COLUMNS(sql)}
    ${DUE_JOINS(sql)}
    where t.active and t.whatsapp_instance is not null and ${sql.unsafe(ASSISTANT_ALLOWED)}
      and a.status in ('scheduled', 'confirmed')
      and a.reminder_24h_sent_at is null
      and a.starts_at > now() + make_interval(hours => ${MIN_HOURS_BEFORE})
      and a.starts_at <= now() + make_interval(hours => ${REMIND_BEFORE_HOURS})
      and a.created_at < now() - make_interval(hours => ${MIN_HOURS_SINCE_BOOKING})
    order by a.starts_at
    limit 100
  `;
}

/** Next active appointment of one customer, ignoring the time window (panel test). */
export async function findNextReminderFor(sql: Sql, tenantId: string, phone: string): Promise<DueReminder | undefined> {
  const [row] = await sql<DueReminder[]>`
    select ${DUE_COLUMNS(sql)}
    ${DUE_JOINS(sql)}
    where a.tenant_id = ${tenantId} and c.phone = ${phone}
      and a.status in ('scheduled', 'confirmed') and a.starts_at > now()
    order by a.starts_at
    limit 1
  `;
  return row;
}

function insideSendingHours(reminder: DueReminder, now: Date): boolean {
  const hour = Number(utcToZoned(now, reminder.timezone).time.slice(0, 2));
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

/** Checks every few minutes for reminders to send. Returns a stop function. */
export function startReminderJob(deps: {
  sql: Sql;
  log: FastifyBaseLogger;
  channelFor: (whatsappInstance: string) => Channel;
}): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      for (const reminder of await findDueReminders(deps.sql)) {
        if (!reminder.whatsappInstance || !insideSendingHours(reminder, now)) continue;
        await sendReminder(deps, deps.channelFor(reminder.whatsappInstance), reminder, now);
      }
    } catch (error) {
      deps.log.error({ err: error }, "reminder job failed");
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, RUN_EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
