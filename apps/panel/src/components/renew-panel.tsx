import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Copy, Loader2, Lock, MessageCircle, Minus, Plus, ShieldCheck, Undo2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type AutoDebit, type Subscription } from "@/api";
import { CardBrands, PixMark } from "@/components/payment-brands";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/format";
import { formatDate, paidUntilAfter, PRIVACY_URL, quote, subscriptionKey, TERMS_URL } from "@/lib/billing";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const SUPPORT_PHONE = "556294737276";
export const whatsappLink = (text: string) => `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(text)}`;

const PRESETS = [1, 3, 6, 12] as const;
const monthsLabel = (n: number) => (n === 1 ? "1 mês" : `${n} meses`);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

type Method = "card" | "pix";

/** What the order costs, line by line, for the summary. */
type Order = {
  periodLabel: string;
  baseCents: number;
  yearlyDiscountCents: number;
  totalCents: number;
  /** Card: renews at this amount; Pix: one payment. */
  renews: boolean;
  every: "mês" | "ano";
  until: Date;
  /** Card with access already paid: nothing today, the first charge is on this day. */
  firstChargeAt: Date | null;
};

/** Same rule as the server: with access paid ahead, the card is only charged when it ends. */
function firstChargeDate(subscription: Subscription): Date | null {
  if (subscription.billingCycle === "lifetime" || subscription.expired || !subscription.paidUntil) return null;
  const end = new Date(subscription.paidUntil);
  return end.getTime() - Date.now() > 60 * 60 * 1000 ? end : null;
}

/**
 * Checkout for renewing a subscription, laid out like a professional payment page: choose the
 * method (card with automatic debit, or Pix), the period, see the order summary with discounts
 * and the security notes, then pay. Card data is typed only into Mercado Pago's secure fields.
 * `split` = summary in a side column (payment page); `stacked` = one column (Configurações).
 */
export function RenewPanel({
  tenantId,
  subscription,
  layout = "stacked",
  only,
}: {
  tenantId: string;
  subscription: Subscription;
  layout?: "split" | "stacked";
  /** Shows one way to pay, without the choice (e.g. access already paid: card set up apart from Pix). */
  only?: Method;
}) {
  const { autoDebit, plan } = subscription;
  const refresh = useRefresh(tenantId);
  const [method, setMethod] = useState<Method>(only ?? (subscription.pending || !subscription.cardAvailable ? "pix" : "card"));
  const [months, setMonths] = useState<number>(subscription.pending?.months ?? 1);
  const [custom, setCustom] = useState(false);
  const [frequency, setFrequency] = useState<1 | 12>(1);
  const [terms, setTerms] = useState(subscription.termsAccepted);
  const [email, setEmail] = useState(subscription.billingEmail ?? "");
  const [cardStep, setCardStep] = useState<"details" | "card">("details");
  const [choosingPix, setChoosingPix] = useState(!subscription.pending);

  const checkout = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/checkout`, { method: "POST", body: { months, acceptTerms: true } }),
    onSuccess: (data) => {
      refresh(data);
      setChoosingPix(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const report = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/payments/${subscription.pending!.id}/report`, { method: "POST" }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  // An active debit renews by itself: nothing to choose, only to manage.
  if (autoDebit && autoDebit.status !== "paused") return <AutoDebitStatus tenantId={tenantId} subscription={subscription} autoDebit={autoDebit} />;
  if (plan.priceCentsMonthly === null) return <NoPrice tenantName={subscription.tenantName} />;

  const monthly = plan.priceCentsMonthly;
  const pixTotal = (n: number) => ((PRESETS as readonly number[]).includes(n) ? subscription.prices.pix[n as 1 | 3 | 6 | 12] : quote(plan, n)) ?? 0;
  const order: Order =
    method === "card"
      ? {
          periodLabel: frequency === 1 ? "Mensal" : "Anual (12 meses)",
          baseCents: monthly * frequency,
          yearlyDiscountCents: frequency === 12 ? monthly * 12 - pixTotal(12) : 0,
          totalCents: subscription.prices.card[frequency] ?? pixTotal(frequency),
          renews: true,
          every: frequency === 1 ? "mês" : "ano",
          until: paidUntilAfter(subscription.paidUntil, frequency),
          firstChargeAt: firstChargeDate(subscription),
        }
      : {
          periodLabel: monthsLabel(months),
          baseCents: monthly * months,
          yearlyDiscountCents: months === 12 ? monthly * 12 - pixTotal(12) : 0,
          totalCents: pixTotal(months),
          renews: false,
          every: "mês",
          until: paidUntilAfter(subscription.paidUntil, months),
          firstChargeAt: null,
        };
  const firstCharge = order.firstChargeAt ? formatDate(order.firstChargeAt) : null;
  // Without the method choice the steps start at 1.
  const stepOffset = only ? 1 : 0;

  const showingPix = method === "pix" && subscription.pending && !choosingPix;
  const summary = showingPix ? null : <OrderSummary planName={plan.name} order={order} method={method} />;
  const split = layout === "split";

  const submitCard = async (card: CardResult) => {
    try {
      const data = await api<Subscription>(`/tenants/${tenantId}/subscription/card`, {
        method: "POST",
        body: { cardToken: card.token, cardBrand: card.cardBrand, lastFour: card.lastFour, email: email.trim(), frequencyMonths: frequency, acceptTerms: true },
      });
      refresh(data);
      toast.success(firstCharge ? `Renovação automática ativada. A primeira cobrança será em ${firstCharge}.` : "Débito automático ativado.");
    } catch (error) {
      toast.error((error as Error).message);
      // Rejecting lets the card form show the error and stay editable.
      throw error;
    }
  };

  const main = (
    <div className="min-w-0 space-y-8">
      {autoDebit && <AutoDebitStatus tenantId={tenantId} subscription={subscription} autoDebit={autoDebit} />}

      {showingPix ? (
        <PixPay subscription={subscription} busy={report.isPending} onReport={() => report.mutate()} onChangePeriod={() => setChoosingPix(true)} />
      ) : (
        <>
          {!only && <Step number={1} title="Forma de pagamento">
            <div className="space-y-2" role="radiogroup" aria-label="Forma de pagamento">
              {subscription.cardAvailable && (
                <MethodOption
                  selected={method === "card"}
                  onSelect={() => setMethod("card")}
                  title="Cartão de crédito"
                  note={
                    <>
                      <span className="font-medium text-foreground">Renovação automática</span> · você nunca fica sem acesso
                    </>
                  }
                  logos={<CardBrands />}
                />
              )}
              <MethodOption
                selected={method === "pix"}
                onSelect={() => setMethod("pix")}
                title="Pix"
                note="Pagamento único · aprovado na hora"
                logos={<PixMark withName />}
              />
            </div>
          </Step>}

          <Step number={2 - stepOffset} title={method === "card" ? "Frequência da cobrança" : "Por quanto tempo"}>
            {method === "card" ? (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Frequência da cobrança">
                {([1, 12] as const).map((n) => {
                  const value = subscription.prices.card[n] ?? 0;
                  return (
                    <PeriodOption
                      key={n}
                      selected={frequency === n}
                      onSelect={() => setFrequency(n)}
                      title={n === 1 ? "Mensal" : "Anual"}
                      price={`${formatPrice(value)} /${n === 1 ? "mês" : "ano"}`}
                      note={n === 12 ? `2 meses grátis · ${formatPrice(Math.round(value / 12))}/mês` : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Período">
                  {PRESETS.map((n) => (
                    <PeriodOption
                      key={n}
                      selected={!custom && months === n}
                      onSelect={() => {
                        setCustom(false);
                        setMonths(n);
                      }}
                      title={monthsLabel(n)}
                      price={formatPrice(pixTotal(n))}
                      note={n === 12 ? "2 meses grátis" : undefined}
                    />
                  ))}
                </div>
                <div className="mt-3">
                  {custom ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Outro período:</span>
                      <Button variant="outline" size="icon" aria-label="Menos um mês" onClick={() => setMonths((m) => Math.max(1, m - 1))}>
                        <Minus />
                      </Button>
                      <Input
                        className="w-16 text-center tabular-nums"
                        inputMode="numeric"
                        aria-label="Quantidade de meses"
                        value={months}
                        onChange={(e) => {
                          const value = Number(e.target.value.replace(/\D/g, ""));
                          if (value >= 1) setMonths(Math.min(value, 36));
                        }}
                      />
                      <Button variant="outline" size="icon" aria-label="Mais um mês" onClick={() => setMonths((m) => Math.min(36, m + 1))}>
                        <Plus />
                      </Button>
                      <span className="text-sm text-muted-foreground">{months === 1 ? "mês" : "meses"}</span>
                    </div>
                  ) : (
                    <Button variant="link" className="h-auto px-0" onClick={() => setCustom(true)}>
                      Escolher outra quantidade de meses
                    </Button>
                  )}
                </div>
              </>
            )}
          </Step>

          {split && <div className="lg:hidden">{summary}</div>}
          {!split && summary}

          <Step number={3 - stepOffset} title={method === "card" ? (firstCharge ? "Cartão" : "Pagamento") : "Confirmar"}>
            {method === "card" ? (
              cardStep === "details" ? (
                <div className="space-y-4">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">E-mail para recibos</span>
                    <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                  </label>
                  <TermsCheck checked={terms} onChange={setTerms} />
                  <Button size="lg" className="h-12 w-full text-base" disabled={!validEmail(email) || !terms} onClick={() => setCardStep("card")}>
                    <Lock /> Continuar para os dados do cartão
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock className="size-4 shrink-0" aria-hidden /> Ambiente seguro do Mercado Pago
                    </span>
                    <CardBrands className="hidden sm:flex" />
                  </div>
                  {/* The form only turns the card into a token (the charge is the subscription's), so its amount
                      stays fixed: switching monthly/yearly neither reloads it nor erases what was typed. */}
                  <CardForm
                    publicKey={subscription.mercadoPagoPublicKey!}
                    amountCents={subscription.prices.card[1] ?? order.totalCents}
                    email={email.trim()}
                    submitLabel={firstCharge ? "Ativar renovação automática" : "Assinar"}
                    note={
                      firstCharge
                        ? `Nada é cobrado hoje. Primeira cobrança de ${formatPrice(order.totalCents)} em ${firstCharge} · cancele quando quiser`
                        : `${formatPrice(order.totalCents)} por ${order.every}, cobrado no cartão · cancele quando quiser`
                    }
                    onSubmit={submitCard}
                  />
                  <Button variant="link" className="h-auto px-0" onClick={() => setCardStep("details")}>
                    Voltar
                  </Button>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <TermsCheck checked={terms} onChange={setTerms} />
                <Button size="lg" className="h-12 w-full text-base" disabled={!terms || checkout.isPending} onClick={() => checkout.mutate()}>
                  {checkout.isPending ? <Loader2 className="animate-spin" /> : <PixMark />}
                  Gerar Pix de {formatPrice(order.totalCents)}
                </Button>
              </div>
            )}
          </Step>
        </>
      )}
    </div>
  );

  if (!split) return main;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      {main}
      <aside className="hidden lg:sticky lg:top-6 lg:block">{summary}</aside>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground tabular-nums">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MethodOption({ selected, onSelect, title, note, logos }: { selected: boolean; onSelect: () => void; title: string; note: ReactNode; logos: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3.5 text-left transition-colors duration-150",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
      )}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground/50")}>
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{note}</span>
        {/* Phones: the logos go under the text, so they are still seen. */}
        <span className="mt-2 block sm:hidden">{logos}</span>
      </span>
      <span className="hidden shrink-0 sm:block">{logos}</span>
    </button>
  );
}

function PeriodOption({
  selected,
  disabled,
  onSelect,
  title,
  price,
  note,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  note?: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-[76px] flex-col items-start justify-center rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-150 disabled:opacity-60",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
      )}
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-sm text-muted-foreground tabular-nums">{price}</span>
      {note && <span className="text-xs font-medium text-status-confirmed">{note}</span>}
    </button>
  );
}

/** The order at a glance: plan, period, discounts, total and what happens next, with the security notes. */
function OrderSummary({ planName, order, method }: { planName: string; order: Order; method: Method }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Resumo</h2>
      <dl className="space-y-2 text-sm">
        <Line label="Plano" value={planName} />
        <Line label="Período" value={order.periodLabel} />
        <Line label="Valor" value={formatPrice(order.baseCents)} />
        {order.yearlyDiscountCents > 0 && <Line label="Anual: 2 meses grátis" value={`− ${formatPrice(order.yearlyDiscountCents)}`} discount />}
        {order.firstChargeAt && <Line label="Primeira cobrança" value={`${formatDate(order.firstChargeAt)} · ${formatPrice(order.totalCents)}`} />}
      </dl>
      <div className="border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Total hoje</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatPrice(order.firstChargeAt ? 0 : order.totalCents)}</span>
        </div>
        {/* Anchoring: the yearly plan read as a monthly price. */}
        {order.yearlyDiscountCents > 0 && (
          <p className="mt-1 text-right text-xs font-medium text-status-confirmed">Equivale a {formatPrice(Math.round(order.totalCents / 12))} por mês</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {order.firstChargeAt
          ? `Seu acesso já está pago até ${formatDate(order.firstChargeAt)}. Nesse dia o cartão é cobrado em ${formatPrice(order.totalCents)} e depois a cada ${order.every}. Cancele quando quiser, sem multa.`
          : order.renews
            ? `Depois, ${formatPrice(order.totalCents)} a cada ${order.every}, a partir de ${formatDate(order.until)}. Cancele quando quiser, sem multa.`
            : `Acesso liberado até ${formatDate(order.until)}. Sem renovação automática.`}
      </p>

      <ul className="space-y-2.5 border-t pt-4 text-xs text-muted-foreground">
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Pagamento seguro</span> processado pelo Mercado Pago.
            {method === "card" && " A Chama Lia não vê nem guarda os dados do seu cartão."}
          </span>
        </li>
        <li className="flex gap-2">
          <Undo2 className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
          <span>
            <span className="font-medium text-foreground">7 dias de garantia:</span> desistiu, devolvemos o valor.
          </span>
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
          <span>Seus dados são tratados conforme a LGPD.</span>
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <CardBrands />
        <PixMark withName />
      </div>
    </div>
  );
}

function Line({ label, value, discount }: { label: string; value: string; discount?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", discount ? "font-medium text-status-confirmed" : "font-medium")}>{value}</dd>
    </div>
  );
}

/** "Li e aceito…" with links that open in a new tab. Required before any payment. */
export function TermsCheck({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>
        Li e aceito os{" "}
        <a href={TERMS_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
          Termos de Uso
        </a>{" "}
        e a{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
          Política de Privacidade
        </a>
        .
      </span>
    </label>
  );
}

export function useRefresh(tenantId: string) {
  const queryClient = useQueryClient();
  return (data: Subscription) => queryClient.setQueryData(subscriptionKey(tenantId), data);
}

// --- Pix: pay the generated code ---

function PixPay({
  subscription,
  busy,
  onReport,
  onChangePeriod,
}: {
  subscription: Subscription;
  busy: boolean;
  onReport: () => void;
  onChangePeriod: () => void;
}) {
  const pending = subscription.pending!;
  const until = formatDate(paidUntilAfter(subscription.paidUntil, pending.months));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pending.pixCode!);
      toast.success("Código Pix copiado");
    } catch {
      toast.error("Não deu para copiar. Selecione o código e copie.");
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="pagar">
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="pagar" className="flex items-center gap-2 text-sm font-medium">
            <PixMark /> {monthsLabel(pending.months)} · até {until}
          </h2>
          <span className="text-xl font-semibold tabular-nums">{formatPrice(pending.amountCents)}</span>
        </div>
        {pending.pixCode ? (
          <div className="space-y-4 p-4">
            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={pending.pixCode} size={192} marginSize={0} title="QR code do Pix" />
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra o app do seu banco e entre em Pix.</li>
              <li>Escolha ler QR code, ou Pix copia e cola com o código abaixo.</li>
              <li>Confira o valor de {formatPrice(pending.amountCents)} e confirme.</li>
            </ol>
            <div className="flex gap-2">
              <Input readOnly value={pending.pixCode} aria-label="Código Pix copia e cola" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={copy}>
                <Copy /> Copiar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4 text-sm">
            <p>Para pagar, chame a gente no WhatsApp: enviamos a chave Pix e liberamos assim que o pagamento cair.</p>
            <Button asChild>
              <a
                href={whatsappLink(`Oi! Quero renovar a Chama Lia (${subscription.tenantName}): ${monthsLabel(pending.months)}, ${formatPrice(pending.amountCents)}.`)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> Pagar pelo WhatsApp
              </a>
            </Button>
          </div>
        )}
      </div>

      {pending.automatic ? (
        <Waiting>
          Aguardando o pagamento. Assim que o Pix for pago, o acesso é liberado na hora e esta tela se atualiza sozinha.
          {pending.expiresAt && (
            <span className="mt-1 block text-xs text-muted-foreground">Este Pix vale até {format(new Date(pending.expiresAt), "dd/MM 'às' HH:mm")}.</span>
          )}
        </Waiting>
      ) : pending.reportedAt ? (
        <Waiting>Recebemos seu aviso. Assim que o pagamento for confirmado, o acesso é liberado e esta tela se atualiza. Pode deixá-la aberta.</Waiting>
      ) : (
        <Button size="lg" variant="outline" className="h-12 w-full" disabled={busy} onClick={onReport}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Já fiz o pagamento
        </Button>
      )}

      <Button variant="link" className="h-auto w-full px-0" onClick={onChangePeriod}>
        Escolher outra forma ou período
      </Button>
    </section>
  );
}

// --- Card (automatic debit) ---

/** What the card form hands back: a one-time token, plus brand and last 4 digits to show later. */
export type CardResult = { token: string; cardBrand?: string; lastFour?: string };

let mercadoPagoKey: string | null = null;
function ensureMercadoPago(publicKey: string) {
  if (mercadoPagoKey === publicKey) return;
  initMercadoPago(publicKey, { locale: "pt-BR" });
  mercadoPagoKey = publicKey;
}

type BrickController = {
  getFormData: () => Promise<{ token: string; payment_method_id?: string } | undefined>;
  getAdditionalData?: () => Promise<{ lastFourDigits?: string } | undefined>;
};

/**
 * Mercado Pago's secure card fields (Card Payment Brick): the card never touches our servers.
 * Its own button is hidden; ours (same look as the rest of the panel) asks it for the card token.
 */
export function CardForm({
  publicKey,
  amountCents,
  email,
  submitLabel = "Assinar",
  note,
  onSubmit,
}: {
  publicKey: string;
  amountCents: number;
  email: string;
  submitLabel?: string;
  /** Small line under the button ("R$ 0,95 por mês · cancele quando quiser"). */
  note?: string;
  onSubmit: (card: CardResult) => Promise<void>;
}) {
  ensureMercadoPago(publicKey);
  const { resolved } = useTheme();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // The brick re-mounts whenever these objects change: keep them stable.
  const initialization = useMemo(() => ({ amount: amountCents / 100, payer: { email } }), [amountCents, email]);
  const customization = useMemo(
    () => ({
      paymentMethods: { maxInstallments: 1, types: { excluded: ["debit_card" as const, "prepaid_card" as const] } },
      visual: {
        hideFormTitle: true,
        hidePaymentButton: true,
        style: {
          theme: resolved === "dark" ? ("dark" as const) : ("default" as const),
          customVariables: {
            baseColor: resolved === "dark" ? "#3b82f6" : "#2563eb",
            formBackgroundColor: "transparent",
            formPadding: "0px",
            borderRadiusSmall: "6px",
            borderRadiusMedium: "8px",
            borderRadiusLarge: "10px",
          },
        },
      },
    }),
    [resolved],
  );
  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback((error: unknown) => console.warn("card form", error), []);
  // Submission goes through our button; the brick's own submit is never shown.
  const handleBrickSubmit = useCallback(async () => {}, []);

  const submit = async () => {
    const controller = (window as unknown as { cardPaymentBrickController?: BrickController }).cardPaymentBrickController;
    if (!controller) return;
    setBusy(true);
    try {
      // Validates the fields (the brick shows what is missing) and returns a one-time token.
      const formData = await controller.getFormData();
      if (!formData?.token) return;
      const additional = await controller.getAdditionalData?.();
      await onSubmit({ token: formData.token, cardBrand: formData.payment_method_id, lastFour: additional?.lastFourDigits });
    } catch {
      // onSubmit already told the user; invalid fields are highlighted by the brick.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!ready && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Abrindo o ambiente seguro do Mercado Pago…
        </p>
      )}
      <CardPayment
        locale="pt-BR"
        initialization={initialization}
        customization={customization}
        onReady={handleReady}
        onError={handleError}
        onSubmit={handleBrickSubmit}
      />
      {ready && (
        <div className="space-y-2">
          <Button size="lg" className="h-12 w-full text-base font-semibold" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" /> : <Lock />}
            {submitLabel}
          </Button>
          {note && <p className="text-center text-xs text-muted-foreground">{note}</p>}
        </div>
      )}
    </div>
  );
}

function AutoDebitStatus({ tenantId, subscription, autoDebit }: { tenantId: string; subscription: Subscription; autoDebit: AutoDebit }) {
  const refresh = useRefresh(tenantId);
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/card/cancel`, { method: "POST" }),
    onSuccess: (data) => {
      refresh(data);
      toast.success("Débito automático cancelado. Nenhuma nova cobrança será feita.");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const per = autoDebit.frequencyMonths === 1 ? "por mês" : "por ano";
  const firstChargePending = subscription.expired && autoDebit.status !== "paused";

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" aria-labelledby="debito">
      <div>
        <h2 id="debito" className="text-sm font-semibold">
          {autoDebit.status === "paused" ? "Débito automático com problema" : "Débito automático ativo"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPrice(autoDebit.amountCents)} {per} no cartão{autoDebit.cardLastFour && ` final ${autoDebit.cardLastFour}`} · recibos em {autoDebit.payerEmail}
          {!subscription.expired && subscription.paidUntil && ` · pago até ${formatDate(subscription.paidUntil)}`}
        </p>
      </div>
      {autoDebit.status === "paused" ? (
        <p className="text-sm">A última cobrança não passou no cartão. Pague por Pix abaixo, ou troque o cartão em Configurações &gt; Cobrança.</p>
      ) : (
        firstChargePending && <Waiting>Processando a cobrança no cartão. O acesso é liberado assim que ela for aprovada.</Waiting>
      )}
      <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => setConfirm(true)}>
        Cancelar débito automático
      </Button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o débito automático?</AlertDialogTitle>
            <AlertDialogDescription>
              Nenhuma nova cobrança será feita no cartão. Sem multa.
              {subscription.paidUntil && !subscription.expired && ` O acesso continua até ${formatDate(subscription.paidUntil)}; depois disso, renove por Pix se quiser continuar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>Cancelar débito automático</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// --- Shared bits ---

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm" role="status">
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function NoPrice({ tenantName }: { tenantName: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p>Este plano ainda não tem preço definido. Fale com a gente para renovar.</p>
      <Button asChild className="mt-3">
        <a href={whatsappLink(`Oi! Quero renovar a Chama Lia (${tenantName}).`)} target="_blank" rel="noreferrer">
          <MessageCircle /> Falar no WhatsApp
        </a>
      </Button>
    </div>
  );
}
