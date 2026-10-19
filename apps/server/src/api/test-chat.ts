import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CollectingChannel } from "../channels/channel.js";
import { handleIncomingMessage, type EngineDeps } from "../conversation/engine.js";

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

  app.get("/api/tenants/:tenantId/test-chat", async (request) => {
    const { tenantId } = params.parse(request.params);
    const query = z.object({ phone }).parse(request.query);
    return sql`
      select m.id, m.direction, m.body, m.created_at
      from messages m
      join conversations c on c.id = m.conversation_id
      join customers cu on cu.id = c.customer_id
      where m.tenant_id = ${tenantId} and cu.phone = ${query.phone}
      order by m.created_at
    `;
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
