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
    <>
      <p>
        Situação: <strong>{status ? STATE_LABELS[status.state] : "…"}</strong>
        {status?.instance && <span className="muted"> · instância {status.instance}</span>}
      </p>
      {status && !status.available && (
        <p className="muted">Confira se o Docker Desktop está aberto e a Evolution está rodando (npm run evolution:up).</p>
      )}

      {status?.state !== "open" && (
        <button className="primary" onClick={connect} disabled={busy}>
          {busy ? "Gerando…" : qrCode ? "Gerar outro QR code" : "Conectar WhatsApp"}
        </button>
      )}
      {status?.state === "open" && <button onClick={() => refresh()}>Atualizar</button>}

      {qrCode && (
        <div style={{ marginTop: 16 }}>
          <img src={qrCode} width={280} height={280} alt="QR code para conectar o WhatsApp" />
          <ol>
            <li>No celular do número do cliente, abra o WhatsApp.</li>
            <li>Vá em Configurações › Aparelhos conectados › Conectar aparelho.</li>
            <li>Aponte a câmera para este QR code. A tela atualiza sozinha.</li>
          </ol>
        </div>
      )}

      <p className="muted" style={{ marginTop: 24 }}>
        Conexão pela Evolution (não oficial): use um chip próprio para o bot, nunca o número principal do cliente.
      </p>
      {error && <p className="error">{error}</p>}
    </>
  );
}
