import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HUMAN_STATE, releaseToAssistant } from "../conversation/engine.js";
import type { Sql } from "../db/client.js";

const tenantParams = z.object({ tenantId: z.string().uuid() });
const itemParams = tenantParams.extend({ id: z.string().uuid() });

/** Conversations currently with the team, so the panel can give them back to the assistant. */
export function registerConversationRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/handoffs", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`
      select c.id, c.context->>'handoffReason' as reason, c.context->>'handoffTo' as handoff_to,
             c.context->>'handoffAt' as handoff_at, c.context->>'teamLastAt' as team_last_at,
             c.last_message_at, cu.name as customer_name, cu.phone as customer_phone,
             (select body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
      from conversations c
      join customers cu on cu.id = c.customer_id
      where c.tenant_id = ${tenantId} and c.state = ${HUMAN_STATE}
      order by c.last_message_at desc
      limit 100
    `;
  });

  app.post("/api/tenants/:tenantId/conversations/:id/release", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const released = await releaseToAssistant(sql, tenantId, id);
    return released.length ? { released: true } : reply.code(404).send({ error: "not_found" });
  });
}
