import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type AssistantRule, type BusinessHour, type FaqEntry, type PriceTable, type Tenant, type TestChatState, type WhatsappStatus } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useProfessionals, useServices } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Same number the test chat starts with. */
const TEST_PHONE = "5511999990000";

const RULE_SUGGESTIONS: { kind: AssistantRule["kind"]; text: string }[] = [
  { kind: "always", text: "pergunte o nome antes de confirmar o horário" },
  { kind: "always", text: "chame a cliente pelo nome" },
  { kind: "never", text: "ofereça desconto" },
  { kind: "never", text: "use gírias" },
  { kind: "always", text: "avise que atrasos de mais de 15 minutos precisam remarcar" },
];

type Step = { id: string; title: string; hint: string; page: string; done: boolean };

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

/** "Treinar a Lia": a guided checklist to set the assistant up, plus plain-language rules it follows. */
export function TrainPage({ tenant, onNavigate }: { tenant: Tenant; onNavigate: (page: string) => void }) {
  const mobile = useIsMobile();
  const lia = tenant.assistantName;
  const services = useServices(tenant.id);
  const professionals = useProfessionals(tenant.id);
  const hours = useQuery({ queryKey: keys.hours(tenant.id), queryFn: () => api<BusinessHour[]>(`/tenants/${tenant.id}/business-hours`) });
  const prices = useQuery({ queryKey: ["price-table", tenant.id], queryFn: () => api<PriceTable>(`/tenants/${tenant.id}/price-table`) });
  const faq = useQuery({ queryKey: ["faq", tenant.id], queryFn: () => api<FaqEntry[]>(`/tenants/${tenant.id}/faq`) });
  const whatsapp = useQuery({ queryKey: ["whatsapp", tenant.id], queryFn: () => api<WhatsappStatus>(`/tenants/${tenant.id}/whatsapp`) });
  const test = useQuery({
    queryKey: ["test-chat-progress", tenant.id],
    queryFn: () => api<TestChatState>(`/tenants/${tenant.id}/test-chat?phone=${TEST_PHONE}`),
  });

  const loading = [services, professionals, hours, prices, faq, whatsapp, test].some((q) => q.isLoading);
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const testMessages = (test.data?.messages ?? []).filter((m) => m.direction === "inbound").length;

  const steps: Step[] = [
    {
      id: "services",
      title: "Cadastrar os serviços",
      hint: "Nome, duração e preço de cada um. É o que ela oferece e agenda.",
      page: "services",
      done: activeServices.length > 0,
    },
    {
      id: "professionals",
      title: "Dizer quem faz cada serviço",
      hint: "Marque os serviços de cada profissional e, se quiser, os horários de cada um.",
      page: "professionals",
      done: (professionals.data ?? []).some((p) => p.active && p.kind === "professional" && p.serviceIds.length > 0),
    },
    {
      id: "hours",
      title: "Horário de funcionamento",
      hint: `Sem isso, a ${lia} não tem horário para oferecer.`,
      page: "hours",
      done: (hours.data ?? []).length > 0,
    },
    {
      id: "settings",
      title: "Endereço e WhatsApp do responsável",
      hint: "Para ela informar onde fica e para os avisos chegarem em alguém.",
      page: "settings",
      done: Boolean(tenant.address && tenant.ownerPhone),
    },
    {
      id: "faq",
      title: "Pelo menos 3 respostas prontas",
      hint: "Estacionamento, formas de pagamento, atrasos… as perguntas que mais chegam.",
      page: "faq",
      done: (faq.data ?? []).length >= 3,
    },
    {
      id: "prices",
      title: "Tabela de preços (opcional)",
      hint: "Texto ou imagem que ela manda quando pedem a tabela.",
      page: "prices",
      done: Boolean(prices.data?.body || prices.data?.file),
    },
    {
      id: "test",
      title: `Conversar com a ${lia} no teste`,
      hint: `Mande pelo menos 3 mensagens e use "Corrigir" quando algo não ficar bom.`,
      page: "test-chat",
      done: testMessages >= 3,
    },
    {
      id: "whatsapp",
      title: "Conectar o WhatsApp",
      hint: `Último passo: a partir daqui a ${lia} atende as clientes de verdade.`,
      page: "whatsapp",
      done: whatsapp.data?.state === "open",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);

  return (
    <>
      {!mobile && (
        <PageHeader
          title={`Treinar a ${lia}`}
          description={`A ${lia} aprende com o que você cadastra. Siga os passos, teste e corrija: em poucos minutos ela fica do jeito do seu negócio.`}
        />
      )}

      <Section title="Primeiros passos" description="Siga na ordem. Cada passo leva direto para a tela certa.">
        {loading ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {done === steps.length ? `Tudo pronto! A ${lia} está treinada.` : `${done} de ${steps.length} passos`}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
            </div>
            <ol className="divide-y overflow-hidden rounded-lg border bg-card">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(step.page)}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        step.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {step.done ? <Check className="size-4" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-medium", step.done && "text-muted-foreground line-through")}>{step.title}</span>
                      <span className="block text-xs text-muted-foreground">{step.hint}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section
        title="Regras"
        description={`Frases curtas que a ${lia} segue em todas as conversas. Ex.: "Sempre pergunte o nome", "Nunca ofereça desconto".`}
      >
        <Rules tenant={tenant} />
      </Section>

      <Section title="Como treinar" description="O ciclo que deixa ela cada vez melhor.">
        <ol className="space-y-2 text-sm">
          <li>
            <span className="font-medium">1. Teste.</span> Em Testar a {lia}, toque nas perguntas prontas ou escreva como uma cliente.
          </li>
          <li>
            <span className="font-medium">2. Corrija.</span> Se a resposta não ficou boa, toque em "Corrigir" embaixo dela e escreva o jeito
            certo, ou transforme em regra.
          </li>
          <li>
            <span className="font-medium">3. Teste de novo.</span> Ela já usa a correção na próxima mensagem.
          </li>
        </ol>
        <div className="mt-3">
          <Button variant="outline" onClick={() => onNavigate("test-chat")}>
            Ir para Testar a {lia}
          </Button>
        </div>
      </Section>
      <Hint>Tudo aqui vale também no WhatsApp de verdade, assim que ele estiver conectado.</Hint>
    </>
  );
}

function Rules({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const key = ["rules", tenant.id];
  const rules = useQuery({ queryKey: key, queryFn: () => api<AssistantRule[]>(`/tenants/${tenant.id}/rules`) });
  const [kind, setKind] = useState<AssistantRule["kind"]>("always");
  const [text, setText] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (rule: { kind: AssistantRule["kind"]; text: string }) => api(`/tenants/${tenant.id}/rules`, { method: "POST", body: rule }),
    onSuccess: () => {
      setText("");
      toast.success("Regra salva");
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (rule: AssistantRule) => api(`/tenants/${tenant.id}/rules/${rule.id}`, { method: "DELETE" }),
    onMutate: (rule) => queryClient.setQueryData<AssistantRule[]>(key, (list) => list?.filter((r) => r.id !== rule.id)),
    onError: (e) => toast.error((e as Error).message),
    onSettled: refresh,
  });

  const existing = new Set((rules.data ?? []).map((r) => r.text.toLowerCase()));

  return (
    <div className="space-y-3">
      {rules.isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : (rules.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra ainda.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {rules.data!.map((rule) => (
            <li key={rule.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
                  rule.kind === "always" ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive",
                )}
              >
                {rule.kind === "always" ? "Sempre" : "Nunca"}
              </span>
              <span className="min-w-0 flex-1 text-sm">{rule.text}</span>
              <ConfirmDelete title="Apagar esta regra?" description={`"${rule.text}" deixa de valer.`} confirmLabel="Apagar" onConfirm={() => remove.mutate(rule)}>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Apagar regra ${rule.text}`}>
                  <Trash2 />
                </Button>
              </ConfirmDelete>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) create.mutate({ kind, text: text.trim() });
        }}
      >
        <Select value={kind} onValueChange={(v) => setKind(v as AssistantRule["kind"])}>
          <SelectTrigger className="sm:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Sempre</SelectItem>
            <SelectItem value="never">Nunca</SelectItem>
          </SelectContent>
        </Select>
        <Input className="flex-1" maxLength={300} placeholder="pergunte o nome antes de agendar" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" disabled={!text.trim() || create.isPending}>
          <Plus /> Adicionar
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {RULE_SUGGESTIONS.filter((s) => !existing.has(s.text.toLowerCase())).map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => create.mutate(s)}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          >
            {s.kind === "always" ? "Sempre" : "Nunca"} {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}
