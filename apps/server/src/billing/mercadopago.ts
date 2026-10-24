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

  /** Any Mercado Pago endpoint, with the token, a timeout and short error messages. */
  call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, init);
  }

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

export type CardSubscription = { id: string; status: string; externalReference: string | null };
export type SubscriptionInvoice = { id: string; preapprovalId: string; paid: boolean; amountCents: number };

type InvoiceData = {
  id: number | string;
  preapproval_id: string;
  status?: string;
  transaction_amount?: number;
  payment?: { id?: number; status?: string };
};

const toInvoice = (data: InvoiceData): SubscriptionInvoice => ({
  id: String(data.id),
  preapprovalId: data.preapproval_id,
  // A charge of the subscription is paid when its payment was approved.
  paid: data.payment?.status === "approved" || data.status === "paid",
  amountCents: toCents(data.transaction_amount),
});

/**
 * Automatic card debit (Mercado Pago "Assinaturas", subscription without a plan). The card is typed
 * into Mercado Pago's secure fields in the browser; we only send the one-time token it returns.
 */
export class MercadoPagoSubscriptions {
  constructor(private readonly client: MercadoPagoClient) {}

  async create(input: {
    cardToken: string;
    payerEmail: string;
    amountCents: number;
    frequencyMonths: 1 | 12;
    reason: string;
    /** Our card_subscriptions id: comes back on every charge. */
    externalReference: string;
    backUrl: string;
  }): Promise<CardSubscription> {
    const data = await this.client.call<{ id: string; status: string; external_reference?: string }>("/preapproval", {
      method: "POST",
      headers: { "X-Idempotency-Key": input.externalReference },
      body: JSON.stringify({
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        card_token_id: input.cardToken,
        back_url: input.backUrl,
        status: "authorized",
        auto_recurring: {
          frequency: input.frequencyMonths,
          frequency_type: "months",
          transaction_amount: input.amountCents / 100,
          currency_id: "BRL",
        },
      }),
    });
    return { id: data.id, status: data.status, externalReference: data.external_reference ?? null };
  }

  async get(id: string): Promise<CardSubscription> {
    const data = await this.client.call<{ id: string; status: string; external_reference?: string }>(`/preapproval/${encodeURIComponent(id)}`);
    return { id: data.id, status: data.status, externalReference: data.external_reference ?? null };
  }

  /** Stops future charges. Access already paid is kept until it ends. */
  async cancel(id: string): Promise<void> {
    const path = `/preapproval/${encodeURIComponent(id)}`;
    try {
      await this.client.call(path, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    } catch (error) {
      // The docs spell it both ways; the API has accepted "cancelled", keep the other as a fallback.
      if (!(error instanceof MercadoPagoError) || !error.message.startsWith("Mercado Pago 400")) throw error;
      await this.client.call(path, { method: "PUT", body: JSON.stringify({ status: "canceled" }) });
    }
  }

  async invoice(id: string): Promise<SubscriptionInvoice> {
    return toInvoice(await this.client.call<InvoiceData>(`/authorized_payments/${encodeURIComponent(id)}`));
  }

  /** Charges of one subscription, for when a notification is late. */
  async invoices(preapprovalId: string): Promise<SubscriptionInvoice[]> {
    const data = await this.client.call<{ results?: InvoiceData[] }>(
      `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`,
    );
    return (data.results ?? []).map(toInvoice);
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
