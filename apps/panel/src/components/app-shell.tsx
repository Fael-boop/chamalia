import { LogOut, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/logo";

export type NavItem = { id: string; label: string; icon: ComponentType<{ className?: string }> };

type Props = {
  brand: string;
  context?: ReactNode;
  items: NavItem[];
  /** Up to 4 items for the phone's bottom bar (the last one is usually "Mais"). */
  mobileItems: NavItem[];
  current: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={resolved === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      title={resolved === "dark" ? "Tema claro" : "Tema escuro"}
    >
      {resolved === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AppShell({ brand, context, items, mobileItems, current, onNavigate, onLogout, children }: Props) {
  const mobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={current}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );

  if (mobile) {
    const currentLabel = current === "more" ? "Mais" : (items.find((item) => item.id === current)?.label ?? brand);
    return (
      <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-sidebar px-4 text-white">
          {/* Tapping the logo or the title opens "Mais", like the bottom menu item. */}
          <button
            type="button"
            onClick={() => onNavigate("more")}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity active:opacity-70"
            aria-label="Abrir o menu Mais"
          >
            <LogoMark size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{currentLabel}</span>
              <span className="block truncate text-[11px] text-sidebar-foreground">{context ?? brand}</span>
            </span>
          </button>
          <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" />
        </header>
        <main className="px-4 py-4">{content}</main>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)]"
          aria-label="Menu principal"
        >
          {mobileItems.map((item) => {
            const active = item.id === current || (item.id === "more" && !mobileItems.some((m) => m.id === current));
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 active:scale-95",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 pt-5 pb-4">
          <Logo size={30} onDark textClassName="text-[15px]" />
          <div className="mt-3 truncate text-xs">{context ?? brand}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3" aria-label="Menu principal">
          {items.map((item) => {
            const active = item.id === current;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                  active ? "bg-sidebar-accent text-white" : "hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary"
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  />
                )}
                <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 border-t border-sidebar-border p-3">
          <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" />
          <Button
            variant="ghost"
            className="flex-1 justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
            onClick={onLogout}
          >
            <LogOut /> Sair
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">{content}</div>
      </main>
    </div>
  );
}
