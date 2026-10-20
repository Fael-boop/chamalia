import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, type Service, type Tenant } from "@/api";
import { DurationInput } from "@/components/duration-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Hint, PageHeader } from "@/components/page-header";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, formatPrice } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useServices } from "@/lib/queries";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  durationMinutes: z.number({ message: "Informe a duração" }).int().min(5, "Mínimo 5 minutos").max(480, "Máximo 8 horas"),
  price: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+([.,]\d{1,2})?$/.test(v), "Use por exemplo 45 ou 45,50"),
  description: z.string().trim().max(500),
  handoff: z.boolean(),
  handoffReason: z.string().trim().max(300),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { name: "", durationMinutes: 30, price: "", description: "", handoff: false, handoffReason: "" };

const toCents = (price: string) => (price.trim() === "" ? null : Math.round(Number(price.trim().replace(",", ".")) * 100));
const fromCents = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function ServicesPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const services = useServices(tenant.id);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: (s: Service) => api(`/tenants/${tenant.id}/services/${s.id}`, { method: "PATCH", body: { active: !s.active } }),
    onSuccess: (_d, s) => {
      toast.success(s.active ? `${s.name} desativado` : `${s.name} ativado`);
      void queryClient.invalidateQueries({ queryKey: keys.services(tenant.id) });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openForm = (target: Service | "new") => {
    setEditing(target);
    setOpen(true);
  };

  const newButton = (
    <Button onClick={() => openForm("new")} className={mobile ? "w-full" : undefined} size={mobile ? "lg" : "default"}>
      <Plus /> Novo serviço
    </Button>
  );

  return (
    <>
      {mobile ? (
        <div className="mb-4 space-y-2">
          {newButton}
          <Hint>Só serviços com duração fixa. Combos, encaixe e serviços marcados "sempre com a equipe" a {tenant.assistantName} passa para você.</Hint>
        </div>
      ) : (
        <PageHeader
          title="Serviços"
          description={`O que a ${tenant.assistantName} agenda sozinha. Combos, encaixe e serviços marcados "sempre com a equipe" ela passa para você.`}
          actions={newButton}
        />
      )}

      {services.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : mobile ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {(services.data ?? []).map((s) => (
            <li key={s.id} className="flex min-h-[60px] items-center gap-3 px-3">
              <button className="min-w-0 flex-1 py-2 text-left" onClick={() => openForm(s)}>
                <div className={s.active ? "truncate text-sm font-medium" : "truncate text-sm font-medium text-muted-foreground"}>
                  {s.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDuration(s.durationMinutes)} · {formatPrice(s.priceCents)}
                  {s.handoff && " · com a equipe"}
                </div>
              </button>
              <Switch checked={s.active} onCheckedChange={() => toggle.mutate(s)} aria-label={`Ativar ${s.name}`} />
              <DeleteService tenant={tenant} service={s} compact />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Serviço</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="w-28">Ativo</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(services.data ?? []).map((s) => (
                <TableRow key={s.id} className={s.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="pl-4 font-medium">
                    {s.name}
                    {s.description && <div className="text-xs font-normal text-muted-foreground">{s.description}</div>}
                    {s.handoff && (
                      <div className="text-xs font-normal text-muted-foreground">
                        Sempre com a equipe{s.handoffReason ? `: ${s.handoffReason}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDuration(s.durationMinutes)}</TableCell>
                  <TableCell className="tabular-nums">{formatPrice(s.priceCents)}</TableCell>
                  <TableCell>
                    <Switch checked={s.active} onCheckedChange={() => toggle.mutate(s)} aria-label={`Ativar ${s.name}`} />
                  </TableCell>
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openForm(s)}>
                      Editar
                    </Button>
                    <DeleteService tenant={tenant} service={s} compact />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-3">
        <Hint>Serviço novo já fica disponível para todas as profissionais ativas. Ajuste em Profissionais.</Hint>
      </div>

      <ServiceForm tenant={tenant} service={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ServiceForm({
  tenant,
  service,
  open,
  onOpenChange,
}: {
  tenant: Tenant;
  service: Service | "new" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isNew = service === "new";
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const handoff = form.watch("handoff");

  useEffect(() => {
    if (!open) return;
    form.reset(
      service && service !== "new"
        ? {
            name: service.name,
            durationMinutes: service.durationMinutes,
            price: fromCents(service.priceCents),
            description: service.description ?? "",
            handoff: service.handoff,
            handoffReason: service.handoffReason ?? "",
          }
        : EMPTY,
    );
  }, [open, service, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        name: values.name,
        durationMinutes: values.durationMinutes,
        priceCents: toCents(values.price),
        description: values.description || null,
        handoff: values.handoff,
        handoffReason: values.handoff ? values.handoffReason || null : null,
      };
      return isNew
        ? api(`/tenants/${tenant.id}/services`, { method: "POST", body })
        : api(`/tenants/${tenant.id}/services/${(service as Service).id}`, { method: "PATCH", body });
    },
    onSuccess: (_d, values) => {
      toast.success(isNew ? `${values.name} adicionado` : "Serviço atualizado");
      void queryClient.invalidateQueries({ queryKey: keys.services(tenant.id) });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo serviço" : "Editar serviço"}
      description="A atendente usa duração e preço para oferecer horários e responder dúvidas."
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          {isNew ? (
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          ) : (
            <DeleteService tenant={tenant} service={service as Service} onDeleted={() => onOpenChange(false)} />
          )}
          <Button size="lg" type="submit" form="service-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form id="service-form" className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: Escova" autoFocus={isNew} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duração</FormLabel>
                  <FormControl>
                    <DurationInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preço (R$)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="45,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição (opcional)</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Ex.: inclui lavagem" {...field} />
                </FormControl>
                <FormDescription className="text-xs">A atendente pode usar para explicar o serviço.</FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="handoff"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <div className="space-y-1">
                  <FormLabel>Sempre passar para a equipe</FormLabel>
                  <FormDescription className="text-xs">A {tenant.assistantName} não agenda: entende o pedido e chama você.</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          {handoff && (
            <FormField
              control={form.control}
              name="handoffReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: precisa de avaliação antes" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">A {tenant.assistantName} usa para explicar à cliente por que vai chamar você.</FormDescription>
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </ResponsiveSheet>
  );
}

/** Trash button; `compact` is the small icon used in the list rows. */
function DeleteService({ tenant, service, onDeleted, compact }: { tenant: Tenant; service: Service; onDeleted?: () => void; compact?: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/tenants/${tenant.id}/services/${service.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${service.name} excluído`);
      void queryClient.invalidateQueries({ queryKey: keys.services(tenant.id) });
      void queryClient.invalidateQueries({ queryKey: keys.professionals(tenant.id) });
      onDeleted?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <ConfirmDelete
      title={`Excluir ${service.name}?`}
      description={`A ${tenant.assistantName} para de oferecer este serviço. Horários já marcados continuam na agenda. Para só pausar, desligue "Ativo".`}
      onConfirm={() => remove.mutate()}
    >
      {compact ? (
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Excluir ${service.name}`} disabled={remove.isPending}>
          <Trash2 />
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="text-destructive hover:text-destructive" disabled={remove.isPending}>
          Excluir
        </Button>
      )}
    </ConfirmDelete>
  );
}
