import { useState } from "react";
import { Button } from "./ui";

const KEY = "chamalia.cookieNotice";

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Transparency notice (LGPD). The site sets no advertising or tracking cookies; the only thing
 * stored is this choice, in the browser, so the notice does not come back every visit.
 * If analytics or ads are ever added, this must become a real opt-in with a "recusar" button.
 */
export function CookieNotice() {
  const [hidden, setHidden] = useState(seen);
  if (hidden) return null;

  const accept = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private mode: the notice just returns next visit.
    }
    setHidden(true);
  };

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-graphite-700 bg-surface p-5 shadow-2xl sm:flex-row sm:items-center sm:gap-6">
        <p className="text-[14px] leading-relaxed text-muted">
          Este site não usa cookies de publicidade nem rastreamento. Guardamos no seu navegador só o necessário para funcionar, como lembrar que
          você viu este aviso. Saiba mais na{" "}
          <a href="/privacidade/" className="text-accent-text underline underline-offset-2 hover:text-ink">
            Política de privacidade
          </a>
          .
        </p>
        <Button onClick={accept} className="h-11 shrink-0 px-6 text-[14px]">
          Ok, entendi
        </Button>
      </div>
    </div>
  );
}
