import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import jsQR from "jsqr";
import { ImageUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PixInfo = { configured: boolean; key: string | null; name: string | null; city: string | null };

/** Reads the QR code in a photo or screenshot, in the browser. null = no QR found. */
async function readQrFromImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // Big photos are slow to scan and do not read better.
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Where the subscriptions are paid: the agency sends the QR code (photo or screenshot) or the
 * "Pix copia e cola" of its bank app; the payment page then creates a Pix with the exact amount.
 */
export function PixSettings() {
  const queryClient = useQueryClient();
  const pix = useQuery({ queryKey: ["billing-pix"], queryFn: () => api<PixInfo>("/billing/pix") });
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (value: string) => api<PixInfo>("/billing/pix", { method: "PUT", body: { code: value } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["billing-pix"], data);
      toast.success("Pix configurado. A página de pagamento já usa este recebimento.");
      setEditing(false);
      setCode("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const found = await readQrFromImage(file);
      if (found) save.mutate(found);
      else toast.error("Não achei um QR code nessa imagem. Tente um print mais nítido, só com o QR.");
    } catch {
      toast.error("Não consegui abrir essa imagem.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (pix.isLoading) return null;
  const info = pix.data;
  const showForm = editing || !info?.configured;
  const busy = reading || save.isPending;

  return (
    <section className="mt-4 rounded-lg border bg-card p-4" aria-labelledby="pix-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pix-titulo" className="text-sm font-semibold">
            Recebimento por Pix
          </h2>
          {info?.configured ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chave {info.key}
              {info.name && ` · ${info.name}`}
              {info.city && ` · ${info.city}`}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ainda não configurado: na página de pagamento, o cliente é mandado para o WhatsApp.
            </p>
          )}
        </div>
        {info?.configured && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Trocar
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Foto ou print do QR code</p>
            <p className="text-xs text-muted-foreground">No app do banco, abra Pix → Receber, sem valor, e tire um print do QR.</p>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <ImageUp />} Enviar imagem do QR code
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Ou cole o Pix copia e cola</p>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              placeholder="00020126…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || code.trim().length < 10} onClick={() => save.mutate(code)}>
                Salvar
              </Button>
              {info?.configured && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
