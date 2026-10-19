/**
 * Where messages go out. The conversation engine only talks to this
 * interface, so the same engine serves WhatsApp (Evolution / Meta Cloud) and
 * the panel's "Testar a Lia" chat.
 */
export interface Channel {
  readonly name: string;
  sendText(toPhone: string, text: string): Promise<void>;
}

/** Keeps outgoing messages in memory; used by the panel test chat. */
export class CollectingChannel implements Channel {
  readonly name = "test";
  readonly sent: { to: string; text: string }[] = [];

  async sendText(toPhone: string, text: string): Promise<void> {
    this.sent.push({ to: toPhone, text });
  }
}
