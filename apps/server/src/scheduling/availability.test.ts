import { describe, expect, it } from "vitest";
import { zonedToUtc } from "../lib/time.js";
import { computeAvailableSlots, type AvailabilityInput } from "./availability.js";

const SP = "America/Sao_Paulo";
const at = (time: string) => zonedToUtc("2026-10-21", time, SP);

const base: AvailabilityInput = {
  date: "2026-10-21",
  timeZone: SP,
  durationMinutes: 30,
  now: zonedToUtc("2026-10-20", "12:00", SP),
  professionals: [
    { id: "joao", name: "João", windows: [{ opensAt: "09:00", closesAt: "11:00" }] },
    { id: "carlos", name: "Carlos", windows: [{ opensAt: "10:00", closesAt: "11:00" }] },
  ],
  busy: [],
};

const times = (input: AvailabilityInput) => computeAvailableSlots(input).map((slot) => slot.time);

describe("computeAvailableSlots", () => {
  it("offers every step inside opening hours and merges professionals", () => {
    const slots = computeAvailableSlots(base);
    expect(slots.map((slot) => slot.time)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slots[2]!.professionals.map((p) => p.name)).toEqual(["João", "Carlos"]);
  });

  it("only offers slots where the whole service fits before closing", () => {
    expect(times({ ...base, durationMinutes: 60 })).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("skips times taken by an appointment for that professional only", () => {
    const slots = computeAvailableSlots({
      ...base,
      busy: [{ professionalId: "joao", start: at("10:00"), end: at("10:30") }],
    });
    const tenOClock = slots.find((slot) => slot.time === "10:00")!;
    expect(tenOClock.professionals.map((p) => p.name)).toEqual(["Carlos"]);
  });

  it("business-wide time off blocks everyone", () => {
    expect(times({ ...base, busy: [{ professionalId: null, start: at("09:00"), end: at("10:30") }] })).toEqual([
      "10:30",
    ]);
  });

  it("never offers past slots or slots inside the minimum notice", () => {
    expect(times({ ...base, now: at("09:10") })).toEqual(["10:00", "10:30"]);
  });

  it("returns nothing on a closed day", () => {
    expect(times({ ...base, professionals: base.professionals.map((p) => ({ ...p, windows: [] })) })).toEqual([]);
  });
});
