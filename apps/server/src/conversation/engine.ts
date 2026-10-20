import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { Channel } from "../channels/channel.js";
import type { Sql } from "../db/client.js";
import { KeyedLock } from "../lib/keyed-lock.js";
import { getTenant, type Service } from "../scheduling/service.js";
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
  const [conversation] = await sql<{ id: string; state: string }[]>`
    insert into conversations (tenant_id, customer_id) values (${tenantId}, ${customer!.id})
    on conflict (tenant_id, customer_id) do update set last_message_at = now()
    returning id, state
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

  const ctx: ToolContext = { sql, tenant, customer, ownerNotices: [] };
  let reply: string;
  if (message.unsupported) {
    reply = UNSUPPORTED_REPLY;
  } else {
    try {
      reply = await askModel(deps, ctx, conversation.id);
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
    const context = { handoffReason: ctx.handoffReason, handoffAt: new Date().toISOString() };
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
  return {
    reply,
    ownerNotices: ctx.ownerNotices,
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

/** Gives a conversation back to the assistant after the owner handled it. */
export async function releaseToAssistant(sql: Sql, tenantId: string, conversationId: string) {
  return sql`
    update conversations set state = 'idle', context = '{}'
    where tenant_id = ${tenantId} and id = ${conversationId}
    returning id
  `;
}

async function askModel(deps: EngineDeps, ctx: ToolContext, conversationId: string): Promise<string> {
  const { sql } = deps;
  const { tenant } = ctx;

  const [services, professionals, hours, history] = await Promise.all([
    sql<Service[]>`
      select id, name, description, duration_minutes, price_cents, active
      from services where tenant_id = ${tenant.id} and active order by name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from professionals where tenant_id = ${tenant.id} and active order by name
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
  ]);

  const system = buildSystemPrompt({
    tenant,
    services,
    professionals,
    hours,
    customerName: ctx.customer.name,
    now: new Date(),
  });

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
