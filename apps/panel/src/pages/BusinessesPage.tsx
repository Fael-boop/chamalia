import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
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

/** Agency home: every business served by Chama Lia. */
export function BusinessesPage({ onOpen }: { onOpen: (tenantId: string) => void }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api<TenantSummary[]>("/tenants") });
  const niches = useQuery({ queryKey: ["niches"], queryFn: () => api<Niche[]>("/niches") });
  const nicheLabel = (value: string) => niches.data?.find((n) => n.slug === value)?.label ?? value;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", businessType: "beauty_salon", ownerName: "", ownerPhone: "", address: "", addressNeighborhood: "", addressCity: "", assistantName: "Lia" },
  });
  const create = useMutation({
    mutationFn: (v: Values) =>
      api<Tenant>("/tenants", {
        method: "POST",
        body: {
          name: v.name,
          businessType: v.businessType,
          assistantName: v.assistantName,
          ownerName: v.ownerName || null,
          ownerPhone: v.ownerPhone ? v.ownerPhone.replace(/\D/g, "") : null,
          address: v.address || null,
          addressNeighborhood: v.addressNeighborhood || null,
          addressCity: v.addressCity || null,
        },
      }),
    onSuccess: (tenant) => {
      toast.success(`${tenant.name} criado`);
      void queryClient.invalidateQueries({ queryKey: ["businesses"] });
      setOpen(false);
      form.reset();
      onOpen(tenant.id);
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

  return (
    <>
      <PageHeader
        title="Negócios"
        description="Os negócios atendidos pela Chama Lia."
        actions={
          <Button onClick={() => setOpen(true)}>
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
            <li key={b.id}>
              <button onClick={() => onOpen(b.id)} className={cn("flex min-h-[60px] w-full items-center gap-3 px-3 text-left active:bg-muted", !b.active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {nicheLabel(b.businessType)} · {b.upcoming} próximos
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(businesses.data ?? []).map((b) => (
                <TableRow key={b.id} className={cn("cursor-pointer", !b.active && "text-muted-foreground")} onClick={() => onOpen(b.id)}>
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
                  <TableCell className="pr-4 text-right">
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Novo negócio"
        description="O nicho define os serviços iniciais e o horário padrão (ter–sáb, 9h–18h). Depois você ajusta tudo."
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="lg" type="submit" form="business-form" disabled={create.isPending}>
              {create.isPending ? "Criando…" : "Criar"}
            </Button>
          </div>
        }
      >
        <Form {...form}>
          <form id="business-form" className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
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
                      {(niches.data ?? []).map((n) => (
                        <SelectItem key={n.id} value={n.slug}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            {field("ownerName", "Nome do responsável", "Vira a primeira profissional cadastrada.")}
            {field("ownerPhone", "WhatsApp do responsável", "Recebe os avisos.", "5511999999999")}
            {field("address", "Endereço")}
            {field("addressNeighborhood", "Bairro")}
            {field("addressCity", "Cidade")}
            {field("assistantName", "Nome da atendente virtual")}
          </form>
        </Form>
      </ResponsiveSheet>
      <div className="mt-3">
        <Hint>Clique em um negócio para ver a agenda e configurar.</Hint>
      </div>
    </>
  );
}
