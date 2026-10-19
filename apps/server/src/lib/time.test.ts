import { describe, expect, it } from "vitest";
import { addDays, formatDateTimePtBr, isValidDate, utcToZoned, weekdayOf, zonedToUtc } from "./time.js";

const SP = "America/Sao_Paulo";

describe("time helpers", () => {
  it("converts São Paulo local time to UTC (UTC-3)", () => {
    expect(zonedToUtc("2026-10-21", "14:00", SP).toISOString()).toBe("2026-10-21T17:00:00.000Z");
  });

  it("converts UTC back to local date/time", () => {
    expect(utcToZoned(new Date("2026-10-22T02:30:00Z"), SP)).toEqual({
      date: "2026-10-21",
      time: "23:30",
      weekday: 3,
    });
  });

  it("handles a timezone with daylight saving time", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/Lisbon").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Europe/Lisbon").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("knows weekdays, adds days and validates dates", () => {
    expect(weekdayOf("2026-10-19")).toBe(1);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
  });

  it("formats dates for Portuguese messages", () => {
    expect(formatDateTimePtBr(new Date("2026-10-21T17:00:00Z"), SP)).toBe("quarta, 21/10 às 14:00");
  });
});
