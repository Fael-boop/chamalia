import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Clock,
  Ellipsis,
  KeyRound,
  MessagesSquare,
  Scissors,
  Settings,
  MessageSquareText,
  Smartphone,
  UserRoundCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setToken, setUnauthorizedHandler, type SessionInfo } from "./api";
import { AppShell, type NavItem } from "./components/app-shell";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Skeleton } from "./components/ui/skeleton";
import { useIsMobile } from "./hooks/use-mobile";
import { useTenant } from "./lib/queries";
import { AccessPage } from "./pages/AccessPage";
import { AgendaPage } from "./pages/agenda/AgendaPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { FaqPage } from "./pages/FaqPage";
import { HandoffPage } from "./pages/HandoffPage";
import { HoursPage } from "./pages/HoursPage";
import { MorePage } from "./pages/MorePage";
import { ProfessionalsPage } from "./pages/ProfessionalsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TestChatPage } from "./pages/TestChatPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";

const BRAND = "Chama Lia";

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">("checking");

  const checkSession = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>("/session"));
      setAuthState("ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthState("login");
      else throw e;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState("login"));
    void checkSession();
  }, [checkSession]);

  const logout = () => {
    setToken("");
    setSession(null);
    queryClient.clear();
    setAuthState("login");
  };

  if (authState === "login") {
    return (
      <LoginPage
        onLoggedIn={(token) => {
          setToken(token);
          setAuthState("checking");
          void checkSession();
        }}
      />
    );
  }
  if (authState === "checking" || !session) return <SplashSkeleton />;

  return session.role === "owner" ? (
    <BusinessWorkspace tenantId={session.tenantId} role="owner" onLogout={logout} />
  ) : (
    <AgencyApp onLogout={logout} />
  );
}

function AgencyApp({ onLogout }: { onLogout: () => void }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const mobile = useIsMobile();
  const [page, setPage] = useState("businesses");

  useEffect(() => {
    document.title = BRAND;
  }, [tenantId]);

  if (tenantId) {
    return <BusinessWorkspace tenantId={tenantId} role="admin" onLogout={onLogout} onBackToBusinesses={() => setTenantId(null)} />;
  }

  const items: NavItem[] = [{ id: "businesses", label: "Negócios", icon: Building2 }];
  return (
    <AppShell
      brand={BRAND}
      context="Painel da agência"
      items={items}
      mobileItems={[...items, { id: "more", label: "Mais", icon: Ellipsis }]}
      current={page}
      onNavigate={setPage}
      onLogout={onLogout}
    >
      {page === "more" && mobile ? (
        <MorePage items={items} onNavigate={setPage} onLogout={onLogout} />
      ) : (
        <BusinessesPage onOpen={setTenantId} />
      )}
    </AppShell>
  );
}

/** One business: what the owner sees, plus WhatsApp and access for the agency. */
function BusinessWorkspace({
  tenantId,
  role,
  onLogout,
  onBackToBusinesses,
}: {
  tenantId: string;
  role: "admin" | "owner";
  onLogout: () => void;
  onBackToBusinesses?: () => void;
}) {
  const mobile = useIsMobile();
  const tenant = useTenant(tenantId);
  const [page, setPage] = useState("agenda");

  useEffect(() => {
    if (tenant.data) document.title = role === "owner" ? tenant.data.name : `${tenant.data.name} · ${BRAND}`;
  }, [tenant.data, role]);

  if (tenant.isLoading || !tenant.data) return <SplashSkeleton />;
  const t = tenant.data;

  const main: NavItem[] = [
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "services", label: "Serviços", icon: Scissors },
  ];
  const secondary: NavItem[] = [
    { id: "professionals", label: "Profissionais", icon: UsersRound },
    { id: "hours", label: "Horários", icon: Clock },
    { id: "faq", label: "Respostas prontas", icon: MessageSquareText },
    { id: "handoff", label: "Passar para a equipe", icon: UserRoundCheck },
    { id: "settings", label: "Configurações", icon: Settings },
    { id: "test-chat", label: `Testar a ${t.assistantName}`, icon: MessagesSquare },
    ...(role === "admin"
      ? [
          { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
          { id: "access", label: "Acesso da dona", icon: KeyRound },
        ]
      : []),
  ];
  const back: NavItem[] = onBackToBusinesses ? [{ id: "businesses", label: "Todos os negócios", icon: Building2 }] : [];
  const more: NavItem = { id: "more", label: "Mais", icon: Ellipsis };

  const navigate = (id: string) => {
    if (id === "businesses") onBackToBusinesses?.();
    else setPage(id);
  };

  return (
    <AppShell
      brand={role === "owner" ? t.name : BRAND}
      context={role === "admin" ? t.name : undefined}
      items={[...back, ...main, ...secondary]}
      mobileItems={[...main, more]}
      current={page}
      onNavigate={navigate}
      onLogout={onLogout}
    >
      {page === "agenda" && <AgendaPage tenant={t} />}
      {page === "customers" && <CustomersPage tenant={t} />}
      {page === "services" && <ServicesPage tenant={t} />}
      {page === "professionals" && <ProfessionalsPage tenant={t} />}
      {page === "hours" && <HoursPage tenant={t} />}
      {page === "faq" && <FaqPage tenant={t} />}
      {page === "handoff" && <HandoffPage tenant={t} />}
      {page === "settings" && <SettingsPage tenant={t} role={role} />}
      {page === "test-chat" && <TestChatPage tenant={t} />}
      {page === "whatsapp" && role === "admin" && <WhatsAppPage tenant={t} />}
      {page === "access" && role === "admin" && <AccessPage tenant={t} />}
      {page === "more" && <MorePage items={mobile ? [...secondary, ...back] : secondary} onNavigate={navigate} onLogout={onLogout} />}
    </AppShell>
  );
}

function SplashSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-60 bg-sidebar md:block" />
      <div className="flex-1 space-y-4 p-6 md:p-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

function LoginPage({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-sm animate-in fade-in-0 zoom-in-[0.98] duration-200">
        <div>
          <h1 className="text-lg font-semibold">Entrar</h1>
          <p className="mt-1 text-xs text-muted-foreground">Use o usuário e a senha que você recebeu.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="login">Usuário</Label>
          <Input id="login" autoFocus autoCapitalize="none" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !login || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
