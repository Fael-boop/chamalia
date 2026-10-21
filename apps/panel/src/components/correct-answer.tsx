import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Tenant } from "@/api";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type Correction = { question: string; answer: string };

/**
 * "Corrigir" in Testar a Lia: turns a wrong answer into a ready answer (same
 * question → this answer) or a rule ("sempre…"/"nunca…"). Both are used by the
 * assistant on the next message.
 */
export function CorrectAnswer({
  tenant,
  correction,
  onOpenChange,
}: {
  tenant: Tenant;
  correction: Correction | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const lia = tenant.assistantName;
  const [mode, setMode] = useState<"answer" | "rule">("answer");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [kind, setKind] = useState<"always" | "never">("always");
  const [rule, setRule] = useState("");

  useEffect(() => {
    if (!correction) return;
    setMode("answer");
    setQuestion(correction.question);
    setAnswer("");
    setKind("always");
    setRule("");
  }, [correction]);

  const save = useMutation({
    mutationFn: () =>
      mode === "answer"
        ? api(`/tenants/${tenant.id}/faq`, { method: "POST", body: { question: question.trim(), answer: answer.trim() } })
        : api(`/tenants/${tenant.id}/rules`, { method: "POST", body: { kind, text: rule.trim() } }),
    onSuccess: () => {
      toast.success(mode === "answer" ? `Pronto! A ${lia} vai responder assim da próxima vez.` : `Regra salva. A ${lia} já segue a partir da próxima mensagem.`);
      void queryClient.invalidateQueries({ queryKey: ["faq", tenant.id] });
      void queryClient.invalidateQueries({ queryKey: ["rules", tenant.id] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const valid = mode === "answer" ? question.trim() !== "" && answer.trim() !== "" : rule.trim() !== "";

  return (
    <ResponsiveSheet
      open={Boolean(correction)}
      onOpenChange={onOpenChange}
      title={`Corrigir a ${lia}`}
      description="Ensine o jeito certo. Vale para as próximas conversas, no WhatsApp também."
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="lg" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Ensinar"}
          </Button>
        </div>
      }
    >
      {correction && (
        <div className="space-y-4 pb-2">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">A {lia} respondeu:</div>
            <p className="mt-1 whitespace-pre-wrap">{correction.answer}</p>
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "answer" | "rule")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="answer">Resposta certa</TabsTrigger>
              <TabsTrigger value="rule">Virar regra</TabsTrigger>
            </TabsList>
            <TabsContent value="answer" className="mt-4 space-y-3">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Quando perguntarem</span>
                <Input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Ela deve responder</span>
                <Textarea rows={4} maxLength={1000} placeholder="Escreva a resposta certa, do seu jeito." value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">Fica salvo em Respostas prontas. Perguntas parecidas também usam essa resposta.</p>
            </TabsContent>
            <TabsContent value="rule" className="mt-4 space-y-3">
              <div className="flex gap-2">
                <Select value={kind} onValueChange={(v) => setKind(v as "always" | "never")}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Sempre</SelectItem>
                    <SelectItem value="never">Nunca</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  maxLength={300}
                  placeholder={kind === "always" ? "pergunte o nome antes de agendar" : "ofereça desconto"}
                  value={rule}
                  onChange={(e) => setRule(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Vale em todas as conversas. Fica em Treinar a {lia}, onde dá para apagar depois.</p>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ResponsiveSheet>
  );
}
