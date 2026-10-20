import { useCallback, useEffect, useState } from "react";
import { api, type Service, type Tenant } from "../api";
import { formatPrice, parsePrice } from "../format";

type Draft = { name: string; durationMinutes: string; price: string };
const emptyDraft: Draft = { name: "", durationMinutes: "30", price: "" };

function toBody(draft: Draft) {
  const durationMinutes = Number(draft.durationMinutes);
  const priceCents = parsePrice(draft.price);
  if (!draft.name.trim()) throw new Error("Informe o nome do serviço.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5) throw new Error("Duração inválida.");
  if (Number.isNaN(priceCents)) throw new Error("Preço inválido. Use por exemplo 45 ou 45,50.");
  return { name: draft.name.trim(), durationMinutes, priceCents };
}

export function ServicesPage({ tenant }: { tenant: Tenant }) {
  const [services, setServices] = useState<Service[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setServices(await api<Service[]>(`/tenants/${tenant.id}/services`));
  }, [tenant.id]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setEditDraft({
      name: service.name,
      durationMinutes: String(service.durationMinutes),
      price: service.priceCents === null ? "" : (service.priceCents / 100).toFixed(2).replace(".", ","),
    });
  }

  const saveEdit = (id: string) =>
    run(async () => {
      await api(`/tenants/${tenant.id}/services/${id}`, { method: "PATCH", body: toBody(editDraft) });
      setEditingId(null);
    });

  const toggleActive = (service: Service) =>
    run(() => api(`/tenants/${tenant.id}/services/${service.id}`, { method: "PATCH", body: { active: !service.active } }));

  const create = () =>
    run(async () => {
      await api(`/tenants/${tenant.id}/services`, { method: "POST", body: toBody(newDraft) });
      setNewDraft(emptyDraft);
    });

  return (
    <>
      <p className="muted">
        Só serviços com duração fixa. Química, combos e encaixe a {tenant.assistantName} passa para a dona.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Duração (min)</th>
              <th>Preço</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) =>
              editingId === service.id ? (
                <tr key={service.id}>
                  <td>
                    <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={editDraft.durationMinutes}
                      onChange={(e) => setEditDraft({ ...editDraft, durationMinutes: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      placeholder="45,00"
                      size={8}
                      value={editDraft.price}
                      onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                    />
                  </td>
                  <td>{service.active ? "Ativo" : "Inativo"}</td>
                  <td className="row">
                    <button className="primary" onClick={() => saveEdit(service.id)}>
                      Salvar
                    </button>
                    <button onClick={() => setEditingId(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={service.id} className={service.active ? undefined : "inactive"}>
                  <td>{service.name}</td>
                  <td>{service.durationMinutes}</td>
                  <td>{formatPrice(service.priceCents)}</td>
                  <td>{service.active ? "Ativo" : "Inativo"}</td>
                  <td className="row">
                    <button onClick={() => startEdit(service)}>Editar</button>
                    <button onClick={() => toggleActive(service)}>{service.active ? "Desativar" : "Ativar"}</button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <h2>Novo serviço</h2>
      <div className="row">
        <input placeholder="Nome" value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} />
        <label className="row">
          Duração
          <input
            type="number"
            min={5}
            step={5}
            value={newDraft.durationMinutes}
            onChange={(e) => setNewDraft({ ...newDraft, durationMinutes: e.target.value })}
          />
          min
        </label>
        <input
          placeholder="Preço (ex.: 45,00)"
          value={newDraft.price}
          onChange={(e) => setNewDraft({ ...newDraft, price: e.target.value })}
        />
        <button className="primary" onClick={create}>
          Adicionar
        </button>
      </div>
      <p className="muted">Serviço novo já fica disponível para todas as profissionais ativas.</p>
    </>
  );
}
