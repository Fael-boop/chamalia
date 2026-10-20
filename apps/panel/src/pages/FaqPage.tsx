import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type FaqEntry, type Tenant } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

const faqKey = (tenantId: string) => ["faq", tenantId] as const;

/** Tap to start a new answer with this question. */
const SUGGESTIONS = [
  "Qual o endereço?",
  "Tem estacionamento?",
  "Quais formas de pagamento?",
  "Aceita cartão parcelado?",
  "Pode levar acompanhante?",
  "Atende crianças?",
  "Como chegar?",
  "Tem Wi-Fi?",
];

export function FaqPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const faq = useQuery({ queryKey: faqKey(tenant.id), queryFn: () => api<FaqEntry[]>(`/tenants/${tenant.id}/faq`) });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: faqKey(tenant.id) });
  const fail = (e: unknown) => toast.error((e as Error).message);

  const create = useMutation({
    mutationFn: () => api(`/tenants/${tenant.id}/faq`, { method: "POST", body: { question: question.trim(), answer: answer.trim() } }),
    onSuccess: () => {
      setQuestion("");
      setAnswer("");
      toast.success("Resposta salva");
    },
    onError: fail,
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (entry: FaqEntry) =>
      api(`/tenants/${tenant.id}/faq/${entry.id}`, { method: "PATCH", body: { question: entry.question, answer: entry.answer } }),
    onSuccess: () => toast.success("Resposta atualizada"),
    onError: fail,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (entry: FaqEntry) => api(`/tenants/${tenant.id}/faq/${entry.id}`, { method: "DELETE" }),
    onMutate: (entry) => queryClient.setQueryData<FaqEntry[]>(faqKey(tenant.id), (list) => list?.filter((item) => item.id !== entry.id)),
    onError: fail,
    onSettled: refresh,
  });

  const taken = new Set((faq.data ?? []).map((f) => f.question.toLowerCase()));

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Respostas prontas"
          description={`Perguntas que os clientes fazem sempre. A ${tenant.assistantName} responde com o que você escrever aqui, no jeito dela de falar.`}
        />
      )}

      <div className="space-y-3">
        {faq.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (faq.data ?? []).length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {faq.data!.map((entry) => (
              <FaqRow key={`${entry.id}-${entry.question}-${entry.answer}`} entry={entry} onSave={(e) => update.mutate(e)} onDelete={(e) => remove.mutate(e)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma resposta ainda. Sem ela, a {tenant.assistantName} passa essas perguntas para a equipe.</p>
        )}

        <form
          className="space-y-2 rounded-lg border border-dashed p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim() && answer.trim()) create.mutate();
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase())).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuestion(s)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
          <Input placeholder="Pergunta. Ex.: Tem estacionamento?" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
          <Textarea
            rows={3}
            placeholder="Resposta. Ex.: Temos estacionamento gratuito em frente ao salão."
            value={answer}
            maxLength={1000}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button type="submit" disabled={!question.trim() || !answer.trim() || create.isPending}>
            <Plus /> Adicionar resposta
          </Button>
        </form>
        <Hint>
          Se uma pergunta aparece muito nas conversas, cadastre aqui. O endereço também pode ser preenchido em Configurações.
        </Hint>
      </div>
    </>
  );
}

function FaqRow({ entry, onSave, onDelete }: { entry: FaqEntry; onSave: (entry: FaqEntry) => void; onDelete: (entry: FaqEntry) => void }) {
  const [question, setQuestion] = useState(entry.question);
  const [answer, setAnswer] = useState(entry.answer);
  const changed = question.trim() !== entry.question || answer.trim() !== entry.answer;
  const valid = question.trim() !== "" && answer.trim() !== "";

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <Input className="h-8 flex-1 text-sm font-medium" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} aria-label="Pergunta" />
        <ConfirmDelete title="Excluir esta resposta?" description={`"${entry.question}" deixa de ser respondida pronta.`} onConfirm={() => onDelete(entry)}>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Excluir ${entry.question}`}>
            <Trash2 />
          </Button>
        </ConfirmDelete>
      </div>
      <Textarea rows={2} className="text-sm" value={answer} maxLength={1000} onChange={(e) => setAnswer(e.target.value)} aria-label="Resposta" />
      {changed && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuestion(entry.question);
              setAnswer(entry.answer);
            }}
          >
            Desfazer
          </Button>
          <Button size="sm" disabled={!valid} onClick={() => onSave({ ...entry, question: question.trim(), answer: answer.trim() })}>
            Salvar
          </Button>
        </div>
      )}
    </li>
  );
}
