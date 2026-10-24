import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type AutoDebit, type OwnerPayment, type Subscription } from "@/api";
import { CardForm, RenewPanel, useRefresh, whatsappLink, type CardResult } from "@/components/renew-panel";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/format";
import { accessStatus, CYCLE_LABELS, formatDate, PRIVACY_URL, TERMS_URL, TONE_STYLES } from "@/lib/billing";
import { cn } from "@/lib/utils";

const BRANDS: Record<string, string> = {
  visa: "Visa",
  master: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  diners: "Diners",
};
const cardLabel = (debit: AutoDebit) =>
  `${debit.cardBrand ? (BRANDS[debit.cardBrand] ?? debit.cardBrand) : "Cartão de crédito"}${debit.cardLastFour ? ` final ${debit.cardLastFour}` : ""}`;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-6 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * Configurações > Cobrança: the business manages its subscription by itself, like the billing
 * portals of large SaaS products: plan and status, payment method (change card, cancel the
 * automatic renewal), renew by Pix, receipts e-mail and payment history.
 */
export function BillingSettings({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const { autoDebit } = subscription;
  const lifetime = subscription.billingCycle === "lifetime";
  const status = accessStatus(subscription.billingCycle, subscription.paidUntil);
  const activeDebit = autoDebit && autoDebit.status !== "paused" ? autoDebit : null;

  return (
    <div className="rounded-lg border bg-card p-4 md:p-6">
      <Section title="Seu plano" description="O que você assina hoje.">
        <dl className="divide-y rounded-md border text-sm">
          <Row label="Plano" value={subscription.plan.name} />
          <Row label="Ciclo" value={activeDebit ? (activeDebit.frequencyMonths === 1 ? "Mensal, débito automático" : "Anual, débito automático") : CYCLE_LABELS[subscription.billingCycle]} />
          {!lifetime && <Row label="Pago até" value={subscription.paidUntil ? formatDate(subscription.paidUntil) : "—"} />}
          {activeDebit && subscription.paidUntil && (
            <Row label="Próxima cobrança" value={`${formatDate(subscription.paidUntil)} · ${formatPrice(activeDebit.amountCents)}`} />
          )}
          <div className="flex items-center justify-between px-3 py-2.5">
            <dt className="text-muted-foreground">Situação</dt>
            <dd>
              <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium", TONE_STYLES[status.tone])}>
                {status.label}
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Quer mudar de plano?{" "}
          <a className="font-medium text-foreground underline-offset-4 hover:underline" href={whatsappLink(`Oi! Quero mudar o plano da Chama Lia (${subscription.tenantName}).`)} target="_blank" rel="noreferrer">
            Fale com a gente
          </a>
        </p>
      </Section>

      {lifetime ? (
        <Section title="Pagamento">
          <p className="text-sm text-muted-foreground">Seu plano é definitivo: não vence e não tem cobrança.</p>
        </Section>
      ) : (
        <>
          <Section title="Forma de pagamento" description="Cartão com renovação automática ou Pix.">
            <PaymentMethod tenantId={tenantId} subscription={subscription} />
          </Section>
          {!activeDebit && (
            <Section title="Pagar ou renovar" description="Cartão com renovação automática ou Pix. No anual, 2 meses grátis.">
              <RenewPanel tenantId={tenantId} subscription={subscription} />
            </Section>
          )}
        </>
      )}

      <Section title="E-mail para recibos" description="Recebe os comprovantes e os avisos da assinatura.">
        <BillingEmail tenantId={tenantId} subscription={subscription} />
      </Section>

      <Section title="Histórico de pagamentos">
        <PaymentHistory tenantId={tenantId} />
        <p className="mt-3 text-xs text-muted-foreground">
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            Termos de Uso
          </a>
          {" · "}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            Política de Privacidade
          </a>
        </p>
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function PaymentMethod({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const { autoDebit } = subscription;
  if (autoDebit) return <DebitCard tenantId={tenantId} subscription={subscription} debit={autoDebit} />;
  return (
    <div className="rounded-md border px-3 py-3 text-sm">
      <p className="font-medium">Pix, sem renovação automática</p>
      <p className="text-muted-foreground">
        {subscription.cardAvailable
          ? "Ative a renovação automática no cartão logo abaixo e não se preocupe mais com o vencimento."
          : "Renove pelo Pix logo abaixo quando estiver perto de vencer."}
      </p>
    </div>
  );
}

function DebitCard({ tenantId, subscription, debit }: { tenantId: string; subscription: Subscription; debit: AutoDebit }) {
  const refresh = useRefresh(tenantId);
  const [changing, setChanging] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const paused = debit.status === "paused";

  const cancel = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/card/cancel`, { method: "POST" }),
    onSuccess: (data) => {
      refresh(data);
      toast.success("Renovação automática cancelada. Nenhuma nova cobrança será feita.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateCard = async (card: CardResult) => {
    try {
      const data = await api<Subscription>(`/tenants/${tenantId}/subscription/card/update`, {
        method: "POST",
        body: { cardToken: card.token, cardBrand: card.cardBrand, lastFour: card.lastFour },
      });
      refresh(data);
      setChanging(false);
      toast.success("Cartão trocado. As próximas cobranças vão para o novo cartão.");
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3", paused && "border-l-[3px] border-l-status-cancelled")}>
        <div className="flex items-center gap-3 text-sm">
          <CreditCard className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{cardLabel(debit)}</p>
            <p className="text-muted-foreground">
              {formatPrice(debit.amountCents)} {debit.frequencyMonths === 1 ? "por mês" : "por ano"} · renova sozinho
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={paused ? "default" : "outline"} onClick={() => setChanging(true)}>
            Trocar cartão
          </Button>
          <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => setConfirmCancel(true)}>
            Cancelar renovação
          </Button>
        </div>
      </div>
      {paused && (
        <p className="text-sm">
          A última cobrança não passou no cartão. Troque o cartão para continuar, ou renove por Pix abaixo.
        </p>
      )}
      {subscription.expired && !paused && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Processando a cobrança no cartão…
        </p>
      )}

      <ResponsiveSheet
        open={changing}
        onOpenChange={setChanging}
        title="Trocar cartão"
        description="As próximas cobranças vão para o novo cartão. Nada é cobrado agora, a não ser que uma cobrança esteja atrasada."
      >
        {changing && subscription.mercadoPagoPublicKey && (
          <CardForm publicKey={subscription.mercadoPagoPublicKey} amountCents={debit.amountCents} email={debit.payerEmail} submitLabel="Salvar cartão" note="Nada é cobrado agora." onSubmit={updateCard} />
        )}
      </ResponsiveSheet>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a renovação automática?</AlertDialogTitle>
            <AlertDialogDescription>
              Nenhuma nova cobrança será feita no cartão. Sem multa.
              {subscription.paidUntil && !subscription.expired && ` O acesso continua até ${formatDate(subscription.paidUntil)}; depois disso, renove por Pix se quiser continuar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>Cancelar renovação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BillingEmail({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const refresh = useRefresh(tenantId);
  const current = subscription.billingEmail ?? "";
  const [email, setEmail] = useState(current);
  useEffect(() => setEmail(current), [current]);
  const save = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/billing-email`, { method: "PATCH", body: { email: email.trim() } }),
    onSuccess: (data) => {
      refresh(data);
      toast.success("E-mail salvo");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Input type="email" autoComplete="email" aria-label="E-mail para recibos" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
      <Button type="submit" variant="outline" disabled={!valid || email.trim() === current || save.isPending}>
        Salvar
      </Button>
    </form>
  );
}

const METHOD_LABELS: Record<OwnerPayment["method"], string> = { pix: "Pix", card: "Cartão", manual: "Registrado pela Chama Lia" };

function PaymentHistory({ tenantId }: { tenantId: string }) {
  const payments = useQuery({
    queryKey: ["owner-payments", tenantId],
    queryFn: () => api<OwnerPayment[]>(`/tenants/${tenantId}/subscription/payments`),
  });
  if (payments.isLoading) return <Skeleton className="h-24" />;
  const list = payments.data ?? [];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>;
  return (
    <ul className="divide-y rounded-md border text-sm">
      {list.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate">
              {p.planName} · {p.months === 1 ? "1 mês" : `${p.months} meses`}
            </span>
            <span className="block text-xs text-muted-foreground">
              {formatDate(p.paidAt ?? p.createdAt)} · {METHOD_LABELS[p.method]}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-medium tabular-nums">{formatPrice(p.amountCents)}</span>
            <span className={cn("block text-xs", p.status === "paid" ? "text-status-confirmed" : "text-muted-foreground")}>
              {p.status === "paid" ? "Pago" : "Aguardando"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
