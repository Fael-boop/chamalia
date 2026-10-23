/**
 * Makes the bot number behave less like a bot: a "typing…" pause before each
 * message and a cap on how many messages one number sends per minute.
 * Unofficial WhatsApp connections get banned for robotic patterns.
 */

/** Typing time for a reply: about 1 s plus a bit per character, between 1.2 s and 5 s. */
export function typingDelayMs(text: string): number {
  return Math.round(Math.min(5_000, Math.max(1_200, 1_000 + text.length * 30)));
}

const WINDOW_MS = 60_000;

/** At most `perMinute` sends per key (WhatsApp instance) in any 60 s window; extra sends wait. */
export class SendLimiter {
  private readonly sent = new Map<string, number[]>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly perMinute = 20,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Resolves when `key` may send; calls for the same key take turns. */
  wait(key: string): Promise<void> {
    const turn = (this.queues.get(key) ?? Promise.resolve()).then(() => this.take(key));
    this.queues.set(key, turn.catch(() => {}));
    return turn;
  }

  private async take(key: string) {
    for (;;) {
      const now = this.now();
      const recent = (this.sent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
      if (recent.length < this.perMinute) {
        recent.push(now);
        this.sent.set(key, recent);
        return;
      }
      await this.sleep(WINDOW_MS - (now - recent[0]!) + 50);
    }
  }
}
