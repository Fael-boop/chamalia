import { describe, expect, it } from "vitest";
import { zonedToUtc } from "../lib/time.js";
import { computeComboSlots, type ComboInput } from "./availability.js";

const SP = "America/Sao_Paulo";
const at = (time: string) => zonedToUtc("2026-10-21", time, SP);
const nails = { id: "carla", name: "Carla", windows: [{ opensAt: "09:00", closesAt: "12:00" }] };
const hair = { id: "ana", name: "Ana", windows: [{ opensAt: "09:00", closesAt: "12:00" }] };

const base: ComboInput = {
  date: "2026-10-21",
  timeZone: SP,
  now: zonedToUtc("2026-10-20", "12:00", SP),
  parts: [
    { durationMinutes: 45, professionals: [nails] },
    { durationMinutes: 60, professionals: [hair] },
  ],
  busy: [],
};

describe("computeComboSlots", () => {
  it("chains services back to back, even off the 30-minute grid", () => {
    const first = computeComboSlots(base)[0]!;
    expect(first.time).toBe("09:00");
    expect(first.parts.map((p) => [p.time, p.professionals[0]!.name])).toEqual([
      ["09:00", "Carla"],
      ["09:45", "Ana"],
    ]);
    expect(first.endsAt).toEqual(at("10:45"));
  });

  it("needs the whole sequence inside opening hours", () => {
    // 10:00 ends at 11:45; 10:30 would end at 12:15, after closing.
    expect(computeComboSlots(base).at(-1)!.time).toBe("10:00");
  });

  it("skips a start when the second professional is busy at that moment", () => {
    const slots = computeComboSlots({ ...base, busy: [{ professionalId: "ana", start: at("09:45"), end: at("10:15") }] });
    expect(slots.map((s) => s.time)).not.toContain("09:00");
  });

  it("lets the same professional do consecutive parts", () => {
    const both = { ...hair, id: "lu", name: "Lu" };
    const slots = computeComboSlots({
      ...base,
      parts: [
        { durationMinutes: 30, professionals: [both] },
        { durationMinutes: 30, professionals: [both] },
      ],
    });
    expect(slots[0]!.parts.map((p) => p.time)).toEqual(["09:00", "09:30"]);
  });

  it("flags slots where one professional can do every part", () => {
    const both = { ...hair, id: "lu", name: "Lu" };
    const slots = computeComboSlots({
      ...base,
      parts: [
        { durationMinutes: 30, professionals: [nails, both] },
        { durationMinutes: 30, professionals: [hair, both] },
      ],
      busy: [{ professionalId: "lu", start: at("09:00"), end: at("09:30") }],
    });
    expect(slots.find((s) => s.time === "09:00")!.solo).toEqual([]);
    expect(slots.find((s) => s.time === "09:30")!.solo.map((p) => p.name)).toEqual(["Lu"]);
  });
});
