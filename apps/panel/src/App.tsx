import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler, type Tenant } from "./api";
import { TestChatPage } from "./pages/TestChatPage";

type TenantSummary = { id: string; slug: string; name: string };
type Page = "test-chat";

const PAGES: { id: Page; label: string }[] = [{ id: "test-chat", label: "Testar a Lia" }];
const TENANT_KEY = "chamalia.tenantId";

function readStoredTenant(): string {
  try {
    return localStorage.getItem(TENANT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function App() {
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">("checking");
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState(readStoredTenant);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [page, setPage] = useState<Page>("test-chat");
  const [error, setError] = useState("");

  const loadTenants = useCallback(async () => {
    try {
      const list = await api<TenantSummary[]>("/tenants");
      setTenants(list);
      setAuthState("ok");
      setTenantId((current) => (list.some((t) => t.id === current) ? current : (list[0]?.id ?? "")));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthState("login");
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthState("login"));
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      localStorage.setItem(TENANT_KEY, tenantId);
    } catch {
      // Not critical: the first tenant is selected again next time.
    }
    api<Tenant>(`/tenants/${tenantId}`)
      .then(setTenant)
      .catch((e: Error) => setError(e.message));
  }, [tenantId]);

  if (authState === "login") {
    return (
      <LoginForm
        onLogin={(password) => {
          setToken(password);
          setAuthState("checking");
          void loadTenants();
        }}
      />
    );
  }

  return (
    <>
      <header>
        <strong>ChamaLia</strong>
        {tenants.length > 0 && (
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <nav>
          {PAGES.map((p) => (
            <button key={p.id} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {getToken() && (
          <button
            onClick={() => {
              setToken("");
              setAuthState("login");
            }}
          >
            Sair
          </button>
        )}
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        {authState === "checking" && <p className="muted">Carregando…</p>}
        {authState === "ok" && tenants.length === 0 && (
          <p className="muted">Nenhum cliente cadastrado. Rode `npm run db:seed` para criar a demo.</p>
        )}
        {tenant && page === "test-chat" && <TestChatPage key={tenant.id} tenant={tenant} />}
      </main>
    </>
  );
}

function LoginForm({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="form login"
      onSubmit={(e) => {
        e.preventDefault();
        onLogin(password);
      }}
    >
      <h1>ChamaLia · Painel</h1>
      <label>
        Senha
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="primary" type="submit">
        Entrar
      </button>
    </form>
  );
}
