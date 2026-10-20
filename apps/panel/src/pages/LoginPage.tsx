import { Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import { Logo, LogoMark, Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Staggered entrance for the demo conversation (reduced-motion users get it instantly). */
const appear = (delayMs: number) => ({ animationDelay: `${delayMs}ms`, animationFillMode: "both" as const });
const ENTER = "animate-in fade-in-0 slide-in-from-bottom-2 duration-300";

/** A short, real-looking exchange: shows what the product does without any decoration. */
function ConversationPreview() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5" aria-hidden>
      <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
        <LogoMark size={36} />
        <div>
          <div className="text-sm font-medium text-white">Lia</div>
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <span className="size-1.5 rounded-full bg-brand-500" /> atendendo agora
          </div>
        </div>
      </div>
      <div className="space-y-2.5 text-[13px] leading-snug">
        <div className={cn("ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white", ENTER)} style={appear(300)}>
          Oi! Quero marcar uma unha amanhã
        </div>
        <div className={cn("w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90", ENTER)} style={appear(900)}>
          Tenho às 9h30, 10h ou 14h com a Carla. Qual prefere?
        </div>
        <div className={cn("ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white", ENTER)} style={appear(1500)}>
          10h, por favor
        </div>
        <div className={cn("flex w-fit items-center gap-2 rounded-xl border border-white/15 px-3.5 py-2 text-white", ENTER)} style={appear(2100)}>
          <Check className="size-4 text-brand-400" />
          <span>
            Agendado · <span className="text-white/70">amanhã às 10h · Unha com a Carla</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function LoginPage({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body: { login, password } });
      onLoggedIn(result.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <aside className="hidden flex-col justify-between gap-10 border-r border-white/10 bg-sidebar p-12 text-sidebar-foreground lg:flex xl:p-16">
        <Logo size={56} onDark textClassName="text-3xl" className="gap-4" />

        <div className="space-y-10">
          <div className="max-w-xl space-y-5">
            <h2 className="text-4xl leading-[1.08] font-semibold tracking-tight text-white xl:text-5xl">
              Sua atendente no WhatsApp, <span className="text-brand-400">sempre disponível.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-white/70">
              Agenda, confirma e lembra seus clientes. Você só entra na conversa quando precisa.
            </p>
          </div>
          <ConversationPreview />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span>chamalia.com.br</span>
          <span className="text-white/40">Atendimento no WhatsApp</span>
        </div>
      </aside>

      <main className="relative flex items-center justify-center bg-background p-6">
        <form onSubmit={submit} className="w-full max-w-sm animate-in space-y-6 fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col items-center gap-3 pb-2 lg:hidden">
            <LogoMark size={64} />
            <Wordmark className="text-2xl" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Acesse sua conta</h1>
            <p className="text-sm text-muted-foreground">Entre com o usuário e a senha que você recebeu.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login">Usuário</Label>
            <Input
              id="login"
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              className="h-11"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="h-11 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Esconder a senha" : "Mostrar a senha"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy || !login || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Esqueceu a senha? Fale com a Chama Lia: chamalia.com.br</p>
        </form>
      </main>
    </div>
  );
}
