import {
  AmericanExpressFlatRoundedIcon,
  EloFlatRoundedIcon,
  HipercardFlatRoundedIcon,
  MastercardFlatRoundedIcon,
  VisaFlatRoundedIcon,
} from "react-svg-credit-card-payment-icons";
import { cn } from "@/lib/utils";

/**
 * Accepted card brands (react-svg-credit-card-payment-icons, MIT) and the Pix symbol.
 * Brand marks belong to their owners and are shown only to say which methods are accepted.
 */
export function CardBrands({ className }: { className?: string }) {
  const icon = "h-5 w-auto rounded-[3px]";
  return (
    <span className={cn("flex items-center gap-1", className)} aria-label="Visa, Mastercard, Elo, Hipercard e American Express">
      <VisaFlatRoundedIcon className={icon} aria-hidden />
      <MastercardFlatRoundedIcon className={icon} aria-hidden />
      <EloFlatRoundedIcon className={icon} aria-hidden />
      <HipercardFlatRoundedIcon className={icon} aria-hidden />
      <AmericanExpressFlatRoundedIcon className={icon} aria-hidden />
    </span>
  );
}

/**
 * Pix symbol (Banco Central do Brasil, path from Simple Icons, CC0), in the brand's teal.
 * Manual de uso da marca: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/I_manual_uso_marca_pix.pdf
 */
export function PixMark({ className, withName = false }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" role="img" aria-label="Pix">
        <path
          fill="#32BCAD"
          d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"
        />
      </svg>
      {withName && <span className="text-sm font-semibold">pix</span>}
    </span>
  );
}
