import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Copy, CreditCard, Loader2, MessageCircle, Minus, Plus, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type AutoDebit, type Subscription } from "@/api";
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

/**
 * Renewing a subscription: Pix (choose the months, pay, released by itself) or automatic card
 * debit (5% off, renews by itself, cancel in one click). Used on the blocked page and in Configurações > Cobrança.
 */
export function RenewPanel({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const { autoDebit } = subscription;
  const [method, setMethod] = useState<"pix" | "card">(subscription.pending ? "pix" : subscription.cardAvailable ? "card" : "pix");

  // An active debit renews by itself: nothing to choose, only to manage.
  if (autoDebit && autoDebit.status !== "paused") return <AutoDebitStatus tenantId={tenantId} subscription={subscription} autoDebit={autoDebit} />;

  return (
    <div className="space-y-6">
      {autoDebit && <AutoDebitStatus tenantId={tenantId} subscription={subscription} autoDebit={autoDebit} />}

      {subscription.cardAvailable && (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Forma de pagamento">
          <MethodTab active={method === "card"} onClick={() => setMethod("card")} icon={<CreditCard />} title="Cartão" note="5% de desconto · renova sozinho" />
          <MethodTab active={method === "pix"} onClick={() => setMethod("pix")} icon={<QrCode />} title="Pix" note="Escolha quantos meses" />
        </div>
      )}

      {method === "card" && subscription.cardAvailable ? (
        <CardSubscribe tenantId={tenantId} subscription={subscription} />
      ) : (
        <PixRenew tenantId={tenantId} subscription={subscription} />
      )}
    </div>
  );
}

function MethodTab({ active, onClick, icon, title, note }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; note: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors duration-150 [&_svg]:size-5 [&_svg]:shrink-0",
        active ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{note}</span>
      </span>
    </button>
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

// --- Pix ---

export function PixRenew({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const refresh = useRefresh(tenantId);
  const { plan, pending } = subscription;
  const [months, setMonths] = useState<number>(pending?.months ?? 1);
  const [custom, setCustom] = useState(pending ? !(PRESETS as readonly number[]).includes(pending.months) : false);
  const [choosing, setChoosing] = useState(!pending);
  const [terms, setTerms] = useState(subscription.termsAccepted);

  const checkout = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/checkout`, { method: "POST", body: { months, acceptTerms: true } }),
    onSuccess: (data) => {
      refresh(data);
      setChoosing(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const report = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/payments/${pending!.id}/report`, { method: "POST" }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  if (!choosing && pending) {
    return <PixPay subscription={subscription} busy={report.isPending} onReport={() => report.mutate()} onChangePeriod={() => setChoosing(true)} />;
  }

  const total = (PRESETS as readonly number[]).includes(months) ? subscription.prices.pix[months as 1 | 3 | 6 | 12] : quote(plan, months);

  return (
    <section className="space-y-6" aria-labelledby="periodo">
      <div>
        <h2 id="periodo" className="text-sm font-medium">
          Por quanto tempo quer renovar?
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="periodo">
          {PRESETS.map((n) => {
            const price = subscription.prices.pix[n];
            const selected = !custom && months === n;
            return (
              <button
                key={n}
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setCustom(false);
                  setMonths(n);
                }}
                className={cn(
                  "flex min-h-20 flex-col items-start justify-center rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-150",
                  selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
                )}
              >
                <span className="text-sm font-semibold">{monthsLabel(n)}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{price === null ? "—" : formatPrice(price)}</span>
                {n === 12 && price !== null && <span className="text-xs font-medium text-status-confirmed">2 meses grátis</span>}
              </button>
            );
          })}
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
      </div>

      {total === null ? (
        <NoPrice tenantName={subscription.tenantName} />
      ) : (
        <>
          <dl className="divide-y rounded-lg border bg-card text-sm">
            <SummaryRow label="Plano" value={plan.name} />
            <SummaryRow label="Período" value={monthsLabel(months)} />
            <SummaryRow label="Acesso liberado até" value={formatDate(paidUntilAfter(subscription.paidUntil, months))} />
            <div className="flex items-baseline justify-between px-4 py-3">
              <dt className="font-medium">Total</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatPrice(total)}</dd>
            </div>
          </dl>
          <TermsCheck checked={terms} onChange={setTerms} />
          <Button size="lg" className="h-12 w-full text-base" disabled={!terms || checkout.isPending} onClick={() => checkout.mutate()}>
            {checkout.isPending && <Loader2 className="animate-spin" />}
            Pagar {formatPrice(total)} com Pix
          </Button>
          <p className="text-xs text-muted-foreground">
            Pagamento único, sem renovação automática. Desistiu em até 7 dias? Devolvemos o valor, é só pedir.
          </p>
        </>
      )}
    </section>
  );
}

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
      <div className="rounded-lg border bg-card">
        <div className="flex items-baseline justify-between border-b px-4 py-3">
          <h2 id="pagar" className="text-sm font-medium">
            {monthsLabel(pending.months)} · até {until}
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
        Escolher outro período
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

export function CardSubscribe({ tenantId, subscription }: { tenantId: string; subscription: Subscription }) {
  const refresh = useRefresh(tenantId);
  const { resolved } = useTheme();
  const [frequency, setFrequency] = useState<1 | 12>(1);
  const [email, setEmail] = useState(subscription.billingEmail ?? "");
  const [terms, setTerms] = useState(subscription.termsAccepted);
  const [step, setStep] = useState<"details" | "card">("details");

  const price = subscription.prices.card[frequency];
  const pixPrice = subscription.prices.pix[frequency];
  if (price === null || pixPrice === null) return <NoPrice tenantName={subscription.tenantName} />;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const per = frequency === 1 ? "por mês" : "por ano";

  const submit = async (card: CardResult) => {
    try {
      const data = await api<Subscription>(`/tenants/${tenantId}/subscription/card`, {
        method: "POST",
        body: { cardToken: card.token, cardBrand: card.cardBrand, lastFour: card.lastFour, email: email.trim(), frequencyMonths: frequency, acceptTerms: true },
      });
      refresh(data);
      toast.success("Débito automático ativado.");
    } catch (error) {
      toast.error((error as Error).message);
      // Rejecting lets the card form show the error and stay editable.
      throw error;
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="cartao">
      <h2 id="cartao" className="sr-only">
        Débito automático no cartão
      </h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Frequência da cobrança">
        {([1, 12] as const).map((n) => {
          const value = subscription.prices.card[n];
          return (
            <button
              key={n}
              role="radio"
              aria-checked={frequency === n}
              disabled={step === "card"}
              onClick={() => setFrequency(n)}
              className={cn(
                "flex min-h-20 flex-col items-start justify-center rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-150 disabled:opacity-60",
                frequency === n ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
              )}
            >
              <span className="text-sm font-semibold">{n === 1 ? "Mensal" : "Anual"}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {value === null ? "—" : `${formatPrice(value)} ${n === 1 ? "por mês" : "por ano"}`}
              </span>
              <span className="text-xs font-medium text-status-confirmed">{n === 1 ? "5% de desconto" : "2 meses grátis + 5%"}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p>
          <span className="font-semibold">{formatPrice(price)} {per}</span>{" "}
          <span className="text-muted-foreground">
            (em vez de <span className="line-through">{formatPrice(pixPrice)}</span>)
          </span>
          , cobrado automaticamente no cartão de crédito até você cancelar.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>A primeira cobrança é feita agora e o acesso é liberado na hora.</li>
          <li>Cancele quando quiser em Configurações &gt; Cobrança, com um clique e sem multa. O que já foi pago vale até o fim do período.</li>
          <li>Desistiu em até 7 dias da primeira cobrança? Devolvemos o valor.</li>
          <li>O cartão é digitado no ambiente seguro do Mercado Pago. A Chama Lia não vê nem guarda os dados do cartão.</li>
        </ul>
      </div>

      {step === "details" ? (
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">E-mail para recibos</span>
            <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </label>
          <TermsCheck checked={terms} onChange={setTerms} />
          <Button size="lg" className="h-12 w-full text-base" disabled={!validEmail || !terms} onClick={() => setStep("card")}>
            Continuar para o cartão
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <CardForm publicKey={subscription.mercadoPagoPublicKey!} amountCents={price} email={email.trim()} dark={resolved === "dark"} onSubmit={submit} />
          <Button variant="link" className="h-auto w-full px-0" onClick={() => setStep("details")}>
            Voltar
          </Button>
        </div>
      )}
    </section>
  );
}

/** Mercado Pago's secure card fields (Card Payment Brick): the card never touches our servers. */
export function CardForm({
  publicKey,
  amountCents,
  email,
  dark,
  submitLabel = "Assinar com débito automático",
  onSubmit,
}: {
  publicKey: string;
  amountCents: number;
  email: string;
  dark: boolean;
  submitLabel?: string;
  onSubmit: (card: CardResult) => Promise<void>;
}) {
  ensureMercadoPago(publicKey);
  const [ready, setReady] = useState(false);
  return (
    <div className="min-h-40">
      {!ready && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Abrindo o ambiente seguro do Mercado Pago…
        </p>
      )}
      <CardPayment
        locale="pt-BR"
        initialization={{ amount: amountCents / 100, payer: { email } }}
        customization={{
          paymentMethods: { maxInstallments: 1, types: { excluded: ["debit_card", "prepaid_card"] } },
          visual: { style: { theme: dark ? "dark" : "default" }, texts: { formSubmit: submitLabel } },
        }}
        onReady={() => setReady(true)}
        onError={(error) => console.warn("card form", error)}
        onSubmit={(formData, additional) =>
          onSubmit({ token: formData.token, cardBrand: formData.payment_method_id, lastFour: additional?.lastFourDigits })
        }
      />
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
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-labelledby="debito">
      <div>
        <h2 id="debito" className="text-sm font-semibold">
          {autoDebit.status === "paused" ? "Débito automático com problema" : "Débito automático ativo"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPrice(autoDebit.amountCents)} {per} no cartão · recibos em {autoDebit.payerEmail}
          {!subscription.expired && subscription.paidUntil && ` · pago até ${formatDate(subscription.paidUntil)}`}
        </p>
      </div>
      {autoDebit.status === "paused" ? (
        <p className="text-sm">
          A última cobrança não passou no cartão. Pague por Pix abaixo, ou cancele e assine de novo com outro cartão.
        </p>
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

function Waiting({ children }: { children: React.ReactNode }) {
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
