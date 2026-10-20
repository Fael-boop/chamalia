import { randomUUID } from "node:crypto";
import type { Sql } from "../db/client.js";
import { addDays, utcToZoned } from "../lib/time.js";
import { computeComboSlots, type ComboSlot } from "./availability.js";
import { loadDay, SchedulingError, type BookedAppointment, type Service, type Tenant } from "./service.js";

export const MAX_COMBO_SERVICES = 3;

/** Free start times for several services in a row, in the order given. */
export async function findComboSlots(
  sql: Sql,
  tenant: Tenant,
  params: { serviceIds: string[]; date: string; now?: Date },
): Promise<{ services: Service[]; slots: ComboSlot[] }> {
  if (params.serviceIds.length < 2 || params.serviceIds.length > MAX_COMBO_SERVICES) {
    throw new SchedulingError("invalid_combo", `Um combo tem de 2 a ${MAX_COMBO_SERVICES} serviços.`);
  }
  const now = params.now ?? new Date();
  const today = utcToZoned(now, tenant.timezone).date;
  const lastDay = addDays(today, tenant.bookingHorizonDays);
  if (params.date < today || params.date > lastDay) {
    throw new SchedulingError("invalid_date", `Só é possível agendar entre ${today} e ${lastDay}.`);
  }
  const day = await loadDay(sql, tenant, params.date, params.serviceIds);
  const slots = computeComboSlots({
    date: params.date,
    timeZone: tenant.timezone,
    now,
    minLeadMinutes: tenant.minNoticeMinutes,
    busy: day.busy,
    parts: day.services.map(({ service, professionals }) => ({ durationMinutes: service.durationMinutes, professionals })),
  });
  return { services: day.services.map(({ service }) => service), slots };
}

/**
 * Books every service of a combo, one appointment each, sharing a combo_id.
 * professionalIds[i] picks who does service i; when missing, keeps the same
 * professional as the previous part if she is free, else the first free one.
 */
export async function bookCombo(
  sql: Sql,
  tenant: Tenant,
  params: {
    customerId: string;
    serviceIds: string[];
    date: string;
    time: string;
    professionalIds?: (string | undefined)[];
    source: "whatsapp" | "panel";
  },
): Promise<{ comboId: string; parts: BookedAppointment[] }> {
  const { services, slots } = await findComboSlots(sql, tenant, params);
  const slot = slots.find((candidate) => candidate.time === params.time);
  if (!slot) throw new SchedulingError("slot_unavailable", "Esse horário não está mais disponível para todos os serviços.");

  const chosen: { id: string; name: string }[] = [];
  slot.parts.forEach((part, index) => {
    const wanted = params.professionalIds?.[index];
    const previous = chosen[index - 1];
    const pick = wanted
      ? part.professionals.find((p) => p.id === wanted)
      : (part.professionals.find((p) => p.id === previous?.id) ?? part.professionals[0]);
    if (!pick) throw new SchedulingError("slot_unavailable", "A profissional escolhida não está livre nesse horário.");
    chosen.push(pick);
  });

  const comboId = randomUUID();
  try {
    await sql.begin(async (tx) => {
      for (const [index, part] of slot.parts.entries()) {
        await tx`
          insert into appointments (tenant_id, customer_id, service_id, professional_id, starts_at, ends_at, source, combo_id)
          values (${tenant.id}, ${params.customerId}, ${services[index]!.id}, ${chosen[index]!.id},
                  ${part.startsAt}, ${part.endsAt}, ${params.source}, ${comboId})
        `;
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") {
      throw new SchedulingError("slot_unavailable", "Esse horário acabou de ser ocupado.");
    }
    throw error;
  }
  return {
    comboId,
    parts: slot.parts.map((part, index) => ({
      id: comboId,
      startsAt: part.startsAt,
      endsAt: part.endsAt,
      serviceName: services[index]!.name,
      professionalName: chosen[index]!.name,
    })),
  };
}
