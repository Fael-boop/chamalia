import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MercadoPagoClient, MercadoPagoError, validWebhookSignature } from "./mercadopago.js";

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("MercadoPagoClient", () => {
  it("creates a Pix charge with amount in reais, reference and idempotency key", async () => {
    const { impl, calls } = fakeFetch(() => ({
      status: 201,
      body: { id: 123, date_of_expiration: "2026-10-25T12:00:00.000-03:00", point_of_interaction: { transaction_data: { qr_code: "000201PIX" } } },
    }));
    const client = new MercadoPagoClient("TEST-TOKEN", impl);
    const charge = await client.createPixCharge({
      amountCents: 89100,
      description: "Chama Lia · 3 meses",
      externalReference: "pay-1",
      payerEmail: "a@b.com",
      notificationUrl: "https://app.example/webhooks/mercadopago",
      expiresAt: new Date("2026-10-25T15:00:00Z"),
    });
    expect(charge).toEqual({ id: "123", qrCode: "000201PIX", expiresAt: new Date("2026-10-25T15:00:00Z") });
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/v1/payments");
    expect(sent).toMatchObject({ transaction_amount: 891, payment_method_id: "pix", external_reference: "pay-1", payer: { email: "a@b.com" } });
    expect(sent.notification_url).toBe("https://app.example/webhooks/mercadopago");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Idempotency-Key"]).toBe("pay-1");
    expect(headers.authorization).toBe("Bearer TEST-TOKEN");
  });

  it("reads a payment back in cents", async () => {
    const { impl } = fakeFetch(() => ({ body: { id: 5, status: "approved", external_reference: "pay-1", transaction_amount: 297 } }));
    expect(await new MercadoPagoClient("T", impl).getPayment("5")).toEqual({ id: "5", status: "approved", externalReference: "pay-1", amountCents: 29700 });
  });

  it("turns API errors into a short message without the token", async () => {
    const { impl } = fakeFetch(() => ({ status: 401, body: { message: "invalid access token" } }));
    const error = await new MercadoPagoClient("SECRET-TOKEN", impl).getPayment("5").catch((e) => e);
    expect(error).toBeInstanceOf(MercadoPagoError);
    expect(error.message).toBe("Mercado Pago 401: invalid access token");
    expect(error.message).not.toContain("SECRET-TOKEN");
  });
});

describe("validWebhookSignature", () => {
  const secret = "segredo";
  const sign = (dataId: string, requestId: string, ts: string) =>
    createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");

  it("accepts the signature Mercado Pago computes", () => {
    const v1 = sign("999", "req-1", "1704908010");
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "999", secret })).toBe(true);
  });

  it("refuses a wrong secret, another payment id or a missing part", () => {
    const v1 = sign("999", "req-1", "1704908010");
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "998", secret })).toBe(false);
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "999", secret: "outro" })).toBe(false);
    expect(validWebhookSignature({ signature: "ts=1704908010", requestId: "req-1", dataId: "999", secret })).toBe(false);
  });
});
