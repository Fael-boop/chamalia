import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { registerAgendaRoutes } from "./api/agenda.js";
import { registerAuth } from "./api/auth.js";
import { registerPanelRoutes } from "./api/panel.js";
import { registerTestChatRoutes } from "./api/test-chat.js";
import { registerUserRoutes } from "./api/users.js";
import { registerWebhookRoutes } from "./api/webhooks.js";
import { EvolutionChannel, EvolutionClient } from "./channels/evolution.js";
import type { Config } from "./config.js";
import type { Sql } from "./db/client.js";
import { loggerOptions } from "./lib/logger.js";
import { startReminderJob } from "./reminders/reminders.js";

// Built panel (apps/panel/dist). Served by the bot in production so the VPS
// runs a single Node container.
const panelDist = fileURLToPath(new URL("../../panel/dist", import.meta.url));

export async function buildApp(config: Config, sql?: Sql) {
  const app = Fastify({ logger: loggerOptions(config.LOG_LEVEL) });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => `${issue.path.join(".") || "valor"}: ${issue.message}`).join("; ");
      return reply.code(400).send({ error: "invalid_input", message });
    }
    request.log.error({ err: error }, "request failed");
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply
      .code(status)
      .send({ error: "internal_error", message: status < 500 ? (error as Error).message : "Erro interno." });
  });

  app.get("/health", async () => ({
    status: "ok",
    whatsappProvider: config.WHATSAPP_PROVIDER,
    database: sql ? await checkDatabase(sql, app.log) : "not_configured",
    ai: config.ANTHROPIC_API_KEY ? "configured" : "not_configured",
  }));

  registerAuth(app, { sql, adminPassword: config.ADMIN_PASSWORD, sessionSecret: sessionSecret(config, app) });

  if (sql) {
    registerUserRoutes(app, sql);
    registerAgendaRoutes(app, sql);
    const anthropic = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : undefined;
    const whatsapp =
      config.EVOLUTION_API_URL && config.EVOLUTION_API_KEY && config.WEBHOOK_SECRET
        ? {
            evolution: new EvolutionClient(config.EVOLUTION_API_URL, config.EVOLUTION_API_KEY),
            webhookBaseUrl: config.EVOLUTION_WEBHOOK_BASE_URL,
            webhookSecret: config.WEBHOOK_SECRET,
          }
        : undefined;
    registerPanelRoutes(app, sql, whatsapp);
    registerTestChatRoutes(app, { sql, anthropic, model: config.ANTHROPIC_MODEL, log: app.log });

    if (anthropic && whatsapp) {
      registerWebhookRoutes(app, {
        engine: { sql, anthropic, model: config.ANTHROPIC_MODEL, log: app.log },
        evolution: whatsapp.evolution,
        secret: whatsapp.webhookSecret,
      });
    }
    if (whatsapp) {
      // Day-before reminders only make sense where a real WhatsApp is connected.
      const stopReminders = startReminderJob({
        sql,
        log: app.log,
        channelFor: (instance) => new EvolutionChannel(whatsapp.evolution, instance),
      });
      app.addHook("onClose", async () => stopReminders());
    }
    if (!anthropic || !whatsapp) {
      app.log.warn("WhatsApp (Evolution) desligado: faltam ANTHROPIC_API_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY ou WEBHOOK_SECRET");
    }
  }

  if (existsSync(panelDist)) {
    await app.register(fastifyStatic, { root: panelDist });
    // SPA fallback: unknown GET routes outside the API return the panel.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}

function sessionSecret(config: Config, app: { log: FastifyBaseLogger }): string {
  if (config.SESSION_SECRET) return config.SESSION_SECRET;
  // Development only (production requires SESSION_SECRET): logins reset on restart.
  app.log.warn("SESSION_SECRET não definida: usando uma temporária, os logins caem quando o servidor reinicia");
  return randomBytes(32).toString("hex");
}

async function checkDatabase(sql: Sql, log: FastifyBaseLogger): Promise<"ok" | "error"> {
  try {
    await sql`select 1`;
    return "ok";
  } catch (error) {
    log.error({ err: error }, "database health check failed");
    return "error";
  }
}
