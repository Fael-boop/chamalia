import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword } from "../auth/passwords.js";
import type { Sql } from "../db/client.js";

const params = z.object({ tenantId: z.string().uuid() });
const itemParams = params.extend({ id: z.string().uuid() });
const login = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "usuário com 3 a 40 letras minúsculas, números, ponto, hífen ou _");
const password = z.string().min(8, "senha com pelo menos 8 caracteres").max(200);

const adminOnly = { config: { adminOnly: true } };

/** "Acesso do responsável": the agency creates and manages owner logins. */
export function registerUserRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/users", adminOnly, async (request) => {
    const { tenantId } = params.parse(request.params);
    return sql`
      select id, name, login, active, last_login_at, created_at
      from tenant_users where tenant_id = ${tenantId} order by created_at
    `;
  });

  app.post("/api/tenants/:tenantId/users", adminOnly, async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = z.object({ name: z.string().trim().min(1).max(80), login, password }).parse(request.body);
    try {
      const [user] = await sql`
        insert into tenant_users (tenant_id, name, login, password_hash, password_changed_at)
        values (${tenantId}, ${body.name}, ${body.login}, ${await hashPassword(body.password)}, ${new Date()})
        returning id, name, login, active, last_login_at, created_at
      `;
      return reply.code(201).send(user);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "login_taken", message: "Esse usuário já existe. Escolha outro." });
      }
      throw error;
    }
  });

  // New password and/or active flag. A new password logs the user out everywhere.
  app.patch("/api/tenants/:tenantId/users/:id", adminOnly, async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = z.object({ password: password.optional(), active: z.boolean().optional() }).parse(request.body);
    const changes: Record<string, unknown> = {};
    if (body.active !== undefined) changes.active = body.active;
    if (body.password) {
      changes.passwordHash = await hashPassword(body.password);
      // Server clock, same as the session's iat (see auth.ts).
      changes.passwordChangedAt = new Date();
    }
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: "empty_update" });
    const [user] = await sql`
      update tenant_users set ${sql(changes)} where tenant_id = ${tenantId} and id = ${id}
      returning id, name, login, active, last_login_at, created_at
    `;
    return user ?? reply.code(404).send({ error: "not_found" });
  });
}
