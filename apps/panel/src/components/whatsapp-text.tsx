import { Fragment } from "react";

/**
 * Shows a message the way WhatsApp does: *text* in bold. Everything else stays
 * plain text (React escapes it), and line breaks come from whitespace-pre-wrap.
 */
export function WhatsAppText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
          <strong key={index} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
