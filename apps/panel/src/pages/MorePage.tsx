import { ChevronRight, LogOut, Moon, Sun } from "lucide-react";
import type { NavItem } from "@/components/app-shell";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";

/** Phone only: the sections that don't fit in the bottom bar, plus theme and logout. */
export function MorePage({ items, onNavigate, onLogout }: { items: NavItem[]; onNavigate: (id: string) => void; onLogout: () => void }) {
  const { resolved, toggle } = useTheme();
  return (
    <div className="space-y-4">
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <button onClick={() => onNavigate(item.id)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm active:bg-muted">
              <item.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        <li>
          <label className="flex min-h-[52px] items-center gap-3 px-4 text-sm">
            {resolved === "dark" ? <Moon className="size-4 text-muted-foreground" /> : <Sun className="size-4 text-muted-foreground" />}
            <span className="flex-1">Tema escuro</span>
            <Switch checked={resolved === "dark"} onCheckedChange={toggle} />
          </label>
        </li>
        <li>
          <button onClick={onLogout} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm text-destructive active:bg-muted">
            <LogOut className="size-4" />
            Sair
          </button>
        </li>
      </ul>
    </div>
  );
}
