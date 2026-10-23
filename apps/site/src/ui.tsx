import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Where "Entrar" goes: the panel. Override with VITE_APP_URL (e.g. http://localhost:5173 in dev). */
export const APP_URL = import.meta.env.VITE_APP_URL ?? "https://app.chamalia.com.br";
export const WHATSAPP_NUMBER = "556294737276";
export const WHATSAPP_LABEL = "(62) 9473-7276";
export const whatsappUrl = (text = "Oi! Quero saber mais sobre a Chama Lia.") =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export function LogoMark({ size = 32, ring = true }: { size?: number; ring?: boolean }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className="shrink-0" role="img" aria-label="Chama Lia">
      <rect width="512" height="512" rx="112" fill="var(--graphite-950)" />
      {ring && <rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />}
      <rect x="176" y="136" width="56" height="240" rx="8" fill="#ffffff" />
      <rect x="176" y="320" width="168" height="56" rx="8" fill="#ffffff" />
      <circle cx="340" cy="180" r="36" fill="var(--brand-500)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight whitespace-nowrap ${className}`}>
      Chama <span className="text-accent">Lia</span>
    </span>
  );
}

/** One button shape for the whole page. */
export function Button({
  href,
  variant = "primary",
  children,
  className = "",
  onClick,
}: {
  href?: string;
  variant?: "primary" | "quiet" | "light";
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    quiet: "bg-surface-2 text-ink hover:bg-graphite-200",
    light: "bg-white text-ink hover:bg-graphite-100",
  }[variant];
  const cls = `press inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-medium whitespace-nowrap ${styles} ${className}`;
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** Fades and lifts its children in once they scroll into view; `delay` staggers the parts of a section. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "p" | "h2" | "h3" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const style = { "--d": `${delay}ms` } as CSSProperties;
  const Element = Tag as "div";
  return (
    <Element ref={ref as never} className={`reveal ${shown ? "in" : ""} ${className}`} style={style}>
      {children}
    </Element>
  );
}
