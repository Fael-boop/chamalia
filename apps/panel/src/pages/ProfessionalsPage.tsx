import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Professional, type Tenant } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys, useProfessionals, useServices } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function ProfessionalsPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const professionals = useProfessionals(tenant.id);
  const services = useServices(tenant.id);
  const [newName, setNewName] = useState("");
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.professionals(tenant.id) });
  const fail = (e: unknown) => toast.error((e as Error).message);

  const setServices = useMutation({
    mutationFn: ({ p, serviceIds }: { p: Professional; serviceIds: string[] }) =>
      api(`/tenants/${tenant.id}/professionals/${p.id}/services`, { method: "PUT", body: serviceIds }),
    onMutate: ({ p, serviceIds }) =>
      queryClient.setQueryData<Professional[]>(keys.professionals(tenant.id), (list) =>
        list?.map((item) => (item.id === p.id ? { ...item, serviceIds } : item)),
      ),
    onError: fail,
    onSettled: refresh,
  });
  const toggleActive = useMutation({
    mutationFn: (p: Professional) => api(`/tenants/${tenant.id}/professionals/${p.id}`, { method: "PATCH", body: { active: !p.active } }),
    onSuccess: (_d, p) => toast.success(p.active ? `${p.name} desativada` : `${p.name} ativada`),
    onError: fail,
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: (name: string) => api(`/tenants/${tenant.id}/professionals`, { method: "POST", body: { name } }),
    onSuccess: (_d, name) => {
      toast.success(`${name} adicionada`);
      setNewName("");
    },
    onError: fail,
    onSettled: refresh,
  });

  const toggleService = (p: Professional, serviceId: string) =>
    setServices.mutate({
      p,
      serviceIds: p.serviceIds.includes(serviceId) ? p.serviceIds.filter((id) => id !== serviceId) : [...p.serviceIds, serviceId],
    });

  return (
    <>
      {!mobile && <PageHeader title="Profissionais" description={`Quem atende e o que cada uma faz. A ${tenant.assistantName} só oferece horário com quem faz o serviço.`} />}

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) create.mutate(newName.trim());
        }}
      >
        <Input className="bg-card" placeholder="Nome da nova profissional" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" disabled={!newName.trim() || create.isPending}>
          <Plus /> Adicionar
        </Button>
      </form>

      {professionals.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(professionals.data ?? []).map((p) => (
            <div key={p.id} className={cn("rounded-lg border bg-card", !p.active && "opacity-60")}>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.serviceIds.filter((id) => activeServices.some((s) => s.id === id)).length} de {activeServices.length} serviços
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {p.active ? "Ativa" : "Inativa"}
                  <Switch checked={p.active} onCheckedChange={() => toggleActive.mutate(p)} />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                {activeServices.map((s) => (
                  <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted">
                    <Checkbox checked={p.serviceIds.includes(s.id)} onCheckedChange={() => toggleService(p, s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <Hint>A nova profissional começa fazendo todos os serviços; desmarque o que ela não faz.</Hint>
      </div>
    </>
  );
}
