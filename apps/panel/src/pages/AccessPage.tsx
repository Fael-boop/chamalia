import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, type Tenant, type TenantUser } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";

/** Readable random password, no look-alike characters (0/O, 1/l). */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join("");
}

const suggestLogin = (tenant: Tenant) =>
  ((tenant.ownerName || tenant.slug).split(" ")[0] ?? tenant.slug)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  login: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "3 a 40 letras minúsculas, números, ponto ou hífen"),
  password: z.string().min(8, "Pelo menos 8 caracteres"),
});

export function AccessPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);
  const users = useQuery({ queryKey: ["users", tenant.id], queryFn: () => api<TenantUser[]>(`/tenants/${tenant.id}/users`) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users", tenant.id] });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: tenant.ownerName ?? "", login: suggestLogin(tenant), password: generatePassword() },
  });

  const create = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => api(`/tenants/${tenant.id}/users`, { method: "POST", body: v }),
    onSuccess: (_d, v) => {
      setCreated({ login: v.login, password: v.password });
      form.setValue("password", generatePassword());
      toast.success("Acesso criado");
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: refresh,
  });
  const patch = useMutation({
    mutationFn: ({ user, body }: { user: TenantUser; body: { password?: string; active?: boolean } }) =>
      api(`/tenants/${tenant.id}/users/${user.id}`, { method: "PATCH", body }),
    onSuccess: (_d, { user, body }) => {
      if (body.password) setCreated({ login: user.login, password: body.password });
      toast.success(body.password ? "Senha nova gerada" : body.active ? "Acesso liberado" : "Acesso bloqueado");
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: refresh,
  });

  const message = created ? `Endereço: ${window.location.origin}\nUsuário: ${created.login}\nSenha: ${created.password}` : "";

  return (
    <>
      {!mobile && <PageHeader title="Acesso do responsável" description="Usuário e senha para o responsável entrar no painel do negócio." />}

      {created && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-accent p-4">
          <div className="mb-2 text-sm font-medium">Envie para o responsável. A senha não aparece de novo.</div>
          <pre className="rounded-md border bg-card p-3 text-sm whitespace-pre-wrap">{message}</pre>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigator.clipboard.writeText(message).then(() => toast.success("Copiado"))}>
              <Copy /> Copiar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-lg border bg-card">
        {users.isLoading ? (
          <Skeleton className="m-4 h-12" />
        ) : (users.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum acesso criado ainda.</p>
        ) : (
          <ul className="divide-y">
            {users.data!.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {user.name} <span className="font-normal text-muted-foreground">· {user.login}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {user.lastLoginAt ? `Último acesso ${formatDateTime(user.lastLoginAt, tenant.timezone)}` : "Ainda não entrou"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Gerar senha nova para ${user.name}? A atual para de funcionar na hora.`)) {
                      patch.mutate({ user, body: { password: generatePassword() } });
                    }
                  }}
                >
                  <KeyRound /> Nova senha
                </Button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {user.active ? "Liberado" : "Bloqueado"}
                  <Switch checked={user.active} onCheckedChange={(active) => patch.mutate({ user, body: { active } })} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">Novo acesso</div>
        <Form {...form}>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
            {(["name", "login", "password"] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{{ name: "Nome", login: "Usuário", password: "Senha" }[name]}</FormLabel>
                    <FormControl>
                      <Input autoCapitalize="none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <Button type="submit" disabled={create.isPending}>
              Criar acesso
            </Button>
          </form>
        </Form>
      </div>
      <div className="mt-3">
        <Hint>
          O responsável entra no mesmo endereço e vê só o {tenant.name}: agenda, clientes, serviços e configurações. Não vê
          outros negócios, o WhatsApp nem esta tela.
        </Hint>
      </div>
    </>
  );
}
