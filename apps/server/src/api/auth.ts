import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Every /api route requires `Authorization: Bearer <ADMIN_PASSWORD>`.
 * Without ADMIN_PASSWORD (development only) the panel stays open.
 */
export function registerAuth(app: FastifyInstance, adminPassword: string | undefined) {
  if (!adminPassword) {
    app.log.warn("ADMIN_PASSWORD não definida: painel sem senha (aceitável só em desenvolvimento)");
    return;
  }
  const expected = digest(adminPassword);

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!timingSafeEqual(digest(token), expected)) {
      return reply.code(401).send({ error: "unauthorized", message: "Senha inválida." });
    }
  });
}
