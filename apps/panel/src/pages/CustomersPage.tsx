import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { api, type Customer, type CustomerDetail, type Tenant } from "@/api";
import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/page-header";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatPhone, initials, zoned } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys } from "@/lib/queries";

export function CustomersPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  // A customer id, "new" for the add form, or null.
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [open, setOpen] = useState(false);

  const customers = useQuery({
    queryKey: keys.customers(tenant.id, deferred),
    queryFn: () => api<Customer[]>(`/tenants/${tenant.id}/customers${deferred ? `?search=${encodeURIComponent(deferred)}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const detail = useQuery({
    queryKey: keys.customer(tenant.id, selectedId ?? ""),
    queryFn: () => api<CustomerDetail>(`/tenants/${tenant.id}/customers/${selectedId}`),
    enabled: Boolean(selectedId) && selectedId !== "new",
  });

  const isNew = selectedId === "new";
  const newButton = (
    <Button onClick={() => openCustomer("new")} size={mobile ? "lg" : "default"} className={mobile ? "w-full" : undefined}>
      <Plus /> Nova cliente
    </Button>
  );

  const openCustomer = (id: string | "new") => {
    setSelectedId(id);
    setOpen(true);
  };
  const shortDate = (iso: string | null) => (iso ? (formatDateTime(iso, tenant.timezone).split(" às ")[0] ?? "—") : "—");

  return (
    <>
      {!mobile && (
        <PageHeader title="Clientes" description="Quem já agendou ou conversou com a atendente. Você também pode adicionar e editar." actions={newButton} />
      )}
      {mobile && <div className="mb-3">{newButton}</div>}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="bg-card pl-9"
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputMode="search"
        />
      </div>

      {customers.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : (customers.data ?? []).length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {deferred ? "Ninguém encontrado com essa busca." : "Nenhuma cliente ainda."}
        </p>
      ) : mobile ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {customers.data!.map((c) => (
            <li key={c.id}>
              <button onClick={() => openCustomer(c.id)} className="flex min-h-[60px] w-full items-center gap-3 px-3 py-2 text-left active:bg-muted">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name ?? "Sem nome"}</div>
                  <div className="truncate text-xs text-muted-foreground">{formatPhone(c.phone)}</div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  {c.nextAppointment ? (
                    <span className="text-primary">Próximo {shortDate(c.nextAppointment).slice(0, 5)}</span>
                  ) : (
                    `${c.visits} visita${c.visits === 1 ? "" : "s"}`
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Visitas</TableHead>
                <TableHead>Última visita</TableHead>
                <TableHead>Próximo horário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.data!.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => openCustomer(c.id)}>
                  <TableCell className="pl-4 font-medium">{c.name ?? "Sem nome"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatPhone(c.phone)}</TableCell>
                  <TableCell className="tabular-nums">{c.visits}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(c.lastVisit)}</TableCell>
                  <TableCell>
                    {c.nextAppointment ? (
                      <span className="text-primary">{formatDateTime(c.nextAppointment, tenant.timezone)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={isNew ? "Nova cliente" : (detail.data?.name ?? "Cliente")}
        description={isNew ? "Cadastre quem você já atende, para a atendente reconhecer pelo WhatsApp." : detail.data ? formatPhone(detail.data.phone) : undefined}
      >
        {isNew ? (
          <CustomerForm
            tenant={tenant}
            onSaved={() => setOpen(false)}
          />
        ) : detail.isLoading || !detail.data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <CustomerForm tenant={tenant} customer={detail.data} onSaved={() => undefined} />
            <a
              href={`https://wa.me/${detail.data.phone}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <MessageCircle className="size-4" /> Abrir conversa no WhatsApp
            </a>
            <div>
              <div className="mb-2 text-sm font-medium">Histórico</div>
              {detail.data.appointments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ainda sem agendamentos.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.data.appointments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{a.serviceName}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(a.startsAt, tenant.timezone)} · {a.professionalName}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Cliente desde {zoned(detail.data.createdAt, tenant.timezone).date.split("-").reverse().join("/")}.
            </p>
          </div>
        )}
      </ResponsiveSheet>
    </>
  );
}
