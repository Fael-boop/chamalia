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


export type ComboPart = {
  durationMinutes: number;
  /** Professionals who perform this service, with their windows on the date. */
  professionals: AvailabilityProfessional[];
};

export type ComboSlot = {
  startsAt: Date;
  endsAt: Date;
  time: string;
  /** One entry per service, back to back, in the order given. */
  parts: AvailableSlot[];
};

export type ComboInput = Omit<AvailabilityInput, "durationMinutes" | "professionals"> & { parts: ComboPart[] };

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Start times where several services fit one right after the other (the
 * customer goes from one to the next). Each part may be done by a different
 * professional; the same professional can do consecutive parts. Only the first
 * part starts on the step grid; the next ones start when the previous ends.
 */
export function computeComboSlots(input: ComboInput): ComboSlot[] {
  const step = input.stepMinutes ?? 30;
  const earliest = input.now.getTime() + (input.minLeadMinutes ?? 30) * 60000;
  const total = input.parts.reduce((sum, part) => sum + part.durationMinutes, 0);
  const result: ComboSlot[] = [];

  for (let start = 0; start + total <= 24 * 60; start += step) {
    const startsAt = zonedToUtc(input.date, toTime(start), input.timeZone);
    if (startsAt.getTime() < earliest) continue;

    const parts: AvailableSlot[] = [];
    let offset = start;
    for (const part of input.parts) {
      const partStart = offset;
      const partEnd = offset + part.durationMinutes;
      const partStartsAt = zonedToUtc(input.date, toTime(partStart), input.timeZone);
      const partEndsAt = new Date(partStartsAt.getTime() + part.durationMinutes * 60000);
      const free = part.professionals.filter(
        (professional) =>
          professional.windows.some(
            (window) => timeToMinutes(window.opensAt) <= partStart && partEnd <= timeToMinutes(window.closesAt),
          ) &&
          !input.busy.some(
            (interval) =>
              (interval.professionalId === null || interval.professionalId === professional.id) &&
              interval.start < partEndsAt &&
              interval.end > partStartsAt,
          ),
      );
      if (free.length === 0) break;
      parts.push({
        startsAt: partStartsAt,
        endsAt: partEndsAt,
        time: toTime(partStart),
        professionals: free.map(({ id, name }) => ({ id, name })),
      });
      offset = partEnd;
    }
    if (parts.length !== input.parts.length) continue;
    result.push({ startsAt, endsAt: parts.at(-1)!.endsAt, time: toTime(start), parts });
  }
  return result;
}
