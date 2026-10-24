import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Professional, type Tenant } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Hint, PageHeader } from "@/components/page-header";
import { PhotoPicker, useProfessionalPhotos } from "@/components/person-photo";
import { ProfessionalHours } from "@/components/professional-hours";
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
  const photos = useProfessionalPhotos(tenant.id);
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
  const update = useMutation({
    mutationFn: ({ p, changes }: { p: Professional; changes: Partial<Pick<Professional, "active" | "notifyPhone">> }) =>
      api(`/tenants/${tenant.id}/professionals/${p.id}`, { method: "PATCH", body: changes }),
    onSuccess: (_d, { p, changes }) => {
      if ("active" in changes) toast.success(p.active ? `${p.name} desativada` : `${p.name} ativada`);
      else toast.success(`WhatsApp de ${p.name} salvo`);
    },
    onError: fail,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (p: Professional) => api(`/tenants/${tenant.id}/professionals/${p.id}`, { method: "DELETE" }),
    onSuccess: (_d, p) => {
      toast.success(`${p.name} excluída`);
      void queryClient.invalidateQueries({ queryKey: ["handoff-topics", tenant.id] });
      void queryClient.invalidateQueries({ queryKey: keys.tenant(tenant.id) });
      void queryClient.invalidateQueries({ queryKey: keys.services(tenant.id) });
    },
    onError: fail,
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: ({ name, kind }: { name: string; kind: Professional["kind"] }) =>
      api(`/tenants/${tenant.id}/professionals`, { method: "POST", body: { name, kind } }),
    onSuccess: (_d, { name }) => {
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
  const add = (kind: Professional["kind"]) => newName.trim() && create.mutate({ name: newName.trim(), kind });

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Profissionais"
          description={`Quem atende e o que cada uma faz. A ${tenant.assistantName} só oferece horário com quem faz o serviço.`}
        />
      )}

      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add("professional");
        }}
      >
        <Input className="min-w-48 flex-1 bg-card" placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" disabled={!newName.trim() || create.isPending}>
          <Plus /> Profissional
        </Button>
        <Button type="button" variant="outline" disabled={!newName.trim() || create.isPending} onClick={() => add("reception")}>
          <Plus /> Recepção
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
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PhotoPicker tenantId={tenant.id} professional={p} src={photos.data?.[p.id]} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.kind === "reception"
                        ? "Recepção: não faz serviços, só recebe conversas"
                        : `${p.serviceIds.filter((id) => activeServices.some((s) => s.id === id)).length} de ${activeServices.length} serviços`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.active ? "Ativa" : "Inativa"}
                    <Switch checked={p.active} onCheckedChange={() => update.mutate({ p, changes: { active: !p.active } })} />
                  </label>
                  <ConfirmDelete
                    title={`Excluir ${p.name}?`}
                    description={`${p.name} some da lista e a ${tenant.assistantName} para de oferecer horários com ela. Horários já marcados continuam na agenda. Avisos que iriam para ela passam a ir para o responsável. Para só pausar, desligue "Ativa".`}
                    onConfirm={() => remove.mutate(p)}
                  >
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Excluir ${p.name}`}>
                      <Trash2 />
                    </Button>
                  </ConfirmDelete>
                </div>
              </div>
              {p.kind === "professional" && (
                <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                  {activeServices.map((s) => (
                    <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted">
                      <Checkbox checked={p.serviceIds.includes(s.id)} onCheckedChange={() => toggleService(p, s.id)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
              <NotifyPhone key={p.notifyPhone ?? ""} professional={p} onSave={(notifyPhone) => update.mutate({ p, changes: { notifyPhone } })} />
              {p.kind === "professional" && <ProfessionalHours tenant={tenant} professional={p} />}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1">
        <Hint>A nova profissional começa fazendo todos os serviços; desmarque o que ela não faz. Em "Horários", defina dias e horários diferentes dos do salão.</Hint>
        <Hint>O WhatsApp para avisos é usado quando uma conversa é passada para essa pessoa (veja "Passar para a equipe"). Sem número, o aviso vai para o responsável.</Hint>
      </div>
    </>
  );
}

/** Saved when the field loses focus; empty removes the number. */
function NotifyPhone({ professional, onSave }: { professional: Professional; onSave: (phone: string | null) => void }) {
  const initial = professional.notifyPhone ?? "";
  const [value, setValue] = useState(initial);
  const digits = value.replace(/\D/g, "");
  const valid = digits === "" || /^\d{10,15}$/.test(digits);

  return (
    <div className="flex items-center gap-3 border-t px-4 py-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">WhatsApp para avisos</span>
      <Input
        className={cn("h-8 text-xs tabular-nums", !valid && "border-destructive")}
        inputMode="tel"
        placeholder="5511999990000"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (valid && digits !== initial) onSave(digits || null);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`WhatsApp para avisos de ${professional.name}`}
      />
    </div>
  );
}
