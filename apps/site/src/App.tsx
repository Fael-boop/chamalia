import { Hero } from "./hero";
import { Closing, Faq, Features, ForWho, HowItWorks, Teach } from "./sections";
import { APP_URL, Button, LogoMark, Wordmark, WHATSAPP_LABEL, whatsappUrl } from "./ui";

/** A plain bar: the mark, a few links, one action. No lines, no blur. */
function Header() {
  return (
    <header className="page-x">
      <div className="page-wrap flex h-20 items-center gap-6">
        <a href="#topo" className="flex items-center gap-2.5" aria-label="Chama Lia, início">
          <LogoMark size={36} />
          <Wordmark className="text-xl" />
        </a>
        <nav className="ml-6 hidden items-center gap-7 text-[14px] text-muted lg:flex" aria-label="Seções">
          <a href="#como-funciona" className="press hover:text-ink">Como funciona</a>
          <a href="#recursos" className="press hover:text-ink">O que a Lia faz</a>
          <a href="#para-quem" className="press hover:text-ink">Para quem</a>
          <a href="#perguntas" className="press hover:text-ink">Perguntas</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href={APP_URL} className="press flex h-10 items-center rounded-xl text-[14px] font-medium hover:bg-surface-2 sm:px-4">
            Entrar
          </a>
          <span className="hidden sm:block">
            <Button href={whatsappUrl()} className="h-10 px-4 text-[14px]">
              Fale com a gente
            </Button>
          </span>
        </div>
      </div>
    </header>
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
        <Teach />
        <ForWho />
        <Faq />
      </main>
      <Closing appUrl={APP_URL} whatsappLabel={WHATSAPP_LABEL} />
    </>
  );
}
