import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago Pix (Checkout Transparente, /v1/payments). We create one charge per payment
 * request and confirm it only after reading it back from Mercado Pago: a notification alone
 * never releases access.
 */
const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 15_000;

export type MercadoPagoCharge = { id: string; qrCode: string; expiresAt: Date | null };
export type MercadoPagoPayment = { id: string; status: string; externalReference: string | null; amountCents: number };

export class MercadoPagoError extends Error {}

export class MercadoPagoClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = API,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body may echo request data; keep only what helps to debug.
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new MercadoPagoError(`Mercado Pago ${response.status}: ${body.message ?? body.error ?? "erro"}`);
    }
    return (await response.json()) as T;
  }

  async createPixCharge(input: {
    amountCents: number;
    description: string;
    /** Our payment id: comes back on the charge, and makes retries safe (idempotency). */
    externalReference: string;
    payerEmail: string;
    notificationUrl?: string;
    expiresAt: Date;
  }): Promise<MercadoPagoCharge> {
    const data = await this.request<{
      id: number;
      date_of_expiration?: string | null;
      point_of_interaction?: { transaction_data?: { qr_code?: string } };
    }>("/v1/payments", {
      method: "POST",
      headers: { "X-Idempotency-Key": input.externalReference },
      body: JSON.stringify({
        transaction_amount: input.amountCents / 100,
        description: input.description,
        payment_method_id: "pix",
        external_reference: input.externalReference,
        payer: { email: input.payerEmail },
        date_of_expiration: input.expiresAt.toISOString(),
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      }),
    });
    const qrCode = data.point_of_interaction?.transaction_data?.qr_code;
    if (!qrCode) throw new MercadoPagoError("Mercado Pago não devolveu o código Pix");
    return { id: String(data.id), qrCode, expiresAt: data.date_of_expiration ? new Date(data.date_of_expiration) : null };
  }

  async getPayment(id: string): Promise<MercadoPagoPayment> {
    const data = await this.request<{ id: number; status: string; external_reference?: string | null; transaction_amount: number }>(
      `/v1/payments/${encodeURIComponent(id)}`,
    );
    return {
      id: String(data.id),
      status: data.status,
      externalReference: data.external_reference ?? null,
      amountCents: Math.round(data.transaction_amount * 100),
    };
  }
}

/**
 * Checks the x-signature header of a Mercado Pago webhook ("ts=…,v1=…"): HMAC-SHA256 of
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" with the secret from the app's Webhooks page.
 */
export function validWebhookSignature(input: { signature: string; requestId: string; dataId: string; secret: string }): boolean {
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key!.trim(), value.join("=").trim()];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  // Mercado Pago signs alphanumeric ids in lower case.
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
