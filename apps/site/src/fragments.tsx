import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "./ui";

/*
 * Pieces of the product's own interface, built in code at true size with sample data.
 * Each root carries data-ui: inside it the product's conventions apply (small radii, 1px control borders).
 */

const frame = "rounded-[10px] border border-graphite-200 bg-white text-ink";

export type AgendaRow = { time: string; who?: string; service?: string; free?: boolean; mine?: boolean };

/** One professional's day, the way the panel's agenda lists it. */
export function AgendaDay({ title, person, rows, className = "" }: { title: string; person: string; rows: AgendaRow[]; className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[340px] overflow-hidden text-[14px] ${className}`}>
      <div className="flex items-center justify-between bg-surface px-4 py-3">
        <span className="font-semibold">{title}</span>
        <span className="text-muted">{person}</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.time}
            // taste-skill-ignore: rows of an interface fragment (data-ui)
            className={`flex items-center gap-3 border-t border-graphite-200 px-4 py-2.5 transition-colors duration-300 ${
              row.mine ? "bg-brand-50" : ""
            }`}
          >
            <span className="w-11 shrink-0 font-medium tabular-nums">{row.time}</span>
            {row.free ? (
              <span className="text-muted">livre</span>
            ) : (
              <span className="min-w-0 flex-1 truncate">
                <span className={row.mine ? "font-semibold text-accent" : "font-medium"}>{row.who}</span>
                <span className="text-muted"> · {row.service}</span>
              </span>
            )}
            {row.mine && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The reminder the day before: no answer counts as confirmed. */
export function ReminderMessage({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[330px] p-4 text-[14px] leading-snug ${className}`}>
      <p className="font-semibold">Lia · véspera, 18h</p>
      <p className="mt-2">Oi, Camila! Amanhã às 10h você tem corte com a Ana.</p>
      <p className="mt-2 text-muted">Responda 1 para confirmar ou 2 para remarcar.</p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-md bg-brand-50 px-3 py-1.5 font-medium text-accent">1 · Confirmar</span>
        <span className="rounded-md bg-surface-2 px-3 py-1.5 font-medium">2 · Remarcar</span>
      </div>
    </div>
  );
}

/** Two services in one visit, one after the other. */
export function ComboCard({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[330px] overflow-hidden text-[14px] ${className}`}>
      <div className="flex items-center justify-between bg-surface px-4 py-3">
        <span className="font-semibold">Quinta, 10h às 11h45</span>
        <span className="text-muted">com a Ana</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="rounded-md bg-brand-50 px-3 py-2.5">
          <span className="font-semibold tabular-nums">10:00</span> Corte feminino <span className="text-muted">· 1h</span>
        </div>
        <div className="rounded-md bg-brand-100 px-3 py-2.5">
          <span className="font-semibold tabular-nums">11:00</span> Escova <span className="text-muted">· 45 min</span>
        </div>
      </div>
      <p className="border-t border-graphite-200 px-4 py-2.5 text-muted">Total R$ 150,00 · 1h45</p>
    </div>
  );
}

/** What the team gets when the Lia hands a conversation over. */
export function HandoffNotice({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[350px] p-4 text-[14px] leading-snug ${className}`}>
      <p className="font-semibold">A Lia passou uma conversa para você</p>
      <p className="mt-2">
        <span className="text-muted">Cliente:</span> Renata
      </p>
      <p>
        <span className="text-muted">Pedido:</span> quer saber sobre progressiva
      </p>
      <p className="mt-3 rounded-md bg-surface px-3 py-2 text-muted">
        Quando resolver, responda esta mensagem com <span className="font-semibold text-ink">RESOLVIDO</span> e a Lia volta a atender.
      </p>
    </div>
  );
}

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const HOURS: Record<string, string[]> = {
  Ana: ["9–18", "9–18", "9–18", "9–18", "9–18", "9–13"],
  Carla: ["—", "13–19", "13–19", "13–19", "13–19", "9–15"],
};

/** Each professional with her own days and hours. */
export function HoursTable({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[400px] overflow-hidden text-[14px] ${className}`}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface text-muted">
            <th className="px-3 py-2.5 font-medium" />
            {DAYS.map((day) => (
              <th key={day} className="px-1.5 py-2.5 text-center font-medium">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(HOURS).map(([name, slots]) => (
            <tr key={name} className="border-t border-graphite-200">{/* taste-skill-ignore: table of a data-ui fragment */}
              <th className="px-3 py-3 font-semibold">{name}</th>
              {slots.map((slot, index) => (
                <td key={index} className={`px-1.5 py-3 text-center tabular-nums ${slot === "—" ? "text-graphite-400" : ""}`}>
                  {slot}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The owner's own answers and rules, which the Lia follows in every conversation. */
export function TeachCard({ className = "" }: { className?: string }) {
  return (
    <div data-ui className={`${frame} w-full max-w-[340px] p-4 text-[14px] leading-snug ${className}`}>
      <p className="font-semibold">Respostas prontas</p>
      <div className="mt-3 rounded-md bg-surface p-3">
        <p className="text-muted">Quando perguntarem</p>
        <p className="font-medium">Tem estacionamento?</p>
        <p className="mt-2 text-muted">A Lia responde</p>
        <p>Temos sim! Estacionamento conveniado na rua de trás, com 1 hora grátis.</p>
      </div>
      <p className="mt-3 font-semibold">Regras</p>
      <p className="mt-1.5">
        <span className="rounded-md bg-brand-50 px-2 py-1 font-medium text-accent">Sempre</span> pergunte o nome antes de agendar
      </p>
    </div>
  );
}

/** The same request, further along each time: the one card of the "how it works" strip. */
export type TicketStage = 0 | 1 | 2 | 3;
export function Ticket({ stage }: { stage: TicketStage }) {
  const status = ["Novo pedido", "Horários enviados", "Agendado", "Confirmado"][stage]!;
  return (
    <div data-ui className="w-full max-w-[290px] rounded-[10px] bg-white p-4 text-[14px] leading-snug text-ink shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Camila</span>
        <span
          className={`rounded-md px-2 py-0.5 text-[14px] font-medium ${stage >= 2 ? "bg-brand-100 text-brand-900" : "bg-graphite-100 text-graphite-800"}`}
          style={stage >= 2 ? { color: "var(--brand-900)" } : undefined}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-muted">“Quero marcar um corte amanhã”</p>
      <div className="mt-3 min-h-[76px] space-y-1.5">
        {stage === 0 && <p className="text-muted">Chegou pelo WhatsApp às 23h42.</p>}
        {stage === 1 && (
          <>
            <p className="text-muted">A Lia ofereceu:</p>
            <div className="flex gap-1.5">
              {["9h30", "10h", "14h"].map((t) => (
                <span key={t} className="rounded-md bg-surface-2 px-2.5 py-1 font-medium tabular-nums">
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
        {stage >= 2 && (
          <>
            <p className="font-semibold">Amanhã às 10h</p>
            <p className="text-muted">Corte com a Ana</p>
            {stage === 3 && (
              <p className="flex items-center gap-1.5 font-medium text-accent">
                <Check className="size-4" aria-hidden /> Respondeu 1 ao lembrete
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The Lia's avatar inside chat fragments. */
export function LiaAvatar({ size = 32 }: { size?: number }): ReactNode {
  return <LogoMark size={size} ring={false} />;
}
