import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type Customer,
  type CustomerDetail,
  type Slot,
  type Tenant,
} from "@/api";
import { CustomerForm } from "@/components/customer-form";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, todayIn } from "@/format";
import { keys, useProfessionals, useServices } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Books by hand: customer, service, professional, day and a free time. Already confirmed. */
export function NewAppointmentSheet({
  tenant,
  open,
  initialDate,
  preferred,
  onClose,
}: {
  tenant: Tenant;
  open: boolean;
  /** The day open in the agenda. */
  initialDate: string;
  /** Clicked on the grid: this professional at this time, once the service is chosen. */
  preferred?: { professionalId: string; time: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = todayIn(tenant.timezone);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(initialDate < today ? today : initialDate);
  const [time, setTime] = useState<string | null>(null);
  const deferred = useDeferredValue(search.trim());

  // Start clean every time the sheet opens, on the day the agenda is showing.
  useEffect(() => {
    if (!open) return;
    setCustomerId(null);
    setCreating(false);
    setSearch("");
    setServiceId("");
    setProfessionalId("");
    setTime(null);
    setDate(initialDate < today ? today : initialDate);
  }, [open, initialDate, today]);

  const services = useServices(tenant.id);
  const professionals = useProfessionals(tenant.id);
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const eligible = (professionals.data ?? []).filter(
    (p) =>
      p.active &&
      p.kind === "professional" &&
      serviceId !== "" &&
      p.serviceIds.includes(serviceId),
  );

  const customers = useQuery({
    queryKey: keys.customers(tenant.id, deferred),
    queryFn: () =>
      api<Customer[]>(
        `/tenants/${tenant.id}/customers${deferred ? `?search=${encodeURIComponent(deferred)}` : ""}`,
      ),
    enabled: open && !customerId && !creating,
    placeholderData: (previous) => previous,
  });
  const chosen = useQuery({
    queryKey: keys.customer(tenant.id, customerId ?? ""),
    queryFn: () =>
      api<CustomerDetail>(`/tenants/${tenant.id}/customers/${customerId}`),
    enabled: Boolean(customerId),
  });

  const ready = Boolean(serviceId && professionalId);
  const slots = useQuery({
    queryKey: [
      "availability",
      tenant.id,
      "new",
      serviceId,
      professionalId,
      date,
    ],
    queryFn: () =>
      api<Slot[]>(
        `/tenants/${tenant.id}/availability?serviceId=${serviceId}&date=${date}&professionalId=${professionalId}`,
      ),
    enabled: open && ready,
  });

  // The clicked time is picked as soon as it shows up among the free ones.
  useEffect(() => {
    if (
      !time &&
      preferred &&
      professionalId === preferred.professionalId &&
      slots.data?.some((slot) => slot.time === preferred.time)
    ) {
      setTime(preferred.time);
    }
  }, [slots.data, preferred, professionalId, time]);

  const book = useMutation({
    mutationFn: () =>
      api(`/tenants/${tenant.id}/appointments`, {
        method: "POST",
        body: { customerId, serviceId, professionalId, date, time },
      }),
    onSuccess: () => {
      toast.success(
        `Agendado para ${format(parseISO(date), "dd/MM")} às ${time}`,
      );
      void queryClient.invalidateQueries({
        queryKey: keys.allAppointments(tenant.id),
      });
      void queryClient.invalidateQueries({
        queryKey: ["customers", tenant.id],
      });
      onClose();
    },
    onError: (error) => {
      toast.error((error as Error).message);
      void slots.refetch();
    },
  });

  const pickService = (id: string) => {
    setServiceId(id);
    setTime(null);
    // One professional does it: no need to ask.
    const options = (professionals.data ?? []).filter(
      (p) => p.active && p.kind === "professional" && p.serviceIds.includes(id),
    );
    const wanted =
      preferred && options.find((p) => p.id === preferred.professionalId);
    setProfessionalId(
      wanted ? wanted.id : options.length === 1 ? options[0]!.id : "",
    );
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Novo agendamento"
      description={
        preferred
          ? `Escolha o serviço. O horário ${preferred.time} já fica marcado se estiver livre.`
          : "Marque um horário na mão. Ele já entra confirmado."
      }
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={!customerId || !time || book.isPending}
          onClick={() => book.mutate()}
        >
          {book.isPending
            ? "Agendando…"
            : time
              ? `Agendar ${time}`
              : "Escolha o horário"}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-medium">Cliente</div>
          {customerId ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {chosen.data?.name ?? "…"}
                </span>
                {chosen.data && (
                  <span className="text-xs text-muted-foreground">
                    {formatPhone(chosen.data.phone)}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomerId(null)}
              >
                Trocar
              </Button>
            </div>
          ) : creating ? (
            <div className="space-y-3 rounded-md border p-3">
              <CustomerForm
                tenant={tenant}
                onSaved={(id) => {
                  setCustomerId(id);
                  setCreating(false);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Voltar para a busca
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou telefone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                />
              </div>
              <ul className="divide-y overflow-hidden rounded-md border">
                {(customers.data ?? []).slice(0, deferred ? 5 : 3).map((c) => (
                  <li key={c.id}>
                    <button
                      className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => setCustomerId(c.id)}
                    >
                      <span className="font-medium">
                        {c.name ?? "Sem nome"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPhone(c.phone)}
                      </span>
                    </button>
                  </li>
                ))}
                {customers.data && customers.data.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    Ninguém encontrado com essa busca.
                  </li>
                )}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreating(true)}
              >
                Nova cliente
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Serviço</div>
          <Select value={serviceId} onValueChange={pickService}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha o serviço" />
            </SelectTrigger>
            <SelectContent>
              {activeServices.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Profissional</div>
          <Select
            value={professionalId}
            onValueChange={(value) => {
              setProfessionalId(value);
              setTime(null);
            }}
            disabled={!serviceId}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  serviceId
                    ? "Escolha a profissional"
                    : "Escolha o serviço primeiro"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {serviceId && eligible.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ninguém faz esse serviço. Marque quem faz em Profissionais.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Dia</div>
          <Calendar
            mode="single"
            locale={ptBR}
            selected={parseISO(date)}
            onSelect={(day) => {
              if (!day) return;
              setDate(format(day, "yyyy-MM-dd"));
              setTime(null);
            }}
            disabled={[
              { before: parseISO(today) },
              { after: addDays(parseISO(today), tenant.bookingHorizonDays) },
            ]}
            className="rounded-md border p-2"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Horário</div>
          {!ready ? (
            <p className="text-xs text-muted-foreground">
              Escolha o serviço e a profissional para ver os horários livres.
            </p>
          ) : slots.isLoading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : slots.data && slots.data.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {slots.data.map((slot) => (
                <button
                  key={slot.time}
                  onClick={() => setTime(slot.time)}
                  className={cn(
                    "h-10 rounded-md border text-sm font-medium tabular-nums transition-colors duration-150 active:scale-[0.97]",
                    time === slot.time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary/50 hover:bg-accent",
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {slots.error
                ? (slots.error as Error).message
                : "Nenhum horário livre neste dia. Escolha outro dia."}
            </p>
          )}
        </div>
      </div>
    </ResponsiveSheet>
  );
}
