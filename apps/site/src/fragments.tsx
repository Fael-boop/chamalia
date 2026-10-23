import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "./ui";

/*
 * Pieces of the product's own interface, built in code at true size with sample data (made-up names).
 * Each root carries data-ui: inside it the product's conventions apply (small radii, one outline).
 * Dark like the panel at night: graphite body, a blue mark for what is booked.
 */

const frame = "rounded-[10px] border border-graphite-800 bg-graphite-950 text-white";

export type AgendaRow = { time: string; who?: string; service?: string; free?: boolean; mine?: boolean };

/** One professional's day, the way the panel's agenda lists it. */
export function AgendaDay({ title, person, rows, className = "" }: { title: string; person: string; rows: AgendaRow[]; className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[340px] p-3 text-[14px] ${className}`}>
      <div className="flex items-center justify-between px-2 pt-1 pb-2.5">
        <span className="font-semibold">{title}</span>
        <span className="text-graphite-300">{person}</span>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={row.time}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-300 ${row.mine ? "bg-brand-900" : "bg-graphite-900"}`}
          >
            <span className="w-11 shrink-0 font-medium tabular-nums">{row.time}</span>
            {row.free ? (
              <span className="text-graphite-400">livre</span>
            ) : (
              <span className="min-w-0 flex-1 truncate">
                <span className={row.mine ? "font-semibold text-brand-200" : "font-medium"}>{row.who}</span>
                <span className="text-graphite-300"> · {row.service}</span>
              </span>
            )}
            {row.mine && <Check className="size-4 shrink-0 text-brand-300" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  );
}

type PairCell = { who: string; service: string } | null;
const PAIR: { time: string; ana: PairCell; carla: PairCell }[] = [
  { time: "9:00", ana: { who: "Mariana", service: "Escova" }, carla: { who: "Roberta", service: "Pé e mão" } },
  { time: "10:00", ana: null, carla: { who: "Sabrina", service: "Manicure" } },
  { time: "11:00", ana: { who: "Beatriz", service: "Hidratação" }, carla: null },
  { time: "13:00", ana: { who: "Aline", service: "Corte" }, carla: { who: "Patrícia", service: "Pedicure" } },
  { time: "14:00", ana: null, carla: null },
  { time: "15:00", ana: { who: "Larissa", service: "Corte" }, carla: null },
];

/** Two professionals side by side: the free hours are what the Lia offers. */
export function AgendaPair({ className = "" }: { className?: string }) {
  const cell = (c: PairCell) =>
    c ? (
      <div className="min-w-0 rounded-md bg-graphite-900 px-3 py-2.5">
        <p className="truncate font-medium">{c.who}</p>
        <p className="truncate text-graphite-300">{c.service}</p>
      </div>
    ) : (
      <div className="flex items-center rounded-md bg-brand-950 px-3 py-2.5 text-brand-300">livre</div>
    );
  return (
    <div data-ui className={`${frame} w-full max-w-[520px] p-3 text-[14px] ${className}`}>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-1.5 px-1 pt-1 pb-2 font-semibold">
        <span />
        <span className="px-2">Ana</span>
        <span className="px-2">Carla</span>
      </div>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-1.5">
        {PAIR.map((row) => (
          <div key={row.time} className="contents">
            <span className="flex items-center px-1 font-medium text-graphite-300 tabular-nums">{row.time}</span>
            {cell(row.ana)}
            {cell(row.carla)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The reminder the day before: no answer counts as confirmed. */
export function ReminderMessage({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[380px] space-y-2 p-4 text-[14px] leading-snug ${className}`}>
      <p className="font-semibold">Lia · véspera, 18h</p>
      <div className="w-fit max-w-[92%] rounded-xl bg-graphite-900 px-3.5 py-2.5">
        Oi, Camila! Amanhã às 10h você tem corte com a Ana. Responda 1 para confirmar ou 2 para remarcar.
      </div>
      <div className="ml-auto w-fit rounded-xl bg-brand-600 px-3.5 py-2.5">1</div>
      <p className="flex items-center gap-1.5 pt-1 font-medium text-brand-300">
        <Check className="size-4" aria-hidden /> Confirmado
      </p>
    </div>
  );
}

/** Two services in one visit, one after the other. */
export function ComboCard({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[380px] p-3 text-[14px] ${className}`}>
      <div className="flex items-center justify-between px-2 pt-1 pb-2.5">
        <span className="font-semibold">Quinta, 10h às 11h45</span>
        <span className="text-graphite-300">com a Ana</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between rounded-md bg-brand-900 px-3 py-3">
          <span>
            <span className="font-semibold tabular-nums">10:00</span> Corte feminino
          </span>
          <span className="text-brand-200">1h</span>
        </div>
        <div className="flex justify-between rounded-md bg-brand-800 px-3 py-3">
          <span>
            <span className="font-semibold tabular-nums">11:00</span> Escova
          </span>
          <span className="text-brand-200">45 min</span>
        </div>
      </div>
      <p className="px-2 pt-3 pb-1 text-graphite-300">Total R$ 150,00 · 1h45</p>
    </div>
  );
}

/** What the team gets when the Lia hands a conversation over, and how it closes. */
export function HandoffNotice({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[380px] space-y-2 p-4 text-[14px] leading-snug ${className}`}>
      <div className="rounded-xl bg-graphite-900 px-3.5 py-3">
        <p className="font-semibold">A Lia passou uma conversa para você</p>
        <p className="mt-1.5 text-graphite-300">Cliente: Renata</p>
        <p className="text-graphite-300">Pedido: quer saber sobre progressiva</p>
      </div>
      <div className="ml-auto w-fit rounded-xl bg-brand-600 px-3.5 py-2.5 font-semibold">RESOLVIDO</div>
      <p className="flex items-center gap-1.5 pt-1 font-medium text-brand-300">
        <Check className="size-4" aria-hidden /> A Lia voltou a atender a Renata
      </p>
    </div>
  );
}

const HOURS: { name: string; days: { when: string; hours: string; off?: boolean }[] }[] = [
  {
    name: "Ana",
    days: [
      { when: "Seg a Sex", hours: "9h às 18h" },
      { when: "Sábado", hours: "9h às 13h" },
    ],
  },
  {
    name: "Carla",
    days: [
      { when: "Ter a Sex", hours: "13h às 19h" },
      { when: "Sábado", hours: "9h às 15h" },
      { when: "Segunda", hours: "folga", off: true },
    ],
  },
];

/** Each professional with her own days and hours, one readable line per stretch of days. */
export function HoursTable({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[380px] space-y-3 p-3 text-[14px] ${className}`}>
      {HOURS.map((person) => (
        <div key={person.name}>
          <p className="px-1 pb-1.5 font-semibold">{person.name}</p>
          <ul className="space-y-1">
            {person.days.map((day) => (
              <li key={day.when} className="flex items-center justify-between gap-3 rounded-md bg-graphite-900 px-3 py-2.5">
                <span className="text-graphite-300">{day.when}</span>
                <span className={`tabular-nums ${day.off ? "text-graphite-400" : "font-medium"}`}>{day.hours}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Chat pieces, shared by the hero and the steps ───────────────────────── */

export const bubble = "pop w-fit max-w-[86%] rounded-xl px-3.5 py-2.5 text-[14px] leading-snug";
export const liaBubble = "border border-graphite-800 bg-graphite-950 text-white";
export const customerBubble = "ml-auto bg-brand-600 text-white";

export function Typing() {
  return (
    <div className={`pop flex w-fit items-center gap-1 rounded-xl px-3.5 py-3 ${liaBubble}`} aria-label="A Lia está digitando">
      <span className="dot size-1.5 rounded-full bg-graphite-400" />
      <span className="dot size-1.5 rounded-full bg-graphite-400" />
      <span className="dot size-1.5 rounded-full bg-graphite-400" />
    </div>
  );
}

/** The Lia's avatar inside chat fragments. */
export function LiaAvatar({ size = 32 }: { size?: number }): ReactNode {
  return <LogoMark size={size} ring={false} />;
}

/** A static chat window, for the steps of "how it works". */
export function ChatWindow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-ui className={`flex w-full max-w-[420px] flex-col overflow-hidden rounded-[14px] bg-graphite-900 text-white ${className}`}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <LiaAvatar size={36} />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold">Lia</p>
          <p className="flex items-center gap-1.5 text-[14px] text-graphite-300">
            <span className="size-1.5 rounded-full bg-brand-400" /> atendendo agora
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-4">{children}</div>
    </div>
  );
}

/** Step 1: it is almost midnight and the customer writes. */
export function StepWrites() {
  return (
    <ChatWindow>
      <p className="mx-auto text-[14px] text-graphite-400">Hoje, 23h42</p>
      <div className={`${bubble} ${customerBubble}`}>Oi! Quero marcar um corte de cabelo amanhã</div>
      <div className={`${bubble} ${customerBubble}`}>Tem horário de manhã?</div>
    </ChatWindow>
  );
}

/** Step 2: the Lia reads the agenda and offers what is free. */
export function StepOffers() {
  return (
    <ChatWindow>
      <div className={`${bubble} ${liaBubble}`}>
        Oi, Camila! Amanhã tenho <strong>9h30, 10h ou 14h</strong> com a Ana. Qual prefere?
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {["9h30", "10h", "14h"].map((time) => (
          <span key={time} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold tabular-nums">
            {time}
          </span>
        ))}
      </div>
    </ChatWindow>
  );
}

/** Step 3: booked, and the team is told. */
export function StepBooked() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-3">
      <div data-ui className={`${frame} space-y-1 p-4 text-[14px] leading-snug`}>
        <p className="font-semibold">Novo agendamento</p>
        <p>Camila · Corte feminino</p>
        <p className="text-graphite-300">Amanhã, 10h · com a Ana · pelo WhatsApp</p>
      </div>
      <AgendaDay
        title="Amanhã, quarta"
        person="Ana"
        className="max-w-none"
        rows={[
          { time: "9:00", who: "Mariana", service: "Escova" },
          { time: "10:00", who: "Camila", service: "Corte", mine: true },
          { time: "11:00", who: "Beatriz", service: "Hidratação" },
        ]}
      />
    </div>
  );
}
