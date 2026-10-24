import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, LogOut, MessageCircle, Minus, Plus } from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Subscription } from "@/api";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/format";
import { formatDate, paidUntilAfter, quote, subscriptionKey } from "@/lib/billing";
import { cn } from "@/lib/utils";

const SUPPORT_PHONE = "556294737276";
const PRESETS = [1, 3, 6, 12];
const monthsLabel = (n: number) => (n === 1 ? "1 mês" : n === 12 ? "12 meses" : `${n} meses`);

/**
 * What a business sees when its subscription is over: choose how long to renew, pay by Pix,
 * tell us it is paid. The page refreshes by itself and lets them in once the agency confirms.
 */
export function PaymentPage({ tenantId, subscription, onLogout }: { tenantId: string; subscription: Subscription; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const { plan, pending } = subscription;
  const [months, setMonths] = useState(pending?.months ?? 1);
  const [custom, setCustom] = useState(pending ? !PRESETS.includes(pending.months) : false);
  const [choosing, setChoosing] = useState(!pending);

  const refresh = (data: Subscription) => queryClient.setQueryData(subscriptionKey(tenantId), data);
  const checkout = useMutation({
    mutationFn: () => api<Subscription>(`/tenants/${tenantId}/subscription/checkout`, { method: "POST", body: { months } }),
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

  const total = quote(plan, months);
  const neverPaid = !subscription.paidUntil;
  const title = neverPaid ? "Ative sua assinatura" : "Sua assinatura venceu";
  const showPay = !choosing && pending;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-4">
        <Logo />
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut /> Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {subscription.tenantName} · plano {plan.name}
          {subscription.paidUntil && ` · venceu em ${formatDate(subscription.paidUntil)}`}. Seus dados continuam guardados.
        </p>

        {showPay ? (
          <PayStep
            subscription={subscription}
            busy={report.isPending}
            onReport={() => report.mutate()}
            onChangePeriod={() => setChoosing(true)}
          />
        ) : (
          <section className="mt-8 space-y-6" aria-labelledby="periodo">
            <div>
              <h2 id="periodo" className="text-sm font-medium">
                Por quanto tempo quer renovar?
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="periodo">
                {PRESETS.map((n) => {
                  const price = quote(plan, n);
                  const selected = !custom && months === n;
                  const yearlyDeal = n === 12 && plan.priceCentsYearly !== null && plan.priceCentsMonthly !== null;
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
                      {yearlyDeal && (
                        <span className="text-xs text-status-confirmed">{formatPrice(Math.round(plan.priceCentsYearly! / 12))}/mês</span>
                      )}
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
              <div className="rounded-lg border bg-card p-4 text-sm">
                <p>Este plano ainda não tem preço definido. Fale com a gente para renovar.</p>
                <Button asChild className="mt-3">
                  <a href={whatsappLink(`Oi! Quero renovar a Chama Lia (${subscription.tenantName}).`)} target="_blank" rel="noreferrer">
                    <MessageCircle /> Falar no WhatsApp
                  </a>
                </Button>
              </div>
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
                <Button size="lg" className="h-12 w-full text-base" disabled={checkout.isPending} onClick={() => checkout.mutate()}>
                  {checkout.isPending ? <Loader2 className="animate-spin" /> : null}
                  Pagar {formatPrice(total)} com Pix
                </Button>
              </>
            )}
          </section>
        )}

        <div className="mt-10 border-t pt-5 text-center text-sm text-muted-foreground">
          <p>Não quer pagar agora?</p>
          <Button variant="outline" className="mt-2" onClick={onLogout}>
            Sair e voltar ao login
          </Button>
          <p className="mt-4">
            Dúvidas?{" "}
            <a className="font-medium text-foreground underline-offset-4 hover:underline" href={whatsappLink("Oi! Tenho uma dúvida sobre a minha assinatura da Chama Lia.")} target="_blank" rel="noreferrer">
              Fale com a gente
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function PayStep({
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
    <section className="mt-8 space-y-5" aria-labelledby="pagar">
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
                href={whatsappLink(
                  `Oi! Quero renovar a Chama Lia (${subscription.tenantName}): ${monthsLabel(pending.months)}, ${formatPrice(pending.amountCents)}.`,
                )}
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
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm" role="status">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <p>
            Aguardando o pagamento. Assim que o Pix for pago, seu acesso é liberado na hora e esta tela se atualiza sozinha.
            {pending.expiresAt && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Este Pix vale até {format(new Date(pending.expiresAt), "dd/MM 'às' HH:mm")}.
              </span>
            )}
          </p>
        </div>
      ) : pending.reportedAt ? (
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm" role="status">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <p>
            Recebemos seu aviso. Assim que o pagamento for confirmado, seu acesso volta sozinho e esta tela se atualiza. Pode
            deixá-la aberta.
          </p>
        </div>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const whatsappLink = (text: string) => `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(text)}`;
