import { useCallback, useEffect, useState } from "react";

/**
 * Addresses of the panel. Each screen has its own path, so it can be sent as a link, reloaded,
 * opened in another tab, and the browser/phone back button works. No router library: the
 * screens stay plain state; these helpers keep that state and the address bar in step.
 */

/** A business's screens. The owner sees them at the root; the agency under /negocio/<id>. */
export const BUSINESS_PATHS: Record<string, string> = {
  home: "/",
  agenda: "/agenda",
  customers: "/clientes",
  services: "/servicos",
  professionals: "/profissionais",
  hours: "/horarios",
  faq: "/respostas-prontas",
  prices: "/tabela-de-precos",
  handoff: "/passar-para-equipe",
  settings: "/configuracoes",
  billing: "/pagamento",
  train: "/treinar",
  "test-chat": "/testar",
  whatsapp: "/whatsapp",
  access: "/acesso",
  more: "/mais",
};

/** The agency's own screens (no business open). */
export const AGENCY_PATHS: Record<string, string> = {
  businesses: "/",
  plans: "/planos",
  niches: "/nichos",
  more: "/mais",
};

export const businessPrefix = (tenantId: string) => `/negocio/${tenantId}`;

/** Address of a screen (for real links in the menu: open in a new tab, middle click...). */
export function pathFor(paths: Record<string, string>, id: string, prefix = ""): string {
  const rel = paths[id] ?? "/";
  return prefix ? (rel === "/" ? prefix : prefix + rel) : rel;
}

/** Business open in the agency's address (/negocio/<id>/...), if any. */
export function tenantFromPath(): string | null {
  return /^\/negocio\/([0-9a-f-]{36})(\/|$)/i.exec(window.location.pathname)?.[1] ?? null;
}

/** Names people may type for an existing screen. */
const ALIASES: Record<string, string> = {
  "/inicio": "/",
  "/home": "/",
  "/pagamentos": "/pagamento",
  "/cobranca": "/pagamento",
  "/assinatura": "/pagamento",
  "/renovar": "/pagamento",
  "/servico": "/servicos",
  "/cliente": "/clientes",
  "/configuracao": "/configuracoes",
  "/ajustes": "/configuracoes",
  "/negocios": "/",
  "/plano": "/planos",
};
/** Legal pages live on the site. */
const SITE_PAGES: Record<string, string> = {
  "/termos": "https://chamalia.com.br/termos/",
  "/privacidade": "https://chamalia.com.br/privacidade/",
};

/**
 * Before the first screen: tidy what was typed (case, accents, trailing slash), send legal
 * pages to the site and resolve look-alike names. Unknown paths are fixed later by usePathPage,
 * once it is known whether the agency or a business is looking.
 */
export function normalizeAddress() {
  const clean =
    decodeURIComponent(window.location.pathname)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\/+$/, "") || "/";
  if (SITE_PAGES[clean]) return window.location.replace(SITE_PAGES[clean]);
  const target = ALIASES[clean] ?? clean;
  if (target !== window.location.pathname) window.history.replaceState(null, "", target + window.location.search);
}

/**
 * Current screen, read from and written to the address bar.
 * `prefix` = "/negocio/<id>" when the agency is inside a business. While `active` is false the
 * hook neither rewrites the address nor reacts to back/forward (another level owns it).
 * Unknown paths fall back to `fallback` and the address is corrected.
 */
export function usePathPage(paths: Record<string, string>, fallback: string, prefix = "", active = true) {
  const toPath = useCallback((id: string) => pathFor(paths, id, prefix), [paths, prefix]);
  const read = useCallback((): string | undefined => {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) return undefined;
    const rel = prefix ? path.slice(prefix.length) || "/" : path;
    return Object.keys(paths).find((id) => paths[id] === rel);
  }, [paths, prefix]);

  const [page, setPageState] = useState(() => read() ?? fallback);

  // An unknown or mistyped address becomes the address of the screen being shown.
  useEffect(() => {
    if (active && window.location.pathname !== toPath(page)) window.history.replaceState(null, "", toPath(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onBack = () => {
      const id = read();
      if (id) setPageState(id);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [active, read]);

  const setPage = useCallback(
    (id: string, replace = false) => {
      setPageState(id);
      const path = toPath(id);
      if (window.location.pathname !== path) window.history[replace ? "replaceState" : "pushState"](null, "", path);
    },
    [toPath],
  );

  return [page, setPage] as const;
}
