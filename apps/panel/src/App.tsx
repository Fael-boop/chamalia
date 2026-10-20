import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler, type Tenant } from "./api";
import { CLIENT_TABS, ClientPage, type ClientTab } from "./pages/ClientPage";
import { ClientsPage } from "./pages/ClientsPage";

type View = { name: "clients" } | { name: "client"; tenantId: string; tab: ClientTab };

export function App() {
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">("checking");
  const [view, setView] = useState<View>({ name: "clients" });
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState("");

  const checkSession = useCallback(async () => {
    try {
      await api("/session");
      setAuthState("ok");
    } catch (e) {
      setAuthState(e instanceof ApiError && e.status === 401 ? "login" : "ok");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState("login"));
    void checkSession();
  }, [checkSession]);

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
    document.title = tenant ? `${tenant.name} · ChamaLia` : "ChamaLia";
  }, [tenant]);

  if (authState === "login") {
    return (
      <LoginForm
        onLogin={(password) => {
          setToken(password);
          setAuthState("checking");
          void checkSession();
        }}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          ChamaLia <span>· painel</span>
        </div>
        <nav>
          <button
            className="nav-item"
            aria-current={view.name === "clients" ? "page" : undefined}
            onClick={() => setView({ name: "clients" })}
          >
            Clientes
          </button>
          {view.name === "client" && tenant && (
            <>
              <div className="nav-label" title={tenant.name}>
                {tenant.name}
              </div>
              {CLIENT_TABS.map((t) => (
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
        {getToken() && (
          <div className="sidebar-footer">
            <button
              className="nav-item"
              onClick={() => {
                setToken("");
                setAuthState("login");
              }}
            >
              Sair
            </button>
          </div>
        )}
      </aside>

      <main className="content">
        <div className="content-inner">
          {authState === "checking" && <p className="muted">Carregando…</p>}
          {error && <p className="error">{error}</p>}
          {authState === "ok" && view.name === "clients" && (
            <ClientsPage onOpen={(id, tab = "agenda") => setView({ name: "client", tenantId: id, tab })} />
          )}
          {authState === "ok" && view.name === "client" && tenant && (
            <ClientPage
              key={tenant.id}
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

function LoginForm({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <div className="login-wrap">
      <form
        className="panel login"
        onSubmit={(e) => {
          e.preventDefault();
          onLogin(password);
        }}
      >
        <div className="panel-body form">
          <div>
            <div className="brand" style={{ padding: 0 }}>
              ChamaLia
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Entre com a senha do painel.
            </p>
          </div>
          <label>
            Senha
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="primary" type="submit">
            Entrar
          </button>
        </div>
      </form>
    </div>
  );
}
