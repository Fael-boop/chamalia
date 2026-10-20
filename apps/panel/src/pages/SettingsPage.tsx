import { useEffect, useState } from "react";
import { api, type Niche, type Tenant } from "../api";

type Form = {
  name: string;
  businessType: string;
  assistantName: string;
  ownerName: string;
  ownerPhone: string;
  address: string;
  tone: "friendly" | "formal";
  useEmoji: boolean;
  extraInfo: string;
  handoffRules: string;
  minNoticeHours: string;
  bookingHorizonDays: string;
  active: boolean;
};

function toForm(t: Tenant): Form {
  return {
    name: t.name,
    businessType: t.businessType,
    assistantName: t.assistantName,
    ownerName: t.ownerName ?? "",
    ownerPhone: t.ownerPhone ?? "",
    address: t.address ?? "",
    tone: t.tone,
    useEmoji: t.useEmoji,
    extraInfo: t.extraInfo ?? "",
    handoffRules: t.handoffRules ?? "",
    minNoticeHours: String(t.minNoticeMinutes / 60),
    bookingHorizonDays: String(t.bookingHorizonDays),
    active: t.active,
  };
}

export function SettingsPage({ tenant, onSaved }: { tenant: Tenant; onSaved: (tenant: Tenant) => void }) {
  const [form, setForm] = useState<Form>(() => toForm(tenant));
  const [niches, setNiches] = useState<Niche[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Niche[]>("/niches").then(setNiches).catch(() => {});
  }, []);

  const set = <K extends keyof Form>(field: K, value: Form[K]) => {
    setForm({ ...form, [field]: value });
    setStatus("");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    try {
      const saved = await api<Tenant>(`/tenants/${tenant.id}`, {
        method: "PATCH",
        body: {
          name: form.name,
          businessType: form.businessType,
          assistantName: form.assistantName,
          ownerName: form.ownerName || null,
          ownerPhone: form.ownerPhone || null,
          address: form.address || null,
          tone: form.tone,
          useEmoji: form.useEmoji,
          extraInfo: form.extraInfo || null,
          handoffRules: form.handoffRules || null,
          minNoticeMinutes: Math.round(Number(form.minNoticeHours.replace(",", ".")) * 60),
          bookingHorizonDays: Number(form.bookingHorizonDays),
          active: form.active,
        },
      });
      onSaved(saved);
      setForm(toForm(saved));
      setStatus("Configurações salvas.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="panel">
        <div className="panel-header">
          <h2>Negócio</h2>
        </div>
        <div className="panel-body form-grid">
          <label className="form-field">
            Nome do negócio
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="form-field">
            Nicho
            <select value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
              {niches.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Nome da dona
            <input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </label>
          <label className="form-field">
            WhatsApp da dona
            <input value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="5511999999999" />
            <small>Recebe avisos de agendamento, cancelamento e conversas passadas para ela.</small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            Endereço
            <input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </label>
          <label className="form-field check" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Cliente ativo (desmarcado, a atendente não responde ninguém)
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Atendente virtual</h2>
        </div>
        <div className="panel-body form-grid">
          <label className="form-field">
            Nome
            <input required value={form.assistantName} onChange={(e) => set("assistantName", e.target.value)} />
          </label>
          <label className="form-field">
            Jeito de falar
            <select value={form.tone} onChange={(e) => set("tone", e.target.value as Form["tone"])}>
              <option value="friendly">Simpático e informal</option>
              <option value="formal">Mais formal (senhor/senhora)</option>
            </select>
          </label>
          <label className="form-field check" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={form.useEmoji} onChange={(e) => set("useEmoji", e.target.checked)} />
            Pode usar emoji de vez em quando
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            Informações que ela pode responder
            <textarea
              rows={5}
              value={form.extraInfo}
              onChange={(e) => set("extraInfo", e.target.value)}
              placeholder={"Ex.:\nAceitamos Pix, débito e crédito.\nTem estacionamento na rua.\nAtraso de mais de 15 min precisa remarcar."}
            />
            <small>Ela só responde dúvidas com o que estiver aqui. O resto passa para a dona.</small>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            Sempre passar para a dona quando…
            <textarea
              rows={3}
              value={form.handoffRules}
              onChange={(e) => set("handoffRules", e.target.value)}
              placeholder="Ex.: pedirem desconto; falarem de noiva ou festa; reclamarem de algum serviço."
            />
            <small>Química, combos, encaixe e serviços fora da lista ela já passa sozinha.</small>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Agendamento</h2>
        </div>
        <div className="panel-body form-grid">
          <label className="form-field">
            Antecedência mínima (horas)
            <input type="number" min={0} step={0.5} value={form.minNoticeHours} onChange={(e) => set("minNoticeHours", e.target.value)} />
          </label>
          <label className="form-field">
            Agenda aberta até quantos dias à frente
            <input type="number" min={1} max={365} value={form.bookingHorizonDays} onChange={(e) => set("bookingHorizonDays", e.target.value)} />
          </label>
        </div>
        <div className="panel-footer">
          <button className="primary" type="submit">
            Salvar configurações
          </button>
          {status && <span className="muted">{status}</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </form>
  );
}
