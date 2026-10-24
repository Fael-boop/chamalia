import { APP_VERSION } from "@/version";
import type { ReactNode } from "react";
import { ChevronRight, LogOut, Moon, Sun } from "lucide-react";
import type { NavGroup, NavItem } from "@/components/app-shell";
import { Logo } from "@/components/logo";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";

/** Phone only: the sections that don't fit in the bottom bar, plus theme and logout. */
export function MorePage({
  items,
  groups = [],
  onNavigate,
  onLogout,
  header,
}: {
  items: NavItem[];
  /** Modules: items with the same group are listed together under its name. */
  groups?: NavGroup[];
  onNavigate: (id: string) => void;
  onLogout: () => void;
  /** Profile card at the top (inside a business). */
  header?: ReactNode;
}) {
  const { resolved, toggle } = useTheme();
  return (
    <div className="space-y-4">
      {header}
      {[{ id: "", label: "" }, ...groups].map((group) => {
        const list = items.filter((item) => (item.group ?? "") === group.id);
        if (list.length === 0) return null;
        return (
          <section key={group.id || "top"} className="space-y-1.5">
            {group.label && (
              <h2 className="px-1 text-xs font-semibold text-muted-foreground uppercase">
                {group.label}
              </h2>
            )}
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {list.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm active:bg-muted"
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        <li>
          <label className="flex min-h-[52px] items-center gap-3 px-4 text-sm">
            {resolved === "dark" ? (
              <Moon className="size-4 text-muted-foreground" />
            ) : (
              <Sun className="size-4 text-muted-foreground" />
            )}
            <span className="flex-1">Tema escuro</span>
            <Switch checked={resolved === "dark"} onCheckedChange={toggle} />
          </label>
        </li>
        <li>
          <button
            onClick={onLogout}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm text-destructive active:bg-muted"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </li>
      </ul>
      <div className="flex flex-col items-center gap-1.5 pt-4 pb-2 text-center">
        <Logo size={24} textClassName="text-sm" />
        <p className="text-[11px] text-muted-foreground">
          Atendimento no WhatsApp · chamalia.com.br · v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
