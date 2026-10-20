import type { Sql } from "../db/client.js";
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from "../lib/time.js";
import { computeAvailableSlots, type AvailableSlot, type BusyInterval } from "./availability.js";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  assistantName: string;
  businessType: string;
  timezone: string;
  ownerName: string | null;
  ownerPhone: string | null;
  active: boolean;
  address: string | null;
  tone: "friendly" | "formal";
  useEmoji: boolean;
  extraInfo: string | null;
  handoffRules: string | null;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  whatsappInstance: string | null;
};

export const TENANT_COLUMNS = [
  "id",
  "slug",
  "name",
  "assistant_name",
  "business_type",
  "timezone",
  "owner_name",
  "owner_phone",
  "active",
  "address",
  "tone",
  "use_emoji",
  "extra_info",
  "handoff_rules",
  "min_notice_minutes",
  "booking_horizon_days",
  "whatsapp_instance",
];

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  active: boolean;
  /** Always handed over to the owner; the assistant never books it. */
  handoff: boolean;
  handoffReason: string | null;
};

export type BookedAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  professionalName: string;
};

const ACTIVE_STATUSES = ["scheduled", "confirmed"];

export class SchedulingError extends Error {
  constructor(
    readonly code: "service_not_found" | "invalid_date" | "slot_unavailable" | "appointment_not_found" | "handoff_service",
    message: string,
  ) {
    super(message);
  }
}

export async function getTenant(sql: Sql, tenantId: string): Promise<Tenant | undefined> {
  const [tenant] = await sql<Tenant[]>`select ${sql(TENANT_COLUMNS)} from tenants where id = ${tenantId}`;
  return tenant;
}

export async function findAvailableSlots(
  sql: Sql,
  tenant: Tenant,
  params: {
    serviceId: string;
    date: string;
    professionalId?: string;
    now?: Date;
    /** Ignore this appointment's own time (used when rescheduling it). */
    excludeAppointmentId?: string;
  },
): Promise<{ service: Service; slots: AvailableSlot[] }> {
  const now = params.now ?? new Date();
  const today = utcToZoned(now, tenant.timezone).date;
  const lastDay = addDays(today, tenant.bookingHorizonDays);
  if (params.date < today || params.date > lastDay) {
    throw new SchedulingError("invalid_date", `Só é possível agendar entre ${today} e ${lastDay}.`);
  }

  const [service] = await sql<Service[]>`
    select id, name, description, duration_minutes, price_cents, active, handoff, handoff_reason
    from services where tenant_id = ${tenant.id} and id = ${params.serviceId} and active
  `;
  if (!service) throw new SchedulingError("service_not_found", "Serviço não encontrado.");

  const professionals = await sql<{ id: string; name: string }[]>`
    select p.id, p.name
    from professionals p
    join professional_services ps on ps.professional_id = p.id and ps.service_id = ${service.id}
    where p.tenant_id = ${tenant.id} and p.active
      ${params.professionalId ? sql`and p.id = ${params.professionalId}` : sql``}
    order by p.name
  `;

  const hours = await sql<{ professionalId: string | null; opensAt: string; closesAt: string }[]>`
    select professional_id, opens_at, closes_at
    from business_hours
    where tenant_id = ${tenant.id} and weekday = ${weekdayOf(params.date)}
    order by opens_at
  `;
  // A professional with hours of their own follows only those; everyone else
  // follows the business hours.
  const withOwnHours = new Set(
    (
      await sql<{ professionalId: string }[]>`
        select distinct professional_id from business_hours
        where tenant_id = ${tenant.id} and professional_id is not null
      `
    ).map((row) => row.professionalId),
  );

  const dayStart = zonedToUtc(params.date, "00:00", tenant.timezone);
  const dayEnd = zonedToUtc(addDays(params.date, 1), "00:00", tenant.timezone);
  const appointments = await sql<{ professionalId: string; startsAt: Date; endsAt: Date }[]>`
    select professional_id, starts_at, ends_at from appointments
    where tenant_id = ${tenant.id} and status in ${sql(ACTIVE_STATUSES)}
      and starts_at < ${dayEnd} and ends_at > ${dayStart}
      ${params.excludeAppointmentId ? sql`and id <> ${params.excludeAppointmentId}` : sql``}
  `;
  const timeOff = await sql<{ professionalId: string | null; startsAt: Date; endsAt: Date }[]>`
    select professional_id, starts_at, ends_at from time_off
    where tenant_id = ${tenant.id} and starts_at < ${dayEnd} and ends_at > ${dayStart}
  `;
  const busy: BusyInterval[] = [...appointments, ...timeOff].map((row) => ({
    professionalId: row.professionalId,
    start: row.startsAt,
    end: row.endsAt,
  }));

  const slots = computeAvailableSlots({
    date: params.date,
    timeZone: tenant.timezone,
    durationMinutes: service.durationMinutes,
    now,
    minLeadMinutes: tenant.minNoticeMinutes,
    busy,
    professionals: professionals.map((professional) => ({
      ...professional,
      windows: hours
        .filter((row) =>
          withOwnHours.has(professional.id) ? row.professionalId === professional.id : row.professionalId === null,
        )
        .map((row) => ({ opensAt: row.opensAt, closesAt: row.closesAt })),
    })),
  });

  return { service, slots };
}

export async function bookAppointment(
  sql: Sql,
  tenant: Tenant,
  params: {
    customerId: string;
    serviceId: string;
    professionalId: string;
    date: string;
    time: string;
    source: "whatsapp" | "panel";
  },
): Promise<BookedAppointment> {
  // Re-check against business rules (hours, notice, horizon); the database
  // exclusion constraint covers the race between two simultaneous bookings.
  const { service, slots } = await findAvailableSlots(sql, tenant, params);
  const slot = slots.find(
    (candidate) =>
      utcToZoned(candidate.startsAt, tenant.timezone).time === params.time &&
      candidate.professionals.some((professional) => professional.id === params.professionalId),
  );
  if (!slot) throw new SchedulingError("slot_unavailable", "Esse horário não está mais disponível.");

  try {
    const [row] = await sql<{ id: string }[]>`
      insert into appointments (tenant_id, customer_id, service_id, professional_id, starts_at, ends_at, source)
      values (${tenant.id}, ${params.customerId}, ${service.id}, ${params.professionalId},
              ${slot.startsAt}, ${slot.endsAt}, ${params.source})
      returning id
    `;
    return {
      id: row!.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      serviceName: service.name,
      professionalName: slot.professionals.find((p) => p.id === params.professionalId)!.name,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") {
      throw new SchedulingError("slot_unavailable", "Esse horário acabou de ser ocupado.");
    }
    throw error;
  }
}

export async function listUpcomingAppointments(
  sql: Sql,
  tenant: Tenant,
  customerId: string,
): Promise<(BookedAppointment & { status: string })[]> {
  return sql<(BookedAppointment & { status: string })[]>`
    select a.id, a.starts_at, a.ends_at, a.status, s.name as service_name, p.name as professional_name
    from appointments a
    join services s on s.id = a.service_id
    join professionals p on p.id = a.professional_id
    where a.tenant_id = ${tenant.id} and a.customer_id = ${customerId}
      and a.status in ${sql(ACTIVE_STATUSES)} and a.starts_at > now()
    order by a.starts_at
  `;
}

export async function cancelCustomerAppointment(
  sql: Sql,
  tenant: Tenant,
  customerId: string,
  appointmentId: string,
): Promise<BookedAppointment> {
  const [appointment] = await sql<BookedAppointment[]>`
    update appointments a
    set status = 'cancelled', cancelled_at = now()
    from services s, professionals p
    where a.id = ${appointmentId} and a.tenant_id = ${tenant.id} and a.customer_id = ${customerId}
      and a.status in ${sql(ACTIVE_STATUSES)}
      and s.id = a.service_id and p.id = a.professional_id
    returning a.id, a.starts_at, a.ends_at, s.name as service_name, p.name as professional_name
  `;
  if (!appointment) throw new SchedulingError("appointment_not_found", "Agendamento não encontrado.");
  return appointment;
}

/** Moves an appointment to another free slot (same service), keeping its id and status. */
export async function rescheduleAppointment(
  sql: Sql,
  tenant: Tenant,
  params: { appointmentId: string; date: string; time: string; professionalId: string },
): Promise<BookedAppointment> {
  const [current] = await sql<{ serviceId: string }[]>`
    select service_id from appointments
    where tenant_id = ${tenant.id} and id = ${params.appointmentId} and status in ${sql(ACTIVE_STATUSES)}
  `;
  if (!current) throw new SchedulingError("appointment_not_found", "Agendamento não encontrado ou já cancelado.");

  const { service, slots } = await findAvailableSlots(sql, tenant, {
    serviceId: current.serviceId,
    date: params.date,
    professionalId: params.professionalId,
    excludeAppointmentId: params.appointmentId,
  });
  const slot = slots.find((candidate) => utcToZoned(candidate.startsAt, tenant.timezone).time === params.time);
  if (!slot) throw new SchedulingError("slot_unavailable", "Esse horário não está disponível.");

  try {
    await sql`
      update appointments
      set starts_at = ${slot.startsAt}, ends_at = ${slot.endsAt}, professional_id = ${params.professionalId},
          reminder_24h_sent_at = null, reminder_2h_sent_at = null
      where tenant_id = ${tenant.id} and id = ${params.appointmentId}
    `;
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") {
      throw new SchedulingError("slot_unavailable", "Esse horário acabou de ser ocupado.");
    }
    throw error;
  }
  return {
    id: params.appointmentId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    serviceName: service.name,
    professionalName: slot.professionals[0]!.name,
  };
}
