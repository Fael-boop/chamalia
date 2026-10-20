import {
  Bell,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Layers,
  MessageCircle,
  Smartphone,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

/** Where "Entrar" goes: the panel. Override with VITE_APP_URL (e.g. http://localhost:5173 in dev). */
const APP_URL = import.meta.env.VITE_APP_URL ?? "https://app.chamalia.com.br";
const WHATSAPP_NUMBER = "5562993621633";
const WHATSAPP_LABEL = "(62) 99362-1633";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Quero saber mais sobre a Chama Lia.")}`;

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className="shrink-0" role="img" aria-label="Chama Lia">
      <rect width="512" height="512" rx="112" fill="var(--graphite-950)" />
      <rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
      <rect x="176" y="136" width="56" height="240" rx="8" fill="#ffffff" />
      <rect x="176" y="320" width="168" height="56" rx="8" fill="#ffffff" />
      <circle cx="340" cy="180" r="36" fill="var(--brand-500)" />
    </svg>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight whitespace-nowrap ${className}`}>
      Chama <span className="text-primary">Lia</span>
    </span>
  );
}

function Button({ href, variant = "primary", children, className = "" }: { href: string; variant?: "primary" | "outline"; children: ReactNode; className?: string }) {
  const styles =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-hover"
      : "border border-border text-foreground hover:bg-muted";
  return (
    <a
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-colors active:scale-[0.98] ${styles} ${className}`}
    >
      {children}
    </a>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <a href="#topo" className="flex items-center gap-2.5" aria-label="Chama Lia, início">
          <LogoMark size={32} />
          <Wordmark className="text-lg" />
        </a>
        <nav className="ml-4 hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Seções">
          <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
          <a href="#recursos" className="transition-colors hover:text-foreground">O que a Lia faz</a>
          <a href="#para-quem" className="transition-colors hover:text-foreground">Para quem</a>
          <a href="#perguntas" className="transition-colors hover:text-foreground">Perguntas</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button href={APP_URL} variant="outline" className="h-10 px-4 text-sm">Entrar</Button>
          <span className="hidden sm:block">
            <Button href={WHATSAPP_URL} className="h-10 px-4 text-sm">Fale com a gente</Button>
          </span>
        </div>
      </div>
    </header>
  );
}

const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

/** A short, real-looking exchange: shows what the product does. */
function Conversation() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-muted p-5" aria-label="Exemplo de conversa com a Lia">
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
        <LogoMark size={36} />
        <div>
          <div className="text-sm font-medium">Lia</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand-500" /> atendendo agora
          </div>
        </div>
      </div>
      <div className="space-y-2.5 text-[13px] leading-snug">
        <div className="rise ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white" style={delay(300)}>
          Oi! Quero marcar um corte de cabelo amanhã
        </div>
        <div className="rise w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-background px-3.5 py-2" style={delay(900)}>
          Tenho às 9h30, 10h ou 14h com a Ana. Qual prefere?
        </div>
        <div className="rise ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white" style={delay(1500)}>
          10h, por favor
        </div>
        <div className="rise flex w-fit items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2" style={delay(2100)}>
          <Check className="size-4 text-primary" />
          <span>
            Agendado · <span className="text-muted-foreground">amanhã às 10h · Corte com a Ana</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="topo" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-7">
        <p className="text-sm font-medium text-primary">Para salões, barbearias e negócios com hora marcada</p>
        <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Sua atendente no WhatsApp, <span className="text-primary">sempre disponível.</span>
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
          A Lia responde seus clientes, marca o horário, confirma e lembra na véspera. Você acompanha a agenda e só entra na conversa quando
          precisa.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button href={WHATSAPP_URL}>
            <MessageCircle className="size-4" /> Fale com a gente
          </Button>
          <Button href="#como-funciona" variant="outline">Ver como funciona</Button>
        </div>
      </div>
      <div className="flex justify-center lg:justify-end">
        <Conversation />
      </div>
    </section>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="mb-10 max-w-2xl space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          {intro && <p className="text-lg leading-relaxed text-muted-foreground">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

const STEPS = [
  { title: "O cliente chama no WhatsApp", text: "Ele escreve do jeito dele, a qualquer hora: de madrugada, no fim de semana, no meio do atendimento." },
  { title: "A Lia agenda, confirma e lembra", text: "Ela oferece os horários livres, marca na agenda e avisa o cliente na véspera. Se ele não puder ir, ela remarca." },
  { title: "Você acompanha e assume quando quiser", text: "Tudo aparece na agenda. Quando a conversa precisa de uma pessoa, a Lia chama a recepção ou a profissional certa." },
];

function HowItWorks() {
  return (
    <Section id="como-funciona" title="Como funciona" intro="Em três passos, sem o cliente baixar nada e sem você parar o atendimento para responder mensagem.">
      <ol className="grid gap-8 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="space-y-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-border text-sm font-semibold text-primary">{index + 1}</span>
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarCheck, title: "Agenda sozinha", text: "Mostra os horários livres de cada profissional e marca sem dupla reserva." },
  { icon: Bell, title: "Lembra na véspera", text: "Manda o lembrete e, se o cliente não puder ir, remarca na hora." },
  { icon: Layers, title: "Vários serviços de uma vez", text: "Corte e escova, unha e hidratação: a Lia encaixa um depois do outro, de preferência com a mesma profissional." },
  { icon: UserRoundCheck, title: "Chama a pessoa certa", text: "Dúvidas, casos especiais e pedidos fora do comum vão para a recepção ou para a profissional que você escolher." },
  { icon: Clock, title: "Horários de cada profissional", text: "Cada uma com seus dias e horários, e a Lia só oferece o que realmente existe." },
  { icon: Smartphone, title: "Painel no computador e no celular", text: "Agenda, clientes, serviços, tabela de preços e respostas prontas, tudo à mão e do seu jeito." },
];

function Features() {
  return (
    <Section id="recursos" title="O que a Lia faz" intro="Ela aprende o seu negócio: serviços, preços, horários, tom de voz e as respostas que você mais repete.">
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="space-y-2.5">
            <Icon className="size-5 text-primary" />
            <h3 className="font-semibold">{title}</h3>
            <p className="leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ForWho() {
  return (
    <Section id="para-quem" title="Para quem é" intro="Feita primeiro para salões e barbearias, e serve para qualquer negócio ou profissional que vive de hora marcada.">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-semibold">Principal</h3>
          <ul className="space-y-2 text-muted-foreground">
            {["Salões de beleza", "Barbearias", "Manicures e estúdios de unha"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="size-4 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="font-semibold">E também</h3>
          <ul className="space-y-2 text-muted-foreground">
            {["Estética e clínicas", "Consultórios e terapeutas", "Qualquer pessoa que queira ter um agente de agendamento"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="size-4 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Contact() {
  return (
    <section id="contato" className="border-t border-border bg-muted">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between md:py-20">
        <div className="max-w-xl space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight">Vamos conversar?</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Cada negócio é diferente. Fale com a gente, conte como você atende hoje e receba uma proposta sob medida.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button href={WHATSAPP_URL}>
            <MessageCircle className="size-4" /> Fale com a gente
          </Button>
          <span className="text-center text-sm text-muted-foreground">WhatsApp {WHATSAPP_LABEL}</span>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  { q: "A Lia substitui a minha recepcionista?", a: "Não. Ela cuida do que se repete (horários, confirmações, lembretes e dúvidas comuns) e chama a sua equipe quando o assunto precisa de uma pessoa." },
  { q: "E se a Lia não souber responder?", a: "Ela não inventa. Avisa o cliente que vai chamar alguém, manda o pedido para a pessoa certa da sua equipe e fica em silêncio até ela assumir." },
  { q: "O cliente precisa instalar alguma coisa?", a: "Não. Ele conversa pelo WhatsApp normal. Você usa o painel pelo navegador, no computador ou no celular." },
  { q: "Eu consigo mudar o que a Lia fala?", a: "Sim. Você define o nome dela, o jeito de falar, os serviços, os preços, a tabela de preços e as respostas prontas, e escolhe o que ela deve sempre passar para uma pessoa." },
  { q: "Como começo?", a: "Fale com a gente pelo WhatsApp. Conversamos sobre o seu negócio, configuramos a Lia com você e você testa antes de colocá-la para atender de verdade." },
];

function Faq() {
  return (
    <Section id="perguntas" title="Perguntas frequentes">
      <div className="max-w-3xl divide-y divide-border border-y border-border">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group py-5">
            <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-medium">
              {q}
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={24} />
          <Wordmark className="text-foreground" />
          <span>· chamalia.com.br</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <a href={WHATSAPP_URL} className="transition-colors hover:text-foreground">WhatsApp {WHATSAPP_LABEL}</a>
          <a href={APP_URL} className="transition-colors hover:text-foreground">Entrar</a>
          <span>© {new Date().getFullYear()} Chama Lia</span>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <ForWho />
        <Contact />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
