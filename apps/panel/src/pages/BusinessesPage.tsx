import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, type Niche, type Tenant, type TenantSummary } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  businessType: z.string(),
  ownerName: z.string().trim(),
  ownerPhone: z.string().trim().refine((v) => v === "" || /^\d{10,15}$/.test(v.replace(/\D/g, "")), "DDI + DDD + número"),
  address: z.string().trim(),
  addressNeighborhood: z.string().trim(),
  addressCity: z.string().trim(),
  assistantName: z.string().trim().min(1).max(40),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  businessType: "beauty_salon",
  ownerName: "",
  ownerPhone: "",
  address: "",
  addressNeighborhood: "",
  addressCity: "",
  assistantName: "Lia",
};
const toValues = (t: Tenant): Values => ({
  name: t.name,
  businessType: t.businessType,
  ownerName: t.ownerName ?? "",
  ownerPhone: t.ownerPhone ?? "",
  address: t.address ?? "",
  addressNeighborhood: t.addressNeighborhood ?? "",
  addressCity: t.addressCity ?? "",
  assistantName: t.assistantName,
});

/** Agency home: every business. Click a row to edit it; the arrow opens its workspace. */
export function BusinessesPage({ onOpen }: { onOpen: (tenantId: string) => void }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // An id to edit, "new" to create, or null.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api<TenantSummary[]>("/tenants") });
  const niches = useQuery({ queryKey: ["niches"], queryFn: () => api<Niche[]>("/niches") });
  const nicheLabel = (value: string) => niches.data?.find((n) => n.slug === value)?.label ?? value;

  const openEditor = (id: string | "new") => {
    setEditing(id);
    setOpen(true);
  };

  const toggleActive = useMutation({
    mutationFn: (b: TenantSummary) => api<Tenant>(`/tenants/${b.id}`, { method: "PATCH", body: { active: !b.active } }),
    onMutate: (b) =>
      queryClient.setQueryData<TenantSummary[]>(["businesses"], (list) => list?.map((item) => (item.id === b.id ? { ...item, active: !item.active } : item))),
    onSuccess: (_d, b) => toast.success(b.active ? `${b.name} desativado` : `${b.name} ativado`),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["businesses"] }),
  });

  const activeSwitch = (b: TenantSummary) => (
    <Switch checked={b.active} onCheckedChange={() => toggleActive.mutate(b)} aria-label={`${b.active ? "Desativar" : "Ativar"} ${b.name}`} />
  );
  const openButton = (b: TenantSummary) => (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Abrir agenda de ${b.name}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(b.id);
      }}
    >
      <ArrowUpRight />
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Negócios"
        description="Os negócios atendidos pela Chama Lia."
        actions={
          <Button onClick={() => openEditor("new")}>
            <Plus /> Novo negócio
          </Button>
        }
      />

      {businesses.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : mobile ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {(businesses.data ?? []).map((b) => (
            <li key={b.id} className={cn("flex min-h-[60px] items-center gap-2 px-3", !b.active && "opacity-60")}>
              <button onClick={() => openEditor(b.id)} className="min-w-0 flex-1 py-2 text-left">
                <div className="truncate text-sm font-medium">{b.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {nicheLabel(b.businessType)} · {b.upcoming} próximos
                </div>
              </button>
              {activeSwitch(b)}
              {openButton(b)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Negócio</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Próximos agendamentos</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(businesses.data ?? []).map((b) => (
                <TableRow key={b.id} className={cn("cursor-pointer", !b.active && "text-muted-foreground")} onClick={() => openEditor(b.id)}>
                  <TableCell className="pl-4 font-medium">
                    {b.name}
                    {!b.active && <span className="ml-2 text-xs font-normal">(inativo)</span>}
                  </TableCell>
                  <TableCell>{nicheLabel(b.businessType)}</TableCell>
                  <TableCell>{b.ownerName ?? "—"}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-1.5 rounded-full", b.whatsappInstance ? "bg-status-confirmed" : "bg-muted-foreground/40")} />
                      {b.whatsappInstance ? "Configurado" : "Não configurado"}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{b.upcoming}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>{activeSwitch(b)}</TableCell>
                  <TableCell className="pr-4 text-right">{openButton(b)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="mt-3">
        <Hint>Clique em um negócio para editar o cadastro. A seta abre a agenda dele. Inativo: a atendente para de responder nesse negócio.</Hint>
      </div>

      <BusinessEditor niches={niches.data ?? []} id={editing} open={open} onOpenChange={setOpen} onOpenWorkspace={onOpen} />
    </>
  );
}

function BusinessEditor({
  niches,
  id,
  open,
  onOpenChange,
  onOpenWorkspace,
}: {
  niches: Niche[];
  id: string | "new" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenWorkspace: (tenantId: string) => void;
}) {
  const queryClient = useQueryClient();
  const isNew = id === "new";
  const detail = useQuery({
    queryKey: ["tenant-edit", id],
    queryFn: () => api<Tenant>(`/tenants/${id}`),
    enabled: open && Boolean(id) && !isNew,
  });

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(!isNew && detail.data ? toValues(detail.data) : EMPTY);
  }, [open, isNew, detail.data, form]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        name: v.name,
        businessType: v.businessType,
        assistantName: v.assistantName,
        ownerName: v.ownerName || null,
        ownerPhone: v.ownerPhone ? v.ownerPhone.replace(/\D/g, "") : null,
        address: v.address || null,
        addressNeighborhood: v.addressNeighborhood || null,
        addressCity: v.addressCity || null,
      };
      return isNew ? api<Tenant>("/tenants", { method: "POST", body }) : api<Tenant>(`/tenants/${id}`, { method: "PATCH", body });
    },
    onSuccess: (tenant) => {
      toast.success(isNew ? `${tenant.name} criado` : "Negócio atualizado");
      void queryClient.invalidateQueries({ queryKey: ["businesses"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-edit", tenant.id] });
      void queryClient.invalidateQueries({ queryKey: ["tenant", tenant.id] });
      onOpenChange(false);
      if (isNew) onOpenWorkspace(tenant.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const field = (name: keyof Omit<Values, "businessType">, label: string, help?: string, placeholder?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} {...f} />
          </FormControl>
          {help && <FormDescription className="text-xs">{help}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const loading = !isNew && detail.isLoading;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo negócio" : (detail.data?.name ?? "Editar negócio")}
      description={isNew ? "O nicho define os serviços iniciais e o horário padrão. Depois você ajusta tudo." : "Dados do cadastro. Serviços, agenda e o resto ficam dentro do negócio."}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="lg" type="submit" form="business-form" disabled={save.isPending || loading}>
            {save.isPending ? "Salvando…" : isNew ? "Criar" : "Salvar"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <Form {...form}>
          <form id="business-form" className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            {!isNew && id && (
              <Button type="button" variant="outline" className="w-full" onClick={() => onOpenWorkspace(id)}>
                <ArrowUpRight /> Abrir agenda deste negócio
              </Button>
            )}
            {field("name", "Nome do negócio", undefined, "Ex.: Salão da Ana")}
            <FormField
              control={form.control}
              name="businessType"
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>Nicho</FormLabel>
                  <Select value={f.value} onValueChange={f.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {niches.map((n) => (
                        <SelectItem key={n.id} value={n.slug}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            {field("ownerName", "Nome do responsável", isNew ? "Vira a primeira profissional cadastrada." : undefined)}
            {field("ownerPhone", "WhatsApp do responsável", "Recebe os avisos.", "5511999999999")}
            {field("address", "Endereço")}
            {field("addressNeighborhood", "Bairro")}
            {field("addressCity", "Cidade")}
            {field("assistantName", "Nome da atendente virtual")}
          </form>
        </Form>
      )}
    </ResponsiveSheet>
  );
}
