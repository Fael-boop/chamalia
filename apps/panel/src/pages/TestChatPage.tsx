import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type Tenant, type TestChatReply, type TestChatState } from "../api";
import { formatPhone, formatTime } from "../format";

/** Owner notifications are not stored; they live only in this screen. */
type Notice = { id: string; text: string; createdAt: string };

const DEFAULT_PHONE = "5511999990000";

export function TestChatPage({ tenant }: { tenant: Tenant }) {
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [state, setState] = useState<TestChatState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [ownerPhoneMissing, setOwnerPhoneMissing] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const base = `/tenants/${tenant.id}/test-chat`;
  const validPhone = /^\d{10,15}$/.test(phone);

  const load = useCallback(async () => {
    if (!/^\d{10,15}$/.test(phone)) return;
    setState(await api<TestChatState>(`${base}?phone=${phone}`));
  }, [base, phone]);

  useEffect(() => {
    setNotices([]);
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [state, notices, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setPending(text);
    setError("");
    try {
      const result = await api<TestChatReply>(base, { method: "POST", body: { phone, text } });
      setOwnerPhoneMissing(result.ownerPhoneMissing);
      const now = new Date().toISOString();
      setNotices((current) => [
        ...current,
        ...result.ownerNotices.map((notice, index) => ({ id: `${now}-${index}`, text: notice, createdAt: now })),
      ]);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setDraft(text);
    } finally {
      setPending(null);
    }
  }

  async function resetConversation() {
    setError("");
    await api(`${base}?phone=${phone}`, { method: "DELETE" });
    setNotices([]);
    await load();
  }

  async function releaseToAssistant() {
    setError("");
    await api(`${base}/release`, { method: "POST", body: { phone } });
    await load();
  }

  const items = [
    ...(state?.messages ?? []).map((m) => ({ kind: "message" as const, createdAt: m.createdAt, message: m })),
    ...notices.map((n) => ({ kind: "notice" as const, createdAt: n.createdAt, notice: n })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <h1>Testar a {tenant.assistantName}</h1>
      <p className="muted">
        Converse como se fosse uma cliente no WhatsApp. É o mesmo motor que vai responder no WhatsApp; os agendamentos
        feitos aqui entram na agenda de verdade.
      </p>

      <div className="row">
        <label className="row">
          Telefone da cliente
          <input value={phone} size={16} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
        </label>
        <span className="muted">{validPhone ? formatPhone(phone) : "use DDI + DDD + número, só números"}</span>
        <span className="spacer" />
        <button onClick={resetConversation} disabled={!validPhone || Boolean(pending)}>
          Nova conversa
        </button>
      </div>

      {state?.withOwner && (
        <p className="row">
          <span>
            <strong>Conversa com a dona:</strong> a {tenant.assistantName} não responde até ser devolvida.
            {state.handoffReason && <span className="muted"> Pedido: {state.handoffReason}</span>}
          </span>
          <button onClick={releaseToAssistant}>Devolver para a {tenant.assistantName}</button>
        </p>
      )}

      <div className="chat" style={{ marginTop: 12 }}>
        {items.length === 0 && !pending && <p className="muted">Mande a primeira mensagem, por exemplo "oi, quero marcar um horário".</p>}
        {items.map((item) =>
          item.kind === "message" ? (
            <div key={item.message.id} className={`bubble ${item.message.direction}`}>
              {item.message.body}
              <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
                {formatTime(item.message.createdAt, tenant.timezone)}
              </div>
            </div>
          ) : (
            <div key={item.notice.id} className="notice">
              Aviso para a dona no WhatsApp:{"\n"}
              {item.notice.text}
            </div>
          ),
        )}
        {pending && (
          <>
            <div className="bubble inbound">{pending}</div>
            <div className="muted">{state?.withOwner ? "Enviando…" : `${tenant.assistantName} está digitando…`}</div>
          </>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          placeholder="Escreva como a cliente…"
          value={draft}
          disabled={!validPhone}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!validPhone || !draft.trim() || Boolean(pending)}>
          Enviar
        </button>
      </form>

      {ownerPhoneMissing && notices.length > 0 && (
        <p className="muted">
          O WhatsApp da dona ainda não está cadastrado: no WhatsApp real esses avisos não seriam enviados.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}
