import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type HandoffTopic, type Professional, type Service, type Tenant } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatPhone } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useProfessionals, useServices } from "@/lib/queries";
import { cn } from "@/lib/utils";

const topicsKey = (tenantId: string) => ["handoff-topics", tenantId] as const;
const OWNER = "owner";

/** Things that are always handed over even when nobody configured them. */
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

/** "Who resolves it": the owner or an active team member. Someone without WhatsApp falls back to the owner. */
function PersonSelect({
  tenant,
  people,
  value,
  onChange,
  className,
}: {
  tenant: Tenant;
  people: Professional[];
  value: string | null;
  onChange: (personId: string | null) => void;
  className?: string;
}) {
  const ownerLabel = tenant.ownerName ? `${tenant.ownerName} (dona)` : "Dona";
  return (
    <Select value={value ?? OWNER} onValueChange={(v) => onChange(v === OWNER ? null : v)}>
      <SelectTrigger size="sm" className={cn("h-8 w-full text-xs sm:w-56", className)} aria-label="Quem resolve">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OWNER}>{ownerLabel}</SelectItem>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.kind === "reception" ? " (recepção)" : ""}
            {p.notifyPhone ? "" : " · sem WhatsApp, vai para a dona"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function HandoffPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const professionals = useProfessionals(tenant.id);
  const people = (professionals.data ?? []).filter((p) => p.active);
  const lia = tenant.assistantName;

  const setDefault = useMutation({
    mutationFn: (personId: string | null) =>
      api<Tenant>(`/tenants/${tenant.id}`, { method: "PATCH", body: { defaultHandoffProfessionalId: personId } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.tenant(tenant.id), saved);
      toast.success("Salvo");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Passar para a equipe"
          description={`Quando a ${lia} para de responder e chama uma pessoa da equipe (dona, profissional ou recepção). Ela avisa a cliente, manda o pedido no WhatsApp de quem vai resolver e fica em silêncio nessa conversa.`}
        />
      )}
      <div className="mb-4 space-y-1.5 text-xs text-muted-foreground">
        {tenant.ownerPhone ? (
          <p>Avisos da dona chegam no WhatsApp {formatPhone(tenant.ownerPhone)}.</p>
        ) : (
          <p className="text-destructive">
            O WhatsApp da dona não está cadastrado em Configurações: a {lia} passa a conversa, mas o aviso não chega.
          </p>
        )}
        <p>Quem recebe o aviso responde a cliente pelo WhatsApp do salão. O WhatsApp de cada pessoa fica em Profissionais.</p>
        {!professionals.isLoading && !people.some((p) => p.kind === "reception") && (
          <p>Se uma recepcionista cuida das dúvidas (corte, progressiva…), cadastre-a em Profissionais com o botão Recepção: ela vira quem recebe o resto.</p>
        )}
      </div>

      <Section title="Assuntos" description={`Temas que alguém da equipe responde pessoalmente. A ${lia} passa assim que a cliente tocar no assunto.`}>
        <TopicsList tenant={tenant} people={people} />
      </Section>
      <Section title="Serviços" description={`Serviços que a ${lia} nunca agenda sozinha. Ex.: química que precisa de avaliação.`}>
        <ServicesList tenant={tenant} people={people} />
      </Section>
      <Section title="Todo o resto" description={`Para não perder cliente, nesses casos a ${lia} também passa a conversa, mesmo sem estar na lista.`}>
        <ul className="space-y-1.5 text-sm">
          {ALWAYS.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-muted-foreground">–</span>
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span>Vai para</span>
          {professionals.isLoading ? (
            <Skeleton className="h-8 w-56" />
          ) : (
            <PersonSelect tenant={tenant} people={people} value={tenant.defaultHandoffProfessionalId} onChange={(id) => setDefault.mutate(id)} />
          )}
        </div>
        <div className="mt-3">
          <Hint>Na dúvida, ela prefere chamar alguém a responder errado. Depois de atender, devolva a conversa para a {lia}.</Hint>
        </div>
      </Section>
    </>
  );
}

function ServicesList({ tenant, people }: { tenant: Tenant; people: Professional[] }) {
  const queryClient = useQueryClient();
  const services = useServices(tenant.id);
  const update = useMutation({
    mutationFn: ({ service, changes }: { service: Service; changes: Partial<Pick<Service, "handoff" | "handoffReason" | "handoffProfessionalId">> }) =>
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
              {s.handoff ? "Passa para alguém" : `A ${tenant.assistantName} agenda`}
              <Switch checked={s.handoff} onCheckedChange={(handoff) => update.mutate({ service: s, changes: { handoff } })} />
            </span>
          </label>
          {s.handoff && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <PersonSelect
                tenant={tenant}
                people={people}
                value={s.handoffProfessionalId}
                onChange={(handoffProfessionalId) => update.mutate({ service: s, changes: { handoffProfessionalId } })}
              />
              <ReasonInput
                initial={s.handoffReason ?? ""}
                placeholder="Motivo (opcional). Ex.: precisa de avaliação antes"
                onSave={(reason) => update.mutate({ service: s, changes: { handoffReason: reason || null } })}
              />
            </div>
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
      className="h-8 flex-1 text-xs"
      value={value}
      maxLength={300}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function TopicsList({ tenant, people }: { tenant: Tenant; people: Professional[] }) {
  const queryClient = useQueryClient();
  const topics = useQuery({
    queryKey: topicsKey(tenant.id),
    queryFn: () => api<HandoffTopic[]>(`/tenants/${tenant.id}/handoff-topics`),
  });
  const [topic, setTopic] = useState("");
  const [reason, setReason] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: topicsKey(tenant.id) });
  const fail = (e: unknown) => toast.error((e as Error).message);

  const create = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant.id}/handoff-topics`, {
        method: "POST",
        body: { topic: topic.trim(), reason: reason.trim() || null, professionalId: personId },
      }),
    onSuccess: () => {
      setTopic("");
      setReason("");
      toast.success("Assunto adicionado");
    },
    onError: fail,
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (t: HandoffTopic) =>
      api(`/tenants/${tenant.id}/handoff-topics/${t.id}`, {
        method: "PATCH",
        body: { topic: t.topic, reason: t.reason, professionalId: t.professionalId },
      }),
    onMutate: (t) => queryClient.setQueryData<HandoffTopic[]>(topicsKey(tenant.id), (list) => list?.map((item) => (item.id === t.id ? t : item))),
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
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <PersonSelect tenant={tenant} people={people} value={t.professionalId} onChange={(professionalId) => update.mutate({ ...t, professionalId })} />
                <ReasonInput initial={t.reason ?? ""} placeholder="Motivo (opcional)" onSave={(value) => update.mutate({ ...t, reason: value || null })} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum assunto cadastrado.</p>
      )}

      <form
        className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) create.mutate();
        }}
      >
        <Input placeholder="Assunto. Ex.: noivas e festas" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
        <Input placeholder="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Vai para
          <PersonSelect tenant={tenant} people={people} value={personId} onChange={setPersonId} className="flex-1 sm:w-auto" />
        </div>
        <Button type="submit" disabled={!topic.trim() || create.isPending}>
          <Plus /> Adicionar
        </Button>
      </form>
      <Hint>Exemplos: desconto ou parcelamento; noivas e festas; pacotes; atendimento a domicílio; reclamações.</Hint>
    </div>
  );
}
