import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { toSquareImage } from "@/components/profile-photo";
import { cn } from "@/lib/utils";

/** { professionalId: dataUrl } for the professionals who have a photo. */
export const useProfessionalPhotos = (tenantId: string) =>
  useQuery({
    queryKey: ["professional-photos", tenantId],
    queryFn: () => api<Record<string, string>>(`/tenants/${tenantId}/professional-photos`),
    staleTime: 10 * 60_000,
  });

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** A person's photo in a circle, or their initials while there is none. */
export function PersonPhoto({ name, src, className, ringColor }: { name: string; src?: string | null; className?: string; ringColor?: string }) {
  const ring = ringColor ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${ringColor}` } : undefined;
  return src ? (
    <img src={src} alt="" style={ring} className={cn("shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span aria-hidden style={ring} className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground", className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Click the circle to choose a photo; shrinks it to a small square before sending. */
export function PhotoPicker({ tenantId, professional, src }: { tenantId: string; professional: { id: string; name: string }; src?: string | null }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["professional-photos", tenantId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await toSquareImage(file, "image/jpeg", 200);
      return api(`/tenants/${tenantId}/professionals/${professional.id}/photo`, {
        method: "PUT",
        body: { mime: "image/jpeg", dataBase64: dataUrl.split(",")[1] },
      });
    },
    onSuccess: () => {
      refresh();
      toast.success(`Foto de ${professional.name} salva`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/tenants/${tenantId}/professionals/${professional.id}/photo`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Foto removida");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="group relative">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={upload.isPending}
        className="relative block rounded-full focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={src ? `Trocar a foto de ${professional.name}` : `Enviar foto de ${professional.name}`}
        title={src ? "Trocar foto" : "Enviar foto"}
      >
        <PersonPhoto name={professional.name} src={src} className="size-11 text-sm" />
        <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground group-hover:text-foreground">
          <Camera className="size-3" aria-hidden />
        </span>
      </button>
      {src && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          className="mt-1 block w-full text-center text-[10px] text-muted-foreground hover:text-destructive"
        >
          Remover
        </button>
      )}
    </div>
  );
}
