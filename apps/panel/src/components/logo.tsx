import { cn } from "@/lib/utils";

/**
 * The Chama Lia mark: a dark square, a white "L" and a blue dot (the "call").
 * Colors come from the palette tokens, so changing --brand-* / --graphite-*
 * in index.css recolors it too. Same drawing as public/logo.svg.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={cn("shrink-0", className)} role="img" aria-label="Chama Lia">
      <rect width="512" height="512" rx="112" fill="var(--graphite-950)" />
      {/* Hairline so the mark still reads on a dark background. */}
      <rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
      <rect x="176" y="136" width="56" height="240" rx="8" fill="#ffffff" />
      <rect x="176" y="320" width="168" height="56" rx="8" fill="#ffffff" />
      <circle cx="340" cy="180" r="36" fill="var(--brand-500)" />
    </svg>
  );
}

/** "Chama Lia" with "Lia" in the brand color. `onDark`: the text sits on the black sidebar/panel. */
export function Wordmark({ onDark, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", onDark ? "text-white" : "text-foreground", className)}>
      Chama <span className={onDark ? "text-brand-400" : "text-primary"}>Lia</span>
    </span>
  );
}

export function Logo({ size = 28, onDark, className, textClassName }: { size?: number; onDark?: boolean; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <Wordmark onDark={onDark} className={textClassName} />
    </span>
  );
}
