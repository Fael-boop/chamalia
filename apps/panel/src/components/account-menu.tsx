import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ChevronDown,
  CreditCard,
  ImageUp,
  KeyRound,
  LogOut,
  UserRound,
  Users,
} from "lucide-react";
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
import { formatPhone } from "@/format";
import { APP_VERSION } from "@/version";
import { cn } from "@/lib/utils";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/me"),
    staleTime: 5 * 60_000,
  });
/** The logged-in person's own photo (owners only; the agency has none). */
export const useMyPhoto = (enabled: boolean) =>
  useQuery({
    queryKey: ["me", "photo"],
    queryFn: () => api<{ dataUrl: string | null }>("/me/photo"),
    staleTime: 10 * 60_000,
    enabled,
  });
export const useBusinessLogo = (tenantId: string) =>
  useQuery({
    queryKey: ["logo", tenantId],
    queryFn: () => api<{ dataUrl: string | null }>(`/tenants/${tenantId}/logo`),
    staleTime: 10 * 60_000,
  });

/** The business's logo, or its initials while there is none. */
export function BusinessAvatar({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  return logo ? (
    <img
      src={logo}
      alt=""
      className={cn("shrink-0 rounded-md bg-white object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

type Sheet = "profile" | "password" | null;

/** The person's initials in a circle (the business has its logo; people have this). */
function PersonAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src)
    return (
      <img
        src={src}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
        className,
      )}
    >
      {initialsOf(name) || "?"}
    </span>
  );
}

/**
 * Top bar, right: who is logged in, opening profile (logo, own name and e-mail), password,
 * billing and logout. Without a business (agency list) only logout. The WhatsApp photo is not
 * here: it belongs to the assistant and lives in WhatsApp.
 */
export function ProfileMenu({
  business,
  role,
  compact = false,
  onBilling,
  onAccess,
  onProfile,
  onLogout,
}: {
  business?: { id: string; name: string };
  role: "admin" | "owner";
  /** Phone: the avatar only. */
  compact?: boolean;
  onBilling?: () => void;
  /** Opens Configurações > Meu perfil (without it, the profile opens in a side sheet). */
  onProfile?: () => void;
  /** Agency inside a business: shortcut to "Acesso do responsável" (create/reset the login). */
  onAccess?: () => void;
  onLogout: () => void;
}) {
  const me = useMe();
  const [sheet, setSheet] = useState<Sheet>(null);
  const who = me.data?.role === "owner" ? me.data.name : "Agência";
  const photo = useMyPhoto(me.data?.role === "owner");
  const contact =
    me.data?.role === "owner"
      ? (me.data.email ?? me.data.login)
      : "Acesso da agência";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2.5 rounded-full text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              compact ? "p-1" : "py-1 pr-2 pl-1 hover:bg-accent",
            )}
            aria-label={`Perfil de ${who}`}
          >
            <PersonAvatar
              name={who}
              src={photo.data?.dataUrl}
              className="size-8"
            />
            {!compact && (
              <>
                <span className="hidden min-w-0 lg:block">
                  <span className="block max-w-40 truncate text-sm leading-tight font-medium">
                    {who}
                  </span>
                  <span className="block max-w-40 truncate text-xs leading-tight text-muted-foreground">
                    {role === "owner" ? "Responsável" : "Equipe Chama Lia"}
                  </span>
                </span>
                <ChevronDown
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <PersonAvatar
              name={who}
              src={photo.data?.dataUrl}
              className="size-9"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {who}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {contact}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {business && (
            <>
              <DropdownMenuItem
                onSelect={() => (onProfile ? onProfile() : setSheet("profile"))}
              >
                <UserRound /> Meu perfil
              </DropdownMenuItem>
              {role === "owner" && (
                <DropdownMenuItem onSelect={() => setSheet("password")}>
                  <KeyRound /> Trocar senha
                </DropdownMenuItem>
              )}
              {onBilling && (
                <DropdownMenuItem onSelect={onBilling}>
                  <CreditCard /> Cobrança
                </DropdownMenuItem>
              )}
              {role === "admin" && onAccess && (
                <DropdownMenuItem onSelect={onAccess}>
                  <Users /> Acesso do responsável
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onSelect={onLogout}>
            <LogOut /> Sair
          </DropdownMenuItem>
          {/* Always visible here, also with the side menu folded: tells which version this tab runs. */}
          <p className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground tabular-nums">
            Chama Lia v{APP_VERSION}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {business && (
        <ProfileSheet
          tenantId={business.id}
          tenantName={business.name}
          role={role}
          open={sheet}
          onOpenChange={setSheet}
        />
      )}
    </>
  );
}

/** Top bar, left: the business being managed, with its logo. The agency also gets "Todos os negócios". */
export function BusinessBadge({
  id,
  name,
  onBack,
}: {
  id: string;
  name: string;
  onBack?: () => void;
}) {
  const logo = useBusinessLogo(id);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {onBack && (
        <>
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Todos os negócios
          </button>
          <span className="text-muted-foreground/60" aria-hidden>
            /
          </span>
        </>
      )}
      <BusinessAvatar
        name={name}
        logo={logo.data?.dataUrl}
        className="size-7"
      />
      <span className="truncate text-sm font-semibold">{name}</span>
    </div>
  );
}

/** Phone: the same profile, as the first row of "Mais". */
export function AccountCard({
  tenantId,
  tenantName,
  role,
}: {
  tenantId: string;
  tenantName: string;
  role: "admin" | "owner";
}) {
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
        <BusinessAvatar
          name={tenantName}
          logo={logo.data?.dataUrl}
          className="size-11"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {tenantName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {me.data?.role === "owner"
              ? `${me.data.name} · ${me.data.email ?? me.data.login}`
              : "Acesso da agência"}
          </span>
        </span>
        <span className="text-xs font-medium text-primary">Perfil</span>
      </button>
      <ProfileSheet
        tenantId={tenantId}
        tenantName={tenantName}
        role={role}
        open={sheet}
        onOpenChange={setSheet}
      />
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
      description={
        open === "password"
          ? "Depois da troca, os outros aparelhos conectados saem da conta."
          : tenantName
      }
    >
      {open === "password" ? (
        <PasswordForm onDone={() => onOpenChange(null)} />
      ) : (
        <div className="space-y-8">
          {/* The person first, then the business. */}
          {role === "owner" ? (
            <>
              <AccountSection />
              <Button
                variant="outline"
                onClick={() => onOpenChange("password")}
              >
                <KeyRound /> Trocar senha
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Você está como agência. Os dados de acesso de cada negócio ficam
              em Acesso do responsável.
            </p>
          )}
        </div>
      )}
    </ResponsiveSheet>
  );
}

export function LogoSection({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const queryClient = useQueryClient();
  const logo = useBusinessLogo(tenantId);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["logo", tenantId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await toSquareImage(file, "image/png", 320);
      return api(`/tenants/${tenantId}/logo`, {
        method: "PUT",
        body: { mime: "image/png", dataBase64: dataUrl.split(",")[1] },
      });
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
        <BusinessAvatar
          name={tenantName}
          logo={logo.data?.dataUrl}
          className="size-16 text-base"
        />
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
          <Button
            size="sm"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <ImageUp /> {logo.data?.dataUrl ? "Trocar logo" : "Enviar logo"}
          </Button>
          {logo.data?.dataUrl && (
            <ConfirmDelete
              title="Remover a logo?"
              description="Volta a aparecer as iniciais do negócio."
              onConfirm={() => remove.mutate()}
            >
              <Button size="sm" variant="ghost">
                Remover
              </Button>
            </ConfirmDelete>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Aparece no menu do painel. A foto que aparece no WhatsApp é outra, a da
        atendente, e fica na tela WhatsApp.
      </p>
    </section>
  );
}

function AccountSection() {
  const queryClient = useQueryClient();
  const me = useMe();
  const photo = useMyPhoto(true);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setNickname(me.data.nickname ?? "");
      setEmail(me.data.email ?? "");
      setPhone(me.data.phone ? formatPhone(me.data.phone) : "");
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: () =>
      api<Me>("/me", {
        method: "PATCH",
        body: {
          name: name.trim(),
          nickname: nickname.trim() || null,
          email: email.trim() || null,
          phone: phone.replace(/\D/g, "") || null,
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data);
      toast.success("Dados salvos");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const setPhoto = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api("/me/photo", { method: "DELETE" });
      const dataUrl = await toSquareImage(file, "image/jpeg", 240);
      return api("/me/photo", {
        method: "PUT",
        body: { mime: "image/jpeg", dataBase64: dataUrl.split(",")[1] },
      });
    },
    onSuccess: (_d, file) => {
      void queryClient.invalidateQueries({ queryKey: ["me", "photo"] });
      toast.success(file ? "Foto salva" : "Foto removida");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const digits = phone.replace(/\D/g, "");
  const validEmail =
    email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const validPhone =
    digits === "" || (digits.length >= 10 && digits.length <= 13);
  const dirty =
    me.data &&
    (name.trim() !== me.data.name ||
      (nickname.trim() || null) !== me.data.nickname ||
      (email.trim() || null) !== me.data.email ||
      phone.trim() !== (me.data.phone ? formatPhone(me.data.phone) : ""));

  return (
    <section className="space-y-4" aria-labelledby="conta-titulo">
      <h3 id="conta-titulo" className="text-sm font-semibold">
        Seus dados
      </h3>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={setPhoto.isPending}
          className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={
            photo.data?.dataUrl ? "Trocar sua foto" : "Adicionar sua foto"
          }
        >
          <PersonAvatar
            name={name || "?"}
            src={photo.data?.dataUrl}
            className="size-16 text-base"
          />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground group-hover:text-foreground">
            <Camera className="size-3.5" aria-hidden />
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhoto.mutate(file);
            e.target.value = "";
          }}
        />
        <div className="space-y-1">
          <Button
            size="sm"
            variant="outline"
            disabled={setPhoto.isPending}
            onClick={() => input.current?.click()}
          >
            <ImageUp /> {photo.data?.dataUrl ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {photo.data?.dataUrl && (
            <button
              type="button"
              className="block text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setPhoto.mutate(null)}
            >
              Remover foto
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Nome completo</span>
          <Input
            value={name}
            maxLength={80}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Como quer ser chamado</span>
          <Input
            value={nickname}
            maxLength={40}
            autoComplete="nickname"
            placeholder={name.trim().split(/\s+/)[0] || "Ex.: Rafa"}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Aparece na saudação do Início. Em branco, usamos o primeiro nome.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">E-mail</span>
          <Input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="voce@email.com"
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!validEmail}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">WhatsApp</span>
          <Input
            inputMode="tel"
            value={phone}
            autoComplete="tel"
            placeholder="(62) 99999-0000"
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!validPhone}
          />
        </label>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Usamos o e-mail para os recibos e o WhatsApp para falar com você sobre a
        conta, se precisar.
      </p>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Usuário de acesso</span>
        <Input value={me.data?.login ?? ""} readOnly disabled />
        <span className="block text-xs text-muted-foreground">
          Para trocar o usuário, fale com a Chama Lia.
        </span>
      </label>
      {(!validEmail || !validPhone) && (
        <p className="text-sm text-destructive">
          {!validEmail
            ? "Confira o e-mail."
            : "Telefone com DDD. Ex.: (62) 99999-0000"}
        </p>
      )}
      <Button
        size="sm"
        disabled={
          !dirty || !name.trim() || !validEmail || !validPhone || save.isPending
        }
        onClick={() => save.mutate()}
      >
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
    mutationFn: () =>
      api<{ token: string }>("/me/password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      }),
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
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Nova senha</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <span className="block text-xs text-muted-foreground">
          Pelo menos 8 caracteres.
        </span>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Repita a nova senha</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || undefined}
        />
        {mismatch && (
          <span className="block text-xs text-destructive">
            As senhas não são iguais.
          </span>
        )}
      </label>
      <Button
        type="submit"
        disabled={
          !current || next.length < 8 || next !== confirm || change.isPending
        }
      >
        {change.isPending ? "Trocando…" : "Trocar senha"}
      </Button>
    </form>
  );
}

/** Configurações > Meu perfil: only the person (photo, name, contacts, login, password). The business is in Negócio. */
export function ProfileSettings({ role }: { role: "admin" | "owner" }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className="space-y-6 rounded-lg border bg-card p-4 md:p-6">
      {role === "owner" ? (
        <>
          <AccountSection />
          <section
            className="space-y-3 border-t pt-6"
            aria-labelledby="senha-titulo"
          >
            <h3 id="senha-titulo" className="text-sm font-semibold">
              Senha
            </h3>
            {changing ? (
              <PasswordForm onDone={() => setChanging(false)} />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChanging(true)}
              >
                <KeyRound /> Trocar senha
              </Button>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Você está como agência. O perfil é de cada responsável: ele edita aqui
          quando entra com o próprio login. Os logins ficam em Acesso do
          responsável.
        </p>
      )}
    </div>
  );
}
