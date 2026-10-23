import { maskPhonesInText, withCountryCode } from "../lib/phone.js";
import type { Channel, OutgoingFile } from "./channel.js";
import { SendLimiter, typingDelayMs } from "./send-pacing.js";

/** Shared by every client: the cap is per WhatsApp number (instance), not per request. */
const limiter = new SendLimiter(20);

export class EvolutionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ConnectionState = "open" | "connecting" | "close" | "unknown";

/** Thin client for the parts of Evolution API v2 we use. */
export class EvolutionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { apikey: this.apiKey, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new EvolutionError(response.status, maskPhonesInText(`Evolution ${method} ${path}: ${response.status} ${text.slice(0, 300)}`));
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async instanceExists(instance: string): Promise<boolean> {
    try {
      await this.connectionState(instance);
      return true;
    } catch (error) {
      if (error instanceof EvolutionError && error.status === 404) return false;
      throw error;
    }
  }

  async createInstance(instance: string, webhookUrl: string) {
    await this.request("POST", "/instance/create", {
      instanceName: instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      // Calls are rejected so the chip does not ring forever on a bot number.
      rejectCall: true,
      msgCall: "Oi! Este número não atende ligações, mas responde por mensagem. 🙂",
      groupsIgnore: true,
      webhook: { url: webhookUrl, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
    });
  }

  async setWebhook(instance: string, webhookUrl: string) {
    await this.request("POST", `/webhook/set/${instance}`, {
      webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
    });
  }

  async connectionState(instance: string): Promise<ConnectionState> {
    const result = await this.request<{ instance?: { state?: string } }>("GET", `/instance/connectionState/${instance}`);
    const state = result.instance?.state;
    return state === "open" || state === "connecting" || state === "close" ? state : "unknown";
  }

  /** Starts (or restarts) pairing and returns the QR code as a data URL. */
  async qrCode(instance: string): Promise<string | undefined> {
    const result = await this.request<{ base64?: string }>("GET", `/instance/connect/${instance}`);
    return result.base64;
  }

  /** Pairing by code (typed in the phone) instead of QR; useful when the owner only has the phone at hand. */
  async pairingCode(instance: string, phone: string): Promise<string | undefined> {
    const result = await this.request<{ pairingCode?: string }>("GET", `/instance/connect/${instance}?number=${phone}`);
    return result.pairingCode;
  }

  /** The WhatsApp number paired to the instance (digits only), when connected. */
  async connectedNumber(instance: string): Promise<string | undefined> {
    const result = await this.request<{ ownerJid?: string | null }[] | { ownerJid?: string | null }>(
      "GET",
      `/instance/fetchInstances?instanceName=${instance}`,
    );
    const owner = (Array.isArray(result) ? result[0] : result)?.ownerJid;
    const digits = owner?.split("@")[0]?.replace(/\D/g, "");
    return digits && /^\d{10,15}$/.test(digits) ? digits : undefined;
  }

  /** Sets the WhatsApp profile photo of the connected number (raw base64, no data: prefix). */
  async updateProfilePicture(instance: string, base64: string) {
    await this.request("POST", `/chat/updateProfilePicture/${instance}`, { picture: base64 });
  }

  /** Unpairs the phone; the instance stays so a new number can be connected later. */
  async logout(instance: string) {
    await this.request("DELETE", `/instance/logout/${instance}`);
  }

  async sendFile(instance: string, toPhone: string, file: OutgoingFile): Promise<string | undefined> {
    await limiter.wait(instance);
    const result = await this.request<{ key?: { id?: string } }>("POST", `/message/sendMedia/${instance}`, {
      // Evolution shows "typing…" for this long before sending.
      delay: 1_500,
      // Team numbers typed in the panel may lack the 55; WhatsApp then reads them as another country.
      number: withCountryCode(toPhone),
      mediatype: file.mime.startsWith("image/") ? "image" : "document",
      mimetype: file.mime,
      fileName: file.name,
      caption: file.caption,
      media: file.data.toString("base64"),
    });
    return result.key?.id;
  }

  async sendText(instance: string, toPhone: string, text: string): Promise<string | undefined> {
    await limiter.wait(instance);
    const result = await this.request<{ key?: { id?: string } }>("POST", `/message/sendText/${instance}`, {
      number: withCountryCode(toPhone),
      text,
      delay: typingDelayMs(text),
    });
    return result.key?.id;
  }
}

/** Channel bound to one tenant's Evolution instance. */
export class EvolutionChannel implements Channel {
  readonly name = "evolution";

  constructor(
    private readonly client: EvolutionClient,
    private readonly instance: string,
  ) {}

  async sendText(toPhone: string, text: string) {
    return { providerMessageId: await this.client.sendText(this.instance, toPhone, text) };
  }

  async sendFile(toPhone: string, file: OutgoingFile) {
    return { providerMessageId: await this.client.sendFile(this.instance, toPhone, file) };
  }
}
