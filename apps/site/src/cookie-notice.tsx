import { Cookie } from "lucide-react";
import { useState } from "react";

const KEY = "chamalia.cookieChoice";

type Choice = "accepted" | "declined";

function stored(): Choice | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Optional cookies (measurement, ads) are allowed only after "Aceitar". Today the site sets none,
 * so both choices only change what is remembered; any future analytics script must check this first.
 */
export function optionalCookiesAllowed(): boolean {
  return stored() === "accepted";
}

/** Small corner notice (LGPD): essential storage only, optional cookies need a yes. */
export function CookieNotice() {
  const [choice, setChoice] = useState<Choice | null>(stored);
  if (choice) return null;

  const decide = (value: Choice) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Private mode: the notice just returns next visit.
    }
    setChoice(value);
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed bottom-3 left-3 z-50 w-[calc(100%-1.5rem)] max-w-[340px] rounded-xl border border-graphite-700 bg-surface p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <Cookie
          className="mt-0.5 size-5 shrink-0 text-accent-text"
          aria-hidden
        />
        <p className="text-[13px] leading-relaxed text-muted">
          Usamos só o necessário para o site funcionar. Cookies de medição ou
          anúncios, se um dia existirem, só com o seu aceite.{" "}
          <a
            href="/privacidade/"
            className="text-accent-text underline underline-offset-2 hover:text-ink"
          >
            Privacidade
          </a>
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide("accepted")}
          className="press h-9 flex-1 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
        >
          Aceitar
        </button>
        <button
          type="button"
          onClick={() => decide("declined")}
          className="press h-9 flex-1 rounded-lg bg-surface-2 px-3 text-[13px] font-medium text-ink hover:bg-graphite-700"
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
