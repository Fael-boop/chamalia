import { useCallback, useEffect, useState } from "react";
import { api, type Tenant, type WhatsappStatus } from "../api";

const STATE_LABELS: Record<WhatsappStatus["state"], string> = {
  open: "Conectado",
  connecting: "Aguardando leitura do QR code",
  close: "Desconectado",
  unknown: "Sem resposta da Evolution",
};

export function WhatsAppPage({ tenant }: { tenant: Tenant }) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const current = await api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp`);
    setStatus(current);
    if (current.state === "open") setQrCode(undefined);
  }, [tenant.id]);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  // While a QR code is on screen, refresh it (it expires) and watch for the connection.
  useEffect(() => {
    if (!qrCode) return;
    const timer = setInterval(() => {
      api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp/connect`, { method: "POST" })
        .then((result) => {
          setStatus(result);
          setQrCode(result.state === "open" ? undefined : result.qrCode);
        })
        .catch((e: Error) => setError(e.message));
    }, 15_000);
    return () => clearInterval(timer);
  }, [qrCode, tenant.id]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const result = await api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp/connect`, { method: "POST" });
      setStatus(result);
      setQrCode(result.state === "open" ? undefined : result.qrCode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>
          <span className={`status${status?.state === "open" ? " ok" : ""}`}>{status ? STATE_LABELS[status.state] : "Verificando…"}</span>
        </h2>
        {status?.instance && <span className="muted">Instância {status.instance}</span>}
      </div>
      <div className="panel-body">
        {status && !status.available && (
          <p className="muted" style={{ marginTop: 0 }}>
            Confira se o Docker Desktop está aberto e a Evolution está rodando (npm run evolution:up).
          </p>
        )}

        {qrCode ? (
          <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
            <img src={qrCode} width={240} height={240} alt="QR code para conectar o WhatsApp" />
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>No celular do número do cliente, abra o WhatsApp.</li>
              <li>Vá em Configurações › Aparelhos conectados.</li>
              <li>Toque em Conectar aparelho.</li>
              <li>Aponte a câmera para este QR code.</li>
            </ol>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {status?.state === "open"
              ? `A ${tenant.assistantName} já está respondendo por este número.`
              : "Conecte o número que a atendente vai usar. O QR code aparece aqui."}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="panel-footer">
        {status?.state !== "open" ? (
          <button className="primary" onClick={connect} disabled={busy}>
            {busy ? "Gerando…" : qrCode ? "Gerar outro QR code" : "Conectar WhatsApp"}
          </button>
        ) : (
          <button onClick={() => refresh()}>Atualizar situação</button>
        )}
        <span className="muted">Conexão não oficial (Evolution): use um chip próprio, nunca o número principal do cliente.</span>
      </div>
    </div>
  );
}
