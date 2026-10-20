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
  Receipt,
  Smartphone,
  UserRoundCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setToken, setUnauthorizedHandler, type SessionInfo } from "./api";
import { AppShell, type NavItem } from "./components/app-shell";
import { LogoMark } from "./components/logo";
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
import { LoginPage } from "./pages/LoginPage";
import { MorePage } from "./pages/MorePage";
import { PriceTablePage } from "./pages/PriceTablePage";
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
    { id: "prices", label: "Tabela de preços", icon: Receipt },
    { id: "handoff", label: "Passar para a equipe", icon: UserRoundCheck },
    { id: "settings", label: "Configurações", icon: Settings },
    { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
    { id: "test-chat", label: `Testar a ${t.assistantName}`, icon: MessagesSquare },
    ...(role === "admin" ? [{ id: "access", label: "Acesso da dona", icon: KeyRound }] : []),
  ];
  const back: NavItem[] = onBackToBusinesses ? [{ id: "businesses", label: "Todos os negócios", icon: Building2 }] : [];
  const more: NavItem = { id: "more", label: "Mais", icon: Ellipsis };

  const navigate = (id: string) => {
    if (id === "businesses") onBackToBusinesses?.();
    else setPage(id);
  };

  return (
    <AppShell
      brand={BRAND}
      context={t.name}
      items={[...back, ...main, ...secondary]}
      mobileItems={[...main, more]}
      current={page}
      onNavigate={navigate}
      onLogout={onLogout}
      onBack={onBackToBusinesses}
    >
      {page === "agenda" && <AgendaPage tenant={t} />}
      {page === "customers" && <CustomersPage tenant={t} />}
      {page === "services" && <ServicesPage tenant={t} />}
      {page === "professionals" && <ProfessionalsPage tenant={t} />}
      {page === "hours" && <HoursPage tenant={t} />}
      {page === "faq" && <FaqPage tenant={t} />}
      {page === "prices" && <PriceTablePage tenant={t} />}
      {page === "handoff" && <HandoffPage tenant={t} />}
      {page === "settings" && <SettingsPage tenant={t} role={role} />}
      {page === "test-chat" && <TestChatPage tenant={t} />}
      {page === "whatsapp" && <WhatsAppPage tenant={t} />}
      {page === "access" && role === "admin" && <AccessPage tenant={t} />}
      {page === "more" && <MorePage items={mobile ? [...secondary, ...back] : secondary} onNavigate={navigate} onLogout={onLogout} />}
    </AppShell>
  );
}

function SplashSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-60 bg-sidebar p-5 md:block">
        <LogoMark size={30} className="animate-pulse" />
      </div>
      <div className="flex-1 space-y-4 p-6 md:p-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
