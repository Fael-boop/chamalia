import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Logo, LogoMark, Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Staggered entrance for the demo conversation (reduced-motion users get it instantly). */
const appear = (delayMs: number) => ({ animationDelay: `${delayMs}ms`, animationFillMode: "both" as const });
const ENTER = "animate-in fade-in-0 slide-in-from-bottom-2 duration-300";

const REMEMBER_KEY = "chamalia.remember";
const LAST_LOGIN_KEY = "chamalia.lastLogin";
const SUPPORT_URL = `https://wa.me/556294737276?text=${encodeURIComponent("Oi! Esqueci a senha do painel da Chama Lia.")}`;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice just is not remembered.
  }
};

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
          Oi! Quero marcar um corte de cabelo amanhã
        </div>
        <div className={cn("w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-white/90", ENTER)} style={appear(900)}>
          Tenho às 9h30, 10h ou 14h com a Ana. Qual prefere?
        </div>
        <div className={cn("ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white", ENTER)} style={appear(1500)}>
          10h, por favor
        </div>
        <div className={cn("flex w-fit items-center gap-2 rounded-xl border border-white/15 px-3.5 py-2 text-white", ENTER)} style={appear(2100)}>
          <Check className="size-4 text-brand-400" />
          <span>
            Agendado · <span className="text-white/70">amanhã às 10h · Corte com a Ana</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function LoginPage({ onLoggedIn }: { onLoggedIn: (token: string, remember: boolean) => void }) {
  const [remember, setRemember] = useState(() => read(REMEMBER_KEY) !== "0");
  const [login, setLogin] = useState(() => (remember ? (read(LAST_LOGIN_KEY) ?? "") : ""));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // The button stays enabled; an empty field is explained and focused instead.
    if (!login.trim() || !password) {
      setError(!login.trim() ? "Digite o seu usuário." : "Digite a sua senha.");
      (!login.trim() ? loginRef : passwordRef).current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body: { login, password, remember } });
      write(REMEMBER_KEY, remember ? "1" : "0");
      write(LAST_LOGIN_KEY, remember ? login.trim().toLowerCase() : null);
      onLoggedIn(result.token, remember);
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  // Caps Lock is read from any key or click on the page, so the warning is right before the password is typed.
  useEffect(() => {
    const track = (e: KeyboardEvent | MouseEvent) => {
      if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));
    };
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    window.addEventListener("mousedown", track);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
      window.removeEventListener("mousedown", track);
    };
  }, []);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <aside className="hidden flex-col justify-between gap-10 border-r border-white/10 bg-sidebar p-12 text-sidebar-foreground lg:flex xl:p-16">
        <Logo size={56} onDark textClassName="text-3xl" className="gap-4" />

        <div className="space-y-10">
          <div className="max-w-xl space-y-5">
            <p className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-white xl:text-5xl">
              Sua atendente no WhatsApp, <span className="text-brand-400">sempre disponível.</span>
            </p>
            <p className="max-w-md text-base leading-relaxed text-white/70">
              Agenda, confirma e lembra seus clientes. Você só entra na conversa quando precisa.
            </p>
          </div>
          <ConversationPreview />
        </div>

        <div className="flex items-center justify-between text-sm">
          <a href="https://chamalia.com.br" className="transition-colors hover:text-white">
            chamalia.com.br
          </a>
          <span className="text-white/40">Atendimento no WhatsApp</span>
        </div>
      </aside>

      <main className="relative flex items-center justify-center bg-background p-6">
        <form noValidate onSubmit={submit} className="w-full max-w-sm animate-in space-y-6 fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col items-center gap-3 pb-2 lg:hidden">
            <LogoMark size={64} />
            <Wordmark className="text-2xl" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Acesse sua conta</h1>
            <p className="text-sm text-muted-foreground">Entre com o usuário e a senha que você recebeu.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login">Usuário</Label>
            <Input
              ref={loginRef}
              id="login"
              name="username"
              autoFocus={!login}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
              className="h-11"
              value={login}
              aria-invalid={error === "Digite o seu usuário." || undefined}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoFocus={Boolean(login)}
                autoComplete="current-password"
                className="h-11 pr-11"
                value={password}
                aria-describedby={capsLock ? "caps-lock" : undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Esconder a senha" : "Mostrar a senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            {capsLock && (
              <p id="caps-lock" className="text-xs font-medium text-amber-500" aria-live="polite">
                Caps Lock está ligado.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="remember" checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
            <Label htmlFor="remember" className="cursor-pointer font-normal">
              Lembrar de mim
            </Label>
          </div>
          <div aria-live="polite">
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Esqueceu a senha?{" "}
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
              Fale com a gente no WhatsApp
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}
