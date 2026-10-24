import { APP_VERSION } from "@/version";
import {
  ChevronDown,
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
  /** Module it belongs to (NavGroup id); without it the entry stands on its own at the top. */
  group?: string;
};

/** A module of the menu (e.g. "Cadastros"), which folds its sub-screens. */
export type NavGroup = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

/**
 * One module open at a time (accordion). Going to a screen opens its module and closes the others;
 * clicking a module's name opens it (closing the one that was open) or closes it.
 */
function useOpenGroup(
  currentGroup: string | null,
): [string | null, (id: string) => void] {
  const [open, setOpen] = useState<string | null>(currentGroup);
  useEffect(() => setOpen(currentGroup), [currentGroup]);
  return [open, (id) => setOpen((now) => (now === id ? null : id))];
}

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
  /** Modules of the side menu (items point to them through NavItem.group). */
  groups?: NavGroup[];
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
  groups = [],
  wide,
  children,
}: Props) {
  const [autoHide, setAutoHide] = useAutoHideNav();
  const currentGroup = items.find((item) => item.id === current)?.group ?? null;
  const [openGroup, toggleGroup] = useOpenGroup(currentGroup);
  // The folded rail shows what the open menu shows at the top level: loose screens and modules.
  // A module's icon leads to its first screen and is lit while one of its screens is open.
  const railEntries = items.flatMap((item, index) => {
    const group = item.group
      ? groups.find((g) => g.id === item.group)
      : undefined;
    if (!group)
      return [
        {
          id: item.id,
          label: item.label,
          icon: item.icon,
          href: item.href,
          target: item.id,
          active: item.id === current,
        },
      ];
    if (items.findIndex((other) => other.group === group.id) !== index)
      return [];
    return [
      {
        id: group.id,
        label: group.label,
        icon: group.icon,
        href: item.href,
        target: item.id,
        active: currentGroup === group.id,
      },
    ];
  });
  const navLink = (item: NavItem, sub = false) => {
    const active = item.id === current;
    return (
      <a
        key={item.id}
        href={item.href ?? "#"}
        onClick={(event) => followLink(event, () => onNavigate(item.id))}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none",
          sub
            ? "h-8 gap-2.5 !px-2.5 text-[13px] font-normal"
            : "h-9 font-medium",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
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
          className={cn(
            sub ? "size-[15px]" : "size-4",
            active && "text-sidebar-primary",
          )}
        />
        <span className="truncate">{item.label}</span>
      </a>
    );
  };
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
  // Changing between "fixed" and "folded" moves the menu, the rail and the page at once: no
  // animation for that switch (they would drift apart for a moment). Opening/closing on hover animates.
  const [animate, setAnimate] = useState(true);
  const switchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(switchTimer.current), []);
  const toggleAutoHide = () => {
    clearTimeout(closeTimer.current);
    clearTimeout(switchTimer.current);
    setAnimate(false);
    setPeek(false);
    setAutoHide(!autoHide);
    switchTimer.current = setTimeout(() => setAnimate(true), 300);
  };

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

  // The logo leads to the first screen of the menu (Início).
  const home = items[0];
  const homeLink = (content: ReactNode, label: string) =>
    home ? (
      <a
        href={home.href ?? "#"}
        onClick={(event) => followLink(event, () => onNavigate(home.id))}
        aria-label={label}
        className="rounded-md focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
      >
        {content}
      </a>
    ) : (
      content
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-4 text-foreground">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95"
              aria-label="Voltar para todos os negócios"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          {homeLink(<LogoMark size={30} />, "Ir para o início")}
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
        // Slim rail while the menu is folded: icons only; reaching it brings the full menu back.
        <nav
          aria-label="Menu recolhido"
          onMouseEnter={openPeek}
          onMouseLeave={closePeek}
          className="fixed top-0 left-0 z-40 flex h-dvh w-14 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3"
        >
          {homeLink(<LogoMark size={28} />, "Ir para o início")}
          <div className="mt-3 flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {/* Only the top level, like the open menu: the loose screens and one icon per module. */}
            {railEntries.map((entry) => (
              <a
                key={entry.id}
                href={entry.href ?? "#"}
                onClick={(event) =>
                  followLink(event, () => onNavigate(entry.target))
                }
                aria-label={entry.label}
                aria-current={entry.active ? "page" : undefined}
                title={entry.label}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none",
                  entry.active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <entry.icon className="size-[18px]" />
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleAutoHide}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
            aria-label="Fixar o menu na tela"
            title="Fixar o menu"
          >
            <PanelLeftOpen className="size-[18px]" />
          </button>
        </nav>
      )}
      <aside
        onMouseEnter={autoHide ? openPeek : undefined}
        onMouseLeave={autoHide ? closePeek : undefined}
        className={cn(
          "top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          autoHide
            ? "fixed left-0 z-50 shadow-2xl has-[:focus-visible]:translate-x-0 " +
                (animate
                  ? "transition-transform duration-200 motion-reduce:transition-none "
                  : "") +
                (peek ? "translate-x-0" : "-translate-x-full")
            : "sticky",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-5">
          {homeLink(
            <Logo size={28} textClassName="text-[15px]" />,
            "Chama Lia, ir para o início",
          )}
          <button
            type="button"
            onClick={toggleAutoHide}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
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
        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-3"
          aria-label="Menu principal"
        >
          {items.map((item, index) => {
            const group = item.group
              ? groups.find((g) => g.id === item.group)
              : undefined;
            if (!group) return navLink(item);
            // The module header is drawn once, before its first sub-screen.
            if (items.findIndex((other) => other.group === group.id) !== index)
              return null;
            const children = items.filter((other) => other.group === group.id);
            const holdsCurrent = children.some((child) => child.id === current);
            const open = openGroup === group.id;
            return (
              <div key={group.id} className="mt-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none",
                    holdsCurrent
                      ? "text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <group.icon
                    className={cn(
                      "size-4",
                      holdsCurrent && "text-sidebar-primary",
                    )}
                  />
                  <span className="flex-1 truncate">{group.label}</span>
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 opacity-60 transition-transform duration-150",
                      !open && "-rotate-90",
                    )}
                  />
                </button>
                {open && (
                  <div className="mt-0.5 ml-[1.1rem] flex flex-col gap-0.5 border-l border-sidebar-border pl-1.5">
                    {children.map((child) => navLink(child, true))}
                  </div>
                )}
              </div>
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
        </div>
      </aside>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          animate &&
            "transition-[padding-left] duration-200 motion-reduce:transition-none",
        )}
        // The menu opening pushes the page instead of covering it.
        style={{ paddingLeft: autoHide ? (peek ? 240 : 56) : 0 }}
      >
        <header
          className={cn(
            "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70",
            wide ? "px-5" : "px-8",
          )}
        >
          <div className="min-w-0 flex-1">{headerStart}</div>
          <div className="flex items-center gap-1">{headerEnd}</div>
        </header>
        <main id="conteudo" className="min-w-0 flex-1">
          <div
            className={cn(
              "mx-auto",
              wide ? "px-5 py-5" : "max-w-[1400px] px-8 py-8",
            )}
            style={wide ? { width: "max(85%, min(100%, 1200px))" } : undefined}
          >
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
