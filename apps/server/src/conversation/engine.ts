import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { Channel } from "../channels/channel.js";
import type { Sql } from "../db/client.js";
import { KeyedLock } from "../lib/keyed-lock.js";
import { formatDateTimePtBr } from "../lib/time.js";
import type { PendingReminder } from "../reminders/reminders.js";
import { cancelCustomerAppointment, getTenant, SchedulingError, type Service } from "../scheduling/service.js";
import { buildSystemPrompt } from "./prompt.js";
import { executeTool, tools, type ToolContext } from "./tools.js";

export type IncomingMessage = {
  tenantId: string;
  fromPhone: string;
  text: string;
  /** Id from WhatsApp; repeated deliveries of the same id are ignored. */
  providerMessageId: string;
  /** Audio, image, sticker...: stored as-is, answered with a fixed message. */
  unsupported?: boolean;
};

export type EngineDeps = {
  sql: Sql;
  anthropic: Anthropic;
  model: string;
  log: FastifyBaseLogger;
};

/** Only recent messages go to the model; an old conversation starts fresh. */
const HISTORY_WINDOW_HOURS = 24;
const HISTORY_MAX_MESSAGES = 30;
const MAX_TOOL_ROUNDS = 8;
/** conversations.state while the owner is handling the conversation. */
export const HUMAN_STATE = "human";
const FALLBACK_REPLY = "Desculpe, tive um probleminha aqui. Pode me mandar de novo em alguns instantes?";
const UNSUPPORTED_REPLY = "Por enquanto eu só consigo ler mensagens de texto. Pode me escrever? 🙂";
const OWNER_TOOK_OVER = "A dona respondeu pelo WhatsApp";

// One lock per tenant + customer phone: customer messages, our replies and the
// owner's own messages for the same chat are processed one at a time.
const lock = new KeyedLock();

async function upsertConversation(sql: Sql, tenantId: string, phone: string) {
  const [customer] = await sql<{ id: string; phone: string; name: string | null }[]>`
    insert into customers (tenant_id, phone) values (${tenantId}, ${phone})
    on conflict (tenant_id, phone) do update set updated_at = now()
    returning id, phone, name
  `;
  const [conversation] = await sql<{ id: string; state: string; context: { reminder?: PendingReminder } }[]>`
    insert into conversations (tenant_id, customer_id) values (${tenantId}, ${customer!.id})
    on conflict (tenant_id, customer_id) do update set last_message_at = now()
    returning id, state, context
  `;
  return { customer: customer!, conversation: conversation! };
}

/** Sends through the channel; a failure is logged and does not lose the stored message. */
async function safeSend(channel: Channel, log: FastifyBaseLogger, tenantId: string, to: string, text: string) {
  try {
    return (await channel.sendText(to, text)).providerMessageId ?? null;
  } catch (error) {
    log.error({ err: error, tenantId, to, channel: channel.name }, "failed to send message");
    return null;
  }
}

/**
 * Handles one customer message end to end: identifies the customer, asks the
 * model (with scheduling tools), stores both messages and sends the reply and
 * any owner notifications through `channel`.
 */
export async function handleIncomingMessage(deps: EngineDeps, channel: Channel, message: IncomingMessage) {
  return lock.run(`${message.tenantId}:${message.fromPhone}`, () => processMessage(deps, channel, message));
}

async function processMessage(deps: EngineDeps, channel: Channel, message: IncomingMessage) {
  const { sql, log } = deps;
  const tenant = await getTenant(sql, message.tenantId);
  if (!tenant?.active) {
    log.warn({ tenantId: message.tenantId }, "message for unknown or inactive tenant ignored");
    return;
  }

  const { customer, conversation } = await upsertConversation(sql, tenant.id, message.fromPhone);
  const inserted = await sql`
    insert into messages (tenant_id, conversation_id, direction, body, provider_message_id)
    values (${tenant.id}, ${conversation.id}, 'inbound', ${message.text}, ${message.providerMessageId})
    on conflict (tenant_id, provider_message_id) do nothing
    returning id
  `;
  if (inserted.length === 0) {
    log.info({ tenantId: tenant.id }, "duplicated message ignored");
    return;
  }
  // The owner took over this conversation: store the message, stay quiet.
  if (conversation.state === HUMAN_STATE) {
    return { reply: null, ownerNotices: [], ownerPhoneMissing: !tenant.ownerPhone, withOwner: true };
  }

  const ctx: ToolContext = { sql, tenant, customer, ownerNotices: [], teamNotices: [] };
  const answer = message.unsupported ? null : await answerReminder(ctx, conversation, message.text);
  let reply: string;
  if (message.unsupported) {
    reply = UNSUPPORTED_REPLY;
  } else if (answer?.reply) {
    reply = answer.reply;
  } else {
    try {
      reply = await askModel(deps, ctx, conversation.id, answer?.note);
    } catch (error) {
      log.error({ err: error, tenantId: tenant.id }, "conversation engine failed");
      reply = FALLBACK_REPLY;
    }
  }

  // Send first so the provider id is stored before its echo comes back.
  const replyId = await safeSend(channel, log, tenant.id, message.fromPhone, reply);
  await sql`
    insert into messages (tenant_id, conversation_id, direction, body, provider_message_id)
    values (${tenant.id}, ${conversation.id}, 'outbound', ${reply}, ${replyId})
  `;
  if (ctx.handoffReason) {
    const context = { handoffReason: ctx.handoffReason, handoffTo: ctx.handoffTo, handoffAt: new Date().toISOString() };
    await sql`
      update conversations set state = ${HUMAN_STATE}, context = ${sql.json(context)}, last_message_at = now()
      where id = ${conversation.id}
    `;
  } else {
    await sql`update conversations set last_message_at = now() where id = ${conversation.id}`;
  }

  for (const notice of ctx.ownerNotices) {
    if (tenant.ownerPhone) await safeSend(channel, log, tenant.id, tenant.ownerPhone, notice);
    else log.warn({ tenantId: tenant.id }, "owner phone not set; notification not sent");
  }
  for (const notice of ctx.teamNotices) await safeSend(channel, log, tenant.id, notice.phone, notice.text);
  return {
    reply,
    ownerNotices: [...ctx.ownerNotices, ...ctx.teamNotices.map((notice) => `[Para ${notice.name}] ${notice.text}`)],
    ownerPhoneMissing: !tenant.ownerPhone,
    withOwner: Boolean(ctx.handoffReason),
  };
}

/**
 * A message sent from the business phone itself (fromMe). Our own replies come
 * back as echoes and are ignored by id; anything else was typed by the owner,
 * so the assistant steps out of that conversation.
 */
export async function handleOwnerMessage(
  deps: Pick<EngineDeps, "sql" | "log">,
  message: { tenantId: string; toPhone: string; text: string; providerMessageId: string },
) {
  const { sql, log } = deps;
  return lock.run(`${message.tenantId}:${message.toPhone}`, async () => {
    const [echo] = await sql`
      select 1 from messages where tenant_id = ${message.tenantId} and provider_message_id = ${message.providerMessageId}
    `;
    if (echo) return;

    const { conversation } = await upsertConversation(sql, message.tenantId, message.toPhone);
    await sql`
      insert into messages (tenant_id, conversation_id, direction, body, provider_message_id)
      values (${message.tenantId}, ${conversation.id}, 'outbound', ${message.text}, ${message.providerMessageId})
      on conflict (tenant_id, provider_message_id) do nothing
    `;
    if (conversation.state !== HUMAN_STATE) {
      const context = { handoffReason: OWNER_TOOK_OVER, handoffAt: new Date().toISOString() };
      await sql`
        update conversations set state = ${HUMAN_STATE}, context = ${sql.json(context)}
        where id = ${conversation.id}
      `;
      log.info({ tenantId: message.tenantId }, "owner replied manually; assistant paused for this conversation");
    }
  });
}

/**
 * A message we start (reminder), not an answer. Stored in the conversation so
 * the model sees it in the history, with `context` merged into the conversation.
 * Returns false when the channel could not deliver it.
 */
export async function sendProactiveMessage(
  deps: Pick<EngineDeps, "sql" | "log">,
  channel: Channel,
  message: { tenantId: string; toPhone: string; text: string; context: { reminder: PendingReminder } },
): Promise<boolean> {
  const { sql, log } = deps;
  return lock.run(`${message.tenantId}:${message.toPhone}`, async () => {
    const { conversation } = await upsertConversation(sql, message.tenantId, message.toPhone);
    try {
      const sent = await channel.sendText(message.toPhone, message.text);
      await sql`
        insert into messages (tenant_id, conversation_id, direction, body, provider_message_id)
        values (${message.tenantId}, ${conversation.id}, 'outbound', ${message.text}, ${sent.providerMessageId ?? null})
      `;
    } catch (error) {
      log.error({ err: error, tenantId: message.tenantId, to: message.toPhone, channel: channel.name }, "failed to send message");
      return false;
    }
    await sql`
      update conversations set context = context || ${sql.json(message.context)}, last_message_at = now()
      where id = ${conversation.id}
    `;
    return true;
  });
}

/** How long a "1"/"2" still counts as an answer to the reminder. */
const REMINDER_ANSWER_HOURS = 36;

/**
 * Answers to the day-before reminder. "1" gets a fixed reply. "2" frees the
 * slot right away and lets the model offer new times (`note`). Anything else
 * goes to the model as usual, with the reminder in the history.
 */
async function answerReminder(
  ctx: ToolContext,
  conversation: { id: string; context: { reminder?: PendingReminder } },
  text: string,
): Promise<{ reply?: string; note?: string } | null> {
  const pending = conversation.context.reminder;
  if (!pending || Date.now() - Date.parse(pending.sentAt) > REMINDER_ANSWER_HOURS * 3_600_000) return null;
  const choice = text.trim().replace(/[.!\s]+$/, "");
  if (choice !== "1" && choice !== "2") return null;

  const { sql, tenant } = ctx;
  await sql`update conversations set context = context - 'reminder' where id = ${conversation.id}`;
  if (choice === "1") {
    return { reply: tenant.useEmoji ? "Combinado, te esperamos! 😊" : "Combinado, te esperamos!" };
  }

  try {
    const appointment = await cancelCustomerAppointment(sql, tenant, ctx.customer.id, pending.appointmentId);
    const when = formatDateTimePtBr(appointment.startsAt, tenant.timezone);
    ctx.ownerNotices.push(
      `Cliente pediu para remarcar pelo lembrete. Horário liberado:\n${appointment.serviceName} com ${appointment.professionalName}\n${when}\nCliente: ${ctx.customer.name ?? "Cliente sem nome"} (${ctx.customer.phone})\nA ${tenant.assistantName} está oferecendo outro horário.`,
    );
    return {
      note:
        `A cliente respondeu 2 ao lembrete. O sistema JÁ DESMARCOU o horário de ${appointment.serviceName} com ` +
        `${appointment.professionalName} (${when}); não cancele nada. Diga que desmarcou e ofereça novos horários ` +
        `para o mesmo serviço, de preferência com a mesma profissional, e agende quando ela escolher.`,
    };
  } catch (error) {
    if (error instanceof SchedulingError) return null; // already cancelled or gone: just talk
    throw error;
  }
}

/** Gives a conversation back to the assistant after the owner handled it. */
export async function releaseToAssistant(sql: Sql, tenantId: string, conversationId: string) {
  return sql`
    update conversations set state = 'idle', context = '{}'
    where tenant_id = ${tenantId} and id = ${conversationId}
    returning id
  `;
}

async function askModel(deps: EngineDeps, ctx: ToolContext, conversationId: string, note?: string): Promise<string> {
  const { sql } = deps;
  const { tenant } = ctx;

  const [services, professionals, hours, history, recentlyCancelled, handoffTopics] = await Promise.all([
    sql<Service[]>`
      select id, name, description, duration_minutes, price_cents, active, handoff, handoff_reason
      from services where tenant_id = ${tenant.id} and active and archived_at is null order by name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from professionals where tenant_id = ${tenant.id} and active and kind = 'professional' order by name
    `,
    sql<{ professionalId: string | null; weekday: number; opensAt: string; closesAt: string }[]>`
      select professional_id, weekday, opens_at, closes_at from business_hours
      where tenant_id = ${tenant.id} order by weekday, opens_at
    `,
    sql<{ direction: "inbound" | "outbound"; body: string }[]>`
      select direction, body from (
        select direction, body, created_at from messages
        where conversation_id = ${conversationId}
          and created_at > now() - make_interval(hours => ${HISTORY_WINDOW_HOURS})
        order by created_at desc limit ${HISTORY_MAX_MESSAGES}
      ) recent order by created_at
    `,
    // So the model knows these are already gone and doesn't think it failed.
    sql<{ startsAt: Date; serviceName: string; professionalName: string }[]>`
      select a.starts_at, s.name as service_name, p.name as professional_name
      from appointments a
      join services s on s.id = a.service_id
      join professionals p on p.id = a.professional_id
      where a.tenant_id = ${tenant.id} and a.customer_id = ${ctx.customer.id}
        and a.status = 'cancelled' and a.cancelled_at > now() - make_interval(hours => ${HISTORY_WINDOW_HOURS})
      order by a.cancelled_at
    `,
    sql<{ id: string; topic: string; reason: string | null }[]>`
      select id, topic, reason from handoff_topics where tenant_id = ${tenant.id} order by created_at
    `,
  ]);
  const cancelledNote = recentlyCancelled.length
    ? "\n\nHorários desta cliente desmarcados nas últimas horas (já cancelados de verdade, não aparecem em list_customer_appointments):\n" +
      recentlyCancelled
        .map((a) => `- ${a.serviceName} com ${a.professionalName}, ${formatDateTimePtBr(a.startsAt, tenant.timezone)}`)
        .join("\n")
    : "";

  const system =
    buildSystemPrompt({
      tenant,
      services,
      professionals,
      hours,
      handoffTopics,
      customerName: ctx.customer.name,
      now: new Date(),
    }) +
    cancelledNote +
    (note ? `\n\nAviso do sistema sobre esta mensagem: ${note}` : "");

  const messages: Anthropic.MessageParam[] = history.map((row) => ({
    role: row.direction === "inbound" ? "user" : "assistant",
    content: row.body,
  }));
  // The API requires the conversation to start with the customer.
  while (messages[0]?.role === "assistant") messages.shift();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await deps.anthropic.messages.create({
      model: deps.model,
      max_tokens: 4096,
      system,
      tools,
      output_config: { effort: "medium" },
      messages,
    });

    if (response.stop_reason === "refusal") {
      deps.log.warn({ tenantId: tenant.id, category: response.stop_details?.category }, "model refused");
      return FALLBACK_REPLY;
    }

    // Append the full content (thinking blocks included) so the tool loop stays valid.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return text || FALLBACK_REPLY;
    }

    // Sequential on purpose: tools write to the database (book, cancel).
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) results.push(await executeTool(ctx, block));
    messages.push({ role: "user", content: results });
  }

  deps.log.warn({ tenantId: tenant.id }, "tool loop limit reached");
  return FALLBACK_REPLY;
}
