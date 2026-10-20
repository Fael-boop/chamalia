import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type BusinessHour, type Professional, type Tenant } from "@/api";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fromWeek, summarizeWeek, toWeek, WeekHoursEditor, type Week } from "@/components/week-hours-editor";
import { keys } from "@/lib/queries";

const useHours = (tenantId: string, professionalId?: string) =>
  useQuery({
    queryKey: keys.hours(tenantId, professionalId),
    queryFn: () =>
      api<BusinessHour[]>(`/tenants/${tenantId}/business-hours${professionalId ? `?professionalId=${professionalId}` : ""}`),
  });

/** One line on the professional card + the sheet to edit her own schedule. */
export function ProfessionalHours({ tenant, professional }: { tenant: Tenant; professional: Professional }) {
  const queryClient = useQueryClient();
  const own = useHours(tenant.id, professional.id);
  const business = useHours(tenant.id);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [week, setWeek] = useState<Week | null>(null);
  const [saving, setSaving] = useState(false);

  const hasOwn = (own.data?.length ?? 0) > 0;

  // Fresh form every time the sheet opens. Turning "own hours" on starts from the business hours.
  useEffect(() => {
    if (!open || !own.data || !business.data) return;
    setCustom(own.data.length > 0);
    setWeek(toWeek(own.data.length > 0 ? own.data : business.data));
  }, [open, own.data, business.data]);

  async function save() {
    if (!week) return;
    const rows = custom ? fromWeek(week) : [];
    if (custom && rows.length === 0) {
      toast.error("Marque pelo menos um dia, ou desligue o horário próprio.");
      return;
    }
    setSaving(true);
    try {
      await api(`/tenants/${tenant.id}/business-hours?professionalId=${professional.id}`, { method: "PUT", body: rows });
      await queryClient.invalidateQueries({ queryKey: keys.hours(tenant.id, professional.id) });
      toast.success(`Horários de ${professional.name} salvos`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
        <div className="min-w-0 text-xs">
          <span className="text-muted-foreground">Horário: </span>
          {own.isLoading ? (
            <Skeleton className="inline-block h-3 w-32 align-middle" />
          ) : hasOwn ? (
            <span className="tabular-nums">{summarizeWeek(toWeek(own.data!))}</span>
          ) : (
            <span className="text-muted-foreground">igual ao do salão</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Horários
        </Button>
      </div>

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={`Horários de ${professional.name}`}
        description={`A ${tenant.assistantName} só oferece horários com ${professional.name} dentro destes períodos.`}
        footer={
          <Button onClick={save} disabled={!week || saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        }
      >
        {!week ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : (
          <div className="space-y-4 pb-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
              <span>
                <span className="font-medium">Horário próprio</span>
                <span className="block text-xs text-muted-foreground">
                  {custom ? "Atende só nos dias e horários abaixo." : "Desligado: segue o horário do salão."}
                </span>
              </span>
              <Switch
                checked={custom}
                onCheckedChange={(checked) => {
                  setCustom(checked);
                  if (checked && business.data && !hasOwn) setWeek(toWeek(business.data));
                }}
              />
            </label>
            {custom && <WeekHoursEditor value={week} onChange={setWeek} closedLabel="Não atende" />}
          </div>
        )}
      </ResponsiveSheet>
    </>
  );
}
