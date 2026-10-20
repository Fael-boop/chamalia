import { Input } from "@/components/ui/input";
import { formatDuration } from "@/format";

/** Hours + minutes fields for a total in minutes (NaN = nothing typed yet). */
export function DurationInput({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const total = Number.isNaN(value) ? 0 : value;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const set = (h: number, m: number) => onChange(h * 60 + m);
  const num = (raw: string) => Math.max(0, Number.parseInt(raw, 10) || 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={8}
          className="w-16 tabular-nums"
          aria-label="Horas"
          value={hours === 0 && total === 0 ? "" : hours}
          placeholder="0"
          onChange={(e) => set(num(e.target.value), minutes)}
        />
        <span className="text-xs text-muted-foreground">h</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={5}
          className="w-16 tabular-nums"
          aria-label="Minutos"
          value={total === 0 ? "" : minutes}
          placeholder="0"
          onChange={(e) => set(hours, Math.min(59, num(e.target.value)))}
        />
        <span className="text-xs text-muted-foreground">min</span>
      </div>
      {total > 0 && <p className="mt-1 text-xs text-muted-foreground">Total: {formatDuration(total)}</p>}
    </div>
  );
}
