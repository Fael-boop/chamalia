import type { Tenant } from "../api";
import { AgendaPage } from "./AgendaPage";
import { HoursPage } from "./HoursPage";
import { ProfessionalsPage } from "./ProfessionalsPage";
import { ServicesPage } from "./ServicesPage";
import { SettingsPage } from "./SettingsPage";
import { TestChatPage } from "./TestChatPage";
import { WhatsAppPage } from "./WhatsAppPage";

export type ClientTab = "agenda" | "services" | "professionals" | "hours" | "settings" | "whatsapp" | "test-chat";

export const CLIENT_TABS: { id: ClientTab; label: string; description: string }[] = [
  { id: "agenda", label: "Agenda", description: "Agendamentos do dia. Mude o status direto na tabela." },
  { id: "services", label: "Serviços", description: "O que a atendente pode agendar sozinha, com duração e preço." },
  { id: "professionals", label: "Profissionais", description: "Quem atende e quais serviços cada uma faz." },
  { id: "hours", label: "Horários", description: "Dias e horários de funcionamento." },
  { id: "settings", label: "Configurações", description: "Dados do negócio e o jeito de a atendente conversar." },
  { id: "whatsapp", label: "WhatsApp", description: "Conexão do número que a atendente usa." },
  { id: "test-chat", label: "Testar", description: "Converse como se fosse uma cliente no WhatsApp." },
];

export function ClientPage(props: { tenant: Tenant; tab: ClientTab; onSaved: (tenant: Tenant) => void; onBack: () => void }) {
  const { tenant, tab } = props;
  const current = CLIENT_TABS.find((t) => t.id === tab)!;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button onClick={props.onBack}>Clientes</button> / {tenant.name}
            {!tenant.active && " (inativo)"}
          </div>
          <h1>{tab === "test-chat" ? `Testar a ${tenant.assistantName}` : current.label}</h1>
          <p>{current.description}</p>
        </div>
      </div>
      {tab === "agenda" && <AgendaPage tenant={tenant} />}
      {tab === "services" && <ServicesPage tenant={tenant} />}
      {tab === "professionals" && <ProfessionalsPage tenant={tenant} />}
      {tab === "hours" && <HoursPage tenant={tenant} />}
      {tab === "settings" && <SettingsPage tenant={tenant} onSaved={props.onSaved} />}
      {tab === "whatsapp" && <WhatsAppPage tenant={tenant} />}
      {tab === "test-chat" && <TestChatPage tenant={tenant} />}
    </>
  );
}
