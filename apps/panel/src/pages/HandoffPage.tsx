import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type HandoffTopic, type Service, type Tenant } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatPhone } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useServices } from "@/lib/queries";

const topicsKey = (tenantId: string) => ["handoff-topics", tenantId] as const;

/** Things that are always sent to the owner even when nobody configured them. */
const ALWAYS = [
  "Serviço que não está na lista",
  "Mais de um serviço no mesmo atendimento (combo)",
  "Encaixe em horário ocupado",
  "Reclamação, orçamento, desconto ou problema com serviço feito",
  "Qualquer pergunta que ela não saiba responder com as informações cadastradas",
];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-6 first:pt-0 last:border-b-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function HandoffPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const lia = tenant.assistantName;

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Passar para a dona"
          description={`Quando a ${lia} para de responder e chama você. Ela avisa a cliente, manda o pedido no seu WhatsApp e fica em silêncio nessa conversa.`}
        />
      )}
      <p className="mb-6 text-xs text-muted-foreground">
        {tenant.ownerPhone ? (
          <>Os avisos chegam no WhatsApp {formatPhone(tenant.ownerPhone)}.</>
        ) : (
          <span className="text-destructive">
            Seu WhatsApp não está cadastrado em Configurações: a {lia} passa a conversa, mas o aviso não chega até você.
          </span>
        )}
      </p>

      <Section title="Assuntos" description={`Temas que você quer responder pessoalmente. A ${lia} chama você assim que a cliente tocar no assunto.`}>
        <TopicsList tenant={tenant} />
      </Section>
      <Section title="Serviços" description={`Serviços que a ${lia} nunca agenda sozinha. Ex.: química que precisa de avaliação.`}>
        <ServicesList tenant={tenant} />
      </Section>
      <Section title="Sempre, sem precisar cadastrar" description={`Para não perder cliente, nesses casos a ${lia} chama você mesmo que não esteja na lista.`}>
        <ul className="space-y-1.5 text-sm">
          {ALWAYS.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-muted-foreground">–</span>
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Hint>Na dúvida, ela prefere chamar você a responder errado. Depois de atender, devolva a conversa para a {lia} em Testar ou pelo WhatsApp.</Hint>
        </div>
      </Section>
    </>
  );
}

function ServicesList({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const services = useServices(tenant.id);
  const update = useMutation({
    mutationFn: ({ service, changes }: { service: Service; changes: Partial<Pick<Service, "handoff" | "handoffReason">> }) =>
      api(`/tenants/${tenant.id}/services/${service.id}`, { method: "PATCH", body: changes }),
    onMutate: ({ service, changes }) =>
      queryClient.setQueryData<Service[]>(keys.services(tenant.id), (list) => list?.map((s) => (s.id === service.id ? { ...s, ...changes } : s))),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.services(tenant.id) }),
  });

  if (services.isLoading) return <Skeleton className="h-40 rounded-lg" />;
  const list = (services.data ?? []).filter((s) => s.active);
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Nenhum serviço ativo.</p>;

  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
      {list.map((s) => (
        <li key={s.id} className="px-3 py-2.5">
          <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{s.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {s.handoff ? "Com a dona" : `A ${tenant.assistantName} agenda`}
              <Switch checked={s.handoff} onCheckedChange={(handoff) => update.mutate({ service: s, changes: { handoff } })} />
            </span>
          </label>
          {s.handoff && (
            <ReasonInput
              initial={s.handoffReason ?? ""}
              placeholder="Motivo (opcional). Ex.: precisa de avaliação antes"
              onSave={(reason) => update.mutate({ service: s, changes: { handoffReason: reason || null } })}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Saves when the field loses focus (or Enter), only if the text changed. */
function ReasonInput({ initial, placeholder, onSave }: { initial: string; placeholder: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  const commit = () => {
    if (value.trim() !== initial) onSave(value.trim());
  };
  return (
    <Input
      className="mt-2 h-8 text-xs"
      value={value}
      maxLength={300}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function TopicsList({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const topics = useQuery({
    queryKey: topicsKey(tenant.id),
    queryFn: () => api<HandoffTopic[]>(`/tenants/${tenant.id}/handoff-topics`),
  });
  const [topic, setTopic] = useState("");
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: topicsKey(tenant.id) });
  const fail = (e: unknown) => toast.error((e as Error).message);

  const create = useMutation({
    mutationFn: () => api(`/tenants/${tenant.id}/handoff-topics`, { method: "POST", body: { topic: topic.trim(), reason: reason.trim() || null } }),
    onSuccess: () => {
      setTopic("");
      setReason("");
      toast.success("Assunto adicionado");
    },
    onError: fail,
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (t: HandoffTopic) => api(`/tenants/${tenant.id}/handoff-topics/${t.id}`, { method: "PATCH", body: { topic: t.topic, reason: t.reason } }),
    onError: fail,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (t: HandoffTopic) => api(`/tenants/${tenant.id}/handoff-topics/${t.id}`, { method: "DELETE" }),
    onMutate: (t) => queryClient.setQueryData<HandoffTopic[]>(topicsKey(tenant.id), (list) => list?.filter((item) => item.id !== t.id)),
    onError: fail,
    onSettled: refresh,
  });

  return (
    <div className="space-y-3">
      {topics.isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : (topics.data ?? []).length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {topics.data!.map((t) => (
            <li key={t.id} className="px-3 py-2.5">
              <div className="flex min-h-9 items-center justify-between gap-3">
                <span className="min-w-0 text-sm">{t.topic}</span>
                <Button variant="ghost" size="icon" aria-label={`Remover ${t.topic}`} onClick={() => remove.mutate(t)}>
                  <X />
                </Button>
              </div>
              <ReasonInput
                initial={t.reason ?? ""}
                placeholder="Motivo (opcional)"
                onSave={(value) => update.mutate({ ...t, reason: value || null })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum assunto cadastrado.</p>
      )}

      <form
        className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) create.mutate();
        }}
      >
        <Input placeholder="Assunto. Ex.: noivas e festas" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
        <Input placeholder="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" disabled={!topic.trim() || create.isPending}>
          <Plus /> Adicionar
        </Button>
      </form>
      <Hint>Exemplos: desconto ou parcelamento; noivas e festas; pacotes; atendimento a domicílio; reclamações.</Hint>
    </div>
  );
}
