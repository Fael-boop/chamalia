import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Tenant, type WhatsappStatus } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const STATE_LABELS: Record<WhatsappStatus["state"], string> = {
  open: "Conectado",
  connecting: "Aguardando leitura do QR code",
  close: "Desconectado",
  unknown: "Sem resposta da Evolution",
};

export function WhatsAppPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const [qrCode, setQrCode] = useState<string | undefined>();
  const status = useQuery({
    queryKey: ["whatsapp", tenant.id],
    queryFn: () => api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp`),
    // While pairing, watch for the phone to finish connecting.
    refetchInterval: qrCode ? 4000 : false,
  });
  const connect = useMutation({
    mutationFn: () => api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp/connect`, { method: "POST" }),
    onSuccess: (result) => setQrCode(result.state === "open" ? undefined : result.qrCode),
    onError: (e) => toast.error((e as Error).message),
  });

  // QR codes expire: refresh every 20 s while one is shown.
  const refreshQr = connect.mutate;
  useEffect(() => {
    if (!qrCode) return;
    const timer = setInterval(() => refreshQr(), 20_000);
    return () => clearInterval(timer);
  }, [qrCode, refreshQr]);

  useEffect(() => {
    if (qrCode && status.data?.state === "open") {
      setQrCode(undefined);
      toast.success("WhatsApp conectado");
    }
  }, [qrCode, status.data?.state]);

  const state = status.data?.state;

  return (
    <>
      {!mobile && <PageHeader title="WhatsApp" description="Conexão do número que a atendente usa." />}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          {status.isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn("size-2 rounded-full", state === "open" ? "bg-status-confirmed" : "bg-muted-foreground/40")} />
              {state ? STATE_LABELS[state] : "—"}
            </span>
          )}
          {status.data?.instance && <span className="text-xs text-muted-foreground">{status.data.instance}</span>}
        </div>
        <div className="p-4">
          {qrCode ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              <img src={qrCode} width={240} height={240} alt="QR code para conectar o WhatsApp" className="rounded-md border bg-white p-2" />
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>No celular do número do negócio, abra o WhatsApp.</li>
                <li>Vá em Configurações › Aparelhos conectados.</li>
                <li>Toque em Conectar aparelho e aponte a câmera para o código.</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {state === "open"
                ? `A ${tenant.assistantName} já está respondendo por este número.`
                : status.data && !status.data.available
                  ? "Confira se o Docker Desktop está aberto e a Evolution rodando (npm run evolution:up)."
                  : "Conecte o número que a atendente vai usar. O QR code aparece aqui."}
            </p>
          )}
        </div>
        {state !== "open" && (
          <div className="border-t p-4">
            <Button onClick={() => connect.mutate()} disabled={connect.isPending} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
              {connect.isPending ? "Gerando…" : qrCode ? "Gerar outro QR code" : "Conectar WhatsApp"}
            </Button>
          </div>
        )}
      </div>
      <div className="mt-3">
        <Hint>Conexão não oficial (Evolution): use um chip próprio, nunca o número principal do negócio.</Hint>
      </div>
    </>
  );
}
