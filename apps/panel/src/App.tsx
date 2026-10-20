import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from "./api";
import { ClientPage, type ClientTab } from "./pages/ClientPage";
import { ClientsPage } from "./pages/ClientsPage";

type View = { name: "clients" } | { name: "client"; tenantId: string; tab: ClientTab };

export function App() {
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">("checking");
  const [view, setView] = useState<View>({ name: "clients" });

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
    <>
      <header>
        <strong>ChamaLia</strong>
        <nav>
          <button aria-current={view.name === "clients" ? "page" : undefined} onClick={() => setView({ name: "clients" })}>
            Clientes
          </button>
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
        {authState === "checking" && <p className="muted">Carregando…</p>}
        {authState === "ok" && view.name === "clients" && (
          <ClientsPage onOpen={(tenantId, tab = "agenda") => setView({ name: "client", tenantId, tab })} />
        )}
        {authState === "ok" && view.name === "client" && (
          <ClientPage
            key={view.tenantId}
            tenantId={view.tenantId}
            tab={view.tab}
            onTab={(tab) => setView({ ...view, tab })}
            onBack={() => setView({ name: "clients" })}
          />
        )}
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
