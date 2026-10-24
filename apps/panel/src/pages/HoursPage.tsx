import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type BusinessHour, type Tenant } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { TimeOffSection } from "@/components/time-off-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fromWeek, toWeek, WeekHoursEditor, type Week } from "@/components/week-hours-editor";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys } from "@/lib/queries";

export function HoursPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const hours = useQuery({
    queryKey: keys.hours(tenant.id),
    queryFn: () => api<BusinessHour[]>(`/tenants/${tenant.id}/business-hours`),
  });
  const [days, setDays] = useState<Week | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hours.data) setDays(toWeek(hours.data));
  }, [hours.data]);

  async function save() {
    if (!days) return;
    setSaving(true);
    try {
      await api(`/tenants/${tenant.id}/business-hours`, { method: "PUT", body: fromWeek(days) });
      await queryClient.invalidateQueries({ queryKey: ["hours", tenant.id] });
      toast.success("Horários salvos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {!mobile && <PageHeader title="Horários" description="Dias e horários de funcionamento. Para almoço, use dois períodos no mesmo dia." />}
      {!days ? <Skeleton className="h-96 rounded-lg" /> : <WeekHoursEditor value={days} onChange={setDays} />}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={!days || saving} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
          {saving ? "Salvando…" : "Salvar horários"}
        </Button>
      </div>
      <div className="mt-3">
        <Hint>
          A {tenant.assistantName} só oferece horários dentro destes períodos. Se uma profissional atende em horário diferente, ajuste em
          Profissionais.
        </Hint>
      </div>
      <TimeOffSection tenant={tenant} />
    </>
  );
}
