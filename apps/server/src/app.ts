import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import Fastify, { type FastifyBaseLogger } from "fastify";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { registerAgendaRoutes } from "./api/agenda.js";
import { registerBillingRoutes, type MercadoPagoSetup } from "./api/billing.js";
import { registerNicheRoutes } from "./api/niches.js";
import { registerRuleRoutes } from "./api/rules.js";
import { registerAuth } from "./api/auth.js";
import { registerConversationRoutes } from "./api/conversations.js";
import { registerPanelRoutes } from "./api/panel.js";
import { registerPriceTableRoutes } from "./api/price-table.js";
import { registerProfilePhotoRoutes } from "./api/profile-photo.js";
import { registerTestChatRoutes } from "./api/test-chat.js";
import { registerUserRoutes } from "./api/users.js";
import { registerWebhookRoutes } from "./api/webhooks.js";
import { MercadoPagoClient, MercadoPagoSubscriptions } from "./billing/mercadopago.js";
import { EvolutionChannel, EvolutionClient } from "./channels/evolution.js";
import { groqTranscriber } from "./channels/transcribe.js";
import type { Config } from "./config.js";
import type { Sql } from "./db/client.js";
import { loggerOptions } from "./lib/logger.js";
import { startRetentionJob } from "./maintenance/retention.js";
import { startReminderJob } from "./reminders/reminders.js";

// Built panel (apps/panel/dist). Served by the bot in production so the VPS
// runs a single Node container.
const panelDist = fileURLToPath(new URL("../../panel/dist", import.meta.url));

export async function buildApp(config: Config, sql?: Sql) {
  // In production the app is only reached through the proxy (Traefik), which tells the visitor's IP:
  // needed for the login limit and the access records the Marco Civil requires.
  const app = Fastify({ logger: loggerOptions(config.LOG_LEVEL), trustProxy: config.NODE_ENV === "production" });

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
    registerBillingRoutes(app, sql, {
      log: app.log,
      mercadoPago: mercadoPagoSetup(config),
    });
    registerAgendaRoutes(app, sql);
    registerNicheRoutes(app, sql);
    const anthropic = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : undefined;
    registerRuleRoutes(app, sql, anthropic && { anthropic, model: config.ANTHROPIC_MODEL });
    registerPriceTableRoutes(app, sql);
    registerConversationRoutes(app, sql);
    const whatsapp =
      config.EVOLUTION_API_URL && config.EVOLUTION_API_KEY && config.WEBHOOK_SECRET
        ? {
            evolution: new EvolutionClient(config.EVOLUTION_API_URL, config.EVOLUTION_API_KEY),
            webhookBaseUrl: config.EVOLUTION_WEBHOOK_BASE_URL,
            webhookSecret: config.WEBHOOK_SECRET,
          }
        : undefined;
    registerPanelRoutes(app, sql, whatsapp);
    registerProfilePhotoRoutes(app, sql, whatsapp);
    registerTestChatRoutes(app, { sql, anthropic, model: config.ANTHROPIC_MODEL, log: app.log });

    if (anthropic && whatsapp) {
      registerWebhookRoutes(app, {
        engine: { sql, anthropic, model: config.ANTHROPIC_MODEL, log: app.log },
        evolution: whatsapp.evolution,
        secret: whatsapp.webhookSecret,
        transcribe: config.GROQ_API_KEY ? groqTranscriber(config.GROQ_API_KEY, config.GROQ_TRANSCRIBE_MODEL) : undefined,
      });
      if (!config.GROQ_API_KEY) app.log.warn("Áudios do WhatsApp sem transcrição: falta GROQ_API_KEY");
    }
    const stopRetention = startRetentionJob({ sql, log: app.log });
    app.addHook("onClose", async () => stopRetention());

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

function mercadoPagoSetup(config: Config): MercadoPagoSetup | undefined {
  if (!config.MERCADOPAGO_ACCESS_TOKEN) return undefined;
  const client = new MercadoPagoClient(config.MERCADOPAGO_ACCESS_TOKEN);
  return {
    client,
    webhookSecret: config.MERCADOPAGO_WEBHOOK_SECRET,
    // The card form needs the Public Key; without it only Pix is offered.
    subscriptions: config.MERCADOPAGO_PUBLIC_KEY ? new MercadoPagoSubscriptions(client) : undefined,
    publicKey: config.MERCADOPAGO_PUBLIC_KEY,
    publicUrl: config.PUBLIC_URL.replace(/\/$/, ""),
  };
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
