import { useCallback, useEffect, useState } from "react";
import { api, type Tenant, type TenantUser } from "../api";

/** Readable random password, no look-alike characters (0/O, 1/l). */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function suggestLogin(tenant: Tenant): string {
  const base = (tenant.ownerName || tenant.slug).split(" ")[0] ?? tenant.slug;
  return base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function AccessPage({ tenant }: { tenant: Tenant }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [form, setForm] = useState(() => ({
    name: tenant.ownerName ?? "",
    login: suggestLogin(tenant),
    password: generatePassword(),
  }));
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setUsers(await api<TenantUser[]>(`/tenants/${tenant.id}/users`));
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

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api(`/tenants/${tenant.id}/users`, { method: "POST", body: form });
      setCreated({ login: form.login, password: form.password });
      setForm({ ...form, password: generatePassword() });
    });
  };

  const resetPassword = (user: TenantUser) => {
    const password = generatePassword();
    if (!window.confirm(`Gerar uma senha nova para ${user.name}? A senha atual para de funcionar na hora.`)) return;
    void run(async () => {
      await api(`/tenants/${tenant.id}/users/${user.id}`, { method: "PATCH", body: { password } });
      setCreated({ login: user.login, password });
    });
  };

  const loginUrl = window.location.origin;

  return (
    <>
      {created && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-body">
            <p style={{ marginTop: 0 }}>
              <strong>Acesso pronto.</strong> Envie para a dona (a senha não aparece de novo depois que você sair desta tela):
            </p>
            <pre style={{ background: "#fafafa", border: "1px solid var(--border)", borderRadius: 6, padding: 12, margin: 0, whiteSpace: "pre-wrap" }}>
              {`Endereço: ${loginUrl}\nUsuário: ${created.login}\nSenha: ${created.password}`}
            </pre>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(`Endereço: ${loginUrl}\nUsuário: ${created.login}\nSenha: ${created.password}`)
                }
              >
                Copiar
              </button>
              <button onClick={() => setCreated(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        {users.length === 0 ? (
          <div className="empty">Nenhum acesso criado para este cliente.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Último acesso</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.active ? undefined : "inactive"}>
                    <td>{user.name}</td>
                    <td>{user.login}</td>
                    <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "Nunca entrou"}</td>
                    <td>{user.active ? "Ativo" : "Bloqueado"}</td>
                    <td className="actions">
                      <div className="row">
                        <button className="small" onClick={() => resetPassword(user)}>
                          Nova senha
                        </button>
                        <button
                          className="small"
                          onClick={() =>
                            run(() =>
                              api(`/tenants/${tenant.id}/users/${user.id}`, { method: "PATCH", body: { active: !user.active } }),
                            )
                          }
                        >
                          {user.active ? "Bloquear" : "Desbloquear"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="panel-footer" onSubmit={create}>
          <strong style={{ marginRight: 4 }}>Novo acesso</strong>
          <input placeholder="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            placeholder="usuário"
            required
            autoCapitalize="none"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })}
          />
          <input placeholder="senha" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="primary" type="submit">
            Criar acesso
          </button>
        </form>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        A dona entra no mesmo endereço do painel e vê só o {tenant.name}: agenda, serviços, profissionais, horários,
        configurações e teste. Ela não vê outros clientes, o WhatsApp nem esta tela.
      </p>
    </>
  );
}
