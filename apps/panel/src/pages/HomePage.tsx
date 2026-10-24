import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  MessageSquareText,
  MessagesSquare,
  Receipt,
  Scissors,
  Smartphone,
  UserRoundCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { api, type AppointmentStatus, type Tenant } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatPrice,
  shiftDate,
  STATUS_LABELS,
  todayIn,
  zoned,
} from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { professionalColors } from "@/lib/professional-color";
import { useAppointments } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Period = "today" | "week" | "month" | "last-month";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mês" },
  { id: "last-month", label: "Mês passado" },
];

type Overview = {
  appointments: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    noShow: number;
    cancelled: number;
    valueCents: number;
  };
  assistant: { booked: number; conversations: number; withTeam: number };
  customers: { total: number; added: number };
  pending: number;
  setup: {
    services: number;
    professionals: number;
    hours: number;
    appointments: number;
    whatsapp: boolean;
  };
};

function rangeOf(
  period: Period,
  today: string,
): { from: string; to: string; label: string } {
  const day = parseISO(today);
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const short = (iso: string) => format(parseISO(iso), "dd/MM");
  let from = today;
  let to = today;
  if (period === "week") {
    from = fmt(startOfWeek(day, { weekStartsOn: 1 }));
    to = shiftDate(from, 6);
  } else if (period === "month") {
    from = fmt(startOfMonth(day));
    to = fmt(endOfMonth(day));
  } else if (period === "last-month") {
    const last = addMonths(day, -1);
    from = fmt(startOfMonth(last));
    to = fmt(endOfMonth(last));
  }
  return {
    from,
    to,
    label: from === to ? short(from) : `${short(from)} até ${short(to)}`,
  };
}

/** "Início": an overview of the business, for the period chosen. */
export function HomePage({
  tenant,
  assistant,
  onNavigate,
  onOpenDay,
}: {
  tenant: Tenant;
  assistant: boolean;
  onNavigate: (id: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const mobile = useIsMobile();
  const today = todayIn(tenant.timezone);
  const [period, setPeriod] = useState<Period>("month");
  const range = rangeOf(period, today);

  const overview = useQuery({
    queryKey: ["overview", tenant.id, range.from, range.to],
    queryFn: () =>
      api<Overview>(
        `/tenants/${tenant.id}/overview?from=${range.from}&to=${range.to}`,
      ),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const todays = useAppointments(tenant.id, today, today);
  const colors = useMemo(
    () => professionalColors((todays.data ?? []).map((a) => a.professionalId)),
    [todays.data],
  );
  const upcoming = (todays.data ?? []).filter((a) => a.status !== "cancelled");
  const data = overview.data;

  const picker = (
    <div
      className="flex flex-wrap gap-1 rounded-lg border bg-card p-1"
      role="radiogroup"
      aria-label="Período"
    >
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={period === p.id}
          onClick={() => setPeriod(p.id)}
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium transition-colors duration-150",
            period === p.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  const steps = data
    ? [
        {
          id: "services",
          label: "Cadastrar os serviços",
          done: data.setup.services > 0,
        },
        {
          id: "professionals",
          label: "Cadastrar quem atende",
          done: data.setup.professionals > 0,
        },
        {
          id: "hours",
          label: "Definir os horários de funcionamento",
          done: data.setup.hours > 0,
        },
        ...(assistant
          ? [
              {
                id: "whatsapp",
                label: "Conectar o WhatsApp",
                done: data.setup.whatsapp,
              },
            ]
          : []),
        {
          id: "agenda",
          label: "Criar o primeiro agendamento",
          done: data.setup.appointments > 0,
        },
      ]
    : [];
  const pendingSteps = steps.filter((s) => !s.done);
  const name = tenant.assistantName;
  const shortcuts: Shortcut[] = [
    ...pendingSteps.map((step) => ({
      id: step.id,
      title: step.label,
      text: "Falta fazer para começar.",
      pending: true,
    })),
    ...(assistant
      ? [
          {
            id: "train",
            title: `Treinar a ${name}`,
            text: "Ensine regras e respostas para ela seguir.",
          },
          {
            id: "test-chat",
            title: `Testar a ${name}`,
            text: "Converse como cliente e veja como ela responde.",
          },
          {
            id: "faq",
            title: "Respostas prontas",
            text: "Perguntas que ela responde do seu jeito.",
          },
          {
            id: "prices",
            title: "Tabela de preços",
            text: "O arquivo ou texto que ela envia ao cliente.",
          },
          {
            id: "handoff",
            title: "Passar para a equipe",
            text: "Defina o que ela não resolve sozinha.",
          },
        ]
      : []),
    {
      id: "hours",
      title: "Folgas e feriados",
      text: "Bloqueie dias fechados, férias e folgas.",
    },
    {
      id: "professionals",
      title: "Profissionais",
      text: "Foto, serviços e horário de cada pessoa.",
    },
    {
      id: "customers",
      title: "Clientes",
      text: "Histórico, observações e contatos.",
    },
    ...(assistant
      ? [
          {
            id: "whatsapp",
            title: "WhatsApp",
            text: "Conecte ou troque o número da atendente.",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {!mobile ? (
        <PageHeader
          title="Início"
          description={`Visão geral do negócio · ${range.label}`}
          actions={picker}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Visão geral · {range.label}
          </p>
          <div className="-mx-4 overflow-x-auto px-4">{picker}</div>
        </div>
      )}

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <Shortcuts cards={shortcuts} onNavigate={onNavigate} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Agenda"
              subtitle={range.label}
              action={{
                label: "Abrir agenda",
                onClick: () => onNavigate("agenda"),
              }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Agendamentos" value={data.appointments.total} />
                <Stat label="Concluídos" value={data.appointments.completed} />
                <Stat label="Faltas" value={data.appointments.noShow} />
                <Stat label="Cancelados" value={data.appointments.cancelled} />
              </div>
              {data.pending > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(today)}
                  className="mt-3 flex min-h-10 w-full items-center justify-between rounded-md border border-status-pending-border bg-status-pending-bg px-3 text-sm text-status-pending"
                >
                  <span>
                    {data.pending}{" "}
                    {data.pending === 1
                      ? "agendamento aguardando"
                      : "agendamentos aguardando"}{" "}
                    aprovação
                  </span>
                  <ArrowRight className="size-4" />
                </button>
              )}
            </Panel>

            <Panel
              title="Clientes e valores"
              subtitle={range.label}
              action={{
                label: "Ver clientes",
                onClick: () => onNavigate("customers"),
              }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Clientes" value={data.customers.total} />
                <Stat label="Novas no período" value={data.customers.added} />
                <Stat
                  label="Atendimentos concluídos"
                  value={formatPrice(data.appointments.valueCents)}
                  hint="Soma do preço dos serviços concluídos"
                />
              </div>
            </Panel>
          </div>

          {assistant && (
            <Panel
              title={`Atendente ${tenant.assistantName}`}
              subtitle={range.label}
              action={{
                label: `Treinar a ${tenant.assistantName}`,
                onClick: () => onNavigate("train"),
              }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Conversas" value={data.assistant.conversations} />
                <Stat
                  label={`Marcados pela ${tenant.assistantName}`}
                  value={data.assistant.booked}
                />
                <Stat
                  label="Com a equipe agora"
                  value={data.assistant.withTeam}
                  hint="Conversas passadas para uma pessoa"
                  onClick={
                    data.assistant.withTeam > 0
                      ? () => onNavigate("handoff")
                      : undefined
                  }
                />
              </div>
            </Panel>
          )}

          <Panel
            title="Hoje na agenda"
            subtitle={`${upcoming.length} ${upcoming.length === 1 ? "atendimento" : "atendimentos"}`}
            action={{ label: "Ver o dia", onClick: () => onOpenDay(today) }}
          >
            {todays.isLoading ? (
              <Skeleton className="h-24" />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada marcado para hoje.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {upcoming.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDay(today)}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="w-12 shrink-0 font-medium tabular-nums">
                        {zoned(a.startsAt, tenant.timezone).time}
                      </span>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: colors.get(a.professionalId),
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {a.customerName ?? "Sem nome"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.serviceName} · {a.professionalName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {STATUS_LABELS[a.status as AppointmentStatus]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => onOpenDay(today)}
              >
                Ver os outros {upcoming.length - 8}
              </Button>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** Same icons as the menu, so a card and its menu entry look alike. */
const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  agenda: CalendarDays,
  customers: Users,
  services: Scissors,
  professionals: UsersRound,
  hours: Clock,
  faq: MessageSquareText,
  prices: Receipt,
  handoff: UserRoundCheck,
  train: GraduationCap,
  "test-chat": MessagesSquare,
  whatsapp: Smartphone,
};

type Shortcut = { id: string; title: string; text: string; pending?: boolean };

/** Cards to reach the rest of the system; what is still missing to set up comes first. */
function Shortcuts({
  cards,
  onNavigate,
}: {
  cards: Shortcut[];
  onNavigate: (id: string) => void;
}) {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({ left: direction * 300, behavior: "smooth" });
  return (
    <section aria-label="Atalhos">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Atalhos</h2>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => scroll(-1)}
            aria-label="Atalhos anteriores"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => scroll(1)}
            aria-label="Próximos atalhos"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <ul
        ref={track}
        className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <li key={card.id + card.title} className="w-64 shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onNavigate(card.id)}
              className="flex h-full min-h-40 w-full flex-col justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
            >
              <span>
                <span
                  className={cn(
                    "mb-3 flex size-9 items-center justify-center rounded-md bg-muted text-foreground",
                    card.pending && "bg-status-pending-bg text-status-pending",
                  )}
                  aria-hidden
                >
                  {(() => {
                    const Icon = SHORTCUT_ICONS[card.id] ?? ArrowRight;
                    return <Icon className="size-[18px]" />;
                  })()}
                </span>
                <span className="block text-sm font-semibold">
                  {card.title}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-xs",
                    card.pending
                      ? "text-status-pending"
                      : "text-muted-foreground",
                  )}
                >
                  {card.text}
                </span>
              </span>
              <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                Acessar <ArrowRight className="size-3.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </>
  );
  const cls = "rounded-md border bg-background px-3 py-2.5 text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(cls, "transition-colors hover:bg-muted")}
    >
      {body}
    </button>
  ) : (
    <div className={cls} title={hint}>
      {body}
    </div>
  );
}
