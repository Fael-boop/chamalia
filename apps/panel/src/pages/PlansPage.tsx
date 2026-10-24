import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpRight, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type BillingCycle, type BillingTenant, type Payment, type Plan } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { PixSettings } from "@/components/pix-settings";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice, fromCents, toCents } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { accessStatus, CYCLE_LABELS, formatDate, paidUntilAfter, quote, TONE_STYLES, type AccessTone } from "@/lib/billing";
import { cn } from "@/lib/utils";

type Overview = { plans: Plan[]; tenants: BillingTenant[] };
type StatusFilter = "all" | AccessTone | "waiting";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas as situações" },
  { value: "waiting", label: "Pagamento para confirmar" },
  { value: "soon", label: "Vence em até 7 dias" },
  { value: "expired", label: "Vencidos" },
  { value: "ok", label: "Em dia" },
  { value: "lifetime", label: "Definitivos" },
];
const PRESETS = [1, 3, 6, 12];
const monthsLabel = (n: number) => (n === 1 ? "1 mês" : `${n} meses`);

/** Agency: the plans for sale and every business's subscription, with filters. */
export function PlansPage({ onOpenBusiness }: { onOpenBusiness: (tenantId: string) => void }) {
  const mobile = useIsMobile();
  const overview = useQuery({ queryKey: ["billing"], queryFn: () => api<Overview>("/billing") });
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim().toLowerCase());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const plans = overview.data?.plans ?? [];
  const tenants = overview.data?.tenants ?? [];
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "—";
  const waiting = tenants.filter((t) => t.pendingPayments > 0);
  const reported = tenants.filter((t) => t.reportedPayments > 0).length;

  const rows = useMemo(
    () =>
      tenants
        .map((t) => ({ t, status: accessStatus(t.billingCycle, t.paidUntil) }))
        .filter(({ t, status }) => {
          if (planFilter !== "all" && t.planId !== planFilter) return false;
          if (statusFilter === "waiting" ? t.pendingPayments === 0 : statusFilter !== "all" && status.tone !== statusFilter) return false;
          return !deferred || t.name.toLowerCase().includes(deferred);
        })
        // Most urgent first: expired, then expiring, then the rest by name.
        .sort((a, b) => urgency(a.status.tone) - urgency(b.status.tone) || (a.status.days ?? 9999) - (b.status.days ?? 9999) || a.t.name.localeCompare(b.t.name)),
    [tenants, planFilter, statusFilter, deferred],
  );
  const selected = tenants.find((t) => t.id === selectedId) ?? null;
  const open = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  if (overview.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Planos" description="Os planos à venda e a assinatura de cada negócio." />

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.id} className={cn("rounded-lg border bg-card p-4", !plan.active && "opacity-70")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{plan.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plan.includesAssistant ? "Agenda, clientes, serviços e a Lia no WhatsApp" : "Agenda, clientes e serviços, sem a Lia"}
                  {!plan.active && " · fora de venda"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditingPlan(plan)}>
                Editar
              </Button>
            </div>
            <p className="mt-3 text-sm">
              {plan.priceCentsMonthly === null ? (
                <span className="text-muted-foreground">Sem preço definido</span>
              ) : (
                <>
                  <span className="text-lg font-semibold tabular-nums">{formatPrice(plan.priceCentsMonthly)}</span>
                  <span className="text-muted-foreground"> por mês</span>
                  {plan.priceCentsYearly !== null && (
                    <span className="text-muted-foreground"> · 12 meses por {formatPrice(plan.priceCentsYearly)}</span>
                  )}
                </>
              )}
            </p>
            <button
              className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setPlanFilter(planFilter === plan.id ? "all" : plan.id)}
            >
              {plan.tenants} {plan.tenants === 1 ? "negócio" : "negócios"} neste plano
            </button>
          </div>
        ))}
      </div>

      <PixSettings />

      {waiting.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <span>
            <span className="font-medium">
              {waiting.length} {waiting.length === 1 ? "pagamento aguardando" : "pagamentos aguardando"} confirmação
            </span>
            {reported > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {reported} {reported === 1 ? "já avisou que pagou" : "já avisaram que pagaram"}
              </span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => setStatusFilter("waiting")}>
            Ver
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filtrar por plano">
          {[{ id: "all", name: "Todos", count: tenants.length }, ...plans.map((p) => ({ id: p.id, name: p.name, count: p.tenants }))].map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={planFilter === item.id}
              onClick={() => setPlanFilter(item.id)}
              className={cn(
                "h-9 shrink-0 rounded-md border px-3 text-sm whitespace-nowrap transition-colors duration-150",
                planFilter === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
              )}
            >
              {item.name} <span className="tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2 sm:justify-end">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="bg-card pl-9" placeholder="Buscar negócio" value={search} onChange={(e) => setSearch(e.target.value)} inputMode="search" />
          </div>
        </div>
      </div>

      <div className="mt-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">Nenhum negócio com esses filtros.</p>
        ) : mobile ? (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {rows.map(({ t, status }) => (
              <li key={t.id}>
                <button onClick={() => open(t.id)} className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2 text-left active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {planName(t.planId)} · {CYCLE_LABELS[t.billingCycle]}
                      {t.pendingPayments > 0 && " · pagamento para confirmar"}
                    </span>
                  </span>
                  <StatusPill tone={status.tone} label={status.label} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Negócio</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Pago até</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ t, status }) => (
                  <TableRow key={t.id} className={cn("cursor-pointer", !t.active && "text-muted-foreground")} onClick={() => open(t.id)}>
                    <TableCell className="pl-4 font-medium">
                      {t.name}
                      {!t.active && <span className="ml-2 text-xs font-normal">(inativo)</span>}
                    </TableCell>
                    <TableCell>{planName(t.planId)}</TableCell>
                    <TableCell>{CYCLE_LABELS[t.billingCycle]}</TableCell>
                    <TableCell className="tabular-nums">{t.billingCycle === "lifetime" ? "—" : t.paidUntil ? formatDate(t.paidUntil) : "—"}</TableCell>
                    <TableCell>
                      <StatusPill tone={status.tone} label={status.label} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.autoDebit === "authorized" ? (
                        <span className="text-status-confirmed">Débito automático</span>
                      ) : t.autoDebit === "paused" ? (
                        <span className="font-medium text-status-cancelled">Cartão recusado</span>
                      ) : t.reportedPayments > 0 ? (
                        <span className="font-medium text-status-pending">Avisou que pagou</span>
                      ) : t.pendingPayments > 0 ? (
                        <span className="text-muted-foreground">Gerou um Pix</span>
                      ) : (
                        <span className="text-muted-foreground">{t.lastPaidAt ? `Último em ${formatDate(t.lastPaidAt)}` : "—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <div className="mt-3">
        <Hint>Vencido: o responsável só vê a página de pagamento e a Lia para de responder. Clique em um negócio para mudar o plano, o prazo ou registrar um pagamento.</Hint>
      </div>

      <SubscriptionSheet
        tenant={selected}
        plans={plans}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpenBusiness={onOpenBusiness}
      />
      <PlanEditor plan={editingPlan} onClose={() => setEditingPlan(null)} />
    </>
  );
}

const urgency = (tone: AccessTone) => ({ expired: 0, soon: 1, ok: 2, lifetime: 3 })[tone];

function StatusPill({ tone, label }: { tone: AccessTone; label: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", TONE_STYLES[tone])}>{label}</span>
  );
}

function useBillingRefresh(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
    if (tenantId) {
      void queryClient.invalidateQueries({ queryKey: ["payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["subscription", tenantId] });
    }
  };
}

/** One business: confirm a payment, change plan/cycle/date, record a payment received elsewhere, history. */
function SubscriptionSheet({
  tenant,
  plans,
  open,
  onClose,
  onOpenBusiness,
}: {
  tenant: BillingTenant | null;
  plans: Plan[];
  open: boolean;
  onClose: () => void;
  onOpenBusiness: (tenantId: string) => void;
}) {
  const refresh = useBillingRefresh(tenant?.id);
  const payments = useQuery({
    queryKey: ["payments", tenant?.id],
    queryFn: () => api<Payment[]>(`/tenants/${tenant!.id}/payments`),
    enabled: open && Boolean(tenant),
  });

  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [paidUntil, setPaidUntil] = useState("");
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !tenant) return;
    setPlanId(tenant.planId);
    setCycle(tenant.billingCycle);
    setPaidUntil(tenant.paidUntil ? format(new Date(tenant.paidUntil), "yyyy-MM-dd") : "");
    setMonths(1);
    setNote("");
  }, [open, tenant]);

  const plan = plans.find((p) => p.id === planId);
  // The amount follows the plan's price for the months chosen; it can be typed over.
  useEffect(() => {
    if (plan) setAmount(fromCents(quote(plan, months)));
  }, [plan, months]);

  const save = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant!.id}/subscription`, {
        method: "PATCH",
        // End of the chosen day, so "pago até 10/11" includes all of 10/11.
        body: { planId, billingCycle: cycle, paidUntil: cycle === "lifetime" || !paidUntil ? null : new Date(`${paidUntil}T23:59:59`).toISOString() },
      }),
    onSuccess: () => {
      toast.success("Assinatura atualizada");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const record = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant!.id}/payments`, {
        method: "POST",
        body: { months, amountCents: toCents(amount) ?? 0, note: note.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Pagamento registrado e acesso liberado");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "cancel" }) => api(`/payments/${id}/${action}`, { method: "POST" }),
    onSuccess: (_d, { action }) => {
      toast.success(action === "confirm" ? "Pagamento confirmado. Acesso liberado." : "Pedido de pagamento cancelado");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!tenant) return null;
  const status = accessStatus(tenant.billingCycle, tenant.paidUntil);
  const pending = (payments.data ?? []).find((p) => p.status === "pending");
  const history = (payments.data ?? []).filter((p) => p.id !== pending?.id);
  const dirty =
    planId !== tenant.planId ||
    cycle !== tenant.billingCycle ||
    (cycle !== "lifetime" && paidUntil !== (tenant.paidUntil ? format(new Date(tenant.paidUntil), "yyyy-MM-dd") : ""));

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={tenant.name}
      description={
        <span className="flex items-center gap-2">
          <StatusPill tone={status.tone} label={status.label} />
          {tenant.billingCycle !== "lifetime" && tenant.paidUntil && <span>pago até {formatDate(tenant.paidUntil)}</span>}
        </span>
      }
      footer={
        <Button variant="outline" className="w-full" onClick={() => onOpenBusiness(tenant.id)}>
          <ArrowUpRight /> Abrir o painel deste negócio
        </Button>
      }
    >
      <div className="space-y-6">
        {pending && (
          <section className="space-y-2 rounded-lg border p-3" aria-label="Pagamento aguardando">
            <p className="text-sm font-medium">
              Pix de {formatPrice(pending.amountCents)} · {monthsLabel(pending.months)}
            </p>
            <p className="text-xs text-muted-foreground">
              Gerado em {formatDate(pending.createdAt)}.{" "}
              {pending.automatic
                ? "Pix do Mercado Pago: libera sozinho quando for pago."
                : pending.reportedAt
                ? `Avisou que pagou em ${format(new Date(pending.reportedAt), "dd/MM 'às' HH:mm")}. Confira no banco.`
                : "Ainda não avisou que pagou."}{" "}
              Ao confirmar, fica liberado até {formatDate(paidUntilAfter(tenant.paidUntil, pending.months))}.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: pending.id, action: "confirm" })}>
                Confirmar pagamento
              </Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: pending.id, action: "cancel" })}>
                Cancelar pedido
              </Button>
            </div>
          </section>
        )}

        <section className="space-y-3" aria-labelledby="assinatura">
          <h3 id="assinatura" className="text-sm font-semibold">
            Assinatura
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Plano</span>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Ciclo</span>
              <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CYCLE_LABELS) as BillingCycle[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CYCLE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {cycle !== "lifetime" && (
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium">Pago até</span>
                <Input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
                <span className="block text-xs text-muted-foreground">Depois desse dia o responsável é bloqueado até renovar.</span>
              </label>
            )}
          </div>
          {cycle === "lifetime" && <Hint>Definitivo: nunca vence.</Hint>}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Salvar assinatura"}
          </Button>
        </section>

        {tenant.billingCycle !== "lifetime" && (
          <section className="space-y-3 border-t pt-5" aria-labelledby="registrar">
            <div>
              <h3 id="registrar" className="text-sm font-semibold">
                Registrar pagamento recebido
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Recebeu fora da página de pagamento (dinheiro, transferência)? Registre aqui.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  onClick={() => setMonths(n)}
                  aria-pressed={months === n}
                  className={cn(
                    "h-9 rounded-md border px-3 text-sm transition-colors duration-150",
                    months === n ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40",
                  )}
                >
                  {monthsLabel(n)}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Valor (R$)</span>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Observação (opcional)</span>
                <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: pago em dinheiro" />
              </label>
            </div>
            <Button size="sm" variant="outline" disabled={record.isPending} onClick={() => record.mutate()}>
              Registrar e liberar até {formatDate(paidUntilAfter(tenant.paidUntil, months))}
            </Button>
          </section>
        )}

        <section className="space-y-2 border-t pt-5" aria-labelledby="historico">
          <h3 id="historico" className="text-sm font-semibold">
            Histórico de pagamentos
          </h3>
          {payments.isLoading ? (
            <Skeleton className="h-16" />
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum pagamento ainda.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block">
                      {monthsLabel(p.months)} · {formatPrice(p.amountCents)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDate(p.createdAt)} · {p.method === "pix" ? "Pix" : "Registrado à mão"}
                      {p.note && ` · ${p.note}`}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-xs", p.status === "paid" ? "text-status-confirmed" : "text-muted-foreground")}>
                    {p.status === "paid" ? `Pago ${p.paidAt ? formatDate(p.paidAt) : ""}` : "Cancelado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ResponsiveSheet>
  );
}

/** Name, prices and whether the plan is for sale. What the plan includes is fixed. */
function PlanEditor({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const refresh = useBillingRefresh(undefined);
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!plan) return;
    setName(plan.name);
    setMonthly(fromCents(plan.priceCentsMonthly));
    setYearly(fromCents(plan.priceCentsYearly));
    setActive(plan.active);
  }, [plan]);

  const save = useMutation({
    mutationFn: () =>
      api(`/plans/${plan!.id}`, {
        method: "PATCH",
        body: { name: name.trim(), priceCentsMonthly: toCents(monthly), priceCentsYearly: toCents(yearly), active },
      }),
    onSuccess: () => {
      toast.success("Plano salvo");
      refresh();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const monthlyCents = toCents(monthly);
  const yearlyCents = toCents(yearly);
  const invalid = !name.trim() || (monthly.trim() !== "" && Number.isNaN(monthlyCents)) || (yearly.trim() !== "" && Number.isNaN(yearlyCents));

  return (
    <ResponsiveSheet
      open={Boolean(plan)}
      onOpenChange={(next) => !next && onClose()}
      title="Editar plano"
      description={plan?.includesAssistant ? "Inclui a Lia no WhatsApp." : "Só a agenda online, sem a Lia."}
      footer={
        <Button className="w-full" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : "Salvar plano"}
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Nome</span>
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Preço por mês (R$)</span>
          <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Ex.: 97,00" />
          <span className="block text-xs text-muted-foreground">Vazio: o plano não aparece com preço e a renovação é combinada pelo WhatsApp.</span>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Preço de 12 meses (R$, opcional)</span>
          <Input inputMode="decimal" value={yearly} onChange={(e) => setYearly(e.target.value)} placeholder="Vazio = 10 × o preço do mês" />
          <span className="block text-xs text-muted-foreground">
            {monthlyCents !== null && !Number.isNaN(monthlyCents) && yearly.trim() === ""
              ? `Automático: ${formatPrice(monthlyCents * 10)} por ano (2 meses grátis), no Pix e no cartão.`
              : "Vazio: o ano custa 10 mensalidades (2 meses grátis), no Pix e no cartão."}
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          À venda
        </label>
      </div>
    </ResponsiveSheet>
  );
}
