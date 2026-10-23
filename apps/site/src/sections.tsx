import { Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AgendaDay,
  ComboCard,
  HandoffNotice,
  HoursTable,
  LiaAvatar,
  ReminderMessage,
  TeachCard,
  Ticket,
  type TicketStage,
} from "./fragments";
import { Button, Reveal, whatsappUrl } from "./ui";

/* ───────────────────────── Como funciona: one card, four fields ───────────────────────── */

const STEPS: { clause: string; stage: TicketStage; field: string }[] = [
  { clause: "Primeiro, o cliente chama no WhatsApp.", stage: 0, field: "bg-dark text-white" },
  { clause: "Depois, a Lia oferece os horários livres.", stage: 1, field: "bg-surface-2 text-ink" },
  { clause: "Então marca na agenda, sem dupla reserva.", stage: 2, field: "bg-accent text-white" },
  { clause: "E lembra o cliente na véspera.", stage: 3, field: "bg-brand-100 text-ink" },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="grid sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, index) => (
        <div key={step.stage} className={`${step.field} flex flex-col justify-between gap-8 p-[var(--pad)] py-12 sm:min-h-[520px] sm:gap-10 sm:pb-10 lg:min-h-[600px]`}>
          <div className="sm:min-h-[8.5rem]">
            {index === 0 && (
              <h2 id="como-funciona-titulo" className="t-heading">
                Como funciona
              </h2>
            )}
          </div>
          <Reveal delay={index * 90}>
            <div className="lift">
              <Ticket stage={step.stage} />
            </div>
          </Reveal>
          <p className="t-lead sm:max-w-[18ch]">{step.clause}</p>
        </div>
      ))}
    </section>
  );
}

/* ───────────────────────── O que a Lia faz: staggered fragment cells ───────────────────────── */

type Cell = { title: string; text: string; fragment: ReactNode; fragmentFirst: boolean; dock: "self-start" | "self-end" };

const CELLS: Cell[] = [
  {
    title: "Agenda sozinha",
    text: "Mostra os horários livres de cada profissional e marca sem dupla reserva.",
    fragment: (
      <AgendaDay
        title="Quarta"
        person="Ana"
        rows={[
          { time: "9:00", who: "Mariana", service: "Escova" },
          { time: "10:00", free: true },
          { time: "11:00", who: "Beatriz", service: "Hidratação" },
          { time: "14:00", free: true },
        ]}
      />
    ),
    fragmentFirst: false,
    dock: "self-end",
  },
  {
    title: "Lembra na véspera",
    text: "Quem não responde fica confirmado. Quem responde 2, a Lia remarca na hora.",
    fragment: <ReminderMessage />,
    fragmentFirst: true,
    dock: "self-start",
  },
  {
    title: "Vários serviços de uma vez",
    text: "Corte e escova no mesmo dia? Ela encaixa um depois do outro, de preferência com a mesma profissional.",
    fragment: <ComboCard />,
    fragmentFirst: false,
    dock: "self-start",
  },
  {
    title: "Chama a pessoa certa",
    text: "Química, orçamento ou dúvida fora do comum: a Lia avisa a equipe e fica em silêncio até alguém assumir.",
    fragment: <HandoffNotice />,
    fragmentFirst: true,
    dock: "self-end",
  },
  {
    title: "Horário de cada profissional",
    text: "Cada uma com seus dias e horários. A Lia só oferece o que realmente existe.",
    fragment: <HoursTable />,
    fragmentFirst: false,
    dock: "self-start",
  },
  {
    title: "Fala do seu jeito",
    text: "Você escreve as respostas e as regras. Ela segue em todas as conversas e nunca inventa preço nem horário.",
    fragment: <TeachCard />,
    fragmentFirst: true,
    dock: "self-start",
  },
];

export function Features() {
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className="section-y page-x">
      <div className="page-wrap">
        <Reveal as="h2" className="t-heading max-w-[12ch]">
          <span id="recursos-titulo">O que a Lia faz</span>
        </Reveal>
        <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
          {CELLS.map((cell, index) => (
            <Reveal key={cell.title} delay={(index % 3) * 90}>
              <article
                className={`lift flex flex-col justify-between gap-8 sm:min-h-[500px] overflow-hidden rounded-xl bg-surface p-6 ${
                  cell.fragmentFirst ? "lg:flex-col-reverse" : ""
                }`}
              >
                <div>
                  <h3 className="t-lead">{cell.title}</h3>
                  <p className="mt-2 text-muted sm:max-w-[34ch]">{cell.text}</p>
                </div>
                <div className={`${cell.dock} w-full ${cell.fragmentFirst ? "lg:-translate-y-6" : "lg:translate-y-6"} ${cell.dock === "self-end" ? "flex justify-end" : ""}`}>
                  {cell.fragment}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Você ensina: input half, output half ───────────────────────── */

const RULES = [
  {
    rule: "Sempre pergunte o nome antes de agendar.",
    ask: "Quero marcar um corte amanhã",
    answer: "Claro! Qual é o seu nome? Já deixo anotado e vejo os horários para você.",
  },
  {
    rule: "Nunca ofereça desconto.",
    ask: "Tem desconto para pagar no Pix?",
    answer: "Os valores são os da nossa tabela: corte feminino R$ 90. Quer que eu veja um horário para você?",
  },
  {
    rule: "Sempre termine com um beijo.",
    ask: "Qual o endereço?",
    answer: "Rua das Flores, 120, Centro. Te esperamos! Beijos, equipe do salão.",
  },
] as const;

export function Teach() {
  const [selected, setSelected] = useState(0);
  const current = RULES[selected]!;
  return (
    <section id="treinar" aria-labelledby="treinar-titulo" className="relative grid md:grid-cols-2">
      <h2
        id="treinar-titulo"
        className="t-heading pointer-events-none order-first px-[var(--pad)] pt-16 pb-8 text-ink md:absolute md:right-0 md:bottom-8 md:left-0 md:z-10 md:flex md:justify-between md:gap-6 md:p-0 md:px-[var(--pad)]"
      >
        <span className="md:text-white">Você ensina, </span>
        <span>ela segue.</span>
      </h2>
      <div className="bg-dark px-[var(--pad)] pt-14 pb-14 text-white md:pt-24 md:pb-36 lg:min-h-[600px]">
        <p className="t-small text-graphite-300">Você escreve a regra. Toque em uma:</p>
        <div className="mt-5 flex flex-col gap-2 md:max-w-[34ch]" role="radiogroup" aria-label="Regras da Lia">
          {RULES.map((item, index) => (
            <button
              key={item.rule}
              type="button"
              role="radio"
              aria-checked={selected === index}
              onClick={() => setSelected(index)}
              className={`press t-lead rounded-xl px-5 py-4 text-left ${
                selected === index ? "bg-accent text-white" : "bg-dark-2 text-graphite-300 hover:bg-graphite-800"
              }`}
            >
              {item.rule}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-brand-50 px-[var(--pad)] pt-14 pb-14 md:pt-24 md:pb-36 lg:min-h-[600px]">
        <p className="t-small text-muted">E a Lia responde assim, em todas as conversas:</p>
        <div data-ui className="mt-5 w-full max-w-[420px] space-y-2 rounded-[14px] bg-graphite-100 p-3 text-[15px] leading-snug text-ink" aria-live="polite">
          <div key={`a-${selected}`} className="pop ml-auto w-fit max-w-[86%] rounded-xl bg-brand-600 px-3.5 py-2.5 text-white">
            {current.ask}
          </div>
          <div key={`b-${selected}`} className="pop flex items-end gap-2" style={{ animationDelay: "250ms" }}>
            <LiaAvatar size={28} />
            <div className="w-fit max-w-[86%] rounded-xl bg-white px-3.5 py-2.5">{current.answer}</div>
          </div>
        </div>
        <p className="t-small mt-3 text-muted">Exemplo. Nas suas conversas, a Lia usa os seus serviços, preços e horários.</p>
      </div>
    </section>
  );
}

/* ───────────────────────── Para quem: banded rows ───────────────────────── */

const WHO = [
  { name: "Salões de beleza", line: "“Tem horário para escova hoje?”" },
  { name: "Barbearias", line: "“Quero cortar o cabelo e fazer a barba sábado.”" },
  { name: "Manicures e estúdios de unha", line: "“Pode ser às 15h com a Carla?”" },
  { name: "Estética e clínicas", line: "“Preciso remarcar minha sessão de quinta.”" },
  { name: "Consultórios e terapeutas", line: "“Qual o valor da primeira consulta?”" },
  { name: "Qualquer negócio com hora marcada", line: "“Vocês atendem aos domingos?”" },
];

export function ForWho() {
  return (
    <section id="para-quem" aria-labelledby="para-quem-titulo" className="section-y page-x">
      <div className="page-wrap">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal as="h2" className="t-heading">
            <span id="para-quem-titulo" className="block text-graphite-500">
              Feita para quem vive de
            </span>
            <span className="block">hora marcada.</span>
          </Reveal>
          <Reveal delay={90}>
            <Button href={whatsappUrl("Oi! Quero saber se a Lia serve para o meu negócio.")}>Fale com a gente</Button>
          </Reveal>
        </div>
        <ul className="mt-12 space-y-1 md:mt-16">
          {WHO.map((item, index) => (
            <Reveal key={item.name} as="li" delay={index * 50}>
              <div
                className={`flex min-h-[76px] flex-col justify-center gap-1 rounded-xl px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-8 ${
                  index % 2 === 0 ? "bg-surface" : "bg-surface-2"
                }`}
              >
                <span className="t-lead">{item.name}</span>
                <span className="text-muted md:text-right">{item.line}</span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────────────────── Perguntas: accordion of filled tiles ───────────────────────── */

const FAQ = [
  { q: "A Lia substitui a minha recepcionista?", a: "Não. Ela cuida do que se repete (horários, confirmações, lembretes e dúvidas comuns) e chama a sua equipe quando o assunto precisa de uma pessoa." },
  { q: "E se a Lia não souber responder?", a: "Ela não inventa. Avisa o cliente que vai chamar alguém, manda o pedido para a pessoa certa da sua equipe e fica em silêncio até ela assumir." },
  { q: "O cliente precisa instalar alguma coisa?", a: "Não. Ele conversa pelo WhatsApp normal. Você usa o painel pelo navegador, no computador ou no celular." },
  { q: "Eu consigo mudar o que a Lia fala?", a: "Sim. Você define o nome dela, o jeito de falar, os serviços, os preços, a tabela de preços e as respostas prontas, e escolhe o que ela deve sempre passar para uma pessoa." },
  { q: "Preciso de um número novo?", a: "Recomendamos um número só para a Lia. Ela responde as clientes por ele e o seu WhatsApp pessoal continua separado." },
  { q: "Ela funciona de madrugada e no fim de semana?", a: "Sim, responde na hora, a qualquer horário. Os lembretes de véspera só saem entre 8h e 21h, para não incomodar ninguém." },
  { q: "Como começo?", a: "Fale com a gente pelo WhatsApp. Conversamos sobre o seu negócio, configuramos a Lia com você e você testa antes de colocá-la para atender de verdade." },
];

export function Faq() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="section-y page-x pt-0 md:pt-0">
      <div className="page-wrap grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <h2 id="perguntas-titulo" className="t-heading self-start lg:sticky lg:top-24">
          Perguntas
        </h2>
        <div className="space-y-2">
          {FAQ.map(({ q, a }) => (
            <Reveal key={q}>
              <details name="faq" className="group rounded-xl bg-surface open:bg-accent open:text-white">
                <summary className="t-lead flex min-h-[72px] cursor-pointer items-center justify-between gap-4 px-6 py-4">
                  {q}
                  <span className="shrink-0" aria-hidden>
                    <Plus className="size-5 group-open:hidden" />
                    <Minus className="hidden size-5 group-open:block" />
                  </span>
                </summary>
                <p className="max-w-[56ch] px-6 pb-6 leading-relaxed">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Fecho: a sentence with a blank, and the quiet footer ───────────────────────── */

export function Closing({ appUrl, whatsappLabel }: { appUrl: string; whatsappLabel: string }) {
  const [business, setBusiness] = useState("");
  const href = whatsappUrl(`Oi! Tenho um negócio (${business.trim() || "com hora marcada"}) e quero conhecer a Lia.`);
  return (
    <footer id="contato" className="bg-dark text-white">
      <div className="page-x">
        <div className="page-wrap pt-24 md:pt-36">
          <form
            className="max-w-none"
            onSubmit={(event) => {
              event.preventDefault();
              window.open(href, "_blank", "noopener");
            }}
          >
            <h2 className="t-heading">
              <label htmlFor="negocio">Quero a Lia no meu</label>{" "}
              <input
                id="negocio"
                value={business}
                onChange={(event) => setBusiness(event.target.value)}
                placeholder="salão"
                maxLength={40}
                autoComplete="off"
                className="inline-block h-[1.15em] w-[5.5em] max-w-full rounded-xl bg-dark-2 px-[0.35em] align-baseline text-white placeholder:text-graphite-400"
              />.
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href={href} variant="primary">
                Chamar no WhatsApp
              </Button>
              <p className="t-small max-w-[34ch] text-graphite-300">Abre o WhatsApp com a sua mensagem pronta. Sem formulário e sem compromisso.</p>
            </div>
          </form>
        </div>
        <div className="page-wrap grid gap-3 pt-32 pb-8 text-[14px] md:grid-cols-[1fr_auto_1fr] md:items-center md:pt-48">
          <p className="text-graphite-300">Atendente de WhatsApp com IA</p>
          <nav aria-label="Rodapé" className="flex flex-wrap justify-between gap-x-6 gap-y-1 md:justify-start">
            <a href="#como-funciona" className="press hover:text-brand-300">Como funciona</a>
            <a href="#perguntas" className="press hover:text-brand-300">Perguntas</a>
            <a href={whatsappUrl()} className="press hover:text-brand-300">{whatsappLabel}</a>
            <a href={appUrl} className="press hover:text-brand-300">Entrar</a>
          </nav>
          <p className="text-right text-graphite-300">© {new Date().getFullYear()} Chama Lia · chamalia.com.br</p>
        </div>
      </div>
    </footer>
  );
}
