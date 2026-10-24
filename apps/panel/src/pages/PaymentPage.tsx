import { LogOut } from "lucide-react";
import type { Subscription } from "@/api";
import { Logo } from "@/components/logo";
import { RenewPanel } from "@/components/renew-panel";
import { Button } from "@/components/ui/button";
import { formatDate, PRIVACY_URL, TERMS_URL } from "@/lib/billing";

/**
 * What a business sees when its subscription is over: renew by Pix or automatic card debit.
 * The page refreshes by itself and lets them in as soon as the payment is confirmed.
 */
export function PaymentPage({ tenantId, subscription, onLogout }: { tenantId: string; subscription: Subscription; onLogout: () => void }) {
  const neverPaid = !subscription.paidUntil;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Logo />
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut /> Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight">{neverPaid ? "Ative sua assinatura" : "Sua assinatura venceu"}</h1>
        <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
          {subscription.tenantName} · plano {subscription.plan.name}
          {subscription.paidUntil && ` · venceu em ${formatDate(subscription.paidUntil)}`}. Seus dados continuam guardados.
        </p>

        <RenewPanel tenantId={tenantId} subscription={subscription} layout="split" />

        <div className="mt-10 border-t pt-5 text-center text-sm text-muted-foreground">
          <p>Não quer pagar agora?</p>
          <Button variant="outline" className="mt-2" onClick={onLogout}>
            Sair e voltar ao login
          </Button>
          <p className="mt-4">
            Dúvidas?{" "}
            <a
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href={`mailto:contato@chamalia.com.br?subject=${encodeURIComponent(`Dúvida sobre a assinatura · ${subscription.tenantName}`)}`}
            >
              Fale com a gente
            </a>
          </p>
          <p className="mt-3 text-xs">
            <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              Termos de Uso
            </a>
            {" · "}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              Política de Privacidade
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
