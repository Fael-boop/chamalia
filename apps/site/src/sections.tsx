import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  AgendaPair,
  ComboCard,
  HandoffNotice,
  HoursTable,
  LiaAvatar,
  ReminderMessage,
  StepBooked,
  StepOffers,
  StepWrites,
  Typing,
  bubble,
  customerBubble,
  liaBubble,
} from "./fragments";
import { Band, Button, Reveal, whatsappUrl } from "./ui";

/* ───────────────────────── Como funciona: the same request, minute by minute ───────────────────────── */

const STEPS: { time: string; title: string; text: string; piece: ReactNode; stage: string }[] = [
  {
    time: "23h42",
    title: "O cliente chama no WhatsApp.",
    text: "De madrugada, no domingo ou no meio do seu atendimento. Ele escreve do jeito dele e não precisa baixar nada.",
    piece: <StepWrites />,
    stage: "bg-brand-950",
  },
  {
    time: "23h43",
    title: "A Lia oferece os horários livres.",
    text: "Ela olha a agenda de cada profissional e só oferece o que existe de verdade. Nada de horário inventado.",
    piece: <StepOffers />,
    stage: "bg-brand-950",
  },
  {
    time: "23h44",
    title: "Marca na agenda e avisa você.",
    text: "Sem dupla reserva. O horário aparece no painel e você recebe o aviso no seu WhatsApp.",
    piece: <StepBooked />,
    stage: "bg-brand-950",
  },
  {
    time: "Na véspera",
    title: "Lembra o cliente.",
    text: "Quem não responde fica confirmado. Quem pede para remarcar, a Lia remarca na hora e libera o horário.",
    piece: <ReminderMessage />,
    stage: "bg-brand-950",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" >
      <Band className="section-y">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
          <Reveal as="h2" className="t-heading">
            <span id="como-funciona-titulo">Como funciona</span>
          </Reveal>
          <Reveal delay={80}>
            <p className="t-statement text-muted lg:max-w-[46ch]">
              Um pedido de verdade, do começo ao fim, em dois minutos. Você não precisou tocar no celular.
            </p>
          </Reveal>
        </div>
        <ol className="mt-14 space-y-4 md:mt-20">
          {STEPS.map((step, index) => (
            <li key={step.time} className="grid gap-4 lg:grid-cols-12">
              <Reveal className={`flex flex-col justify-center gap-4 py-2 lg:col-span-5 lg:pr-10 ${index % 2 ? "lg:order-2 lg:pl-10" : ""}`}>
                <p className="t-heading text-accent-text tabular-nums">{step.time}</p>
                <h3 className="t-lead">{step.title}</h3>
                <p className="max-w-[44ch] text-muted">{step.text}</p>
              </Reveal>
              <Reveal delay={100} className={`lg:col-span-7 ${index % 2 ? "lg:order-1" : ""}`}>
                <div className={`flex min-h-[340px] items-center justify-center rounded-xl p-6 md:min-h-[420px] md:p-12 ${step.stage}`}>
                  <div className="lift w-full max-w-[420px]">{step.piece}</div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Band>
    </section>
  );
}

/* ───────────────────────── O que a Lia faz: a calm grid of whole pieces ───────────────────────── */

function Feature({ title, text, children, className = "", delay = 0 }: { title: string; text: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={className}>
      <article className="flex h-full flex-col gap-6 rounded-xl bg-surface p-6 md:p-8">
        <div>
          <h3 className="t-lead">{title}</h3>
          <p className="mt-2 max-w-[44ch] text-muted">{text}</p>
        </div>
        <div className="mt-auto flex flex-1 items-center justify-center rounded-xl bg-brand-950 p-5 md:p-8">{children}</div>
      </article>
    </Reveal>
  );
}

export function Features() {
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" >
      <Band className="section-y">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
          <Reveal as="h2" className="t-heading">
            <span id="recursos-titulo">O que a Lia faz</span>
          </Reveal>
          <Reveal delay={80}>
            <p className="t-statement text-muted lg:max-w-[46ch]">Tudo o que uma boa recepcionista faz no WhatsApp, a qualquer hora, sem esquecer ninguém.</p>
          </Reveal>
        </div>
        <div className="mt-14 grid gap-4 md:mt-20 lg:grid-cols-12">
          <Feature className="lg:col-span-7" title="Agenda de cada profissional" text="Vê quem está livre e marca sem dupla reserva. Os espaços azuis são o que ela oferece.">
            <AgendaPair />
          </Feature>
          <Feature className="lg:col-span-5" delay={90} title="Lembra na véspera" text="Quem não responde fica confirmado. Quem responde 2, ela remarca na hora.">
            <ReminderMessage />
          </Feature>
          <Feature className="lg:col-span-4" title="Vários serviços de uma vez" text="Corte e escova no mesmo dia, um depois do outro, de preferência com a mesma pessoa.">
            <ComboCard />
          </Feature>
          <Feature className="lg:col-span-4" delay={90} title="Chama a pessoa certa" text="Química, orçamento ou dúvida fora do comum vão para a equipe. Ela espera o RESOLVIDO.">
            <HandoffNotice />
          </Feature>
          <Feature className="lg:col-span-4" delay={180} title="Horário de cada um" text="Cada profissional com seus dias e horários. Ela só oferece o que existe.">
            <HoursTable />
          </Feature>
        </div>
      </Band>
    </section>
  );
}

/* ───────────────────────── Você ensina: the panel on one side, the conversation on the other ───────────────────────── */

const RULES = [
  {
    kind: "Sempre",
    rule: "pergunte o nome antes de agendar",
    ask: "Quero marcar um corte amanhã",
    answer: "Claro! Qual é o seu nome? Já deixo anotado e vejo os horários para você.",
  },
  {
    kind: "Nunca",
    rule: "ofereça desconto",
    ask: "Tem desconto para pagar no Pix?",
    answer: "Os valores são os da nossa tabela: corte feminino R$ 90. Quer que eu veja um horário para você?",
  },
  {
    kind: "Sempre",
    rule: "termine com um beijo",
    ask: "Qual o endereço?",
    answer: "Rua das Flores, 120, Centro. Te esperamos! Beijos, equipe do salão.",
  },
] as const;

/** A slice of the panel's "Treinar a Lia" screen: pick a rule to see it work. */
function TeachPanel({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  return (
    <div data-ui className="w-full max-w-[460px] rounded-[14px] bg-graphite-900 p-5 text-[14px] text-white">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Treinar a Lia</p>
        <p className="text-graphite-300">5 de 8 passos</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-graphite-800">
        <div className="h-full w-[62%] rounded-full bg-brand-500" />
      </div>
      <p className="mt-6 font-semibold">Regras</p>
      <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Regras da Lia">
        {RULES.map((item, index) => (
          <button
            key={item.rule}
            type="button"
            role="radio"
            aria-checked={selected === index}
            onClick={() => onSelect(index)}
            className={`press flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left ${
              selected === index ? "bg-brand-600 text-white" : "bg-graphite-950 text-graphite-200 hover:bg-graphite-800"
            }`}
          >
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${selected === index ? "bg-white text-brand-600" : "bg-graphite-800"}`}>
              {selected === index && <Check className="size-3.5" aria-hidden />}
            </span>
            <span>
              <strong>{item.kind}</strong> {item.rule}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex gap-2" aria-hidden>
        <span className="rounded-lg bg-graphite-950 px-3 py-2.5 text-graphite-300">Nunca</span>
        <span className="flex-1 rounded-lg bg-graphite-950 px-3 py-2.5 text-graphite-400">fale de concorrentes…</span>
        <span className="rounded-lg bg-graphite-800 px-3 py-2.5 font-medium">Adicionar</span>
      </div>
    </div>
  );
}

function TeachChat({ selected }: { selected: number }) {
  const current = RULES[selected]!;
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    setTyping(true);
    const timer = setTimeout(() => setTyping(false), 900);
    return () => clearTimeout(timer);
  }, [selected]);
  return (
    <div data-ui className="flex min-h-[300px] w-full max-w-[420px] flex-col overflow-hidden rounded-[14px] bg-graphite-900 text-white" aria-live="polite">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <LiaAvatar size={36} />
        <p className="text-[14px] font-semibold">Lia</p>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2.5 px-4 pb-4">
        <div key={`a-${selected}`} className={`${bubble} ${customerBubble}`}>
          {current.ask}
        </div>
        {typing ? (
          <Typing />
        ) : (
          <div key={`b-${selected}`} className={`${bubble} ${liaBubble}`}>
            {current.answer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Teach() {
  const [selected, setSelected] = useState(0);
  return (
    <section id="treinar" aria-labelledby="treinar-titulo" >
      <Band className="section-y">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
          <Reveal as="h2" className="t-heading">
            <span id="treinar-titulo">Você ensina, ela segue.</span>
          </Reveal>
          <Reveal delay={80}>
            <p className="t-statement text-muted lg:max-w-[46ch]">
              Regras curtas e respostas prontas, escritas por você no painel. Toque numa regra e veja a resposta mudar.
            </p>
          </Reveal>
        </div>
        <Reveal delay={120} className="mt-14 md:mt-20">
          <div className="grid items-center gap-6 rounded-xl bg-brand-950 p-5 md:p-12 lg:grid-cols-2 lg:gap-12">
            <div className="flex justify-center lg:justify-end">
              <TeachPanel selected={selected} onSelect={setSelected} />
            </div>
            <div className="flex justify-center lg:justify-start">
              <TeachChat selected={selected} />
            </div>
          </div>
        </Reveal>
        <p className="t-small mt-4 text-muted">Exemplo. Nas suas conversas, a Lia usa os seus serviços, preços e horários.</p>
      </Band>
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
    <section id="para-quem" aria-labelledby="para-quem-titulo" >
      <Band className="section-y">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal as="h2" className="t-heading">
            <span id="para-quem-titulo" className="block text-graphite-400">
              Para quem vive de
            </span>
            <span className="block">hora marcada.</span>
          </Reveal>
          <Reveal delay={90}>
            <Button href={whatsappUrl("Oi! Quero saber se a Lia serve para a minha empresa.")}>Fale com a gente</Button>
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
      </Band>
    </section>
  );
}

/* ───────────────────────── Perguntas: accordion of filled tiles ───────────────────────── */

const FAQ = [
  { q: "A Lia substitui a minha recepcionista?", a: "Não. Ela cuida do que se repete (horários, confirmações, lembretes e dúvidas comuns) e chama a sua equipe quando o assunto precisa de uma pessoa." },
  { q: "E se a Lia não souber responder?", a: "Ela não inventa. Avisa o cliente que vai chamar alguém, manda o pedido para a pessoa certa da sua equipe e fica em silêncio até ela assumir." },
  { q: "O cliente precisa instalar alguma coisa?", a: "Não. Ele conversa pelo WhatsApp normal. Você usa o painel pelo navegador, no computador ou no celular." },
  { q: "Eu consigo mudar o que a Lia fala?", a: "Sim. Você define o nome dela, o jeito de falar, os serviços, os preços, a tabela de preços e as respostas prontas, e escolhe o que ela deve sempre passar para uma pessoa." },
  { q: "Preciso de um número novo?", a: "Recomendamos um número só para a Lia. Ela responde os clientes por ele e o seu WhatsApp pessoal continua separado." },
  { q: "Ela funciona de madrugada e no fim de semana?", a: "Sim, responde na hora, a qualquer horário. Os lembretes de véspera só saem entre 8h e 21h, para não incomodar ninguém." },
  { q: "Como começo?", a: "Fale com a gente pelo WhatsApp. Conversamos sobre a sua empresa, configuramos a Lia com você e você testa antes de colocá-la para atender de verdade." },
];

export function Faq() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo">
      <Band className="section-y grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
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
      </Band>
    </section>
  );
}

/* ───────────────────────── Fecho: a sentence with a blank, then the quiet footer ───────────────────────── */

export function Closing({ appUrl, whatsappLabel }: { appUrl: string; whatsappLabel: string }) {
  const [business, setBusiness] = useState("");
  const href = whatsappUrl(`Oi! Quero a Lia na minha empresa${business.trim() ? ` (${business.trim()})` : ""}.`);
  return (
    <>
      <section id="contato" aria-labelledby="contato-titulo">
        <Band className="py-10 md:py-16">
        <div className="rounded-xl bg-accent px-6 py-16 text-white md:px-14 md:py-24">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              window.open(href, "_blank", "noopener");
            }}
          >
            <h2 id="contato-titulo" className="t-heading">
              <label htmlFor="negocio">Quero a Lia na minha</label>{" "}
              <input
                id="negocio"
                value={business}
                onChange={(event) => setBusiness(event.target.value)}
                placeholder="empresa"
                maxLength={40}
                autoComplete="off"
                className="inline-block h-[1.15em] w-[5.5em] max-w-full rounded-xl bg-brand-700 px-[0.35em] align-baseline text-white placeholder:text-brand-200"
              />
              .
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href={href} variant="light">
                Chamar no WhatsApp
              </Button>
              <p className="t-small max-w-[34ch] text-brand-100">Abre o WhatsApp com a sua mensagem pronta. Sem formulário e sem compromisso.</p>
            </div>
          </form>
        </div>
        </Band>
      </section>
      <footer>
        <Band className="grid gap-3 py-8 text-[14px] md:grid-cols-[1fr_auto_1fr] md:items-center">
          <p className="text-muted">Atendente de WhatsApp com IA</p>
          <nav aria-label="Rodapé" className="flex flex-wrap justify-between gap-x-6 gap-y-1 md:justify-start">
            <a href="#como-funciona" className="press hover:text-accent-text">Como funciona</a>
            <a href="#perguntas" className="press hover:text-accent-text">Perguntas</a>
            <a href={whatsappUrl()} className="press hover:text-accent-text">{whatsappLabel}</a>
            <a href={appUrl} className="press hover:text-accent-text">Entrar</a>
            <a href="/termos/" className="press hover:text-accent-text">Termos</a>
            <a href="/privacidade/" className="press hover:text-accent-text">Privacidade</a>
          </nav>
          <p className="text-right text-muted">© {new Date().getFullYear()} Chama Lia · chamalia.com.br</p>
        </Band>
      </footer>
    </>
  );
}
