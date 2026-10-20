import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { EvolutionChannel, type EvolutionClient } from "../channels/evolution.js";
import { handleIncomingMessage, handleOwnerMessage, type EngineDeps } from "../conversation/engine.js";
import { normalizePhone } from "../lib/phone.js";

type EvolutionMessage = {
  key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    [type: string]: unknown;
  };
  messageType?: string;
};

type EvolutionWebhook = { event?: string; instance?: string; data?: EvolutionMessage };

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * The customer's phone JID. WhatsApp may address chats by LID ("...@lid");
 * Evolution then sends the phone JID in remoteJidAlt.
 */
export function customerJid(key: NonNullable<EvolutionMessage["key"]>): string | undefined {
  return [key.remoteJid, key.remoteJidAlt].find((jid) => jid?.endsWith("@s.whatsapp.net"));
}

export function messageText(data: EvolutionMessage): string | undefined {
  const text = data.message?.conversation ?? data.message?.extendedTextMessage?.text;
  return text?.trim() || undefined;
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { engine: EngineDeps; evolution: EvolutionClient; secret: string },
) {
  const { sql, log } = deps.engine;

  app.post("/webhooks/evolution", async (request, reply) => {
    const { secret } = (request.query ?? {}) as { secret?: string };
    if (!secret || !sameSecret(secret, deps.secret)) return reply.code(401).send({ error: "unauthorized" });

    const body = request.body as EvolutionWebhook;
    if (body.event !== "messages.upsert" || !body.instance || !body.data?.key?.id) return { ignored: true };

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where whatsapp_instance = ${body.instance} and whatsapp_provider = 'evolution' and active
    `;
    if (!tenant) {
      log.warn({ instance: body.instance }, "webhook for unknown instance");
      return { ignored: true };
    }

    const data = body.data;
    const key = data.key!;
    const jid = customerJid(key);
    // Groups, status, newsletters, or a LID without phone: not a 1:1 customer chat we can answer.
    if (!jid) {
      log.info({ tenantId: tenant.id, remoteJid: key.remoteJid }, "webhook message without phone JID ignored");
      return { ignored: true };
    }
    const phone = normalizePhone(jid);
    const text = messageText(data);
    const providerMessageId = key.id!;

    // Answer Evolution right away; the model can take a few seconds.
    void (async () => {
      try {
        if (key.fromMe) {
          await handleOwnerMessage(deps.engine, {
            tenantId: tenant.id,
            toPhone: phone,
            text: text ?? `[${data.messageType ?? "mídia"}]`,
            providerMessageId,
          });
        } else {
          await handleIncomingMessage(deps.engine, new EvolutionChannel(deps.evolution, body.instance!), {
            tenantId: tenant.id,
            fromPhone: phone,
            text: text ?? `[${data.messageType ?? "mídia"}]`,
            providerMessageId,
            unsupported: !text,
          });
        }
      } catch (error) {
        log.error({ err: error, tenantId: tenant.id }, "webhook processing failed");
      }
    })();

    return { received: true };
  });
}
