import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api, type Niche, type Tenant } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { setAgendaAlerts, useAgendaAlertsEnabled } from "@/lib/agenda-alerts";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { LogoSection } from "@/components/account-menu";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome"),
  businessType: z.string(),
  ownerName: z.string().trim(),
  ownerPhone: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d{10,15}$/.test(v.replace(/\D/g, "")),
      "DDI + DDD + número, ex.: 5511999999999",
    ),
  address: z.string().trim(),
  addressNeighborhood: z.string().trim(),
  addressCity: z.string().trim(),
  locationUrl: z.string().trim(),
  assistantName: z.string().trim().min(1, "Informe o nome").max(40),
  tone: z.enum(["friendly", "formal"]),
  useEmoji: z.boolean(),
  extraInfo: z.string().trim().max(2000),
  minNoticeHours: z.number({ message: "Informe as horas" }).min(0).max(168),
  bookingHorizonDays: z
    .number({ message: "Informe os dias" })
    .int()
    .min(1)
    .max(365),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toValues = (t: Tenant): Values => ({
  name: t.name,
  businessType: t.businessType,
  ownerName: t.ownerName ?? "",
  ownerPhone: t.ownerPhone ?? "",
  address: t.address ?? "",
  addressNeighborhood: t.addressNeighborhood ?? "",
  addressCity: t.addressCity ?? "",
  locationUrl: t.locationUrl ?? "",
  assistantName: t.assistantName,
  tone: t.tone,
  useEmoji: t.useEmoji,
  extraInfo: t.extraInfo ?? "",
  minNoticeHours: t.minNoticeMinutes / 60,
  bookingHorizonDays: t.bookingHorizonDays,
  active: t.active,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b py-6 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SettingsPage({
  tenant,
  role,
  assistant = true,
  tab = "business",
  onTab,
  billing,
  profile,
}: {
  tenant: Tenant;
  role: "admin" | "owner";
  assistant?: boolean;
  /** "Cobrança" tab: the business's subscription and payments. */
  tab?: "business" | "billing" | "profile";
  onTab?: (tab: "business" | "billing" | "profile") => void;
  billing?: ReactNode;
  /** "Meu perfil" tab: the logged-in person (photo, name, contacts, password) and the business logo. */
  profile?: ReactNode;
}) {
  const mobile = useIsMobile();
  const queryClient = useQueryClient();
  const niches = useQuery({
    queryKey: ["niches"],
    queryFn: () => api<Niche[]>("/niches"),
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(tenant),
  });

  useEffect(() => form.reset(toValues(tenant)), [tenant, form]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      api<Tenant>(`/tenants/${tenant.id}`, {
        method: "PATCH",
        body: {
          name: v.name,
          businessType: v.businessType,
          assistantName: v.assistantName,
          ownerName: v.ownerName || null,
          ownerPhone: v.ownerPhone ? v.ownerPhone.replace(/\D/g, "") : null,
          address: v.address || null,
          addressNeighborhood: v.addressNeighborhood || null,
          addressCity: v.addressCity || null,
          locationUrl: v.locationUrl || null,
          tone: v.tone,
          useEmoji: v.useEmoji,
          extraInfo: v.extraInfo || null,
          minNoticeMinutes: Math.round(v.minNoticeHours * 60),
          bookingHorizonDays: v.bookingHorizonDays,
          ...(role === "admin" ? { active: v.active } : {}),
        },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.tenant(tenant.id), saved);
      toast.success("Configurações salvas");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const text = (
    name:
      | "name"
      | "ownerName"
      | "ownerPhone"
      | "address"
      | "addressNeighborhood"
      | "addressCity"
      | "locationUrl"
      | "assistantName",
    label: string,
    extra?: { placeholder?: string; help?: string; wide?: boolean },
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={extra?.wide ? "sm:col-span-2" : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={extra?.placeholder} {...field} />
          </FormControl>
          {extra?.help && (
            <FormDescription className="text-xs">{extra.help}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      {/* Each tab has its own entry in the menu (Configurações > Negócio / Meu perfil / Cobrança). */}
      {!mobile && (
        <PageHeader
          title={
            tab === "profile"
              ? "Meu perfil"
              : tab === "billing"
                ? "Cobrança"
                : "Negócio"
          }
          description={
            tab === "profile"
              ? "Seus dados pessoais e sua senha."
              : tab === "billing"
                ? "Plano, forma de pagamento e histórico."
                : "Dados do negócio, atendente e regras de agendamento."
          }
        />
      )}
      {tab === "billing" && billing ? (
        billing
      ) : tab === "profile" && profile ? (
        profile
      ) : (
        <>
          <div className="mb-4 rounded-lg border bg-card p-4 md:p-6">
            <LogoSection tenantId={tenant.id} tenantName={tenant.name} />
          </div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => save.mutate(v))}
              className="rounded-lg border bg-card p-4 md:p-6"
            >
              <Section
                title="Negócio"
                description="Aparece para as clientes e nos avisos."
              >
                {text("name", "Nome do negócio", { wide: true })}
                <FormField
                  control={form.control}
                  name="businessType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nicho</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(niches.data ?? []).map((n) => (
                            <SelectItem key={n.id} value={n.slug}>
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                {text("address", "Endereço", {
                  placeholder: "Rua das Flores, 120",
                })}
                {text("addressNeighborhood", "Bairro")}
                {text("addressCity", "Cidade")}
                {text("locationUrl", "Localização (Google Maps)", {
                  placeholder: "https://maps.app.goo.gl/...",
                  help: "No Google Maps: abra o local, toque em Compartilhar e copie o link. A atendente manda junto com o endereço.",
                  wide: true,
                })}
                {text("ownerName", "Nome do responsável")}
                {text("ownerPhone", "WhatsApp do responsável", {
                  placeholder: "5511999999999",
                  help: "Recebe avisos de agendamento e conversas passadas para ele.",
                })}
              </Section>

              {assistant && (
                <Section
                  title="Atendente virtual"
                  description="Como ela fala e o que pode responder."
                >
                  {text("assistantName", "Nome")}
                  <FormField
                    control={form.control}
                    name="tone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jeito de falar</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="friendly">
                              Simpático e informal
                            </SelectItem>
                            <SelectItem value="formal">
                              Mais formal (senhor/senhora)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="useEmoji"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 sm:col-span-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0 font-normal">
                          Pode usar emoji de vez em quando
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="extraInfo"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>
                          Informações que ela pode responder
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            rows={5}
                            placeholder={
                              "Aceitamos Pix, débito e crédito.\nAtraso de mais de 15 min precisa remarcar."
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Ela só responde dúvidas com o que estiver aqui. O
                          resto passa para a equipe.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </Section>
              )}

              <Section
                title="Agendamento"
                description="Regras que a atendente segue ao oferecer horários."
              >
                <FormField
                  control={form.control}
                  name="minNoticeHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Antecedência mínima (horas)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.5}
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bookingHorizonDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agenda aberta até (dias à frente)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={365}
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {role === "admin" && (
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 sm:col-span-2">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0 font-normal">
                          Cliente ativo (desligado, a atendente não responde
                          ninguém)
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                )}
              </Section>

              <div className="flex justify-end pt-5">
                <Button
                  type="submit"
                  size={mobile ? "lg" : "default"}
                  className={mobile ? "w-full" : undefined}
                  disabled={save.isPending}
                >
                  {save.isPending ? "Salvando…" : "Salvar configurações"}
                </Button>
              </div>
            </form>
          </Form>

          <AgendaAlertsSetting />
        </>
      )}
    </>
  );
}

/** Saved on this device only, and applied right away (no need to press Salvar). */
function AgendaAlertsSetting() {
  const enabled = useAgendaAlertsEnabled();
  return (
    <div className="mt-4 rounded-lg border bg-card p-4 md:p-6">
      <Section
        title="Avisos da agenda"
        description="Valem só neste aparelho. Cada pessoa escolhe no seu."
      >
        <div className="flex items-start gap-3 sm:col-span-2">
          <Switch
            id="agenda-alerts"
            checked={enabled}
            onCheckedChange={setAgendaAlerts}
          />
          <label htmlFor="agenda-alerts" className="text-sm leading-snug">
            Avisar sobre a agenda
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Quando a atendente marca um horário, e ao abrir o sistema se
              houver agendamentos pendentes.
            </span>
          </label>
        </div>
      </Section>
    </div>
  );
}
