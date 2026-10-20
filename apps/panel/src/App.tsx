import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setToken, setUnauthorizedHandler, type SessionInfo, type Tenant } from "./api";
import { clientTabsFor, ClientPage, type ClientTab } from "./pages/ClientPage";
import { ClientsPage } from "./pages/ClientsPage";

const BRAND = "Chama Lia";

type View = { name: "clients" } | { name: "client"; tenantId: string; tab: ClientTab };

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">("checking");

  const checkSession = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>("/session"));
      setAuthState("ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthState("login");
      else throw e;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState("login"));
    void checkSession();
  }, [checkSession]);

  const logout = () => {
    setToken("");
    setSession(null);
    setAuthState("login");
  };

  if (authState === "login") {
    return (
      <LoginForm
        onLoggedIn={(token) => {
          setToken(token);
          setAuthState("checking");
          void checkSession();
        }}
      />
    );
  }
  if (authState === "checking" || !session) return <p className="muted" style={{ padding: 24 }}>Carregando…</p>;

  return session.role === "owner" ? (
    <OwnerApp tenantId={session.tenantId} onLogout={logout} />
  ) : (
    <AgencyApp onLogout={logout} />
  );
}

/** Agency panel: every client, client registration, WhatsApp and owner access. */
function AgencyApp({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>({ name: "clients" });
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState("");

  const tenantId = view.name === "client" ? view.tenantId : null;
  useEffect(() => {
    setTenant(null);
    setError("");
    if (!tenantId) return;
    api<Tenant>(`/tenants/${tenantId}`)
      .then(setTenant)
      .catch((e: Error) => setError(e.message));
  }, [tenantId]);

  useEffect(() => {
    document.title = tenant ? `${tenant.name} · ${BRAND}` : BRAND;
  }, [tenant]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {BRAND} <span>· agência</span>
        </div>
        <nav>
          <button className="nav-item" aria-current={view.name === "clients" ? "page" : undefined} onClick={() => setView({ name: "clients" })}>
            Clientes
          </button>
          {view.name === "client" && tenant && (
            <>
              <div className="nav-label" title={tenant.name}>
                {tenant.name}
              </div>
              {clientTabsFor("admin").map((t) => (
                <button
                  key={t.id}
                  className="nav-item"
                  aria-current={view.tab === t.id ? "page" : undefined}
                  onClick={() => setView({ ...view, tab: t.id })}
                >
                  {t.id === "test-chat" ? `Testar a ${tenant.assistantName}` : t.label}
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onLogout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="content">
        <div className="content-inner">
          {error && <p className="error">{error}</p>}
          {view.name === "clients" && <ClientsPage onOpen={(id, tab = "agenda") => setView({ name: "client", tenantId: id, tab })} />}
          {view.name === "client" && tenant && (
            <ClientPage
              key={tenant.id}
              role="admin"
              tenant={tenant}
              tab={view.tab}
              onSaved={setTenant}
              onBack={() => setView({ name: "clients" })}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/** Business owner panel: only their own business, nothing about the agency. */
function OwnerApp({ tenantId, onLogout }: { tenantId: string; onLogout: () => void }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<ClientTab>("agenda");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Tenant>(`/tenants/${tenantId}`)
      .then(setTenant)
      .catch((e: Error) => setError(e.message));
  }, [tenantId]);

  useEffect(() => {
    if (tenant) document.title = tenant.name;
  }, [tenant]);

  if (error) return <p className="error" style={{ padding: 24 }}>{error}</p>;
  if (!tenant) return <p className="muted" style={{ padding: 24 }}>Carregando…</p>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" title={tenant.name}>
          {tenant.name}
        </div>
        <nav>
          {clientTabsFor("owner").map((t) => (
            <button key={t.id} className="nav-item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.id === "test-chat" ? `Testar a ${tenant.assistantName}` : t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onLogout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="content">
        <div className="content-inner">
          <ClientPage role="owner" tenant={tenant} tab={tab} onSaved={setTenant} />
        </div>
      </main>
    </div>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body: { login, password } });
      onLoggedIn(result.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login" onSubmit={submit}>
        <div className="panel-body form">
          <div>
            <div className="brand" style={{ padding: 0 }}>
              Entrar
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Use o usuário e a senha que você recebeu.
            </p>
          </div>
          <label>
            Usuário
            <input autoFocus autoCapitalize="none" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
          </label>
          <label>
            Senha
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
          <button className="primary" type="submit" disabled={busy || !login || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

