import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, CreditCard, ImageUp, KeyRound, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, replaceToken, type Me } from "@/api";
import { ConfirmDelete } from "@/components/confirm-delete";
import { toSquareImage } from "@/components/profile-photo";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 5 * 60_000 });
export const useBusinessLogo = (tenantId: string) =>
  useQuery({ queryKey: ["logo", tenantId], queryFn: () => api<{ dataUrl: string | null }>(`/tenants/${tenantId}/logo`), staleTime: 10 * 60_000 });

/** The business's logo, or its initials while there is none. */
export function BusinessAvatar({ name, logo, className }: { name: string; logo?: string | null; className?: string }) {
  return logo ? (
    <img src={logo} alt="" className={cn("shrink-0 rounded-md bg-white object-cover", className)} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-white", className)}>
      {initialsOf(name)}
    </span>
  );
}

type Sheet = "profile" | "password" | null;

/**
 * The business card at the top of the menu, as a button: shows who is logged in and opens the
 * profile (logo, own name and e-mail), password, billing and logout. The WhatsApp photo is not here:
 * it belongs to the assistant and lives in WhatsApp.
 */
export function AccountMenu({
  tenantId,
  tenantName,
  role,
  onBilling,
  onLogout,
}: {
  tenantId: string;
  tenantName: string;
  role: "admin" | "owner";
  onBilling: () => void;
  onLogout: () => void;
}) {
  const me = useMe();
  const logo = useBusinessLogo(tenantId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const who = me.data?.role === "owner" ? me.data.name : "Agência";
  const contact = me.data?.role === "owner" ? (me.data.email ?? me.data.login) : "acesso da agência";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mt-4 flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:outline-none"
            aria-label="Abrir o perfil"
          >
            <BusinessAvatar name={tenantName} logo={logo.data?.dataUrl} className="size-8" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] tracking-wide text-sidebar-foreground/70 uppercase">Negócio</span>
              <span className="line-clamp-2 block text-sm leading-snug font-semibold break-words text-white">{tenantName}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/60" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <BusinessAvatar name={tenantName} logo={logo.data?.dataUrl} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{who}</span>
              <span className="block truncate text-xs text-muted-foreground">{contact}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSheet("profile")}>
            <UserRound /> Perfil e logo
          </DropdownMenuItem>
          {role === "owner" && (
            <DropdownMenuItem onSelect={() => setSheet("password")}>
              <KeyRound /> Trocar senha
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onBilling}>
            <CreditCard /> Cobrança
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onLogout}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileSheet tenantId={tenantId} tenantName={tenantName} role={role} open={sheet} onOpenChange={(value) => setSheet(value)} />
    </>
  );
}

/** Phone: the same profile, as the first row of "Mais". */
export function AccountCard({ tenantId, tenantName, role }: { tenantId: string; tenantName: string; role: "admin" | "owner" }) {
  const me = useMe();
  const logo = useBusinessLogo(tenantId);
  const [sheet, setSheet] = useState<Sheet>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setSheet("profile")}
        className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left active:bg-muted"
      >
        <BusinessAvatar name={tenantName} logo={logo.data?.dataUrl} className="size-11" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{tenantName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {me.data?.role === "owner" ? `${me.data.name} · ${me.data.email ?? me.data.login}` : "Acesso da agência"}
          </span>
        </span>
        <span className="text-xs font-medium text-primary">Perfil</span>
      </button>
      <ProfileSheet tenantId={tenantId} tenantName={tenantName} role={role} open={sheet} onOpenChange={setSheet} />
    </>
  );
}

function ProfileSheet({
  tenantId,
  tenantName,
  role,
  open,
  onOpenChange,
}: {
  tenantId: string;
  tenantName: string;
  role: "admin" | "owner";
  open: Sheet;
  onOpenChange: (sheet: Sheet) => void;
}) {
  return (
    <ResponsiveSheet
      open={open !== null}
      onOpenChange={(value) => !value && onOpenChange(null)}
      title={open === "password" ? "Trocar senha" : "Perfil"}
      description={open === "password" ? "Depois da troca, os outros aparelhos conectados saem da conta." : tenantName}
    >
      {open === "password" ? (
        <PasswordForm onDone={() => onOpenChange(null)} />
      ) : (
        <div className="space-y-8">
          <LogoSection tenantId={tenantId} tenantName={tenantName} />
          {role === "owner" ? (
            <>
              <AccountSection />
              <Button variant="outline" onClick={() => onOpenChange("password")}>
                <KeyRound /> Trocar senha
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Você está como agência. Os dados de acesso de cada negócio ficam em Acesso do responsável.</p>
          )}
        </div>
      )}
    </ResponsiveSheet>
  );
}

function LogoSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const queryClient = useQueryClient();
  const logo = useBusinessLogo(tenantId);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["logo", tenantId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await toSquareImage(file, "image/png", 320);
      return api(`/tenants/${tenantId}/logo`, { method: "PUT", body: { mime: "image/png", dataBase64: dataUrl.split(",")[1] } });
    },
    onSuccess: () => {
      refresh();
      toast.success("Logo salva");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/tenants/${tenantId}/logo`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Logo removida");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="space-y-3" aria-labelledby="logo-titulo">
      <h3 id="logo-titulo" className="text-sm font-semibold">
        Logo do negócio
      </h3>
      <div className="flex items-center gap-4">
        <BusinessAvatar name={tenantName} logo={logo.data?.dataUrl} className="size-16 text-base" />
        <div className="flex flex-wrap gap-2">
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
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
            <ImageUp /> {logo.data?.dataUrl ? "Trocar logo" : "Enviar logo"}
          </Button>
          {logo.data?.dataUrl && (
            <ConfirmDelete title="Remover a logo?" description="Volta a aparecer as iniciais do negócio." onConfirm={() => remove.mutate()}>
              <Button size="sm" variant="ghost">
                Remover
              </Button>
            </ConfirmDelete>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Aparece no menu do painel. A foto que aparece no WhatsApp é outra, a da atendente, e fica na tela WhatsApp.
      </p>
    </section>
  );
}

function AccountSection() {
  const queryClient = useQueryClient();
  const me = useMe();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setEmail(me.data.email ?? "");
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: () => api<Me>("/me", { method: "PATCH", body: { name: name.trim(), email: email.trim() || null } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data);
      toast.success("Dados salvos");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const validEmail = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const dirty = me.data && (name.trim() !== me.data.name || (email.trim() || null) !== me.data.email);

  return (
    <section className="space-y-3" aria-labelledby="conta-titulo">
      <h3 id="conta-titulo" className="text-sm font-semibold">
        Seus dados
      </h3>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Nome</span>
        <Input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">E-mail</span>
        <Input type="email" value={email} autoComplete="email" placeholder="voce@email.com" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Usuário de acesso</span>
        <Input value={me.data?.login ?? ""} readOnly disabled />
        <span className="block text-xs text-muted-foreground">Para trocar o usuário, fale com a Chama Lia.</span>
      </label>
      <Button size="sm" disabled={!dirty || !name.trim() || !validEmail || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: () => api<{ token: string }>("/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } }),
    onSuccess: ({ token }) => {
      // This device stays logged in with the new token; the others have to log in again.
      replaceToken(token);
      toast.success("Senha trocada");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const mismatch = confirm !== "" && next !== confirm;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (next.length >= 8 && next === confirm) change.mutate();
      }}
    >
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Senha atual</span>
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Nova senha</span>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <span className="block text-xs text-muted-foreground">Pelo menos 8 caracteres.</span>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Repita a nova senha</span>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch || undefined} />
        {mismatch && <span className="block text-xs text-destructive">As senhas não são iguais.</span>}
      </label>
      <Button type="submit" disabled={!current || next.length < 8 || next !== confirm || change.isPending}>
        {change.isPending ? "Trocando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
