import { useEffect, useState } from "react";
import { api, type Niche, type Tenant, type TenantSummary } from "../api";
import type { ClientTab } from "./ClientPage";

const emptyForm = { name: "", businessType: "beauty_salon", ownerName: "", ownerPhone: "", address: "", assistantName: "Lia" };

export function ClientsPage({ onOpen }: { onOpen: (tenantId: string, tab?: ClientTab) => void }) {
  const [clients, setClients] = useState<TenantSummary[] | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<TenantSummary[]>("/tenants"), api<Niche[]>("/niches")])
      .then(([list, nicheList]) => {
        setClients(list);
        setNiches(nicheList);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const nicheLabel = (value: string) => niches.find((n) => n.value === value)?.label ?? value;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const tenant = await api<Tenant>("/tenants", {
        method: "POST",
        body: {
          name: form.name,
          businessType: form.businessType,
          assistantName: form.assistantName || undefined,
          ownerName: form.ownerName || null,
          ownerPhone: form.ownerPhone || null,
          address: form.address || null,
        },
      });
      onOpen(tenant.id, "services");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const set = (field: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Clientes</h1>
        <span className="spacer" />
        {!showForm && (
          <button className="primary" onClick={() => setShowForm(true)}>
            Novo cliente
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {showForm && (
        <form className="form" onSubmit={create} style={{ margin: "16px 0 24px" }}>
          <h2 style={{ margin: 0 }}>Novo cliente</h2>
          <label>
            Nome do negócio
            <input required value={form.name} onChange={set("name")} placeholder="Ex.: Salão da Ana" />
          </label>
          <label>
            Nicho
            <select value={form.businessType} onChange={set("businessType")}>
              {niches.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <small>Define a lista inicial de serviços. Depois você ajusta tudo.</small>
          </label>
          <label>
            Nome da dona
            <input value={form.ownerName} onChange={set("ownerName")} />
            <small>Vira a primeira profissional cadastrada.</small>
          </label>
          <label>
            WhatsApp da dona
            <input value={form.ownerPhone} onChange={set("ownerPhone")} placeholder="5511999999999" />
            <small>Recebe os avisos de agendamento. DDI + DDD + número.</small>
          </label>
          <label>
            Endereço
            <input value={form.address} onChange={set("address")} />
          </label>
          <label>
            Nome da atendente virtual
            <input value={form.assistantName} onChange={set("assistantName")} />
          </label>
          <div className="row">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar cliente"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {clients && clients.length === 0 && <p className="muted">Nenhum cliente ainda.</p>}
      {clients && clients.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nicho</th>
                <th>Dona</th>
                <th>WhatsApp</th>
                <th>Próximos agendamentos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={c.active ? undefined : "inactive"}>
                  <td>
                    {c.name}
                    {!c.active && " (inativo)"}
                  </td>
                  <td>{nicheLabel(c.businessType)}</td>
                  <td>{c.ownerName ?? "—"}</td>
                  <td>{c.whatsappInstance ? "configurado" : "—"}</td>
                  <td>{c.upcoming}</td>
                  <td>
                    <button onClick={() => onOpen(c.id)}>Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
