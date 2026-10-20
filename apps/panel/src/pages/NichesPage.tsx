import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Niche } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { DurationInput } from "@/components/duration-input";
import { Hint, PageHeader } from "@/components/page-header";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fromWeek, summarizeWeek, toWeek, WeekHoursEditor, type Week } from "@/components/week-hours-editor";
import { formatDuration, formatPrice, fromCents, toCents } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";

const nichesKey = ["niches"] as const;

type ServiceDraft = { name: string; duration: number; price: string };
type Draft = { label: string; place: string; customerWord: "cliente" | "paciente"; services: ServiceDraft[]; week: Week };

const EMPTY_WEEK: Week = Array.from({ length: 7 }, () => []);

const toDraft = (niche?: Niche): Draft =>
  niche
    ? {
        label: niche.label,
        place: niche.place,
        customerWord: niche.customerWord as "cliente" | "paciente",
        services: niche.starterServices.map((s) => ({ name: s.name, duration: s.durationMinutes, price: fromCents(s.priceCents) })),
        week: toWeek(niche.starterHours),
      }
    : { label: "", place: "", customerWord: "cliente", services: [], week: EMPTY_WEEK };

/** What a new client of this niche starts with: the assistant's wording, starter services and starter hours. */
export function NichesPage() {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const niches = useQuery({ queryKey: nichesKey, queryFn: () => api<Niche[]>("/niches") });
  const [editing, setEditing] = useState<Niche | "new" | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: nichesKey });
  const fail = (e: unknown) => toast.error((e as Error).message);
  const remove = useMutation({
    mutationFn: (n: Niche) => api(`/niches/${n.id}`, { method: "DELETE" }),
    onSuccess: (_d, n) => toast.success(`${n.label} excluído`),
    onError: fail,
    onSettled: refresh,
  });

  const openForm = (target: Niche | "new") => {
    setEditing(target);
    setOpen(true);
  };
  const newButton = (
    <Button onClick={() => openForm("new")} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
      <Plus /> Novo nicho
    </Button>
  );

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Nichos"
          description="O ponto de partida de um negócio novo: serviços e horário padrão, e como a atendente fala do lugar e de quem atende."
          actions={newButton}
        />
      )}
      {mobile && <div className="mb-3">{newButton}</div>}

      {niches.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(niches.data ?? []).map((n) => (
            <div key={n.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{n.label}</div>
                  <div className="text-xs text-muted-foreground">
                    "{n.place}" · {n.customerWord === "paciente" ? "paciente" : "cliente"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openForm(n)}>
                    Editar
                  </Button>
                  <ConfirmDelete
                    title={`Excluir ${n.label}?`}
                    description="Só é possível excluir um nicho sem nenhum negócio cadastrado com ele. Serve para configurar os próximos clientes; os já criados não mudam."
                    onConfirm={() => remove.mutate(n)}
                  >
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Excluir ${n.label}`}>
                      <Trash2 />
                    </Button>
                  </ConfirmDelete>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {n.starterServices.length === 0 ? (
                  <div>Sem serviços iniciais</div>
                ) : (
                  <div>
                    {n.starterServices
                      .map((s) => `${s.name} (${formatDuration(s.durationMinutes)}, ${formatPrice(s.priceCents)})`)
                      .join(" · ")}
                  </div>
                )}
                <div className="tabular-nums">{summarizeWeek(toWeek(n.starterHours))}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <Hint>O nicho só vale para negócios novos: ao criar um cliente, o painel usa estes serviços e horário como ponto de partida. Depois disso, cada um ajusta o seu.</Hint>
      </div>

      <NicheForm niche={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

function NicheForm({ niche, open, onOpenChange }: { niche: Niche | "new" | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const isNew = niche === "new";
  const [draft, setDraft] = useState<Draft>(() => toDraft());

  useEffect(() => {
    if (open) setDraft(toDraft(niche && niche !== "new" ? niche : undefined));
  }, [open, niche]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label: draft.label.trim(),
        place: draft.place.trim(),
        customerWord: draft.customerWord,
        starterServices: draft.services
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim(), durationMinutes: s.duration, priceCents: toCents(s.price) })),
        starterHours: fromWeek(draft.week),
      };
      return isNew ? api("/niches", { method: "POST", body }) : api(`/niches/${(niche as Niche).id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      toast.success(isNew ? `${draft.label} criado` : "Nicho atualizado");
      void queryClient.invalidateQueries({ queryKey: nichesKey });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addService = () => setDraft((d) => ({ ...d, services: [...d.services, { name: "", duration: 30, price: "" }] }));
  const updateService = (index: number, patch: Partial<ServiceDraft>) =>
    setDraft((d) => ({ ...d, services: d.services.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const removeService = (index: number) => setDraft((d) => ({ ...d, services: d.services.filter((_, i) => i !== index) }));

  const valid = draft.label.trim() !== "" && draft.place.trim() !== "";

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo nicho" : `Editar ${(niche as Niche | null)?.label ?? ""}`}
      description="O nicho define os serviços iniciais e o horário padrão. Depois você ajusta tudo por negócio."
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="lg" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Nome do nicho</span>
            <Input placeholder="Ex.: Estúdio de sobrancelhas" value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Como a atendente chama o lugar</span>
            <Input placeholder="Ex.: estúdio" value={draft.place} onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Como a atendente chama quem agenda</span>
          <Select value={draft.customerWord} onValueChange={(v) => setDraft((d) => ({ ...d, customerWord: v as Draft["customerWord"] }))}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cliente">cliente</SelectItem>
              <SelectItem value="paciente">paciente</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="space-y-2">
          <div className="text-sm font-medium">Serviços iniciais</div>
          {draft.services.length === 0 && <p className="text-xs text-muted-foreground">Nenhum ainda. Um negócio novo começa sem serviços.</p>}
          <ul className="space-y-2">
            {draft.services.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border bg-card p-2.5">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input placeholder="Nome do serviço" value={s.name} onChange={(e) => updateService(i, { name: e.target.value })} />
                  <div className="flex flex-wrap items-center gap-3">
                    <DurationInput value={s.duration} onChange={(duration) => updateService(i, { duration })} />
                    <Input className="w-28" inputMode="decimal" placeholder="Preço (R$)" value={s.price} onChange={(e) => updateService(i, { price: e.target.value })} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remover serviço" onClick={() => removeService(i)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={addService}>
            <Plus /> Serviço
          </Button>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Horário padrão</div>
          <WeekHoursEditor value={draft.week} onChange={(week) => setDraft((d) => ({ ...d, week }))} />
        </div>
        <Hint>Serve só de ponto de partida: o preço, a duração e o horário podem ficar em branco e são ajustados depois, por negócio.</Hint>
      </div>
    </ResponsiveSheet>
  );
}
