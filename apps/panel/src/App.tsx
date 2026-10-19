import { useEffect, useState } from "react";

type Health = {
  status: string;
  whatsappProvider: string;
  database: string;
  ai: string;
};

const labels: Record<string, string> = {
  configured: "configurado",
  not_configured: "não configurado",
};

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/health")
      .then((response) => response.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "48px auto", padding: "0 16px" }}>
      <h1>ChamaLia · Painel</h1>
      {error && <p>Não foi possível falar com o servidor.</p>}
      {!health && !error && <p>Carregando…</p>}
      {health && (
        <ul>
          <li>Servidor: {health.status === "ok" ? "no ar" : health.status}</li>
          <li>WhatsApp: {health.whatsappProvider}</li>
          <li>Banco de dados: {labels[health.database] ?? health.database}</li>
          <li>IA: {labels[health.ai] ?? health.ai}</li>
        </ul>
      )}
    </main>
  );
}
