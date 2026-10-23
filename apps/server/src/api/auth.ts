import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../auth/passwords.js";
import { SHORT_SESSION_MS, signSession, verifySession, type Session } from "../auth/tokens.js";
import type { Sql } from "../db/client.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
  }
  interface FastifyContextConfig {
    /** Only the agency admin may call this route. */
    adminOnly?: boolean;
  }
}

export const ADMIN_LOGIN = "admin";
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60 * 1000;

const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export function isOwner(request: FastifyRequest): boolean {
  return request.session?.role === "owner";
}

/**
 * Panel authentication.
 * - Agency admin: login "admin" + ADMIN_PASSWORD; sees every tenant.
 * - Business owner: login/password from tenant_users; sees only their tenant.
 * Without ADMIN_PASSWORD (development only) requests without a token act as admin.
 */
export function registerAuth(
  app: FastifyInstance,
  options: { sql?: Sql; adminPassword?: string; sessionSecret: string },
) {
  const { sql, adminPassword, sessionSecret } = options;
  if (!adminPassword) app.log.warn("ADMIN_PASSWORD não definida: painel da agência aberto (só em desenvolvimento)");

  // Wrong passwords per IP + login. Only failures count and a successful login clears them:
  // behind a proxy or tunnel every visitor shares one IP, and a typo must not lock everyone out.
  const failures = new Map<string, { count: number; since: number }>();
  function blocked(key: string): boolean {
    const entry = failures.get(key);
    if (entry && Date.now() - entry.since > ATTEMPT_WINDOW_MS) failures.delete(key);
    return (failures.get(key)?.count ?? 0) >= MAX_ATTEMPTS;
  }
  function recordFailure(key: string) {
    const entry = failures.get(key);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, since: Date.now() });
  }

  app.post("/api/auth/login", async (request, reply) => {
    const body = z
      .object({ login: z.string().trim().toLowerCase(), password: z.string(), remember: z.boolean().optional() })
      .parse(request.body);
    // "Lembrar de mim" off: a short session; on (or an old client that does not send it): the full one.
    const lifetime = body.remember === false ? SHORT_SESSION_MS : undefined;
    const key = `${request.ip}|${body.login}`;
    if (blocked(key)) {
      return reply.code(429).send({ error: "too_many_attempts", message: "Muitas senhas erradas. Tente de novo em 1 minuto." });
    }
    const invalid = () => {
      recordFailure(key);
      return reply.code(401).send({ error: "invalid_login", message: "Usuário ou senha incorretos." });
    };

    if (body.login === ADMIN_LOGIN) {
      if (adminPassword && !sameText(body.password, adminPassword)) return invalid();
      failures.delete(key);
      return { token: signSession({ role: "admin" }, sessionSecret, Date.now(), lifetime), role: "admin" };
    }

    if (!sql) return invalid();
    const [user] = await sql<{ id: string; tenantId: string; name: string; passwordHash: string }[]>`
      select u.id, u.tenant_id, u.name, u.password_hash
      from tenant_users u join tenants t on t.id = u.tenant_id
      where u.login = ${body.login} and u.active and t.active
    `;
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) return invalid();

    failures.delete(key);
    await sql`update tenant_users set last_login_at = now() where id = ${user.id}`;
    return {
      token: signSession({ role: "owner", tenantId: user.tenantId, userId: user.id }, sessionSecret, Date.now(), lifetime),
      role: "owner",
      tenantId: user.tenantId,
      name: user.name,
    };
  });

  // Who is calling: resolves the session for every /api route.
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/auth/login")) return;

    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = token ? verifySession(token, sessionSecret) : undefined;

    if (session?.role === "owner") {
      // Deactivated users and sessions older than a password change are refused.
      // password_changed_at is written with this server's clock, so both sides compare the same clock.
      const [user] = sql
        ? await sql<{ passwordChangedAt: Date }[]>`
            select u.password_changed_at from tenant_users u join tenants t on t.id = u.tenant_id
            where u.id = ${session.userId} and u.active and t.active
          `
        : [];
      if (!user || user.passwordChangedAt.getTime() > session.issuedAt) {
        return reply.code(401).send({ error: "unauthorized", message: "Sessão expirada. Entre de novo." });
      }
      request.session = session;
    } else if (session?.role === "admin" || (!token && !adminPassword)) {
      request.session = session ?? { role: "admin", issuedAt: 0, expiresAt: 0 };
    } else {
      return reply.code(401).send({ error: "unauthorized", message: "Entre com seu usuário e senha." });
    }

    if (session?.role !== "owner") return;
    if (request.routeOptions.config?.adminOnly) {
      return reply.code(403).send({ error: "forbidden", message: "Acesso só da Chama Lia." });
    }
    const tenantId = (request.params as { tenantId?: string } | undefined)?.tenantId;
    if (tenantId && tenantId !== session.tenantId) {
      return reply.code(403).send({ error: "forbidden", message: "Sem acesso a este cliente." });
    }
  });

  app.get("/api/session", async (request) => {
    const session = request.session!;
    if (session.role === "admin") return { role: "admin" };
    const [user] = await sql!`select name from tenant_users where id = ${session.userId}`;
    return { role: "owner", tenantId: session.tenantId, name: user?.name ?? "" };
  });
}
