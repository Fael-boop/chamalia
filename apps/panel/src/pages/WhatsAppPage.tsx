import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Tenant, type WhatsappStatus } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ProfilePhoto } from "@/components/profile-photo";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<WhatsappStatus["state"], string> = {
  open: "Conectado",
  connecting: "Aguardando conexão",
  close: "Desconectado",
  unknown: "Sem resposta do servidor",
};

/** Pairing code shown as ABCD-1234. */
const groupCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

export function WhatsAppPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const statusKey = ["whatsapp", tenant.id];
  const [qrCode, setQrCode] = useState<string | undefined>();
  const [pairingCode, setPairingCode] = useState<string | undefined>();
  const [phone, setPhone] = useState("");
  const pairing = Boolean(qrCode || pairingCode);

  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp`),
    // While pairing, watch for the phone to finish connecting.
    refetchInterval: pairing ? 4000 : false,
  });
  const connect = useMutation({
    mutationFn: (withPhone?: string) =>
      api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp/connect`, { method: "POST", body: withPhone ? { phone: withPhone } : {} }),
    onSuccess: (result, withPhone) => {
      if (result.state === "open") {
        setQrCode(undefined);
        setPairingCode(undefined);
        void queryClient.invalidateQueries({ queryKey: statusKey });
        return;
      }
      setQrCode(result.qrCode);
      setPairingCode(result.pairingCode);
      if (withPhone && !result.pairingCode) toast.info("Não consegui gerar o código para esse número. Use o QR code.");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const disconnect = useMutation({
    mutationFn: () => api(`/tenants/${tenant.id}/whatsapp/disconnect`, { method: "POST" }),
    onSuccess: () => {
      setQrCode(undefined);
      setPairingCode(undefined);
      toast.success("WhatsApp desconectado");
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // QR codes expire: refresh every 20 s while one is shown (pairing codes last longer).
  const refreshQr = connect.mutate;
  useEffect(() => {
    if (!qrCode) return;
    const timer = setInterval(() => refreshQr(undefined), 20_000);
    return () => clearInterval(timer);
  }, [qrCode, refreshQr]);

  useEffect(() => {
    if (pairing && status.data?.state === "open") {
      setQrCode(undefined);
      setPairingCode(undefined);
      toast.success("WhatsApp conectado");
    }
  }, [pairing, status.data?.state]);

  const state = status.data?.state;
  const digits = phone.replace(/\D/g, "");
  const validPhone = /^\d{10,15}$/.test(digits);
  const busy = connect.isPending || disconnect.isPending;

  return (
    <>
      {!mobile && <PageHeader title="WhatsApp" description={`O número que a ${tenant.assistantName} usa para atender. Conecte, troque ou reconecte quando precisar.`} />}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          {status.isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn("size-2 rounded-full", state === "open" ? "bg-status-confirmed" : "bg-muted-foreground/40")} />
              {state ? STATE_LABELS[state] : "—"}
              {state === "open" && status.data?.number && (
                <span className="font-normal text-muted-foreground tabular-nums">· {formatPhone(status.data.number)}</span>
              )}
            </span>
          )}
        </div>

        <div className="p-4">
          {state === "open" ? (
            <p className="text-sm text-muted-foreground">A {tenant.assistantName} está respondendo por este número.</p>
          ) : pairingCode ? (
            <div className="space-y-3">
              <div className="text-3xl font-semibold tracking-widest tabular-nums">{groupCode(pairingCode)}</div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                <li>No celular desse número, abra o WhatsApp.</li>
                <li>Vá em Configurações › Aparelhos conectados › Conectar aparelho.</li>
                <li>Toque em “Conectar com número de telefone” e digite o código acima.</li>
              </ol>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              <img src={qrCode} width={240} height={240} alt="QR code para conectar o WhatsApp" className="rounded-md border bg-white p-2" />
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>No celular do número do negócio, abra o WhatsApp.</li>
                <li>Vá em Configurações › Aparelhos conectados.</li>
                <li>Toque em Conectar aparelho e aponte a câmera para o código.</li>
              </ol>
            </div>
          ) : status.data && !status.data.available ? (
            <p className="text-sm text-muted-foreground">
              Não consegui falar com o servidor do WhatsApp agora. Se continuar assim, avise o suporte da Chama Lia.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum número conectado. Toque em Conectar e leia o QR code com o WhatsApp do número que a {tenant.assistantName} vai usar.
            </p>
          )}
        </div>

        {state !== "open" && (
          <div className="space-y-3 border-t p-4">
            <Button onClick={() => connect.mutate(undefined)} disabled={busy} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
              {connect.isPending && !connect.variables ? "Gerando…" : qrCode ? "Gerar outro QR code" : "Conectar com QR code"}
            </Button>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (validPhone) connect.mutate(digits);
              }}
            >
              <Input
                className="sm:w-56 tabular-nums"
                inputMode="tel"
                placeholder="5511999990000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-label="Número do WhatsApp para conectar com código"
              />
              <Button type="submit" variant="outline" disabled={busy || !validPhone}>
                {connect.isPending && connect.variables ? "Gerando…" : "Conectar com código"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Está no celular do número? Use “Conectar com código”: digite o número com DDI e DDD e depois o código no WhatsApp.
            </p>
          </div>
        )}

        {state === "open" && (
          <div className="border-t p-4">
            <ConfirmDelete
              title="Trocar ou desconectar o número?"
              description={`A ${tenant.assistantName} para de responder neste WhatsApp até você conectar um número de novo. As conversas e a agenda continuam guardadas.`}
              confirmLabel="Desconectar"
              onConfirm={() => disconnect.mutate()}
            >
              <Button variant="outline" disabled={busy} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
                Trocar número / desconectar
              </Button>
            </ConfirmDelete>
          </div>
        )}
        <ProfilePhoto tenant={tenant} />
      </div>
      <div className="mt-3 space-y-1">
        <Hint>Use um número só para a {tenant.assistantName}: ela responde as clientes por ele. Se o WhatsApp cair, volte aqui e conecte de novo.</Hint>
        <Hint>Conexão não oficial: prefira um chip próprio, e não o número principal do negócio.</Hint>
      </div>
    </>
  );
}
