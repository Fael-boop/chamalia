import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, type CustomerDetail, type Tenant } from "@/api";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  phone: z
    .string()
    .trim()
    .refine((value) => /^\d{10,13}$/.test(value.replace(/\D/g, "")), "Telefone com DDD. Ex.: (11) 99999-0000"),
  notes: z.string().trim().max(1000),
});
type Values = z.infer<typeof schema>;

/** Creates a customer (no `customer`) or edits one. Calls `onSaved` with the saved id. */
export function CustomerForm({
  tenant,
  customer,
  onSaved,
}: {
  tenant: Tenant;
  customer?: CustomerDetail;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: customer?.name ?? "", phone: customer?.phone ?? "", notes: customer?.notes ?? "" },
  });

  useEffect(() => {
    form.reset({ name: customer?.name ?? "", phone: customer?.phone ?? "", notes: customer?.notes ?? "" });
  }, [customer, form]);

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = { name: values.name, phone: values.phone, notes: values.notes || null };
      return customer
        ? api<{ id: string }>(`/tenants/${tenant.id}/customers/${customer.id}`, { method: "PATCH", body })
        : api<{ id: string }>(`/tenants/${tenant.id}/customers`, { method: "POST", body });
    },
    onSuccess: (saved) => {
      toast.success(customer ? "Cliente atualizada" : "Cliente adicionada");
      void queryClient.invalidateQueries({ queryKey: ["customers", tenant.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer", tenant.id] });
      onSaved(saved.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Form {...form}>
      <form className="space-y-3" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input autoFocus={!customer} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp</FormLabel>
              <FormControl>
                <Input inputMode="tel" placeholder="(11) 99999-0000" {...field} />
              </FormControl>
              <FormDescription className="text-xs">
                Com DDD. É por este número que a {tenant.assistantName} reconhece a cliente.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações (opcional)</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Ex.: alergia a amônia, prefere horário à tarde" {...field} />
              </FormControl>
              <FormDescription className="text-xs">Só a equipe vê. A {tenant.assistantName} não usa nas conversas.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending || (Boolean(customer) && !form.formState.isDirty)}>
          {save.isPending ? "Salvando…" : customer ? "Salvar alterações" : "Adicionar cliente"}
        </Button>
      </form>
    </Form>
  );
}
