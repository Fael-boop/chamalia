import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppointmentStatus } from "@/api";
import { PersonPhoto } from "@/components/person-photo";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS } from "@/format";
import { cn } from "@/lib/utils";

export type AgendaView = "grid" | "list";

const STATUS_ORDER: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

/** Desktop side panel: jump to any day, find a customer, choose who and what to see, and how. */
export function AgendaSidebar(props: {
  date: string;
  onDate: (date: string) => void;
  search: string;
  onSearch: (value: string) => void;
  professionals: { id: string; name: string }[];
  photos: Record<string, string>;
  colors: Map<string, string>;
  hidden: Set<string>;
  onToggleProfessional: (id: string) => void;
  onShowAll: () => void;
  statuses: Set<AppointmentStatus>;
  onToggleStatus: (status: AppointmentStatus) => void;
  statusCounts: Record<AppointmentStatus, number>;
  view: AgendaView;
  onView: (view: AgendaView) => void;
}) {
  // The month shown can move without changing the selected day.
  const [month, setMonth] = useState(() => parseISO(props.date));
  useEffect(() => setMonth(parseISO(props.date)), [props.date]);
  return (
    <aside
      className="min-h-0 space-y-5 overflow-y-auto pr-1"
      aria-label="Filtros da agenda"
    >
      <Calendar
        mode="single"
        locale={ptBR}
        selected={parseISO(props.date)}
        month={month}
        onMonthChange={setMonth}
        onSelect={(day) => day && props.onDate(format(day, "yyyy-MM-dd"))}
        className="w-full rounded-lg border bg-card p-2 [--cell-size:--spacing(6)]"
      />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 bg-card pl-8 text-sm"
          placeholder="Buscar cliente no dia"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          inputMode="search"
          aria-label="Buscar cliente no dia"
        />
      </div>

      <Group
        title="Profissionais"
        action={
          props.hidden.size > 0
            ? { label: "Todas", onClick: props.onShowAll }
            : undefined
        }
      >
        {props.professionals.map((p) => (
          <label
            key={p.id}
            className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={!props.hidden.has(p.id)}
              onCheckedChange={() => props.onToggleProfessional(p.id)}
            />
            <PersonPhoto
              name={p.name}
              src={props.photos[p.id]}
              className="size-6 text-[9px]"
              ringColor={props.colors.get(p.id)}
            />
            <span className="truncate">{p.name}</span>
          </label>
        ))}
      </Group>

      <Group title="Situação">
        {STATUS_ORDER.map((status) => (
          <label
            key={status}
            className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={props.statuses.has(status)}
              onCheckedChange={() => props.onToggleStatus(status)}
            />
            <span className="flex-1">{STATUS_LABELS[status]}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {props.statusCounts[status] || ""}
            </span>
          </label>
        ))}
      </Group>

      <Group title="Exibição">
        <Segmented
          value={props.view}
          onChange={props.onView}
          options={[
            { value: "grid", label: "Por hora" },
            { value: "list", label: "Só marcados" },
          ]}
        />
      </Group>
    </aside>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1.5">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase">
          {title}
        </h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border bg-card p-1"
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-md text-xs font-medium transition-colors duration-150",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
