import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api, type TeamConversation, type Tenant } from "@/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone } from "@/format";
import { keys } from "@/lib/queries";

const RETURN_HOURS = [1, 2, 4, 8, 12, 24, 48];
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });

/** Conversations the assistant handed over and is staying silent in, with a way to give them back. */
export function TeamConversations({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const key = ["handoffs", tenant.id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<TeamConversation[]>(`/tenants/${tenant.id}/handoffs`),
    refetchInterval: 30_000,
  });

  const release = useMutation({
    mutationFn: (c: TeamConversation) => api(`/tenants/${tenant.id}/conversations/${c.id}/release`, { method: "POST" }),
    onMutate: (c) => queryClient.setQueryData<TeamConversation[]>(key, (items) => items?.filter((item) => item.id !== c.id)),
    onSuccess: (_d, c) => toast.success(`Conversa com ${c.customerName ?? "a cliente"} devolvida para a ${tenant.assistantName}`),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const setHours = useMutation({
    mutationFn: (hours: number) => api<Tenant>(`/tenants/${tenant.id}`, { method: "PATCH", body: { handoffReturnHours: hours } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.tenant(tenant.id), saved);
      toast.success("Salvo");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      {list.isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conversa com a equipe agora. A {tenant.assistantName} está atendendo todas.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {list.data!.map((c) => (
            <li key={c.id} className="space-y-2 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.customerName ?? formatPhone(c.customerPhone)}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.handoffTo ? `Com ${c.handoffTo}` : "Com a equipe"}
                    {c.handoffAt && ` · ${ago(c.handoffAt)}`}
                  </div>
                </div>
                <Button size="sm" onClick={() => release.mutate(c)} disabled={release.isPending}>
                  Devolver para a {tenant.assistantName}
                </Button>
              </div>
              {c.reason && <p className="text-xs leading-relaxed text-muted-foreground">{c.reason}</p>}
              <a
                href={`https://wa.me/${c.customerPhone}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <MessageCircle className="size-3.5" /> Abrir no WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Se ninguém da equipe responder, a conversa volta sozinha para a {tenant.assistantName} depois de</span>
        <Select value={String(tenant.handoffReturnHours)} onValueChange={(v) => setHours.mutate(Number(v))}>
          <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="Horas até voltar para a atendente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RETURN_HOURS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h} {h === 1 ? "hora" : "horas"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        O tempo conta a partir da última mensagem da equipe na conversa. Quando volta sozinha, você recebe um aviso de que o pedido ficou
        pendente. Depois de resolver, toque em "Devolver" para a {tenant.assistantName} voltar na hora.
      </p>
    </div>
  );
}
