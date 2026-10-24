import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Clock,
  CreditCard,
  GraduationCap,
  Ellipsis,
  KeyRound,
  MessagesSquare,
  Scissors,
  Settings,
  Tags,
  MessageSquareText,
  Receipt,
  Smartphone,
  UserRoundCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setExpiredHandler, setToken, setUnauthorizedHandler, type SessionInfo } from "./api";
import { useSubscription } from "./lib/billing";
import { AppShell, type NavItem } from "./components/app-shell";
import { LogoMark } from "./components/logo";
import { Skeleton } from "./components/ui/skeleton";
import { useIsMobile } from "./hooks/use-mobile";
import { useTenant } from "./lib/queries";
import { AccessPage } from "./pages/AccessPage";
import { AgendaAlerts } from "@/components/agenda-alerts";
import { AgendaPage } from "./pages/agenda/AgendaPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { FaqPage } from "./pages/FaqPage";
import { HandoffPage } from "./pages/HandoffPage";
import { HoursPage } from "./pages/HoursPage";
import { LoginPage } from "./pages/LoginPage";
import { MorePage } from "./pages/MorePage";
import { NichesPage } from "./pages/NichesPage";
import { PaymentPage } from "./pages/PaymentPage";
import { PlansPage } from "./pages/PlansPage";
import { PriceTablePage } from "./pages/PriceTablePage";
import { ProfessionalsPage } from "./pages/ProfessionalsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TestChatPage } from "./pages/TestChatPage";
import { TrainPage } from "./pages/TrainPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";

const BRAND = "Chama Lia";
/** Screens of the WhatsApp assistant, hidden on the "Agenda Online" plan. */
const ASSISTANT_PAGES = new Set(["faq", "prices", "handoff", "train", "whatsapp", "test-chat"]);

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
    // Expired while the panel is open: re-reading the subscription shows the payment page.
    setExpiredHandler(() => void queryClient.invalidateQueries({ queryKey: ["subscription"] }));
    void checkSession();
  }, [checkSession, queryClient]);

  const logout = () => {
    setToken("");
    setSession(null);
    queryClient.clear();
    setAuthState("login");
  };

  if (authState === "login") {
    return (
      <LoginPage
        onLoggedIn={(token, remember) => {
          setToken(token, remember);
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

  const items: NavItem[] = [
    { id: "businesses", label: "Negócios", icon: Building2 },
    { id: "plans", label: "Planos", icon: CreditCard },
    { id: "niches", label: "Nichos", icon: Tags },
  ];
  return (
    <AppShell
      brand={BRAND}
      context="Agência"
      contextLabel="Painel"
      items={items}
      mobileItems={[...items, { id: "more", label: "Mais", icon: Ellipsis }]}
      current={page}
      onNavigate={setPage}
      onLogout={onLogout}
    >
      {page === "more" && mobile ? (
        <MorePage items={items} onNavigate={setPage} onLogout={onLogout} />
      ) : page === "niches" ? (
        <NichesPage />
      ) : page === "plans" ? (
        <PlansPage onOpenBusiness={setTenantId} />
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
  const subscription = useSubscription(tenantId);
  const blocked = role === "owner" && subscription.data?.expired === true;
  const tenant = useTenant(tenantId, !blocked);
  const [page, setPage] = useState("agenda");
  // Set by an agenda alert's "Ver": the agenda opens on that day.
  const [agendaFocus, setAgendaFocus] = useState<{ date: string; key: number } | null>(null);

  useEffect(() => {
    if (tenant.data) document.title = role === "owner" ? tenant.data.name : `${tenant.data.name} · ${BRAND}`;
  }, [tenant.data, role]);

  if (subscription.isLoading) return <SplashSkeleton />;
  // Expired: the business only gets the payment page (the agency still opens everything).
  if (blocked) return <PaymentPage tenantId={tenantId} subscription={subscription.data!} onLogout={onLogout} />;
  if (tenant.isLoading || !tenant.data) return <SplashSkeleton />;
  const t = tenant.data;
  // "Agenda Online" (no Lia): her screens are not offered.
  const assistant = subscription.data?.plan.includesAssistant ?? true;
  const shown = !assistant && ASSISTANT_PAGES.has(page) ? "agenda" : page;

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
    { id: "train", label: `Treinar a ${t.assistantName}`, icon: GraduationCap },
    { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
    { id: "test-chat", label: `Testar a ${t.assistantName}`, icon: MessagesSquare },
    ...(role === "admin" ? [{ id: "access", label: "Acesso do responsável", icon: KeyRound }] : []),
  ].filter((item) => assistant || !ASSISTANT_PAGES.has(item.id));
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
      current={shown}
      onNavigate={navigate}
      onLogout={onLogout}
      onBack={onBackToBusinesses}
    >
      <AgendaAlerts
        key={t.id}
        tenant={t}
        onOpen={(date) => {
          setAgendaFocus({ date, key: Date.now() });
          setPage("agenda");
        }}
      />
      {shown === "agenda" && <AgendaPage tenant={t} focus={agendaFocus} />}
      {shown === "customers" && <CustomersPage tenant={t} />}
      {shown === "services" && <ServicesPage tenant={t} />}
      {shown === "professionals" && <ProfessionalsPage tenant={t} />}
      {shown === "hours" && <HoursPage tenant={t} />}
      {shown === "faq" && <FaqPage tenant={t} />}
      {shown === "prices" && <PriceTablePage tenant={t} />}
      {shown === "handoff" && <HandoffPage tenant={t} />}
      {shown === "settings" && <SettingsPage tenant={t} role={role} assistant={assistant} />}
      {shown === "train" && <TrainPage tenant={t} onNavigate={navigate} />}
      {shown === "test-chat" && <TestChatPage tenant={t} />}
      {shown === "whatsapp" && <WhatsAppPage tenant={t} />}
      {shown === "access" && role === "admin" && <AccessPage tenant={t} />}
      {shown === "more" && <MorePage items={mobile ? [...secondary, ...back] : secondary} onNavigate={navigate} onLogout={onLogout} />}
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
