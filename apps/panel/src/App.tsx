import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Layers,
  Building2,
  CalendarDays,
  Clock,
  CreditCard,
  GraduationCap,
  Ellipsis,
  House,
  KeyRound,
  MessagesSquare,
  Scissors,
  Settings,
  Tags,
  MessageSquareText,
  Receipt,
  Smartphone,
  Store,
  UserRound,
  UserRoundCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  setExpiredHandler,
  setToken,
  setUnauthorizedHandler,
  type SessionInfo,
} from "./api";
import { useSubscription } from "./lib/billing";
import {
  AGENCY_PATHS,
  BUSINESS_PATHS,
  businessPrefix,
  normalizeAddress,
  pathFor,
  tenantFromPath,
  usePathPage,
} from "./lib/routes";
import {
  AppShell,
  ThemeToggle,
  type NavGroup,
  type NavItem,
} from "./components/app-shell";
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
import { HomePage } from "./pages/HomePage";
import { MorePage } from "./pages/MorePage";
import { NichesPage } from "./pages/NichesPage";
import { PaymentPage } from "./pages/PaymentPage";
import { PlansPage } from "./pages/PlansPage";
import { BillingSettings } from "./components/billing-settings";
import {
  AccountCard,
  BusinessBadge,
  ProfileMenu,
  ProfileSettings,
} from "./components/account-menu";
import { HelpButton, NotificationsButton } from "./components/topbar-actions";
import { Button } from "./components/ui/button";
import { PriceTablePage } from "./pages/PriceTablePage";
import { ProfessionalsPage } from "./pages/ProfessionalsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TestChatPage } from "./pages/TestChatPage";
import { TrainPage } from "./pages/TrainPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";

const BRAND = "Chama Lia";
// Tidy whatever was typed in the address bar before the first screen (see lib/routes.ts).
normalizeAddress();

/** Screens of the WhatsApp assistant, hidden on the "Agenda Online" plan. */
const ASSISTANT_PAGES = new Set([
  "faq",
  "prices",
  "handoff",
  "train",
  "whatsapp",
  "test-chat",
]);

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">(
    "checking",
  );

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
    setExpiredHandler(
      () => void queryClient.invalidateQueries({ queryKey: ["subscription"] }),
    );
    void checkSession();
  }, [checkSession, queryClient]);

  const logout = () => {
    window.history.replaceState(null, "", "/");
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
    <BusinessWorkspace
      tenantId={session.tenantId}
      role="owner"
      onLogout={logout}
    />
  ) : (
    <AgencyApp onLogout={logout} />
  );
}

function AgencyApp({ onLogout }: { onLogout: () => void }) {
  // A business opened by the agency lives at /negocio/<id>/..., so it survives reloads and links.
  const [tenantId, setTenantId] = useState<string | null>(tenantFromPath);
  const mobile = useIsMobile();
  const [page, setPage] = usePathPage(
    AGENCY_PATHS,
    "businesses",
    "",
    !tenantId,
  );

  useEffect(() => {
    document.title = BRAND;
  }, [tenantId]);

  // Back/forward between the list and a business.
  useEffect(() => {
    const onBack = () => setTenantId(tenantFromPath());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  const openBusiness = (id: string) => {
    window.history.pushState(null, "", businessPrefix(id));
    setTenantId(id);
  };
  const backToList = () => {
    window.history.pushState(null, "", AGENCY_PATHS.businesses);
    setTenantId(null);
    setPage("businesses", true);
  };

  if (tenantId) {
    return (
      <BusinessWorkspace
        key={tenantId}
        tenantId={tenantId}
        role="admin"
        onLogout={onLogout}
        onBackToBusinesses={backToList}
      />
    );
  }

  const items: NavItem[] = [
    { id: "businesses", label: "Negócios", icon: Building2 },
    { id: "plans", label: "Planos", icon: CreditCard },
    { id: "niches", label: "Nichos", icon: Tags },
  ].map((item) => ({ ...item, href: pathFor(AGENCY_PATHS, item.id) }));
  return (
    <AppShell
      brand={BRAND}
      context="Agência"
      items={items}
      mobileItems={[
        ...items,
        {
          id: "more",
          label: "Mais",
          icon: Ellipsis,
          href: pathFor(AGENCY_PATHS, "more"),
        },
      ]}
      current={page}
      onNavigate={setPage}
      headerStart={
        <span className="text-sm font-semibold">Painel da agência</span>
      }
      headerEnd={
        <>
          <HelpButton />
          <ThemeToggle />
          <ProfileMenu role="admin" onLogout={onLogout} />
        </>
      }
      mobileHeaderEnd={<ProfileMenu role="admin" compact onLogout={onLogout} />}
    >
      {page === "more" && mobile ? (
        <MorePage items={items} onNavigate={setPage} onLogout={onLogout} />
      ) : page === "niches" ? (
        <NichesPage />
      ) : page === "plans" ? (
        <PlansPage onOpenBusiness={openBusiness} />
      ) : (
        <BusinessesPage onOpen={openBusiness} />
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
  // Each screen has its address: /clientes, /pagamento... (the agency's under /negocio/<id>).
  const [page, setPage] = usePathPage(
    BUSINESS_PATHS,
    "home",
    role === "admin" ? businessPrefix(tenantId) : "",
  );
  // "Agenda Online" (no Lia): her screens are not offered; a link to one of them lands on the agenda.
  const assistant = subscription.data?.plan.includesAssistant ?? true;
  useEffect(() => {
    if (subscription.data && !assistant && ASSISTANT_PAGES.has(page))
      setPage("agenda", true);
  }, [subscription.data, assistant, page, setPage]);
  // The agency-only screen, reached by an owner through a link: back to the agenda.
  useEffect(() => {
    if (role === "owner" && page === "access") setPage("agenda", true);
  }, [role, page, setPage]);
  // Set by an agenda alert's "Ver": the agenda opens on that day.
  const [agendaFocus, setAgendaFocus] = useState<{
    date: string;
    key: number;
  } | null>(null);

  useEffect(() => {
    if (tenant.data)
      document.title =
        role === "owner" ? tenant.data.name : `${tenant.data.name} · ${BRAND}`;
  }, [tenant.data, role]);

  // Unblocked while looking at the payment page: say it, the panel opens right after.
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (wasBlocked.current && !blocked)
      toast.success("Pagamento confirmado. Bem-vindo de volta!");
    wasBlocked.current = blocked;
  }, [blocked]);

  if (subscription.isLoading) return <SplashSkeleton />;
  // Expired: the business only gets the payment page (the agency still opens everything).
  if (blocked)
    return (
      <PaymentPage
        tenantId={tenantId}
        subscription={subscription.data!}
        onLogout={onLogout}
      />
    );
  if (tenant.isLoading || !tenant.data) return <SplashSkeleton />;
  const t = tenant.data;
  const shown = !assistant && ASSISTANT_PAGES.has(page) ? "agenda" : page;

  // Menu by modules: the day-to-day screens on top, then each module with its sub-screens.
  const groups: NavGroup[] = [
    { id: "registers", label: "Cadastros", icon: Layers },
    { id: "assistant", label: `Atendente ${t.assistantName}`, icon: Bot },
    { id: "config", label: "Configurações", icon: Settings },
  ];
  const allItems: NavItem[] = [
    { id: "home", label: "Início", icon: House },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "services", label: "Serviços", icon: Scissors, group: "registers" },
    {
      id: "professionals",
      label: "Profissionais",
      icon: UsersRound,
      group: "registers",
    },
    {
      id: "hours",
      label: "Horários e folgas",
      icon: Clock,
      group: "registers",
    },
    // Connect, teach, then test: "Testar" closes the module, to try everything that was set up.
    { id: "whatsapp", label: "WhatsApp", icon: Smartphone, group: "assistant" },
    {
      id: "train",
      label: `Treinar a ${t.assistantName}`,
      icon: GraduationCap,
      group: "assistant",
    },
    {
      id: "faq",
      label: "Respostas prontas",
      icon: MessageSquareText,
      group: "assistant",
    },
    {
      id: "prices",
      label: "Tabela de preços",
      icon: Receipt,
      group: "assistant",
    },
    {
      id: "handoff",
      label: "Passar para a equipe",
      icon: UserRoundCheck,
      group: "assistant",
    },
    {
      id: "test-chat",
      label: `Testar a ${t.assistantName}`,
      icon: MessagesSquare,
      group: "assistant",
    },
    { id: "settings", label: "Negócio", icon: Store, group: "config" },
    { id: "profile", label: "Meu perfil", icon: UserRound, group: "config" },
    { id: "billing", label: "Cobrança", icon: CreditCard, group: "config" },
    ...(role === "admin"
      ? [
          {
            id: "access",
            label: "Acesso do responsável",
            icon: KeyRound,
            group: "config",
          },
        ]
      : []),
  ].filter((item) => assistant || !ASSISTANT_PAGES.has(item.id));
  // Phone: the 3 most used in the bottom bar, everything else in "Mais".
  const barIds = ["home", "agenda", "customers"];
  const barItems = allItems.filter((item) => barIds.includes(item.id));
  const moreItems = allItems.filter((item) => !barIds.includes(item.id));
  const back: NavItem[] = onBackToBusinesses
    ? [{ id: "businesses", label: "Todos os negócios", icon: Building2 }]
    : [];
  const more: NavItem = { id: "more", label: "Mais", icon: Ellipsis };

  const navigate = (id: string) => {
    if (id === "businesses") onBackToBusinesses?.();
    else setPage(id);
  };
  const prefix = role === "admin" ? businessPrefix(tenantId) : "";
  const withHref = (item: NavItem): NavItem => ({
    ...item,
    href:
      item.id === "businesses" ? "/" : pathFor(BUSINESS_PATHS, item.id, prefix),
  });
  // From the bell or an agenda alert: the agenda opens on that day.
  const openDay = (date: string) => {
    setAgendaFocus({ date, key: Date.now() });
    setPage("agenda");
  };
  const profile = (compact: boolean) => (
    <ProfileMenu
      business={{ id: t.id, name: t.name }}
      role={role}
      compact={compact}
      onBilling={() => setPage("billing")}
      onProfile={() => setPage("profile")}
      onAccess={() => setPage("access")}
      onLogout={onLogout}
    />
  );

  return (
    <AppShell
      brand={BRAND}
      context={t.name}
      items={allItems.map(withHref)}
      groups={groups}
      mobileItems={[...barItems, more].map(withHref)}
      current={shown}
      wide={shown === "agenda" || shown === "home"}
      onNavigate={navigate}
      onBack={onBackToBusinesses && (() => navigate("businesses"))}
      headerStart={
        <BusinessBadge
          id={t.id}
          name={t.name}
          onBack={onBackToBusinesses && (() => navigate("businesses"))}
        />
      }
      headerEnd={
        <>
          <NotificationsButton tenant={t} onOpenDay={openDay} />
          <HelpButton />
          <ThemeToggle />
          {profile(false)}
        </>
      }
      mobileHeaderEnd={
        <>
          <NotificationsButton
            tenant={t}
            onOpenDay={openDay}
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          />
          {profile(true)}
        </>
      }
    >
      <AgendaAlerts key={t.id} tenant={t} onOpen={openDay} />
      {subscription.data?.renewSoon && shown !== "billing" && (
        <RenewSoonBanner
          daysLeft={subscription.data.daysLeft ?? 0}
          card={subscription.data.cardAvailable}
          onRenew={() => setPage("billing")}
        />
      )}
      {shown === "home" && (
        <HomePage
          tenant={t}
          assistant={assistant}
          onNavigate={navigate}
          onOpenDay={openDay}
        />
      )}
      {shown === "agenda" && <AgendaPage tenant={t} focus={agendaFocus} />}
      {shown === "customers" && <CustomersPage tenant={t} />}
      {shown === "services" && <ServicesPage tenant={t} />}
      {shown === "professionals" && <ProfessionalsPage tenant={t} />}
      {shown === "hours" && <HoursPage tenant={t} />}
      {shown === "faq" && <FaqPage tenant={t} />}
      {shown === "prices" && <PriceTablePage tenant={t} />}
      {shown === "handoff" && <HandoffPage tenant={t} />}
      {(shown === "settings" || shown === "billing" || shown === "profile") && (
        <SettingsPage
          tenant={t}
          role={role}
          assistant={assistant}
          tab={
            shown === "billing"
              ? "billing"
              : shown === "profile"
                ? "profile"
                : "business"
          }
          onTab={(tab) =>
            setPage(
              tab === "billing"
                ? "billing"
                : tab === "profile"
                  ? "profile"
                  : "settings",
            )
          }
          profile={<ProfileSettings role={role} />}
          billing={
            subscription.data && (
              <BillingSettings
                tenantId={t.id}
                subscription={subscription.data}
              />
            )
          }
        />
      )}
      {shown === "train" && <TrainPage tenant={t} onNavigate={navigate} />}
      {shown === "test-chat" && <TestChatPage tenant={t} />}
      {shown === "whatsapp" && <WhatsAppPage tenant={t} />}
      {shown === "access" && role === "admin" && <AccessPage tenant={t} />}
      {shown === "more" && (
        <MorePage
          items={mobile ? [...moreItems, ...back] : moreItems}
          groups={groups}
          onNavigate={navigate}
          onLogout={onLogout}
          header={
            <AccountCard tenantId={t.id} tenantName={t.name} role={role} />
          }
        />
      )}
    </AppShell>
  );
}

/** A few days before a Pix-paid subscription ends: renew now (and the nudge to automatic debit). */
function RenewSoonBanner({
  daysLeft,
  card,
  onRenew,
}: {
  daysLeft: number;
  card: boolean;
  onRenew: () => void;
}) {
  const when = daysLeft <= 1 ? "amanhã" : `em ${daysLeft} dias`;
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-[3px] border-l-amber-500 bg-card px-4 py-3 text-sm"
      role="status"
    >
      <span>
        <span className="font-medium">Sua assinatura vence {when}.</span>{" "}
        <span className="text-muted-foreground">
          {card
            ? "Renove agora pelo Pix, ou ative a renovação automática no cartão e não se preocupe mais com isso."
            : "Renove agora para não ficar sem acesso."}
        </span>
      </span>
      <Button size="sm" onClick={onRenew}>
        Renovar agora
      </Button>
    </div>
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
