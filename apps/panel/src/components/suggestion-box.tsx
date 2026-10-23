import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Tenant } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Proposed = { kind: "always" | "never"; text: string };

/**
 * "Sugestão para a Lia" in Testar a Lia: the owner writes what to change in their own words
 * ("escreve textos menores"), the AI turns it into one clear rule using the last answer as
 * context, and the owner confirms it. Saved rules are the same as in Treinar a Lia.
 */
export function SuggestionBox({
  tenant,
  lastQuestion,
  lastAnswer,
  onRetry,
}: {
  tenant: Tenant;
  lastQuestion?: string;
  lastAnswer?: string;
  /** Sends the last customer message again, to see the new answer. */
  onRetry?: (question: string) => void;
}) {
  const queryClient = useQueryClient();
  const lia = tenant.assistantName;
  const [suggestion, setSuggestion] = useState("");
  const [proposed, setProposed] = useState<Proposed | null>(null);

  const suggest = useMutation({
    mutationFn: () =>
      api<Proposed>(`/tenants/${tenant.id}/rules/suggest`, {
        method: "POST",
        body: { suggestion: suggestion.trim(), lastQuestion: lastQuestion || undefined, lastAnswer: lastAnswer || undefined },
      }),
    onSuccess: setProposed,
    onError: (e) => toast.error((e as Error).message),
  });

  const save = useMutation({
    mutationFn: (rule: Proposed) => api(`/tenants/${tenant.id}/rules`, { method: "POST", body: { kind: rule.kind, text: rule.text.trim() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rules", tenant.id] });
      toast.success(`Regra salva. A ${lia} já segue a partir da próxima mensagem.`, {
        action: lastQuestion && onRetry ? { label: "Testar de novo", onClick: () => onRetry(lastQuestion) } : undefined,
      });
      setProposed(null);
      setSuggestion("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section aria-labelledby="sugestao-titulo" className="rounded-lg border bg-card p-4">
      <h2 id="sugestao-titulo" className="text-sm font-semibold">
        Sugestão para a {lia}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Escreva do seu jeito o que ela deve mudar. Eu transformo em uma regra para você conferir.</p>

      {!proposed ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (suggestion.trim().length >= 2) suggest.mutate();
          }}
        >
          <Textarea
            rows={2}
            maxLength={500}
            className="min-h-11 flex-1 resize-none"
            placeholder="Ex.: escreve textos menores, fala de um jeito mais leve…"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (suggestion.trim().length >= 2 && !suggest.isPending) suggest.mutate();
              }
            }}
          />
          <Button type="submit" className="h-11 shrink-0" disabled={suggest.isPending || suggestion.trim().length < 2}>
            {suggest.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Pensando…
              </>
            ) : (
              "Transformar em regra"
            )}
          </Button>
        </form>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Vou guardar assim. Ajuste se quiser:</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={proposed.kind} onValueChange={(kind) => setProposed({ ...proposed, kind: kind as Proposed["kind"] })}>
              <SelectTrigger className="h-11 sm:w-32" aria-label="Sempre ou Nunca">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Sempre</SelectItem>
                <SelectItem value="never">Nunca</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-11 flex-1" maxLength={300} value={proposed.text} onChange={(e) => setProposed({ ...proposed, text: e.target.value })} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setProposed(null)}>
              Voltar
            </Button>
            <Button disabled={save.isPending || !proposed.text.trim()} onClick={() => save.mutate(proposed)}>
              {save.isPending ? "Salvando…" : "Salvar regra"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
