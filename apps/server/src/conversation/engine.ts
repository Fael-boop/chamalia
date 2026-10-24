import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { Channel } from "../channels/channel.js";
import type { Sql } from "../db/client.js";
import { KeyedLock } from "../lib/keyed-lock.js";
import { samePhone } from "../lib/phone.js";
import { formatDateTimePtBr } from "../lib/time.js";
import { nicheForPrompt } from "../tenants/niches.js";
import type { PendingReminder } from "../reminders/reminders.js";
import { cancelCustomerAppointment, getTenant, SchedulingError, type Service } from "../scheduling/service.js";
import type { PriceTable } from "./price-table.js";
import { buildCurrentContext, buildSystemPrompt } from "./prompt.js";
import { executeTool, tools, type ToolContext } from "./tools.js";

export type IncomingMessage = {
  tenantId: string;
  fromPhone: string;
  text: string;
  /** Id from WhatsApp; repeated deliveries of the same id are ignored. */
  providerMessageId: string;
  /** Audio, image, sticker...: stored as-is, answered with a fixed message. */
  unsupported?: boolean;
  /** The fixed answer for unsupported, when it is not the generic one (a long or unclear voice note). */
  unsupportedReply?: string;
  /** The message this one replies to (WhatsApp "Responder"). */
  quotedMessageId?: string;
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
const UNSUPPORTED_REPLY = "Por enquanto eu não consigo abrir esse tipo de mensagem. Pode me escrever? 🙂";
const OWNER_TOOK_OVER = "A equipe respondeu pelo WhatsApp";

/** conversations.context: handoff info while with the team, and a pending reminder. */
type ConversationContext = {
  reminder?: PendingReminder;
  handoffReason?: string;
  handoffTo?: string;
  handoffAt?: string;
  /** Sent in the handoff notice; "RESOLVIDO <code>" from the team gives the conversation back. */
  handoffCode?: string;
  /** WhatsApp ids of the handoff notices; replying "RESOLVIDO" to one of them closes this conversation. */
  handoffNoticeIds?: string[];
  /** Last time someone from the team wrote in this conversation. */
  teamLastAt?: string;
  /** The conversation came back from the team: by the panel button, or by itself after silence. */
  returned?: { reason?: string; at: string; auto: boolean };
};

/** How long the assistant keeps in mind that a request was already handed over. */
const RETURNED_NOTE_HOURS = 24;

/** Keeps the assistant from handing the same old request over again after it got the conversation back. */
function returnedNote(context: ConversationContext): string | undefined {
  const returned = context.returned;
  if (!returned || Date.now() - Date.parse(returned.at) > RETURNED_NOTE_HOURS * 3_600_000) return undefined;
  const subject = returned.reason ? `o pedido anterior (${returned.reason})` : "o pedido anterior";
  return returned.auto
    ? `A conversa tinha ido para a equipe por causa de ${subject}, mas a equipe não respondeu a tempo e você voltou a atender. A equipe já foi avisada de novo. ` +
        "Não passe a conversa outra vez por causa desse mesmo pedido e não fique repetindo que chamou alguém: atenda normalmente a mensagem atual. " +
        "Só se a cliente perguntar sobre aquele assunto, diga em uma frase que a equipe já foi avisada e responde por aqui. Use transfer_to_owner só para um pedido novo."
    : `A equipe já cuidou de ${subject} e devolveu a conversa para você. Não volte a esse assunto nem passe a conversa de novo por ele; ` +
        "atenda normalmente a mensagem atual. Use transfer_to_owner só se a cliente trouxer um pedido novo que precise de uma pessoa.";
}

/** When the team was last active in a handed-over conversation (handoff or their last message). */
export function lastTeamActivity(context: ConversationContext): number {
  return Math.max(Date.parse(context.handoffAt ?? "") || 0, Date.parse(context.teamLastAt ?? "") || 0);
}

// One lock per tenant + customer phone: customer messages, our replies and the
// owner's own messages for the same chat are processed one at a time.
const lock = new KeyedLock();

async function upsertConversation(sql: Sql, tenantId: string, phone: string) {
  const [customer] = await sql<{ id: string; phone: string; name: string | null }[]>`
    insert into customers (tenant_id, phone) values (${tenantId}, ${phone})
    on conflict (tenant_id, phone) do update set updated_at = now()
    returning id, phone, name
  `;
  const [conversation] = await sql<{ id: string; state: string; context: ConversationContext }[]>`
    insert into conversations (tenant_id, customer_id) values (${tenantId}, ${customer!.id})
    on conflict (tenant_id, customer_id) do update set last_message_at = now()
    returning id, state, context
  `;
  return { customer: customer!, conversation: conversation! };
}

/**
 * Ids of messages we sent that are not stored (team notices). Their echo comes
 * back as fromMe and must not look like the team taking over that chat.
 */
const sentByUs = new Map<string, number>();
const SENT_BY_US_TTL_MS = 10 * 60_000;
function rememberSent(id: string | null | undefined) {
  if (!id) return;
  const now = Date.now();
  for (const [key, at] of sentByUs) if (now - at > SENT_BY_US_TTL_MS) sentByUs.delete(key);
  sentByUs.set(id, now);
}

/** Sends through the channel; a failure is logged and does not lose the stored message. */
async function safeSend(channel: Channel, log: FastifyBaseLogger, tenantId: string, to: string, text: string) {
  try {
    const id = (await channel.sendText(to, text)).providerMessageId ?? null;
    rememberSent(id);
    return id;
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

  if (!message.unsupported && (await handleTeamDone(deps, channel, tenant, message))) {
    return { reply: null, ownerNotices: [], ownerPhoneMissing: !tenant.ownerPhone, withOwner: false };
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
  // With the team: stay quiet, unless the team has been silent long enough;
  // then the assistant takes the conversation back by itself and the owner is told.
  let pendingNotice: string | undefined;
  if (conversation.state === HUMAN_STATE) {
    const silentFor = Date.now() - lastTeamActivity(conversation.context);
    if (silentFor < tenant.handoffReturnHours * 3_600_000) {
      return { reply: null, ownerNotices: [], ownerPhoneMissing: !tenant.ownerPhone, withOwner: true };
    }
    const reason = conversation.context.handoffReason;
    conversation.context = { returned: { reason, at: new Date().toISOString(), auto: true } };
    await sql`update conversations set state = 'idle', context = ${sql.json(conversation.context)} where id = ${conversation.id}`;
    pendingNotice =
      `${customer.name ?? "Cliente sem nome"} (${customer.phone}) voltou a escrever. Ninguém da equipe respondeu em ${tenant.handoffReturnHours} h, ` +
      `então a ${tenant.assistantName} voltou a atender.${reason ? `\nPedido que continua pendente: ${reason}` : ""}`;
    log.info({ tenantId: tenant.id }, "team silent; conversation returned to the assistant");
  }

  const ctx: ToolContext = { sql, tenant, customer, ownerNotices: pendingNotice ? [pendingNotice] : [], teamNotices: [] };
  const answer = message.unsupported ? null : await answerReminder(ctx, conversation, message.text);
  let reply: string;
  if (message.unsupported) {
    reply = message.unsupportedReply ?? UNSUPPORTED_REPLY;
  } else if (answer?.reply) {
    reply = answer.reply;
  } else {
    try {
      reply = await askModel(deps, ctx, conversation.id, [returnedNote(conversation.context), answer?.note].filter(Boolean).join("\n") || undefined);
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
  if (ctx.priceTable) await sendPriceTable(deps, channel, conversation.id, tenant.id, message.fromPhone, ctx.priceTable);
  if (ctx.handoffReason) {
    const context = {
      handoffReason: ctx.handoffReason,
      handoffTo: ctx.handoffTo,
      handoffCode: ctx.handoffCode,
      handoffAt: new Date().toISOString(),
    };
    await sql`
      update conversations set state = ${HUMAN_STATE}, context = ${sql.json(context)}, last_message_at = now()
      where id = ${conversation.id}
    `;
  } else {
    await sql`update conversations set last_message_at = now() where id = ${conversation.id}`;
  }

  const noticeIds: string[] = [];
  for (const notice of ctx.ownerNotices) {
    if (tenant.ownerPhone) noticeIds.push((await safeSend(channel, log, tenant.id, tenant.ownerPhone, notice)) ?? "");
    else log.warn({ tenantId: tenant.id }, "owner phone not set; notification not sent");
  }
  for (const notice of ctx.teamNotices) noticeIds.push((await safeSend(channel, log, tenant.id, notice.phone, notice.text)) ?? "");
  // Lets the team close this exact conversation by replying to its notice.
  const sentIds = noticeIds.filter(Boolean);
  if (ctx.handoffReason && sentIds.length) {
    await sql`update conversations set context = context || ${sql.json({ handoffNoticeIds: sentIds })} where id = ${conversation.id}`;
  }
  return {
    reply,
    ownerNotices: [...ctx.ownerNotices, ...ctx.teamNotices.map((notice) => `[Para ${notice.name}] ${notice.text}`)],
    ownerPhoneMissing: !tenant.ownerPhone,
    withOwner: Boolean(ctx.handoffReason),
  };
}

/** Sends the price list after the reply: the written table, then the file. Both are kept in the history. */
async function sendPriceTable(
  deps: Pick<EngineDeps, "sql" | "log">,
  channel: Channel,
  conversationId: string,
  tenantId: string,
  to: string,
  table: PriceTable,
) {
  const { sql, log } = deps;
  const store = (body: string, providerId: string | null, attachment: Record<string, string> | null = null) =>
    sql`
      insert into messages (tenant_id, conversation_id, direction, body, provider_message_id, attachment)
      values (${tenantId}, ${conversationId}, 'outbound', ${body}, ${providerId}, ${attachment ? sql.json(attachment) : null})
    `;
  if (table.body) await store(table.body, await safeSend(channel, log, tenantId, to, table.body));
  if (table.file) {
    let id: string | null = null;
    try {
      id = (await channel.sendFile(to, table.file)).providerMessageId ?? null;
    } catch (error) {
      log.error({ err: error, tenantId, to, channel: channel.name }, "failed to send price table file");
    }
    await store(`[Tabela de preços enviada: ${table.file.name}]`, id, { kind: "price_table", name: table.file.name, mime: table.file.mime });
  }
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
    if (sentByUs.has(message.providerMessageId)) return;
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
    const now = new Date().toISOString();
    if (conversation.state !== HUMAN_STATE) {
      const context = { handoffReason: OWNER_TOOK_OVER, handoffAt: now, teamLastAt: now };
      await sql`
        update conversations set state = ${HUMAN_STATE}, context = ${sql.json(context)}
        where id = ${conversation.id}
      `;
      log.info({ tenantId: message.tenantId }, "owner replied manually; assistant paused for this conversation");
    } else {
      // Keeps the conversation with the team while they are still talking.
      await sql`update conversations set context = context || ${sql.json({ teamLastAt: now })} where id = ${conversation.id}`;
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
  conversation: { id: string; context: ConversationContext },
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

/** "RESOLVIDO 1234", "fim", "finalizar"...; the code is optional. */
const TEAM_DONE = /^[\s*_]*(resolvido|resolvida|fim|finalizar|finalizado|finalizada|encerrar|encerrado|encerrada)[\s*_.!]*(\d{4})?[\s*_.!]*$/i;

/**
 * Someone from the team (owner or a professional with a notice number) answers
 * a handoff notice with "RESOLVIDO 1234": the conversation goes back to the
 * assistant. Returns false when the message is not that, so it is handled as a
 * normal customer message.
 */
async function handleTeamDone(
  deps: EngineDeps,
  channel: Channel,
  tenant: { id: string; ownerPhone: string | null; assistantName: string },
  message: IncomingMessage,
): Promise<boolean> {
  const match = TEAM_DONE.exec(message.text);
  if (!match) return false;
  const { sql, log } = deps;
  const professionals = await sql<{ name: string; notifyPhone: string }[]>`
    select name, notify_phone from professionals
    where tenant_id = ${tenant.id} and active and archived_at is null and notify_phone is not null
  `;
  const isOwner = Boolean(tenant.ownerPhone) && samePhone(tenant.ownerPhone!, message.fromPhone);
  const person = professionals.find((p) => samePhone(p.notifyPhone, message.fromPhone));
  if (!isOwner && !person) return false;

  const open = await sql<{ id: string; context: ConversationContext; name: string | null }[]>`
    select c.id, c.context, cu.name
    from conversations c join customers cu on cu.id = c.customer_id and cu.tenant_id = c.tenant_id
    where c.tenant_id = ${tenant.id} and c.state = ${HUMAN_STATE}
    order by c.last_message_at desc
  `;
  const code = match[2];
  const quoted = message.quotedMessageId;
  // A reply to a notice: that conversation. A code: that one. Otherwise the only one
  // with this person (the owner sees all).
  const candidates = quoted
    ? open.filter((c) => c.context.handoffNoticeIds?.includes(quoted))
    : code
      ? open.filter((c) => c.context.handoffCode === code)
      : open.filter((c) => isOwner || c.context.handoffTo === person!.name);

  let answer: string;
  if (quoted && candidates.length === 0) {
    answer = "Não achei atendimento aberto para essa mensagem. Ele pode já ter sido resolvido.";
  } else if (candidates.length === 1) {
    const target = candidates[0]!;
    await releaseToAssistant(sql, tenant.id, target.id);
    answer = `Pronto! A ${tenant.assistantName} voltou a atender ${target.name ?? "esse cliente"}.`;
    log.info({ tenantId: tenant.id }, "team marked a handoff as resolved; assistant is back");
  } else if (candidates.length === 0) {
    answer = code
      ? `Não achei atendimento aberto com o código ${code}. Ele pode já ter sido resolvido.`
      : "Não há nenhum atendimento aberto com você agora.";
  } else {
    answer =
      "Há mais de um atendimento aberto. Toque e segure o aviso do cliente, escolha Responder e escreva RESOLVIDO. Ou mande o código:\n" +
      candidates
        .slice(0, 5)
        .map((c) => `*RESOLVIDO ${c.context.handoffCode ?? "????"}* - ${c.name ?? "cliente sem nome"}`)
        .join("\n");
  }
  await safeSend(channel, log, tenant.id, message.fromPhone, answer);
  return true;
}

/** Gives a conversation back to the assistant after the owner handled it. */
export async function releaseToAssistant(sql: Sql, tenantId: string, conversationId: string) {
  // Remembers what was handed over, so the assistant does not hand it over again.
  return sql`
    update conversations
    set state = 'idle',
        context = jsonb_build_object('returned', jsonb_strip_nulls(jsonb_build_object(
          'reason', context->>'handoffReason', 'at', now()::text, 'auto', false)))
    where tenant_id = ${tenantId} and id = ${conversationId}
    returning id
  `;
}

async function askModel(deps: EngineDeps, ctx: ToolContext, conversationId: string, note?: string): Promise<string> {
  const { sql } = deps;
  const { tenant } = ctx;

  const [services, professionals, reception, hours, history, recentlyCancelled, handoffTopics, faq, defaultPerson, niche, rules, timeOff] = await Promise.all([
    sql<Service[]>`
      select id, name, description, duration_minutes, price_cents, active, handoff, handoff_reason
      from services where tenant_id = ${tenant.id} and active and archived_at is null order by name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from professionals where tenant_id = ${tenant.id} and active and kind = 'professional' order by name
    `,
    // Reception staff: not offered for services, but a customer can still ask for them by name.
    sql<{ id: string; name: string }[]>`
      select id, name from professionals
      where tenant_id = ${tenant.id} and active and kind = 'reception' and notify_phone is not null
      order by name
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
    sql<{ question: string; answer: string }[]>`
      select question, answer from faq_entries where tenant_id = ${tenant.id} order by created_at
    `,
    // Who gets the questions nobody configured (to name her when offering to call someone).
    tenant.defaultHandoffProfessionalId
      ? sql<{ name: string; kind: string }[]>`
          select name, kind from professionals
          where tenant_id = ${tenant.id} and id = ${tenant.defaultHandoffProfessionalId} and active and notify_phone is not null
        `
      : Promise.resolve([] as { name: string; kind: string }[]),
    nicheForPrompt(sql, tenant.businessType),
    sql<{ kind: "always" | "never"; text: string }[]>`
      select kind, text from assistant_rules where tenant_id = ${tenant.id} order by created_at
    `,
    // Closures and absences in the booking window, so she can explain "fechado dia 25" instead of just having no slots.
    sql<{ professionalId: string | null; professionalName: string | null; startsAt: Date; endsAt: Date; reason: string | null }[]>`
      select t.professional_id, p.name as professional_name, t.starts_at, t.ends_at, t.reason
      from time_off t
      left join professionals p on p.id = t.professional_id and p.tenant_id = t.tenant_id
      where t.tenant_id = ${tenant.id} and t.ends_at > now()
        and t.starts_at < now() + make_interval(days => ${tenant.bookingHorizonDays})
      order by t.starts_at limit 40
    `,
  ]);
  const cancelledNote = recentlyCancelled.length
    ? "\n\nHorários desta cliente desmarcados nas últimas horas (já cancelados de verdade, não aparecem em list_customer_appointments):\n" +
      recentlyCancelled
        .map((a) => `- ${a.serviceName} com ${a.professionalName}, ${formatDateTimePtBr(a.startsAt, tenant.timezone)}`)
        .join("\n")
    : "";

  const promptData = {
    tenant,
    niche,
    services,
    professionals,
    reception,
    hours,
    handoffTopics,
    faq,
    rules,
    timeOff,
    defaultPerson: defaultPerson[0] ?? null,
    customerName: ctx.customer.name,
    now: new Date(),
  };
  // Prompt caching: the business instructions are the same for every customer of this business
  // until something is edited in the panel, so they are marked for cache; the time, the customer
  // and this message's notes come after them and change freely.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildSystemPrompt(promptData), cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildCurrentContext(promptData) + cancelledNote + (note ? `\n\nAviso do sistema sobre esta mensagem: ${note}` : ""),
    },
  ];

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
      // Automatic caching of the growing conversation: each tool round re-reads the turn so far from cache.
      cache_control: { type: "ephemeral" },
      messages,
    });
    deps.log.info(
      {
        tenantId: tenant.id,
        inputTokens: response.usage.input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens,
      },
      "model usage",
    );

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
