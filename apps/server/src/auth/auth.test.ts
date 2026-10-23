import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.js";
import { SHORT_SESSION_MS, signSession, verifySession } from "./tokens.js";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("salao-da-mae-123");
    expect(hash).not.toContain("salao-da-mae-123");
    expect(await verifyPassword("salao-da-mae-123", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "test-secret";

  it("round-trips an owner session", () => {
    const token = signSession({ role: "owner", tenantId: "t1", userId: "u1" }, secret);
    expect(verifySession(token, secret)).toMatchObject({ role: "owner", tenantId: "t1", userId: "u1" });
  });

  it("rejects tampered tokens, other secrets and expired tokens", () => {
    const token = signSession({ role: "owner", tenantId: "t1", userId: "u1" }, secret);
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ role: "admin", issuedAt: 0, expiresAt: 9e15 })).toString("base64url")}.${signature}`;
    expect(verifySession(forged, secret)).toBeUndefined();
    expect(verifySession(token, "other-secret")).toBeUndefined();
    const old = signSession({ role: "admin" }, secret, Date.now() - 8 * 24 * 3600 * 1000);
    expect(verifySession(old, secret)).toBeUndefined();
  });
});

describe("session lifetime", () => {
  it("is short when 'lembrar de mim' is off", () => {
    const secret = "x".repeat(32);
    const now = Date.now();
    const token = signSession({ role: "admin" }, secret, now, SHORT_SESSION_MS);
    expect(verifySession(token, secret, now + SHORT_SESSION_MS - 1000)).toBeDefined();
    expect(verifySession(token, secret, now + SHORT_SESSION_MS + 1000)).toBeUndefined();
  });
});
