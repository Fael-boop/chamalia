import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { formatDateTimePtBr, isValidDate, utcToZoned, weekdayName, weekdayOf } from "../lib/time.js";
import {
  bookAppointment,
  cancelCustomerAppointment,
  findAvailableSlots,
  listUpcomingAppointments,
  SchedulingError,
  type Tenant,
} from "../scheduling/service.js";

export type ToolContext = {
  sql: Sql;
  tenant: Tenant;
  customer: { id: string; phone: string; name: string | null };
  /** Messages to send to the business owner once the turn ends. */
  ownerNotices: string[];
  /** Set when the model hands the conversation over to the owner. */
  handoffReason?: string;
};

const date = z.string().refine(isValidDate, "use o formato AAAA-MM-DD");

const inputs = {
  find_available_slots: z.object({
    service_id: z.string().uuid(),
    date,
    professional_id: z.string().uuid().optional(),
  }),
  book_appointment: z.object({
    service_id: z.string().uuid(),
    professional_id: z.string().uuid(),
    date,
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  list_customer_appointments: z.object({}),
  cancel_appointment: z.object({ appointment_id: z.string().uuid() }),
  save_customer_name: z.object({ name: z.string().trim().min(1).max(80) }),
  transfer_to_owner: z.object({ reason: z.string().trim().min(1).max(300) }),
};

type ToolName = keyof typeof inputs;

export const tools: Anthropic.Tool[] = [
  {
    name: "find_available_slots",
    description:
      "Lista os horários livres de um serviço em um dia. Use sempre antes de oferecer horários. Cada horário traz os profissionais livres nele.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "service_id do serviço" },
        date: { type: "string", description: "Data no formato AAAA-MM-DD" },
        professional_id: { type: "string", description: "Opcional: só horários deste profissional" },
      },
      required: ["service_id", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Grava o agendamento. Só use depois que o cliente confirmou serviço, profissional, dia e horário.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        professional_id: { type: "string" },
        date: { type: "string", description: "AAAA-MM-DD" },
        time: { type: "string", description: "HH:MM, um dos horários retornados por find_available_slots" },
      },
      required: ["service_id", "professional_id", "date", "time"],
    },
  },
  {
    name: "list_customer_appointments",
    description: "Lista os próximos agendamentos ativos deste cliente.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_appointment",
    description: "Cancela um agendamento do cliente. Só use depois que o cliente confirmou o cancelamento.",
    input_schema: {
      type: "object",
      properties: { appointment_id: { type: "string" } },
      required: ["appointment_id"],
    },
  },
  {
    name: "save_customer_name",
    description: "Salva o nome do cliente quando ele informar.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "transfer_to_owner",
    description:
      "Passa a conversa para a dona do estabelecimento. Depois disso você para de responder esta cliente. Use para química, combos, encaixe, serviço fora da lista ou qualquer pedido que você não consiga resolver.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Resumo curto para a dona: o que a cliente quer" },
      },
      required: ["reason"],
    },
  },
];

function customerLabel(ctx: ToolContext): string {
  return `${ctx.customer.name ?? "Cliente sem nome"} (${ctx.customer.phone})`;
}

const handlers: { [K in ToolName]: (ctx: ToolContext, input: z.infer<(typeof inputs)[K]>) => Promise<unknown> } = {
  async find_available_slots(ctx, input) {
    const { service, slots } = await findAvailableSlots(ctx.sql, ctx.tenant, {
      serviceId: input.service_id,
      date: input.date,
      professionalId: input.professional_id,
    });
    return {
      service: service.name,
      date: input.date,
      weekday: weekdayName(weekdayOf(input.date)),
      slots: slots.map((slot) => ({
        time: utcToZoned(slot.startsAt, ctx.tenant.timezone).time,
        professionals: slot.professionals,
      })),
      note: slots.length === 0 ? "Nenhum horário livre neste dia. Sugira outro dia." : undefined,
    };
  },

  async book_appointment(ctx, input) {
    const appointment = await bookAppointment(ctx.sql, ctx.tenant, {
      customerId: ctx.customer.id,
      serviceId: input.service_id,
      professionalId: input.professional_id,
      date: input.date,
      time: input.time,
      source: "whatsapp",
    });
    const when = formatDateTimePtBr(appointment.startsAt, ctx.tenant.timezone);
    ctx.ownerNotices.push(
      `Novo agendamento pela ${ctx.tenant.assistantName}:\n${appointment.serviceName} com ${appointment.professionalName}\n${when}\nCliente: ${customerLabel(ctx)}`,
    );
    return {
      booked: true,
      appointment_id: appointment.id,
      when,
      service: appointment.serviceName,
      professional: appointment.professionalName,
    };
  },

  async list_customer_appointments(ctx) {
    const appointments = await listUpcomingAppointments(ctx.sql, ctx.tenant, ctx.customer.id);
    return appointments.map((appointment) => ({
      appointment_id: appointment.id,
      when: formatDateTimePtBr(appointment.startsAt, ctx.tenant.timezone),
      service: appointment.serviceName,
      professional: appointment.professionalName,
      status: appointment.status,
    }));
  },

  async cancel_appointment(ctx, input) {
    const appointment = await cancelCustomerAppointment(ctx.sql, ctx.tenant, ctx.customer.id, input.appointment_id);
    const when = formatDateTimePtBr(appointment.startsAt, ctx.tenant.timezone);
    ctx.ownerNotices.push(
      `Agendamento cancelado pelo cliente:\n${appointment.serviceName} com ${appointment.professionalName}\n${when}\nCliente: ${customerLabel(ctx)}`,
    );
    return { cancelled: true, when };
  },

  async save_customer_name(ctx, input) {
    await ctx.sql`update customers set name = ${input.name} where id = ${ctx.customer.id}`;
    ctx.customer.name = input.name;
    return { saved: true };
  },

  async transfer_to_owner(ctx, input) {
    ctx.handoffReason = input.reason;
    ctx.ownerNotices.push(
      `A ${ctx.tenant.assistantName} passou uma conversa para você responder.\nCliente: ${customerLabel(ctx)}\nPedido: ${input.reason}`,
    );
    return {
      transferred: true,
      instruction:
        "Responda à cliente de forma simpática, em uma ou duas frases: diga que vai chamar a dona para cuidar desse pedido e que ela responde por aqui em breve.",
    };
  },
};

/** Runs one tool call. Business errors go back to the model as `is_error` results. */
export async function executeTool(
  ctx: ToolContext,
  block: Anthropic.ToolUseBlock,
): Promise<Anthropic.ToolResultBlockParam> {
  const result = (content: unknown, isError = false): Anthropic.ToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: block.id,
    content: typeof content === "string" ? content : JSON.stringify(content),
    is_error: isError,
  });

  if (!(block.name in inputs)) return result(`Ferramenta desconhecida: ${block.name}`, true);
  const name = block.name as ToolName;
  const parsed = inputs[name].safeParse(block.input);
  if (!parsed.success) return result(`Parâmetros inválidos: ${parsed.error.message}`, true);

  try {
    const handler = handlers[name] as (ctx: ToolContext, input: unknown) => Promise<unknown>;
    return result(await handler(ctx, parsed.data));
  } catch (error) {
    if (error instanceof SchedulingError) return result(error.message, true);
    throw error;
  }
}
