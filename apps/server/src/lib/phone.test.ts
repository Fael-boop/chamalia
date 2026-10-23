import { describe, expect, it } from "vitest";
import { maskPhone, maskPhonesInText, normalizePhone, samePhone, withCountryCode } from "./phone.js";

describe("normalizePhone", () => {
  it("strips formatting and WhatsApp JID suffix", () => {
    expect(normalizePhone("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(normalizePhone("5511987654321@s.whatsapp.net")).toBe("5511987654321");
  });
});

describe("maskPhone", () => {
  it("keeps only prefix and last 4 digits", () => {
    expect(maskPhone("5511987654321")).toBe("5511*****4321");
    expect(maskPhone("5511987654321@s.whatsapp.net")).toBe("5511*****4321");
  });

  it("never returns a short number in full", () => {
    expect(maskPhone("98765432")).toBe("****5432");
    expect(maskPhone("1234")).toBe("****");
  });
});

describe("withCountryCode", () => {
  it("adds 55 to numbers typed with DDD only", () => {
    expect(withCountryCode("(11) 98888-7777")).toBe("5511988887777");
    expect(withCountryCode("1133334444")).toBe("551133334444");
  });

  it("keeps numbers that already have a country code", () => {
    expect(withCountryCode("+55 11 98888-7777")).toBe("5511988887777");
  });
});

describe("maskPhonesInText", () => {
  it("masks numbers quoted inside provider errors", () => {
    expect(maskPhonesInText('{"jid":"11988887777@s.whatsapp.net"}')).toBe('{"jid":"1198***7777@s.whatsapp.net"}');
    expect(maskPhonesInText("Evolution POST /message/sendText/x: 400")).toBe("Evolution POST /message/sendText/x: 400");
  });
});

describe("samePhone", () => {
  it("treats Brazilian mobiles with and without the extra 9 as the same number", () => {
    expect(samePhone("5562988887777", "556288887777")).toBe(true);
    expect(samePhone("(62) 98888-7777", "556288887777@s.whatsapp.net".split("@")[0]!)).toBe(true);
    expect(samePhone("5562988887777", "5562988886666")).toBe(false);
    expect(samePhone("551133334444", "5511933334444")).toBe(true);
  });
});
