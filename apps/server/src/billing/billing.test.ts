import { describe, expect, it } from "vitest";
import { extendPaidUntil, isExpired, quote } from "./billing.js";
import { crc16, pixCopyPaste } from "./pix.js";

describe("isExpired", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("lifetime never expires", () => {
    expect(isExpired({ billingCycle: "lifetime", paidUntil: null }, now)).toBe(false);
  });
  it("never paid is expired", () => {
    expect(isExpired({ billingCycle: "monthly", paidUntil: null }, now)).toBe(true);
  });
  it("paid until the future is active, the past is expired", () => {
    expect(isExpired({ billingCycle: "monthly", paidUntil: new Date("2026-10-24T00:00:00Z") }, now)).toBe(false);
    expect(isExpired({ billingCycle: "annual", paidUntil: new Date("2026-10-23T11:59:59Z") }, now)).toBe(true);
  });
});

describe("quote", () => {
  it("multiplies the monthly price", () => {
    expect(quote({ priceCentsMonthly: 29700, priceCentsYearly: null }, 3)).toBe(89100);
  });
  it("uses the yearly price for 12 months when set", () => {
    expect(quote({ priceCentsMonthly: 29700, priceCentsYearly: 297000 }, 12)).toBe(297000);
    expect(quote({ priceCentsMonthly: 29700, priceCentsYearly: 297000 }, 6)).toBe(178200);
  });
  it("is null when the plan has no price", () => {
    expect(quote({ priceCentsMonthly: null, priceCentsYearly: null }, 1)).toBeNull();
  });
});

describe("extendPaidUntil", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("counts from now when expired or never paid", () => {
    expect(extendPaidUntil(null, 1, now).toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(extendPaidUntil(new Date("2026-01-01T00:00:00Z"), 3, now).toISOString()).toBe("2027-01-23T12:00:00.000Z");
  });
  it("counts from the current end when paying early", () => {
    expect(extendPaidUntil(new Date("2026-11-10T03:00:00Z"), 1, now).toISOString()).toBe("2026-12-10T03:00:00.000Z");
  });
  it("keeps the end of short months", () => {
    expect(extendPaidUntil(new Date("2027-01-31T03:00:00Z"), 1, new Date("2027-01-01T00:00:00Z")).toISOString()).toBe(
      "2027-02-28T03:00:00.000Z",
    );
  });
});

describe("pix", () => {
  it("computes the CRC16 of the Banco Central example", () => {
    // Standard check value of CRC-16/CCITT-FALSE.
    expect(crc16("123456789")).toBe("29B1");
  });
  it("builds a copy-and-paste code with amount and checksum", () => {
    const code = pixCopyPaste({ key: "contato@exemplo.com.br", name: "Chamá Lia", city: "Goiânia" }, 29700, "pag-1234");
    expect(code.startsWith("000201")).toBe(true);
    expect(code).toContain("0014br.gov.bcb.pix0122contato@exemplo.com.br");
    expect(code).toContain("5406297.00");
    expect(code).toContain("5909CHAMA LIA");
    expect(code).toContain("6007GOIANIA");
    expect(code).toContain("62110507pag1234");
    expect(code.slice(-8, -4)).toBe("6304");
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });
});
