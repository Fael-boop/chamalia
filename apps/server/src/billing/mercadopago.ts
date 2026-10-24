import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago Pix through the Orders API (Checkout Transparente, /v1/orders; the older
 * /v1/payments is being retired). One order per payment request, confirmed only after we
 * read it back from Mercado Pago: a notification alone never releases access.
 */
const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 15_000;

export type MercadoPagoCharge = { id: string; qrCode: string };
export type MercadoPagoOrder = { id: string; paid: boolean; externalReference: string | null; amountCents: number };

export class MercadoPagoError extends Error {}

const toCents = (amount: string | number | undefined) => Math.round(Number(amount ?? 0) * 100);

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
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; errors?: { message?: string }[] };
      throw new MercadoPagoError(`Mercado Pago ${response.status}: ${body.errors?.[0]?.message ?? body.message ?? body.error ?? "erro"}`);
    }
    return (await response.json()) as T;
  }

  /** `hours` = how long the Pix stays payable (Mercado Pago accepts 30 min to 30 days). */
  async createPixCharge(input: {
    amountCents: number;
    /** Our payment id: comes back on the order, and makes retries safe (idempotency). */
    externalReference: string;
    payerEmail: string;
    hours: number;
  }): Promise<MercadoPagoCharge> {
    const amount = (input.amountCents / 100).toFixed(2);
    const data = await this.request<{
      id: string;
      transactions?: { payments?: { payment_method?: { qr_code?: string } }[] };
    }>("/v1/orders", {
      method: "POST",
      headers: { "X-Idempotency-Key": input.externalReference },
      body: JSON.stringify({
        type: "online",
        processing_mode: "automatic",
        total_amount: amount,
        external_reference: input.externalReference,
        payer: { email: input.payerEmail },
        transactions: {
          payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: `PT${input.hours}H` }],
        },
      }),
    });
    const qrCode = data.transactions?.payments?.[0]?.payment_method?.qr_code;
    if (!qrCode) throw new MercadoPagoError("Mercado Pago não devolveu o código Pix");
    return { id: data.id, qrCode };
  }

  async getOrder(id: string): Promise<MercadoPagoOrder> {
    const data = await this.request<{
      id: string;
      status: string;
      status_detail?: string;
      external_reference?: string | null;
      total_amount?: string;
    }>(`/v1/orders/${encodeURIComponent(id)}`);
    return {
      id: data.id,
      // Orders API: a paid order is "processed" with detail "accredited".
      paid: data.status === "processed" && data.status_detail === "accredited",
      externalReference: data.external_reference ?? null,
      amountCents: toCents(data.total_amount),
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
  // Mercado Pago signs alphanumeric ids (order ids like ORD01…) in lower case.
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
