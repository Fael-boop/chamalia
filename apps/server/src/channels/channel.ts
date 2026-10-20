/**
 * Where messages go out. The conversation engine only talks to this
 * interface, so the same engine serves WhatsApp (Evolution / Meta Cloud) and
 * the panel's "Testar a Lia" chat.
 */
export interface Channel {
  readonly name: string;
  /** Returns the provider's message id when there is one (used to recognise our own echoes). */
  sendText(toPhone: string, text: string): Promise<{ providerMessageId?: string }>;
  /** Sends an image or PDF (e.g. the price list). */
  sendFile(toPhone: string, file: OutgoingFile): Promise<{ providerMessageId?: string }>;
}

export type OutgoingFile = { name: string; mime: string; data: Buffer; caption?: string };

/** Keeps outgoing messages in memory; used by the panel test chat. */
export class CollectingChannel implements Channel {
  readonly name = "test";
  readonly sent: { to: string; text: string }[] = [];
  readonly files: { to: string; name: string }[] = [];

  async sendText(toPhone: string, text: string) {
    this.sent.push({ to: toPhone, text });
    return {};
  }

  async sendFile(toPhone: string, file: OutgoingFile) {
    this.files.push({ to: toPhone, name: file.name });
    return {};
  }
}
