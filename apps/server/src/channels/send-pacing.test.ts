import { describe, expect, it } from "vitest";
import { SendLimiter, typingDelayMs } from "./send-pacing.js";

describe("typingDelayMs", () => {
  it("grows with the text and stays between 1.2 s and 5 s", () => {
    expect(typingDelayMs("oi")).toBe(1_200);
    expect(typingDelayMs("x".repeat(100))).toBe(4_000);
    expect(typingDelayMs("x".repeat(1_000))).toBe(5_000);
  });
});

describe("SendLimiter", () => {
  it("lets N sends through per minute and makes the next one wait", async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new SendLimiter(
      2,
      () => clock,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    );
    await limiter.wait("a");
    await limiter.wait("a");
    await limiter.wait("b"); // other number, own budget
    expect(waits).toEqual([]);
    await limiter.wait("a");
    expect(waits).toEqual([60_050]);
  });
});
