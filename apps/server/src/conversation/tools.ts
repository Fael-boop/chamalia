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
import { bookCombo, findComboSlots, MAX_COMBO_SERVICES } from "../scheduling/combo.js";
import { loadPriceTable, type PriceTable } from "./price-table.js";

export type ToolContext = {
  sql: Sql;
  tenant: Tenant;
  customer: { id: string; phone: string; name: string | null };
  /** Messages to send to the business owner once the turn ends. */
  ownerNotices: string[];
  /** Handoff notices for a team member other than the owner. */
  teamNotices: { name: string; phone: string; text: string }[];
  /** The price list to send after the reply (set by send_price_table). */
  priceTable?: PriceTable;
  /** Set when the model hands the conversation over to a person. */
  handoffReason?: string;
  /** Who got it (name), for the panel. */
  handoffTo?: string;
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
  find_combo_slots: z.object({
    service_ids: z.array(z.string().uuid()).min(2).max(MAX_COMBO_SERVICES),
    date,
  }),
  book_combo: z.object({
    service_ids: z.array(z.string().uuid()).min(2).max(MAX_COMBO_SERVICES),
    date,
    time: z.string().regex(/^\d{2}:\d{2}$/),
    professional_ids: z.array(z.string().uuid()).optional(),
  }),
  send_price_table: z.object({}),
  list_customer_appointments: z.object({}),
  cancel_appointment: z.object({ appointment_id: z.string().uuid() }),
  save_customer_name: z.object({ name: z.string().trim().min(1).max(80) }),
  transfer_to_owner: z.object({
    service_id: z.string().uuid().optional(),
    topic_id: z.string().uuid().optional(), reason: z.string().trim().min(1).max(300) }),
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
    name: "find_combo_slots",
    description: `Para mais de um serviço no mesmo atendimento (combo, até ${MAX_COMBO_SERVICES}): lista os horários de início em que todos cabem um depois do outro, na ordem dada. Separa os horários em que uma única profissional faz tudo (preferidos) dos horários que precisam de profissionais diferentes. Traz também o preço e a duração total.`,
    input_schema: {
      type: "object",
      properties: {
        service_ids: { type: "array", items: { type: "string" }, description: "service_id de cada serviço, na ordem em que serão feitos" },
        date: { type: "string", description: "AAAA-MM-DD" },
      },
      required: ["service_ids", "date"],
    },
  },
  {
    name: "book_combo",
    description:
      "Grava um combo (um agendamento por serviço, em sequência). Só use depois que a cliente confirmou os serviços, o dia e o horário de início.",
    input_schema: {
      type: "object",
      properties: {
        service_ids: { type: "array", items: { type: "string" }, description: "Mesma lista e ordem usadas em find_combo_slots" },
        date: { type: "string", description: "AAAA-MM-DD" },
        time: { type: "string", description: "HH:MM de início, um dos retornados por find_combo_slots" },
        professional_ids: {
          type: "array",
          items: { type: "string" },
          description: "Opcional: professional_id de cada serviço, na mesma ordem. Sem isso o sistema escolhe.",
        },
      },
      required: ["service_ids", "date", "time"],
    },
  },
  {
    name: "send_price_table",
    description:
      "Envia à cliente a tabela de preços cadastrada pela dona (texto e/ou imagem ou PDF). Use quando a cliente pedir a tabela, a lista de preços, o catálogo ou todos os valores. Não serve para perguntar o preço de um serviço só: esse você responde pela lista de serviços.",
    input_schema: { type: "object", properties: {} },
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
      "Passa a conversa para uma pessoa da equipe (a dona ou quem ela definiu para o caso). Depois disso você para de responder esta cliente. Use para química, combos, encaixe, serviço fora da lista, os serviços e assuntos marcados e qualquer pedido que você não consiga resolver. Informe service_id ou topic_id quando o motivo for um deles: assim o pedido vai para a pessoa certa.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Resumo curto para quem vai atender: o que a cliente quer" },
        service_id: { type: "string", description: "Opcional: service_id quando o motivo é um serviço" },
        topic_id: { type: "string", description: "Opcional: topic_id quando o motivo é um dos assuntos da lista" },
      },
      required: ["reason"],
    },
  },
];

function customerLabel(ctx: ToolContext): string {
  return `${ctx.customer.name ?? "Cliente sem nome"} (${ctx.customer.phone})`;
}

/**
 * Who resolves a handoff: the person set on the service or topic, else the
 * business default. undefined = the owner (also when that person is inactive
 * or has no WhatsApp for notices, so nobody is left without an answer).
 */
async function handoffTarget(
  ctx: ToolContext,
  input: { service_id?: string; topic_id?: string },
): Promise<{ name: string; kind: string; notifyPhone: string } | undefined> {
  const { sql, tenant } = ctx;
  let personId = tenant.defaultHandoffProfessionalId;
  if (input.topic_id) {
    const [topic] = await sql<{ professionalId: string | null }[]>`
      select professional_id from handoff_topics where tenant_id = ${tenant.id} and id = ${input.topic_id}
    `;
    if (topic) personId = topic.professionalId;
  } else if (input.service_id) {
    const [service] = await sql<{ handoffProfessionalId: string | null }[]>`
      select handoff_professional_id from services where tenant_id = ${tenant.id} and id = ${input.service_id} and handoff
    `;
    if (service) personId = service.handoffProfessionalId;
  }
  if (!personId) return undefined;
  const [person] = await sql<{ name: string; kind: string; notifyPhone: string }[]>`
    select name, kind, notify_phone from professionals
    where tenant_id = ${tenant.id} and id = ${personId} and active and notify_phone is not null
  `;
  return person;
}

/** Services the owner marked "always hand over" are never offered or booked by the assistant. */
async function ensureAssistantBooks(ctx: ToolContext, serviceId: string) {
  const [service] = await ctx.sql<{ handoff: boolean; handoffReason: string | null }[]>`
    select handoff, handoff_reason from services where tenant_id = ${ctx.tenant.id} and id = ${serviceId}
  `;
  if (service?.handoff) {
    throw new SchedulingError(
      "handoff_service",
      `Este serviço é sempre com a dona${service.handoffReason ? ` (${service.handoffReason})` : ""}. Não ofereça horários: entenda o pedido e use transfer_to_owner.`,
    );
  }
}

/** Tells the model whether nobody does the service at all (pass to the owner) or the day is just full. */
async function noSlotsNote(ctx: ToolContext, serviceId: string): Promise<string> {
  const [row] = await ctx.sql<{ count: number }[]>`
    select count(*)::int as count
    from professional_services ps
    join professionals p on p.id = ps.professional_id and p.active
    where ps.tenant_id = ${ctx.tenant.id} and ps.service_id = ${serviceId}
  `;
  return row?.count
    ? "Nenhum horário livre neste dia. Consulte outro dia antes de responder."
    : "Nenhuma profissional faz este serviço no momento. Não procure outros dias: passe para a dona com transfer_to_owner.";
}

const handlers: { [K in ToolName]: (ctx: ToolContext, input: z.infer<(typeof inputs)[K]>) => Promise<unknown> } = {
  async find_available_slots(ctx, input) {
    await ensureAssistantBooks(ctx, input.service_id);
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
      note: slots.length === 0 ? await noSlotsNote(ctx, input.service_id) : undefined,
    };
  },

  async book_appointment(ctx, input) {
    await ensureAssistantBooks(ctx, input.service_id);
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

  async find_combo_slots(ctx, input) {
    for (const id of input.service_ids) await ensureAssistantBooks(ctx, id);
    const { services, slots } = await findComboSlots(ctx.sql, ctx.tenant, { serviceIds: input.service_ids, date: input.date });
    const prices = services.map((service) => service.priceCents);
    return {
      services: services.map((service) => service.name),
      total_minutes: services.reduce((sum, service) => sum + service.durationMinutes, 0),
      total_price: prices.some((cents) => cents === null)
        ? "parte sob consulta"
        : `R$ ${(prices.reduce((sum, cents) => sum! + cents!, 0)! / 100).toFixed(2).replace(".", ",")}`,
      date: input.date,
      weekday: weekdayName(weekdayOf(input.date)),
      // One person doing everything is what customers prefer: offer these first.
      slots_with_one_professional: slots
        .filter((slot) => slot.solo.length > 0)
        .map((slot) => ({
          start: slot.time,
          end: utcToZoned(slot.endsAt, ctx.tenant.timezone).time,
          professionals: slot.solo.map((p) => p.name),
        })),
      slots_with_different_professionals: slots
        .filter((slot) => slot.solo.length === 0)
        .map((slot) => ({
          start: slot.time,
          end: utcToZoned(slot.endsAt, ctx.tenant.timezone).time,
          parts: slot.parts.map((part, index) => ({ service: services[index]!.name, time: part.time, professionals: part.professionals })),
        })),
      note:
        slots.length === 0
          ? "Nenhum horário em que todos os serviços caibam em sequência neste dia. Consulte outro dia."
          : "Prefira slots_with_one_professional. Use slots_with_different_professionals só se não houver nenhum horário com uma profissional neste dia ou se a cliente preferir ou pedir outro horário.",
    };
  },

  async book_combo(ctx, input) {
    for (const id of input.service_ids) await ensureAssistantBooks(ctx, id);
    const { parts } = await bookCombo(ctx.sql, ctx.tenant, {
      customerId: ctx.customer.id,
      serviceIds: input.service_ids,
      date: input.date,
      time: input.time,
      professionalIds: input.professional_ids,
      source: "whatsapp",
    });
    const lines = parts.map(
      (part) => `${utcToZoned(part.startsAt, ctx.tenant.timezone).time} ${part.serviceName} com ${part.professionalName}`,
    );
    const when = formatDateTimePtBr(parts[0]!.startsAt, ctx.tenant.timezone);
    ctx.ownerNotices.push(
      `Novo combo pela ${ctx.tenant.assistantName} (${when}):\n${lines.join("\n")}\nCliente: ${customerLabel(ctx)}`,
    );
    return { booked: true, when, ends_at: utcToZoned(parts.at(-1)!.endsAt, ctx.tenant.timezone).time, parts: lines };
  },

  async send_price_table(ctx) {
    const table = await loadPriceTable(ctx.sql, ctx.tenant.id);
    if (!table) {
      return {
        sent: false,
        note: "Não há tabela de preços cadastrada. Responda com os preços da lista de serviços e, se a cliente quiser mais, ofereça chamar a equipe.",
      };
    }
    ctx.priceTable = table;
    return {
      sent: true,
      includes: [table.body ? "tabela escrita" : null, table.file ? "arquivo (imagem/PDF)" : null].filter(Boolean),
      table_text: table.body ?? undefined,
      instruction:
        "A tabela é da dona e será enviada logo depois da sua resposta. Diga em uma frase curta que está mandando a tabela e pergunte se a cliente quer agendar algo. Não repita, não comente e não corrija os valores da tabela, mesmo que sejam diferentes da lista de serviços. Se a cliente perguntar por uma diferença, diga que vai confirmar com a equipe.",
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
      combo_id: appointment.comboId ?? undefined,
    }));
  },

  async cancel_appointment(ctx, input) {
    const appointment = await cancelCustomerAppointment(ctx.sql, ctx.tenant, ctx.customer.id, input.appointment_id);
    const when = formatDateTimePtBr(appointment.startsAt, ctx.tenant.timezone);
    ctx.ownerNotices.push(
      `Agendamento cancelado pelo cliente:\n${appointment.serviceName} com ${appointment.professionalName}\n${when}\nCliente: ${customerLabel(ctx)}`,
    );
    for (const part of appointment.comboParts) {
      ctx.ownerNotices.push(
        `Cancelado junto (mesmo combo):\n${part.serviceName} com ${part.professionalName}\n${formatDateTimePtBr(part.startsAt, ctx.tenant.timezone)}`,
      );
    }
    return {
      cancelled: true,
      when,
      also_cancelled_same_combo: appointment.comboParts.map((part) => part.serviceName),
    };
  },

  async save_customer_name(ctx, input) {
    await ctx.sql`update customers set name = ${input.name} where id = ${ctx.customer.id}`;
    ctx.customer.name = input.name;
    return { saved: true };
  },

  async transfer_to_owner(ctx, input) {
    const person = await handoffTarget(ctx, input);
    const notice = `A ${ctx.tenant.assistantName} passou uma conversa para você responder.\nCliente: ${customerLabel(ctx)}\nPedido: ${input.reason}`;
    ctx.handoffReason = input.reason;
    if (person) {
      ctx.handoffTo = person.name;
      ctx.teamNotices.push({ name: person.name, phone: person.notifyPhone, text: `${notice}\nResponda pelo WhatsApp do salão.` });
    } else {
      ctx.handoffTo = ctx.tenant.ownerName ?? "dona";
      ctx.ownerNotices.push(notice);
    }
    const who = person ? (person.kind === "reception" ? "a recepção" : `a ${person.name}`) : "a dona";
    return {
      transferred: true,
      instruction: `Quem vai atender é ${who}. Responda à cliente de forma simpática, em uma ou duas frases: diga que vai chamar ${who} para cuidar desse pedido e que a resposta vem por aqui em breve. Use exatamente esse nome; não fale em dona se não for ela.`,
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
