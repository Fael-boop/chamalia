import { APP_VERSION } from "@/version";
import {
  ChevronLeft,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/logo";

export type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Address of the screen: the menu entry is a real link (new tab, middle click). */
  href?: string;
};

type Props = {
  brand: string;
  /** Business (or "Agência") shown under the page title on phones. */
  context?: ReactNode;
  items: NavItem[];
  /** Up to 4 items for the phone's bottom bar (the last one is usually "Mais"). */
  mobileItems: NavItem[];
  current: string;
  onNavigate: (id: string) => void;
  /** Agency inside one business: goes back to the list of businesses (phone header arrow). */
  onBack?: () => void;
  /** Top bar, left: the business being managed. */
  headerStart?: ReactNode;
  /** Top bar, right: notices, help, theme and the profile menu. */
  headerEnd?: ReactNode;
  /** Phone header, right: the compact version of headerEnd. */
  mobileHeaderEnd?: ReactNode;
  /** Use the whole width (the agenda); other screens keep a readable max width. */
  wide?: boolean;
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

/** A plain left click stays in the app; ctrl/cmd/shift/middle click open the address in a new tab. */
function followLink(event: MouseEvent<HTMLAnchorElement>, go: () => void) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  go();
}

const AUTO_HIDE_KEY = "chamalia.navAutoHide";

/** Desktop menu preference: pinned (default) or hidden until the mouse reaches the left edge. */
function useAutoHideNav(): [boolean, (value: boolean) => void] {
  const [autoHide, setAutoHide] = useState(() => {
    try {
      return localStorage.getItem(AUTO_HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const save = (value: boolean) => {
    setAutoHide(value);
    try {
      localStorage.setItem(AUTO_HIDE_KEY, value ? "1" : "0");
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
  };
  return [autoHide, save];
}

export function AppShell({
  brand,
  context,
  items,
  mobileItems,
  current,
  onNavigate,
  onBack,
  headerStart,
  headerEnd,
  mobileHeaderEnd,
  wide,
  children,
}: Props) {
  const [autoHide, setAutoHide] = useAutoHideNav();
  const [peek, setPeek] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openPeek = () => {
    clearTimeout(closeTimer.current);
    setPeek(true);
  };
  const closePeek = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPeek(false), 250);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

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

  const skipLink = (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
    >
      Pular para o conteúdo
    </a>
  );

  if (mobile) {
    const currentLabel =
      current === "more"
        ? "Mais"
        : (items.find((item) => item.id === current)?.label ?? brand);
    return (
      <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {skipLink}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-sidebar px-4 text-white">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white active:scale-95"
              aria-label="Voltar para todos os negócios"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          <LogoMark size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">
              {currentLabel}
            </span>
            <span className="block truncate text-[11px] text-sidebar-foreground">
              {context ?? brand}
            </span>
          </span>
          <div className="flex items-center gap-0.5">{mobileHeaderEnd}</div>
        </header>
        <main id="conteudo" className="px-4 py-4">
          {content}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card pb-[env(safe-area-inset-bottom)]"
          style={{
            gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))`,
          }}
          aria-label="Menu principal"
        >
          {mobileItems.map((item) => {
            const active =
              item.id === current ||
              (item.id === "more" &&
                !mobileItems.some((m) => m.id === current));
            return (
              <a
                key={item.id}
                href={item.href ?? "#"}
                onClick={(event) =>
                  followLink(event, () => onNavigate(item.id))
                }
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 active:scale-95",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-5" />
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {skipLink}
      {autoHide && (
        // Thin strip on the left edge: moving the mouse there brings the menu back.
        <div
          aria-hidden
          onMouseEnter={openPeek}
          onMouseLeave={closePeek}
          className="fixed top-0 left-0 z-40 h-dvh w-2 bg-sidebar/70 hover:bg-sidebar"
        />
      )}
      <aside
        onMouseEnter={autoHide ? openPeek : undefined}
        onMouseLeave={autoHide ? closePeek : undefined}
        className={cn(
          "top-0 flex h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
          autoHide
            ? "fixed left-0 z-50 shadow-2xl transition-transform duration-200 has-[:focus-visible]:translate-x-0 motion-reduce:transition-none " +
                (peek ? "translate-x-0" : "-translate-x-full")
            : "sticky",
        )}
      >
        <div className="flex h-14 items-center px-5">
          <Logo size={28} onDark textClassName="text-[15px]" />
        </div>
        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-3"
          aria-label="Menu principal"
        >
          {items.map((item) => {
            const active = item.id === current;
            return (
              <a
                key={item.id}
                href={item.href ?? "#"}
                onClick={(event) =>
                  followLink(event, () => onNavigate(item.id))
                }
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary"
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  />
                )}
                <item.icon
                  className={cn("size-4", active && "text-sidebar-primary")}
                />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <p
            className="text-[11px] text-sidebar-foreground/50 tabular-nums"
            title="Versão do sistema"
          >
            Chama Lia v{APP_VERSION}
          </p>
          <button
            type="button"
            onClick={() => {
              setAutoHide(!autoHide);
              setPeek(false);
            }}
            className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
            aria-label={
              autoHide
                ? "Fixar o menu na tela"
                : "Esconder o menu quando o mouse sair"
            }
            title={
              autoHide ? "Fixar o menu" : "Esconder o menu automaticamente"
            }
          >
            {autoHide ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-8 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="min-w-0 flex-1">{headerStart}</div>
          <div className="flex items-center gap-1">{headerEnd}</div>
        </header>
        <main id="conteudo" className="min-w-0 flex-1">
          <div
            className={cn(
              "mx-auto",
              wide ? "max-w-none px-5 py-5" : "max-w-6xl px-8 py-8",
            )}
          >
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
