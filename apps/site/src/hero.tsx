import { Check, RotateCcw } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { AgendaDay, LiaAvatar, Typing, bubble, customerBubble, liaBubble, type AgendaRow } from "./fragments";
import { Band, Button, Reveal, whatsappUrl } from "./ui";

const TIMES = ["9h30", "10h", "14h"] as const;
type Time = (typeof TIMES)[number];

type State = { step: 0 | 1 | 2 | 3 | 4 | 5; picked?: Time };
type Action = { type: "next" } | { type: "pick"; time: Time } | { type: "reset" };

/*
 * The one live thing: a conversation that plays by itself, then waits for the visitor to pick a time.
 * Steps: 0 customer asks · 1 Lia types · 2 Lia offers times (tap) · 3 customer answers · 4 Lia types · 5 booked.
 */
function reducer(state: State, action: Action): State {
  if (action.type === "reset") return { step: 0 };
  if (action.type === "pick" && state.step === 2) return { step: 3, picked: action.time };
  if (action.type === "next" && state.step !== 2 && state.step < 5) return { ...state, step: (state.step + 1) as State["step"] };
  return state;
}

const REDUCED = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function useConversation() {
  const [state, dispatch] = useReducer(reducer, { step: 0 });
  const { step } = state;
  useEffect(() => {
    if (step === 2 || step === 5) return;
    const wait = REDUCED() ? 0 : { 0: 700, 1: 1300, 3: 700, 4: 1300 }[step as 0 | 1 | 3 | 4];
    const timer = setTimeout(() => dispatch({ type: "next" }), wait);
    return () => clearTimeout(timer);
  }, [step]);
  return { state, dispatch };
}

/** Dark card, like the Lia's chat in the product: the customer in blue, the Lia in graphite. */
function Chat({ state, dispatch }: ReturnType<typeof useConversation>) {
  const { step, picked } = state;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [step]);
  return (
    <div data-ui className="flex h-[440px] w-full max-w-[400px] flex-col overflow-hidden rounded-[14px] bg-graphite-900 text-white">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <LiaAvatar size={36} />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold">Lia</p>
          <p className="flex items-center gap-1.5 text-[14px] text-graphite-300">
            <span className="size-1.5 rounded-full bg-brand-400" /> atendendo agora
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset" })}
          className="press ml-auto flex size-9 items-center justify-center rounded-lg text-graphite-300 hover:bg-graphite-800"
          aria-label="Recomeçar a conversa"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
      <div ref={scroller} className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 pb-4" aria-live="polite">
        <p className="mx-auto mb-1 text-[14px] text-graphite-400">Hoje, 23h42</p>
        <div className={`${bubble} ${customerBubble}`}>Oi! Quero marcar um corte de cabelo amanhã</div>
        {step === 1 && <Typing />}
        {step >= 2 && (
          <div className={`${bubble} ${liaBubble}`}>
            Oi, Camila! Amanhã tenho <strong>9h30, 10h ou 14h</strong> com a Ana. Qual prefere?
          </div>
        )}
        {step === 2 && (
          <div className="pop flex flex-wrap justify-end gap-2" role="group" aria-label="Escolha um horário">
            {TIMES.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => dispatch({ type: "pick", time })}
                className="press h-11 min-w-[72px] rounded-xl bg-brand-600 px-4 text-[14px] font-semibold text-white hover:bg-brand-500"
              >
                {time}
              </button>
            ))}
          </div>
        )}
        {step >= 3 && <div className={`${bubble} ${customerBubble}`}>{picked}, por favor</div>}
        {step === 4 && <Typing />}
        {step === 5 && (
          <div className={`pop flex w-fit items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] ${liaBubble}`}>
            <Check className="size-4 shrink-0 text-brand-400" aria-hidden />
            <span>
              <strong>Agendado</strong> <span className="text-graphite-300">· amanhã às {picked} · Corte com a Ana</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function agendaRows(picked?: Time, booked?: boolean): AgendaRow[] {
  const slot = (label: Time, time: string): AgendaRow =>
    booked && picked === label ? { time, who: "Camila", service: "Corte", mine: true } : { time, free: true };
  return [
    { time: "9:00", who: "Mariana", service: "Escova" },
    slot("9h30", "9:30"),
    slot("10h", "10:00"),
    { time: "11:00", who: "Beatriz", service: "Hidratação" },
    { time: "13:00", who: "Aline", service: "Corte" },
    slot("14h", "14:00"),
  ];
}

export function Hero() {
  const conversation = useConversation();
  const { step, picked } = conversation.state;
  const booked = step === 5;
  return (
    <section id="topo">
      <Band className="pt-10 pb-16 md:pt-16 md:pb-24">
        <h1 className="t-display max-w-[14ch] sm:max-w-none">
          Seu negócio com hora&nbsp;marcada<span className="text-accent-text">!</span>
        </h1>
        <div className="mt-10 grid items-stretch gap-10 md:mt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div className="flex max-w-xl flex-col justify-between gap-10">
            <div className="space-y-7">
              <Reveal>
                <p className="t-statement">
                  A Lia é a atendente que responde seus clientes no WhatsApp, marca o horário, confirma e lembra na véspera. Você só entra na
                  conversa quando precisa.
                </p>
              </Reveal>
              <Reveal delay={80} className="flex flex-wrap items-center gap-3">
                <Button href={whatsappUrl()}>Fale com a gente</Button>
                <Button href="#como-funciona" variant="quiet">
                  Ver como funciona
                </Button>
              </Reveal>
            </div>
            <Reveal delay={160}>
              <p className="t-small text-muted" aria-live="polite">
                {step === 2
                  ? "Toque em um horário e veja a Lia agendar."
                  : booked
                    ? "Pronto: o horário já está na agenda ao lado. Sem você tocar em nada."
                    : "Uma conversa de verdade, acontecendo agora."}
              </p>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <div className="flex flex-col items-center gap-5 rounded-xl bg-brand-950 p-5 sm:flex-row sm:items-start sm:justify-center md:p-8">
              <Chat {...conversation} />
              <div className="hidden sm:block">
                <AgendaDay title="Amanhã, quarta" person="Ana" rows={agendaRows(picked, booked)} className="max-w-[300px]" />
              </div>
            </div>
          </Reveal>
        </div>
      </Band>
    </section>
  );
}
