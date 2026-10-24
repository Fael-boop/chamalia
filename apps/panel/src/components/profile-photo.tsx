import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { api, type Tenant } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_SIDE = 640;
const MAX_BYTES = 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não consegui ler a imagem."));
    reader.readAsDataURL(file);
  });
}

/** Phone photos are huge: crop to a centered square and shrink, like a WhatsApp profile photo. */
async function toSquareJpeg(file: File): Promise<string> {
  return toSquareImage(file, "image/jpeg", MAX_SIDE);
}

/** Centered square, at most `maxSide` pixels. PNG keeps a logo's transparent background. */
export async function toSquareImage(file: File, type: "image/jpeg" | "image/png", maxSide: number): Promise<string> {
  const source = await readAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir a imagem."));
    img.src = source;
  });
  const side = Math.min(image.width, image.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d")!;
  const sx = (image.width - Math.min(image.width, image.height)) / 2;
  const sy = (image.height - Math.min(image.width, image.height)) / 2;
  context.drawImage(image, sx, sy, Math.min(image.width, image.height), Math.min(image.width, image.height), 0, 0, side, side);
  return canvas.toDataURL(type, 0.88);
}

/** The photo that appears as the assistant's WhatsApp profile picture. */
export function ProfilePhoto({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["assistant-photo", tenant.id];
  const photo = useQuery({ queryKey: key, queryFn: () => api<{ dataUrl: string | null }>(`/tenants/${tenant.id}/assistant-photo`) });

  const save = useMutation({
    mutationFn: (dataUrl: string) =>
      api<{ whatsappUpdated: boolean }>(`/tenants/${tenant.id}/assistant-photo`, {
        method: "PUT",
        body: { mime: "image/jpeg", dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) },
      }),
    onSuccess: (result) => {
      toast.success(result.whatsappUpdated ? "Foto atualizada no painel e no WhatsApp" : "Foto salva. Conecte o WhatsApp para ela valer lá também.");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/tenants/${tenant.id}/assistant-photo`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Foto removida");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem (JPG, PNG ou WebP).");
    try {
      const dataUrl = await toSquareJpeg(file);
      const size = Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
      if (size > MAX_BYTES) return toast.error("A imagem continua grande demais. Tente outra.");
      save.mutate(dataUrl);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-4 border-t p-4">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
      {photo.isLoading ? (
        <Skeleton className="size-16 shrink-0 rounded-full" />
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="group relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted"
          aria-label="Trocar foto de perfil"
        >
          {photo.data?.dataUrl ? (
            <img src={photo.data.dataUrl} alt={`Foto de perfil de ${tenant.assistantName}`} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {tenant.assistantName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
            <Camera className="size-5" />
          </span>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Foto de perfil</div>
        <p className="text-xs text-muted-foreground">
          Aparece no painel e, se o WhatsApp estiver conectado, também lá. JPG, PNG ou WebP, até 1 MB.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={save.isPending}>
          {photo.data?.dataUrl ? "Trocar" : "Adicionar"}
        </Button>
        {photo.data?.dataUrl && (
          <ConfirmDelete title="Remover a foto de perfil?" description="A assistente fica sem foto até você enviar outra." onConfirm={() => remove.mutate()}>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={remove.isPending}>
              Remover
            </Button>
          </ConfirmDelete>
        )}
      </div>
    </div>
  );
}
