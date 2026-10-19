import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import { loggerOptions } from "./lib/logger.js";

// Built panel (apps/panel/dist). Served by the bot in production so the VPS
// runs a single Node container.
const panelDist = fileURLToPath(new URL("../../panel/dist", import.meta.url));

export async function buildApp(config: Config) {
  const app = Fastify({ logger: loggerOptions(config.LOG_LEVEL) });

  app.get("/health", async () => ({
    status: "ok",
    whatsappProvider: config.WHATSAPP_PROVIDER,
    database: config.DATABASE_URL ? "configured" : "not_configured",
    ai: config.ANTHROPIC_API_KEY ? "configured" : "not_configured",
  }));

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
