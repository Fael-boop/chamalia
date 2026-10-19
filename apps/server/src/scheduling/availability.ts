import { timeToMinutes, zonedToUtc } from "../lib/time.js";

export type OpeningWindow = { opensAt: string; closesAt: string };

export type AvailabilityProfessional = {
  id: string;
  name: string;
  /** Opening windows of this professional on the requested date. */
  windows: OpeningWindow[];
};

export type BusyInterval = {
  /** null = blocks every professional (e.g. holiday for the whole business). */
  professionalId: string | null;
  start: Date;
  end: Date;
};

export type AvailableSlot = {
  startsAt: Date;
  endsAt: Date;
  time: string;
  professionals: { id: string; name: string }[];
};

export type AvailabilityInput = {
  date: string;
  timeZone: string;
  durationMinutes: number;
  professionals: AvailabilityProfessional[];
  busy: BusyInterval[];
  now: Date;
  stepMinutes?: number;
  minLeadMinutes?: number;
};

/**
 * Free start times on `date` for a service of `durationMinutes`. A slot is
 * offered when at least one professional has it fully inside an opening window
 * and free of appointments/time off. Pure function: all data comes in as input.
 */
export function computeAvailableSlots(input: AvailabilityInput): AvailableSlot[] {
  const step = input.stepMinutes ?? 30;
  const earliest = input.now.getTime() + (input.minLeadMinutes ?? 30) * 60000;
  const byStart = new Map<number, AvailableSlot>();

  for (const professional of input.professionals) {
    const busy = input.busy.filter(
      (interval) => interval.professionalId === null || interval.professionalId === professional.id,
    );

    for (const window of professional.windows) {
      const close = timeToMinutes(window.closesAt);
      for (let start = timeToMinutes(window.opensAt); start + input.durationMinutes <= close; start += step) {
        const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
        const startsAt = zonedToUtc(input.date, time, input.timeZone);
        const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60000);
        if (startsAt.getTime() < earliest) continue;
        if (busy.some((interval) => interval.start < endsAt && interval.end > startsAt)) continue;

        const key = startsAt.getTime();
        const slot = byStart.get(key) ?? { startsAt, endsAt, time, professionals: [] };
        slot.professionals.push({ id: professional.id, name: professional.name });
        byStart.set(key, slot);
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

