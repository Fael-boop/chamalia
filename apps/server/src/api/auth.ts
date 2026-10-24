import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import {
  SHORT_SESSION_MS,
  signSession,
  verifySession,
  type Session,
} from "../auth/tokens.js";
import { getSubscription, isExpired } from "../billing/billing.js";
import type { Sql } from "../db/client.js";
import { withCountryCode } from "../lib/phone.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
  }
  interface FastifyContextConfig {
    /** Only the agency admin may call this route. */
    adminOnly?: boolean;
    /** A business with an expired subscription may still call it (the payment page). */
    allowExpired?: boolean;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Screens that only exist with the WhatsApp assistant (plan "Agenda Online + Lia"). */
const ASSISTANT_ROUTE =
  /^\/api\/tenants\/[^/]+\/(faq|handoff-topics|handoffs|conversations|price-table|assistant-photo|rules|whatsapp|test-chat)(\/|\?|$)/;

export const ADMIN_LOGIN = "admin";
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60 * 1000;

const sameText = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

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
  if (!adminPassword)
    app.log.warn(
      "ADMIN_PASSWORD não definida: painel da agência aberto (só em desenvolvimento)",
    );

  // Wrong passwords per IP + login. Only failures count and a successful login clears them:
  // behind a proxy or tunnel every visitor shares one IP, and a typo must not lock everyone out.
  const failures = new Map<string, { count: number; since: number }>();
  function blocked(key: string): boolean {
    const entry = failures.get(key);
    if (entry && Date.now() - entry.since > ATTEMPT_WINDOW_MS)
      failures.delete(key);
    return (failures.get(key)?.count ?? 0) >= MAX_ATTEMPTS;
  }
  function recordFailure(key: string) {
    const entry = failures.get(key);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, since: Date.now() });
  }

  // Marco Civil da Internet (art. 15): date, time and IP of each login, kept 6 months (purged after 12).
  async function recordAccess(
    role: "admin" | "owner",
    tenantUserId: string | null,
    ip: string,
  ) {
    if (!sql) return;
    try {
      await sql`insert into access_logs (role, tenant_user_id, ip) values (${role}, ${tenantUserId}, ${ip})`;
    } catch (error) {
      app.log.error({ err: error }, "access record failed");
    }
  }

  app.post("/api/auth/login", async (request, reply) => {
    const body = z
      .object({
        login: z.string().trim().toLowerCase(),
        password: z.string(),
        remember: z.boolean().optional(),
      })
      .parse(request.body);
    // "Lembrar de mim" off: a short session; on (or an old client that does not send it): the full one.
    const lifetime = body.remember === false ? SHORT_SESSION_MS : undefined;
    const key = `${request.ip}|${body.login}`;
    if (blocked(key)) {
      return reply
        .code(429)
        .send({
          error: "too_many_attempts",
          message: "Muitas senhas erradas. Tente de novo em 1 minuto.",
        });
    }
    const invalid = () => {
      recordFailure(key);
      return reply
        .code(401)
        .send({
          error: "invalid_login",
          message: "Usuário ou senha incorretos.",
        });
    };

    if (body.login === ADMIN_LOGIN) {
      if (adminPassword && !sameText(body.password, adminPassword))
        return invalid();
      failures.delete(key);
      await recordAccess("admin", null, request.ip);
      return {
        token: signSession(
          { role: "admin" },
          sessionSecret,
          Date.now(),
          lifetime,
        ),
        role: "admin",
      };
    }

    if (!sql) return invalid();
    const [user] = await sql<
      { id: string; tenantId: string; name: string; passwordHash: string }[]
    >`
      select u.id, u.tenant_id, u.name, u.password_hash
      from tenant_users u join tenants t on t.id = u.tenant_id
      where u.login = ${body.login} and u.active and t.active
    `;
    if (!user || !(await verifyPassword(body.password, user.passwordHash)))
      return invalid();

    failures.delete(key);
    await sql`update tenant_users set last_login_at = now() where id = ${user.id}`;
    await recordAccess("owner", user.id, request.ip);
    return {
      token: signSession(
        { role: "owner", tenantId: user.tenantId, userId: user.id },
        sessionSecret,
        Date.now(),
        lifetime,
      ),
      role: "owner",
      tenantId: user.tenantId,
      name: user.name,
    };
  });

  // Who is calling: resolves the session for every /api route.
  app.addHook("preHandler", async (request, reply) => {
    if (
      !request.url.startsWith("/api/") ||
      request.url.startsWith("/api/auth/login")
    )
      return;

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
        return reply
          .code(401)
          .send({
            error: "unauthorized",
            message: "Sessão expirada. Entre de novo.",
          });
      }
      request.session = session;
    } else if (session?.role === "admin" || (!token && !adminPassword)) {
      request.session = session ?? { role: "admin", issuedAt: 0, expiresAt: 0 };
    } else {
      return reply
        .code(401)
        .send({
          error: "unauthorized",
          message: "Entre com seu usuário e senha.",
        });
    }

    const tenantId = (request.params as { tenantId?: string } | undefined)
      ?.tenantId;
    if (session?.role === "owner") {
      if (request.routeOptions.config?.adminOnly) {
        return reply
          .code(403)
          .send({ error: "forbidden", message: "Acesso só da Chama Lia." });
      }
      if (tenantId && tenantId !== session.tenantId) {
        return reply
          .code(403)
          .send({ error: "forbidden", message: "Sem acesso a este cliente." });
      }
    }

    // Plan and subscription. An expired business only reaches the payment page (the agency
    // still sees everything, to fix it); a plan without the assistant has none of its screens.
    if (!tenantId || !sql || !UUID.test(tenantId)) return;
    const owner = session?.role === "owner";
    const assistantRoute = ASSISTANT_ROUTE.test(request.url);
    if (!owner && !assistantRoute) return;
    const subscription = await getSubscription(sql, tenantId);
    if (!subscription) return;
    if (
      owner &&
      isExpired(subscription) &&
      !request.routeOptions.config?.allowExpired
    ) {
      return reply
        .code(402)
        .send({
          error: "subscription_expired",
          message: "Sua assinatura venceu. Renove para continuar.",
        });
    }
    if (assistantRoute && !subscription.plan.includesAssistant) {
      return reply
        .code(403)
        .send({
          error: "plan_required",
          message: "Disponível no plano com a Lia.",
        });
    }
  });

  app.get("/api/session", async (request) => {
    const session = request.session!;
    if (session.role === "admin") return { role: "admin" };
    const [user] =
      await sql!`select name from tenant_users where id = ${session.userId}`;
    return {
      role: "owner",
      tenantId: session.tenantId,
      name: user?.name ?? "",
    };
  });

  // --- The person logged in: profile menu and "Minha conta" ---

  const agencyOnly = (reply: FastifyReply) =>
    reply
      .code(403)
      .send({
        error: "agency_account",
        message: "A conta da agência é configurada no servidor.",
      });

  app.get("/api/me", async (request) => {
    const session = request.session!;
    if (session.role === "admin" || !sql) {
      return {
        role: "admin",
        name: "Agência",
        login: ADMIN_LOGIN,
        email: null,
        nickname: null,
        phone: null,
      };
    }
    const [user] = await sql<
      {
        name: string;
        login: string;
        email: string | null;
        nickname: string | null;
        phone: string | null;
      }[]
    >`
      select name, login, email, nickname, phone from tenant_users where id = ${session.userId}
    `;
    return {
      role: "owner",
      name: user?.name ?? "",
      login: user?.login ?? "",
      email: user?.email ?? null,
      nickname: user?.nickname ?? null,
      phone: user?.phone ?? null,
    };
  });

  app.patch("/api/me", async (request, reply) => {
    const session = request.session!;
    if (session.role !== "owner" || !sql) return agencyOnly(reply);
    const changes = z
      .object({
        name: z.string().trim().min(1, "Informe o nome").max(80),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("E-mail inválido")
          .max(254)
          .nullable(),
        nickname: z
          .string()
          .trim()
          .max(40, "Apelido com até 40 letras")
          .nullable()
          .transform((v) => v || null),
        phone: z
          .string()
          .trim()
          .nullable()
          // A Brazilian number typed without 55 gets it, like the other phones in the panel.
          .transform((v) => (v ? withCountryCode(v) : null))
          .pipe(
            z
              .string()
              .regex(/^\d{10,15}$/, "Telefone com DDD. Ex.: (62) 99999-0000")
              .nullable(),
          ),
      })
      .partial()
      .parse(request.body);
    if (Object.keys(changes).length === 0)
      return reply.code(400).send({ error: "empty_update" });
    const [user] = await sql`
      update tenant_users set ${sql(changes)} where id = ${session.userId} returning name, login, email, nickname, phone
    `;
    return { role: "owner", ...user };
  });

  // The person's photo (small square), kept apart from /api/me so that call stays light.
  const PHOTO_MAX_BYTES = 256 * 1024;
  app.get("/api/me/photo", async (request) => {
    const session = request.session!;
    if (session.role !== "owner" || !sql) return { dataUrl: null };
    const [row] = await sql<
      { photo: Buffer | null; photoMime: string | null }[]
    >`
      select photo, photo_mime from tenant_users where id = ${session.userId}
    `;
    return {
      dataUrl: row?.photo
        ? `data:${row.photoMime};base64,${row.photo.toString("base64")}`
        : null,
    };
  });

  app.put(
    "/api/me/photo",
    { bodyLimit: Math.ceil(PHOTO_MAX_BYTES * 1.4) + 16 * 1024 },
    async (request, reply) => {
      const session = request.session!;
      if (session.role !== "owner" || !sql) return agencyOnly(reply);
      const body = z
        .object({
          mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
          dataBase64: z.string().min(1),
        })
        .parse(request.body);
      const data = Buffer.from(body.dataBase64, "base64");
      if (data.length === 0 || data.length > PHOTO_MAX_BYTES) {
        return reply
          .code(413)
          .send({
            error: "file_too_large",
            message: "A foto precisa ter até 256 KB.",
          });
      }
      await sql`update tenant_users set photo = ${data}, photo_mime = ${body.mime} where id = ${session.userId}`;
      return { saved: true };
    },
  );

  app.delete("/api/me/photo", async (request, reply) => {
    const session = request.session!;
    if (session.role !== "owner" || !sql) return agencyOnly(reply);
    await sql`update tenant_users set photo = null, photo_mime = null where id = ${session.userId}`;
    return { deleted: true };
  });

  // Changing the password ends every other session of this person; this one gets a fresh token.
  app.post("/api/me/password", async (request, reply) => {
    const session = request.session!;
    if (session.role !== "owner" || !sql) return agencyOnly(reply);
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(8, "A nova senha precisa ter pelo menos 8 caracteres.")
          .max(200),
      })
      .parse(request.body);
    const [user] = await sql<
      { passwordHash: string }[]
    >`select password_hash from tenant_users where id = ${session.userId}`;
    if (
      !user ||
      !(await verifyPassword(body.currentPassword, user.passwordHash))
    ) {
      return reply
        .code(400)
        .send({
          error: "wrong_password",
          message: "A senha atual não confere.",
        });
    }
    const changedAt = new Date();
    await sql`
      update tenant_users set password_hash = ${await hashPassword(body.newPassword)}, password_changed_at = ${changedAt}
      where id = ${session.userId}
    `;
    const token = signSession(
      { role: "owner", tenantId: session.tenantId, userId: session.userId },
      sessionSecret,
      changedAt.getTime() + 1,
    );
    return { token };
  });
}
