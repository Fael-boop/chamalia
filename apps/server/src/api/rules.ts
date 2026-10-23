import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";

const tenantParams = z.object({ tenantId: z.string().uuid() });
const itemParams = tenantParams.extend({ id: z.string().uuid() });
const ruleBody = z.object({ kind: z.enum(["always", "never"]), text: z.string().trim().min(1).max(300) });

const suggestionBody = z.object({
  suggestion: z.string().trim().min(2).max(500),
  lastQuestion: z.string().max(2000).optional(),
  lastAnswer: z.string().max(2000).optional(),
});
const ProposedRule = z.object({ kind: z.enum(["always", "never"]), text: z.string() });

/** Turns the owner's own words ("escreve textos menores") into one clear rule, using the last answer as context. */
function suggestionPrompt(assistantName: string) {
  return [
    `Você ajuda o dono de um negócio a ajustar a ${assistantName}, a atendente virtual que responde os clientes dele no WhatsApp.`,
    "Ele escreve um pedido do jeito dele. Transforme o pedido em UMA regra curta que a atendente vai seguir em todas as conversas.",
    "kind: \"always\" para algo que ela deve sempre fazer, \"never\" para algo que ela nunca deve fazer.",
    "text: a regra em português, sem começar com Sempre ou Nunca, no imperativo, concreta e verificável, com no máximo 120 caracteres. Ex.: \"responda em mensagens curtas, de até 2 frases\".",
    "Se o pedido falar de \"isso\" ou \"essa forma\", use a última resposta da atendente para entender o que mudar.",
    "Não crie regras com preços, horários ou serviços inventados.",
  ].join("\n");
}

/** "Treinar a Lia": rules the business writes in plain words; the assistant follows them in every conversation. */
export function registerRuleRoutes(app: FastifyInstance, sql: Sql, ai?: { anthropic: Anthropic; model: string }) {
  app.post("/api/tenants/:tenantId/rules/suggest", async (request, reply) => {
    const { tenantId } = tenantParams.parse(request.params);
    const body = suggestionBody.parse(request.body);
    if (!ai) return reply.code(503).send({ error: "ai_off", message: "IA não configurada (ANTHROPIC_API_KEY)." });
    const [tenant] = await sql<{ assistantName: string }[]>`select assistant_name from tenants where id = ${tenantId}`;
    if (!tenant) return reply.code(404).send({ error: "not_found" });
    const context = [
      body.lastQuestion ? `Última mensagem do cliente: ${body.lastQuestion}` : "",
      body.lastAnswer ? `Última resposta da atendente: ${body.lastAnswer}` : "",
      `Pedido do dono: ${body.suggestion}`,
    ].filter(Boolean).join("\n\n");
    const response = await ai.anthropic.messages.parse({
      model: ai.model,
      max_tokens: 2048,
      system: suggestionPrompt(tenant.assistantName),
      output_config: { effort: "low", format: zodOutputFormat(ProposedRule) },
      messages: [{ role: "user", content: context }],
    });
    const rule = response.stop_reason === "refusal" ? null : response.parsed_output;
    if (!rule) return reply.code(422).send({ error: "no_rule", message: "Não consegui transformar em regra. Tente escrever de outro jeito." });
    const text = rule.text.trim().replace(/^(sempre|nunca)\s+/i, "").replace(/\.$/, "").slice(0, 300);
    return { kind: rule.kind, text };
  });

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
