import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MercadoPagoClient, MercadoPagoError, MercadoPagoSubscriptions, validWebhookSignature } from "./mercadopago.js";

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

describe("MercadoPagoSubscriptions", () => {
  it("creates an authorized monthly debit with the card token, never the card", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: { id: "pre-1", status: "authorized", external_reference: "sub-1" } }));
    const subs = new MercadoPagoSubscriptions(new MercadoPagoClient("T", impl));
    const created = await subs.create({
      cardToken: "tok-123",
      payerEmail: "dona@salao.com",
      amountCents: 28215,
      frequencyMonths: 1,
      reason: "Chama Lia · plano",
      externalReference: "sub-1",
      backUrl: "https://app.example",
    });
    expect(created).toEqual({ id: "pre-1", status: "authorized", externalReference: "sub-1" });
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/preapproval");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      reason: "Chama Lia · plano",
      external_reference: "sub-1",
      payer_email: "dona@salao.com",
      card_token_id: "tok-123",
      back_url: "https://app.example",
      status: "authorized",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 282.15, currency_id: "BRL" },
    });
  });

  it("schedules the first charge when access is already paid", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: { id: "pre-2", status: "authorized", external_reference: "sub-2" } }));
    const subs = new MercadoPagoSubscriptions(new MercadoPagoClient("T", impl));
    await subs.create({
      cardToken: "tok-123",
      payerEmail: "dona@salao.com",
      amountCents: 29700,
      frequencyMonths: 1,
      reason: "Chama Lia · plano",
      externalReference: "sub-2",
      backUrl: "https://app.example",
      startDate: new Date("2026-12-11T03:00:00Z"),
    });
    expect(JSON.parse(String(calls[0]!.init.body)).auto_recurring).toEqual({
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 297,
      currency_id: "BRL",
      start_date: "2026-12-11T03:00:00.000Z",
    });
  });

  it("reads a charge: paid only when its payment was approved", async () => {
    const charge = (payment: string) =>
      new MercadoPagoSubscriptions(
        new MercadoPagoClient("T", fakeFetch(() => ({ body: { id: 9, preapproval_id: "pre-1", status: "processed", transaction_amount: 282.15, payment: { id: 5, status: payment } } })).impl),
      );
    expect(await charge("approved").invoice("9")).toEqual({ id: "9", preapprovalId: "pre-1", paid: true, amountCents: 28215 });
    expect((await charge("rejected").invoice("9")).paid).toBe(false);
  });

  it("swaps the card, reactivating a debit paused by a refused card", async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { id: "pre-1", status: "authorized" } }));
    const subs = new MercadoPagoSubscriptions(new MercadoPagoClient("T", impl));
    await subs.updateCard("pre-1", "tok-new", true);
    await subs.updateCard("pre-1", "tok-2", false);
    expect(calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ card_token_id: "tok-new", status: "authorized" });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ card_token_id: "tok-2" });
  });

  it("cancels, retrying with the other spelling if the API refuses the first", async () => {
    const { impl, calls } = fakeFetch((_url, init) =>
      String(init.body).includes('"cancelled"') ? { status: 400, body: { message: "invalid status" } } : { body: { id: "pre-1", status: "cancelled" } },
    );
    await new MercadoPagoSubscriptions(new MercadoPagoClient("T", impl)).cancel("pre-1");
    expect(calls.map((c) => JSON.parse(String(c.init.body)).status)).toEqual(["cancelled", "canceled"]);
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
