import { Plus, X } from "lucide-react";
import type { BusinessHour } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/format";
import { cn } from "@/lib/utils";

export type Period = { opensAt: string; closesAt: string };
/** Periods per weekday, indexed 0 (Sunday) to 6. */
export type Week = Period[][];

// Monday first, like a salon week.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export const toWeek = (rows: BusinessHour[]): Week =>
  WEEKDAYS.map((_, wd) => rows.filter((r) => r.weekday === wd).map(({ opensAt, closesAt }) => ({ opensAt, closesAt })));

export const fromWeek = (week: Week): BusinessHour[] => week.flatMap((periods, weekday) => periods.map((p) => ({ weekday, ...p })));

/** Short text like "Ter–Sáb 09:00–18:00" or "Ter 09:00–11:00, 14:00–18:00 · Qua …". */
export function summarizeWeek(week: Week): string {
  const parts: { days: number[]; text: string }[] = [];
  for (const wd of ORDER) {
    const periods = week[wd]!;
    if (!periods.length) continue;
    const text = periods.map((p) => `${p.opensAt}–${p.closesAt}`).join(", ");
    const last = parts.at(-1);
    if (last && last.text === text && ORDER.indexOf(last.days.at(-1)!) === ORDER.indexOf(wd) - 1) last.days.push(wd);
    else parts.push({ days: [wd], text });
  }
  if (!parts.length) return "Não atende";
  const short = (wd: number) => WEEKDAYS[wd]!.slice(0, 3);
  return parts
    .map(({ days, text }) => `${days.length > 1 ? `${short(days[0]!)}–${short(days.at(-1)!)}` : short(days[0]!)} ${text}`)
    .join(" · ");
}

export function WeekHoursEditor({ value, onChange, closedLabel = "Fechado", className }: {
  value: Week;
  onChange: (week: Week) => void;
  closedLabel?: string;
  className?: string;
}) {
  const update = (weekday: number, periods: Period[]) => onChange(value.map((p, i) => (i === weekday ? periods : p)));

  return (
    <div className={cn("divide-y overflow-hidden rounded-lg border bg-card", className)}>
      {ORDER.map((weekday) => {
        const periods = value[weekday]!;
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
              {!open && <span className="text-sm text-muted-foreground">{closedLabel}</span>}
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
  );
}
