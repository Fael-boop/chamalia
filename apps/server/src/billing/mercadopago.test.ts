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
  it("creates a Pix order with the amount as text, reference, expiry and idempotency key", async () => {
    const { impl, calls } = fakeFetch(() => ({
      status: 201,
      body: { id: "ORD01ABC", status: "action_required", transactions: { payments: [{ payment_method: { qr_code: "000201PIX" } }] } },
    }));
    const charge = await new MercadoPagoClient("TEST-TOKEN", impl).createPixCharge({
      amountCents: 89100,
      externalReference: "pay-1",
      payerEmail: "a@b.com",
      hours: 24,
    });
    expect(charge).toEqual({ id: "ORD01ABC", qrCode: "000201PIX" });
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/v1/orders");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      type: "online",
      processing_mode: "automatic",
      total_amount: "891.00",
      external_reference: "pay-1",
      payer: { email: "a@b.com" },
      transactions: { payments: [{ amount: "891.00", payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT24H" }] },
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Idempotency-Key"]).toBe("pay-1");
    expect(headers.authorization).toBe("Bearer TEST-TOKEN");
  });

  it("reads an order back: paid only when processed and accredited", async () => {
    const order = (status: string, detail: string) =>
      fakeFetch(() => ({ body: { id: "ORD01ABC", status, status_detail: detail, external_reference: "pay-1", total_amount: "297.00" } })).impl;
    expect(await new MercadoPagoClient("T", order("processed", "accredited")).getOrder("ORD01ABC")).toEqual({
      id: "ORD01ABC",
      paid: true,
      externalReference: "pay-1",
      amountCents: 29700,
    });
    expect((await new MercadoPagoClient("T", order("action_required", "waiting_transfer")).getOrder("ORD01ABC")).paid).toBe(false);
    expect((await new MercadoPagoClient("T", order("expired", "expired")).getOrder("ORD01ABC")).paid).toBe(false);
  });

  it("turns API errors into a short message without the token", async () => {
    const { impl } = fakeFetch(() => ({ status: 401, body: { errors: [{ message: "invalid access token" }] } }));
    const error = await new MercadoPagoClient("SECRET-TOKEN", impl).getOrder("ORD1").catch((e) => e);
    expect(error).toBeInstanceOf(MercadoPagoError);
    expect(error.message).toBe("Mercado Pago 401: invalid access token");
    expect(error.message).not.toContain("SECRET-TOKEN");
  });
});

describe("validWebhookSignature", () => {
  const secret = "segredo";
  const sign = (dataId: string, requestId: string, ts: string) =>
    createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");

  it("accepts the signature Mercado Pago computes (order ids in lower case)", () => {
    const v1 = sign("ord01abc", "req-1", "1704908010");
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "ORD01ABC", secret })).toBe(true);
  });

  it("refuses a wrong secret, another order or a missing part", () => {
    const v1 = sign("ord01abc", "req-1", "1704908010");
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "ORD01ABD", secret })).toBe(false);
    expect(validWebhookSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "ORD01ABC", secret: "outro" })).toBe(false);
    expect(validWebhookSignature({ signature: "ts=1704908010", requestId: "req-1", dataId: "ORD01ABC", secret })).toBe(false);
  });
});
