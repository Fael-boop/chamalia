import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type BusinessHour, type Tenant } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";

type Period = { opensAt: string; closesAt: string };
// Monday first, like a salon week.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const hours = useQuery({
    queryKey: ["hours", tenant.id],
    queryFn: () => api<BusinessHour[]>(`/tenants/${tenant.id}/business-hours`),
  });
  const [days, setDays] = useState<Period[][] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hours.data) {
      setDays(WEEKDAYS.map((_, wd) => hours.data.filter((r) => r.weekday === wd).map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))));
    }
  }, [hours.data]);

  const update = (weekday: number, periods: Period[]) => setDays((current) => current!.map((p, i) => (i === weekday ? periods : p)));

  async function save() {
    if (!days) return;
    setSaving(true);
    try {
      const body = days.flatMap((periods, weekday) => periods.map((p) => ({ weekday, ...p })));
      await api(`/tenants/${tenant.id}/business-hours`, { method: "PUT", body });
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
      {!days ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {ORDER.map((weekday) => {
            const periods = days[weekday]!;
            const open = periods.length > 0;
            return (
              <div key={weekday} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <label className="flex w-36 items-center gap-3 text-sm font-medium">
                  <Switch
                    checked={open}
                    onCheckedChange={(checked) => update(weekday, checked ? [{ opensAt: "09:00", closesAt: "18:00" }] : [])}
                  />
                  {WEEKDAYS[weekday]}
                </label>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {!open && <span className="text-sm text-muted-foreground">Fechado</span>}
                  {periods.map((period, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        className="w-28 tabular-nums"
                        value={period.opensAt}
                        onChange={(e) => update(weekday, periods.map((p, i) => (i === index ? { ...p, opensAt: e.target.value } : p)))}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        className="w-28 tabular-nums"
                        value={period.closesAt}
                        onChange={(e) => update(weekday, periods.map((p, i) => (i === index ? { ...p, closesAt: e.target.value } : p)))}
                      />
                      <Button variant="ghost" size="icon" aria-label="Remover período" onClick={() => update(weekday, periods.filter((_, i) => i !== index))}>
                        <X />
                      </Button>
                    </div>
                  ))}
                  {open && (
                    <Button variant="ghost" size="sm" onClick={() => update(weekday, [...periods, { opensAt: "13:00", closesAt: "18:00" }])}>
                      <Plus /> Período
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={!days || saving} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
          {saving ? "Salvando…" : "Salvar horários"}
        </Button>
      </div>
      <div className="mt-3">
        <Hint>A {tenant.assistantName} só oferece horários dentro destes períodos.</Hint>
      </div>
    </>
  );
}
