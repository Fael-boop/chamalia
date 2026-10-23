import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { EvolutionChannel, type EvolutionClient } from "../channels/evolution.js";
import { MAX_AUDIO_SECONDS, type Transcriber } from "../channels/transcribe.js";
import { handleIncomingMessage, handleOwnerMessage, type EngineDeps, type IncomingMessage } from "../conversation/engine.js";
import { normalizePhone } from "../lib/phone.js";

type EvolutionMessage = {
  key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string; contextInfo?: { stanzaId?: string } };
    audioMessage?: { seconds?: number; mimetype?: string };
    [type: string]: unknown;
  };
  /** Evolution v2 also copies the reply info here. */
  contextInfo?: { stanzaId?: string };
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

/** Id of the message this one replies to (WhatsApp "Responder"), if any. */
export function quotedMessageId(data: EvolutionMessage): string | undefined {
  return data.message?.extendedTextMessage?.contextInfo?.stanzaId ?? data.contextInfo?.stanzaId ?? undefined;
}

const AUDIO_TOO_LONG = "Seu áudio ficou um pouco longo para mim. Pode mandar um de até 2 minutos ou me escrever? 🙂";
const AUDIO_UNCLEAR = "Não consegui entender seu áudio. Pode me escrever? 🙂";

/** A voice message, with its length in seconds when WhatsApp sends it. */
export function audioInfo(data: EvolutionMessage): { seconds?: number } | undefined {
  const audio = data.message?.audioMessage;
  return audio ? { seconds: audio.seconds } : undefined;
}

/**
 * What a voice message says, as the text the assistant will answer. Too long, or nothing
 * understood, becomes a fixed answer asking the person to write instead.
 */
async function voiceToMessage(
  deps: { evolution: EvolutionClient; transcribe: Transcriber; log: EngineDeps["log"] },
  instance: string,
  tenantId: string,
  data: EvolutionMessage,
  seconds: number | undefined,
): Promise<Pick<IncomingMessage, "text" | "unsupported" | "unsupportedReply">> {
  if ((seconds ?? 0) > MAX_AUDIO_SECONDS) return { text: "[áudio longo]", unsupported: true, unsupportedReply: AUDIO_TOO_LONG };
  try {
    const media = await deps.evolution.downloadMedia(instance, data);
    const text = await deps.transcribe(Buffer.from(media.base64, "base64"), media.mimetype);
    if (text) return { text: `[áudio] ${text}` };
  } catch (error) {
    deps.log.error({ err: error, tenantId }, "voice message transcription failed");
  }
  return { text: "[áudio]", unsupported: true, unsupportedReply: AUDIO_UNCLEAR };
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { engine: EngineDeps; evolution: EvolutionClient; secret: string; transcribe?: Transcriber },
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
          const audio = !text && deps.transcribe ? audioInfo(data) : undefined;
          const content = audio
            ? await voiceToMessage({ evolution: deps.evolution, transcribe: deps.transcribe!, log }, body.instance!, tenant.id, data, audio.seconds)
            : { text: text ?? `[${data.messageType ?? "mídia"}]`, unsupported: !text };
          await handleIncomingMessage(deps.engine, new EvolutionChannel(deps.evolution, body.instance!), {
            tenantId: tenant.id,
            fromPhone: phone,
            providerMessageId,
            quotedMessageId: quotedMessageId(data),
            ...content,
          });
        }
      } catch (error) {
        log.error({ err: error, tenantId: tenant.id }, "webhook processing failed");
      }
    })();

    return { received: true };
  });
}
