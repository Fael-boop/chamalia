import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type PriceTable, type Tenant } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1800;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** What is shown and sent: a new file picked now, or the one already saved. */
type FileState = { name: string; mime: string; dataUrl: string | null; size: number; dataBase64?: string } | null;

const toBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Phone photos are huge: scale down to a readable size and save as JPEG. */
async function shrinkImage(file: File): Promise<{ dataUrl: string; mime: string; name: string }> {
  const source = await readAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir a imagem."));
    img.src = source;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return { dataUrl: source, mime: file.type, name: file.name };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), mime: "image/jpeg", name: file.name.replace(/\.\w+$/, "") + ".jpg" };
}

export function PriceTablePage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["price-table", tenant.id];
  const saved = useQuery({ queryKey: key, queryFn: () => api<PriceTable>(`/tenants/${tenant.id}/price-table`) });

  const [body, setBody] = useState("");
  // undefined: keep what is saved; null: removed; object: new or current file.
  const [file, setFile] = useState<FileState | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved.data && !dirty) setBody(saved.data.body ?? "");
  }, [saved.data, dirty]);

  const current: FileState =
    file !== undefined
      ? file
      : saved.data?.file
        ? { name: saved.data.file.name ?? "arquivo", mime: saved.data.file.mime ?? "", dataUrl: saved.data.file.dataUrl, size: saved.data.file.size }
        : null;

  const save = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant.id}/price-table`, {
        method: "PUT",
        body: {
          body: body.trim() || null,
          ...(file === undefined
            ? {}
            : { file: file ? { name: file.name, mime: file.mime, dataBase64: file.dataBase64 } : null }),
        },
      }),
    onSuccess: () => {
      toast.success("Tabela de preços salva");
      setDirty(false);
      setFile(undefined);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function pick(picked: File | undefined) {
    if (!picked) return;
    try {
      if (picked.type === "application/pdf") {
        if (picked.size > MAX_BYTES) return toast.error("O PDF passa de 5 MB. Envie uma imagem ou um PDF menor.");
        const dataUrl = await readAsDataUrl(picked);
        setFile({ name: picked.name, mime: picked.type, dataUrl: null, size: picked.size, dataBase64: toBase64(dataUrl) });
      } else if (picked.type.startsWith("image/")) {
        const shrunk = await shrinkImage(picked);
        const dataBase64 = toBase64(shrunk.dataUrl);
        const size = Math.round((dataBase64.length * 3) / 4);
        if (size > MAX_BYTES) return toast.error("A imagem continua grande demais. Tente outra.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(shrunk.mime)) return toast.error("Use JPG, PNG ou WebP.");
        setFile({ name: shrunk.name, mime: shrunk.mime, dataUrl: shrunk.dataUrl, size, dataBase64 });
      } else {
        return toast.error("Envie uma imagem (JPG, PNG, WebP) ou um PDF.");
      }
      setDirty(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const changed = dirty || file !== undefined;
  const empty = !body.trim() && !current;

  return (
    <>
      {!mobile && (
        <PageHeader
          title="Tabela de preços"
          description={`Quando a cliente pedir a tabela, a ${tenant.assistantName} envia por aqui: o texto, a imagem ou o PDF, o que você cadastrar.`}
        />
      )}

      {saved.isLoading ? (
        <Skeleton className="h-72 rounded-lg" />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Tabela escrita</h2>
            <Textarea
              rows={8}
              maxLength={4000}
              placeholder={"Corte feminino: R$ 90\nEscova: R$ 60\nHidratação: R$ 80\nProgressiva: a partir de R$ 300"}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDirty(true);
              }}
            />
            <Hint>A {tenant.assistantName} manda este texto como mensagem. Escreva do jeito que quer que a cliente veja.</Hint>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Imagem ou PDF</h2>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            {current ? (
              <div className="overflow-hidden rounded-lg border bg-card">
                {current.dataUrl ? (
                  <img src={current.dataUrl} alt="Tabela de preços" className="max-h-96 w-full bg-white object-contain" />
                ) : (
                  <div className="flex items-center gap-3 px-4 py-6 text-sm">
                    <FileText className="size-6 text-muted-foreground" />
                    <span className="truncate">{current.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {current.name} · {Math.max(1, Math.round(current.size / 1024))} KB
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
                      Trocar
                    </Button>
                    <ConfirmDelete
                      title="Remover o arquivo?"
                      description="A cliente deixa de receber a imagem ou o PDF. O texto continua, se houver."
                      confirmLabel="Remover"
                      onConfirm={() => {
                        setFile(null);
                        setDirty(true);
                      }}
                    >
                      <Button variant="ghost" size="icon" aria-label="Remover arquivo" className="text-muted-foreground hover:text-destructive">
                        <X />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <ImagePlus className="size-6" />
                Escolher imagem ou PDF
              </button>
            )}
            <Hint>JPG, PNG, WebP ou PDF, até 5 MB. Fotos do celular são reduzidas sozinhas.</Hint>
          </section>

          <div className="flex items-center gap-3">
            <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
          {empty && <Hint>Sem tabela cadastrada, a {tenant.assistantName} responde com os preços da lista de Serviços.</Hint>}
        </div>
      )}
    </>
  );
}
