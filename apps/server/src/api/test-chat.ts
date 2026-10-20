import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CollectingChannel } from "../channels/channel.js";
import { findNextReminderFor, sendReminder } from "../reminders/reminders.js";
import { handleIncomingMessage, HUMAN_STATE, releaseToAssistant, type EngineDeps } from "../conversation/engine.js";

const params = z.object({ tenantId: z.string().uuid() });
const phone = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,15}$/, "telefone com DDI e DDD, só números"));

/**
 * "Testar a Lia": the panel talks to the same engine the WhatsApp webhook
 * uses, through a channel that just collects the outgoing messages.
 */
export function registerTestChatRoutes(app: FastifyInstance, deps: Omit<EngineDeps, "anthropic"> & Partial<EngineDeps>) {
  const { sql } = deps;

  async function findConversation(tenantId: string, customerPhone: string) {
    const [conversation] = await sql<{ id: string; state: string; context: { handoffReason?: string } }[]>`
      select c.id, c.state, c.context
      from conversations c join customers cu on cu.id = c.customer_id
      where c.tenant_id = ${tenantId} and cu.phone = ${customerPhone}
    `;
    return conversation;
  }

  app.get("/api/tenants/:tenantId/test-chat", async (request) => {
    const { tenantId } = params.parse(request.params);
    const query = z.object({ phone }).parse(request.query);
    const conversation = await findConversation(tenantId, query.phone);
    if (!conversation) return { withOwner: false, handoffReason: null, messages: [] };
    const messages = await sql`
      select id, direction, body, created_at from messages
      where conversation_id = ${conversation.id} order by created_at
    `;
    return {
      withOwner: conversation.state === HUMAN_STATE,
      handoffReason: conversation.context.handoffReason ?? null,
      messages,
    };
  });

  app.post("/api/tenants/:tenantId/test-chat/release", async (request) => {
    const { tenantId } = params.parse(request.params);
    const body = z.object({ phone }).parse(request.body);
    const conversation = await findConversation(tenantId, body.phone);
    if (conversation) await releaseToAssistant(sql, tenantId, conversation.id);
    return { released: Boolean(conversation) };
  });

  app.post("/api/tenants/:tenantId/test-chat", async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = z.object({ phone, text: z.string().trim().min(1).max(2000) }).parse(request.body);
    if (!deps.anthropic) {
      return reply.code(503).send({
        error: "ai_not_configured",
        message: "Coloque a ANTHROPIC_API_KEY no .env e reinicie o servidor.",
      });
    }

    const channel = new CollectingChannel();
    const result = await handleIncomingMessage({ ...deps, anthropic: deps.anthropic }, channel, {
      tenantId,
      fromPhone: body.phone,
      text: body.text,
      providerMessageId: `test-${randomUUID()}`,
    });
    if (!result) return reply.code(404).send({ error: "not_found", message: "Cliente inativo ou inexistente." });
    return result;
  });

  // Sends the day-before reminder of the test customer's next appointment now,
  // ignoring the usual time window, so the owner can try answering "1" or "2".
  app.post("/api/tenants/:tenantId/test-chat/reminder", async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = z.object({ phone }).parse(request.body);
    const reminder = await findNextReminderFor(sql, tenantId, body.phone);
    if (!reminder) {
      return reply.code(404).send({ error: "not_found", message: "Esta cliente de teste não tem horário marcado. Agende um primeiro." });
    }
    // Lets the test resend a reminder that was already sent.
    await sql`update appointments set reminder_24h_sent_at = null where id = ${reminder.appointmentId}`;
    const sent = await sendReminder(deps, new CollectingChannel(), reminder);
    return { sent };
  });

  // Starts a new conversation for the test phone. Customer and appointments stay.
  app.delete("/api/tenants/:tenantId/test-chat", async (request) => {
    const { tenantId } = params.parse(request.params);
    const query = z.object({ phone }).parse(request.query);
    const deleted = await sql`
      delete from conversations c using customers cu
      where c.customer_id = cu.id and c.tenant_id = ${tenantId} and cu.phone = ${query.phone}
      returning c.id
    `;
    return { deleted: deleted.length };
  });
}
