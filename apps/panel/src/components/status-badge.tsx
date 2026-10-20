import type { AppointmentStatus } from "@/api";
import { STATUS_LABELS } from "@/format";
import { cn } from "@/lib/utils";

/** Status colors: the only non-brand colors in the UI, kept subtle. */
export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  confirmed: "bg-status-confirmed-bg text-status-confirmed border-status-confirmed-border",
  scheduled: "bg-status-pending-bg text-status-pending border-status-pending-border",
  cancelled: "bg-status-cancelled-bg text-status-cancelled border-status-cancelled-border",
  completed: "bg-status-done-bg text-status-done border-status-done-border",
  no_show: "bg-status-cancelled-bg text-status-cancelled border-status-cancelled-border",
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap transition-colors duration-200",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
