import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";

const tenantParams = z.object({ tenantId: z.string().uuid() });
const itemParams = tenantParams.extend({ id: z.string().uuid() });
const ruleBody = z.object({ kind: z.enum(["always", "never"]), text: z.string().trim().min(1).max(300) });

/** "Treinar a Lia": rules the business writes in plain words; the assistant follows them in every conversation. */
export function registerRuleRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/rules", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    return sql`select id, kind, text from assistant_rules where tenant_id = ${tenantId} order by created_at`;
  });

  app.post("/api/tenants/:tenantId/rules", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = ruleBody.parse(request.body);
    const [rule] = await sql`
      insert into assistant_rules ${sql({ tenantId, ...body })} returning id, kind, text
    `;
    return reply.code(201).send(rule);
  });

  app.patch("/api/tenants/:tenantId/rules/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = ruleBody.parse(request.body);
    const [rule] = await sql`
      update assistant_rules set ${sql(body)} where tenant_id = ${tenantId} and id = ${id} returning id, kind, text
    `;
    return rule ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/tenants/:tenantId/rules/:id", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const deleted = await sql`delete from assistant_rules where tenant_id = ${tenantId} and id = ${id} returning id`;
    return deleted.length ? { deleted: true } : reply.code(404).send({ error: "not_found" });
  });
}
