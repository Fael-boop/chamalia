import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "./logger.js";

function captureLog(write: (log: pino.Logger) => void): string {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  write(pino(loggerOptions("info"), stream));
  return output;
}

describe("logger", () => {
  it("masks phone numbers at top level and one level deep", () => {
    const output = captureLog((log) =>
      log.info(
        { phone: "5511987654321", customer: { remoteJid: "5511912345678@s.whatsapp.net" } },
        "new message",
      ),
    );

    expect(output).not.toContain("5511987654321");
    expect(output).not.toContain("5511912345678");
    expect(output).toContain("5511*****4321");
    expect(output).toContain("5511*****5678");
  });
});
