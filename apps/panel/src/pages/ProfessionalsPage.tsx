import { useCallback, useEffect, useState } from "react";
import { api, type Professional, type Service, type Tenant } from "../api";

export function ProfessionalsPage({ tenant }: { tenant: Tenant }) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [pros, svcs] = await Promise.all([
      api<Professional[]>(`/tenants/${tenant.id}/professionals`),
      api<Service[]>(`/tenants/${tenant.id}/services`),
    ]);
    setProfessionals(pros);
    setServices(svcs.filter((s) => s.active));
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

  const toggleService = (professional: Professional, serviceId: string) => {
    const serviceIds = professional.serviceIds.includes(serviceId)
      ? professional.serviceIds.filter((id) => id !== serviceId)
      : [...professional.serviceIds, serviceId];
    return run(() =>
      api(`/tenants/${tenant.id}/professionals/${professional.id}/services`, { method: "PUT", body: serviceIds }),
    );
  };

  const rename = (professional: Professional) => {
    const name = window.prompt("Nome da profissional", professional.name)?.trim();
    if (name && name !== professional.name) {
      void run(() => api(`/tenants/${tenant.id}/professionals/${professional.id}`, { method: "PATCH", body: { name } }));
    }
  };

  return (
    <>
      <p className="hint">Marque os serviços que cada profissional faz. A {tenant.assistantName} só oferece horário com quem faz o serviço.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Profissional</th>
              {services.map((s) => (
                <th key={s.id}>{s.name}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {professionals.map((p) => (
              <tr key={p.id} className={p.active ? undefined : "inactive"}>
                <td>
                  {p.name}
                  {!p.active && " (inativa)"}
                </td>
                {services.map((s) => (
                  <td key={s.id}>
                    <input
                      type="checkbox"
                      aria-label={`${p.name} faz ${s.name}`}
                      checked={p.serviceIds.includes(s.id)}
                      onChange={() => toggleService(p, s.id)}
                    />
                  </td>
                ))}
                <td className="actions">
                  <div className="row">
                    <button className="small" onClick={() => rename(p)}>
                      Renomear
                    </button>
                    <button
                      className="small"
                      onClick={() =>
                        run(() => api(`/tenants/${tenant.id}/professionals/${p.id}`, { method: "PATCH", body: { active: !p.active } }))
                      }
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="panel-footer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          void run(async () => {
            await api(`/tenants/${tenant.id}/professionals`, { method: "POST", body: { name: newName.trim() } });
            setNewName("");
          });
        }}
      >
        <strong style={{ marginRight: 4 }}>Nova profissional</strong>
        <input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="primary" type="submit">
          Adicionar
        </button>
      </form>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>A nova profissional começa fazendo todos os serviços; desmarque o que ela não faz.</p>
    </>
  );
}
