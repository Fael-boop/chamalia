import { useEffect, useState } from "react";
import { api, type Tenant } from "../api";
import { AgendaPage } from "./AgendaPage";
import { HoursPage } from "./HoursPage";
import { ProfessionalsPage } from "./ProfessionalsPage";
import { ServicesPage } from "./ServicesPage";
import { SettingsPage } from "./SettingsPage";
import { TestChatPage } from "./TestChatPage";
import { WhatsAppPage } from "./WhatsAppPage";

export type ClientTab = "agenda" | "services" | "professionals" | "hours" | "settings" | "whatsapp" | "test-chat";

const TABS: { id: ClientTab; label: string }[] = [
  { id: "agenda", label: "Agenda" },
  { id: "services", label: "Serviços" },
  { id: "professionals", label: "Profissionais" },
  { id: "hours", label: "Horários" },
  { id: "settings", label: "Configurações" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "test-chat", label: "Testar" },
];

export function ClientPage(props: { tenantId: string; tab: ClientTab; onTab: (tab: ClientTab) => void; onBack: () => void }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Tenant>(`/tenants/${props.tenantId}`)
      .then(setTenant)
      .catch((e: Error) => setError(e.message));
  }, [props.tenantId]);

  if (error) return <p className="error">{error}</p>;
  if (!tenant) return <p className="muted">Carregando…</p>;

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <button onClick={props.onBack}>‹ Clientes</button>
        <strong style={{ fontSize: 16 }}>{tenant.name}</strong>
        {!tenant.active && <span className="muted">(inativo)</span>}
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-current={props.tab === t.id ? "page" : undefined} onClick={() => props.onTab(t.id)}>
            {t.id === "test-chat" ? `Testar a ${tenant.assistantName}` : t.label}
          </button>
        ))}
      </nav>
      {props.tab === "agenda" && <AgendaPage tenant={tenant} />}
      {props.tab === "services" && <ServicesPage tenant={tenant} />}
      {props.tab === "professionals" && <ProfessionalsPage tenant={tenant} />}
      {props.tab === "hours" && <HoursPage tenant={tenant} />}
      {props.tab === "settings" && <SettingsPage tenant={tenant} onSaved={setTenant} />}
      {props.tab === "whatsapp" && <WhatsAppPage tenant={tenant} />}
      {props.tab === "test-chat" && <TestChatPage tenant={tenant} />}
    </>
  );
}
