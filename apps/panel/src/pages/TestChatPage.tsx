import { BellRing, RotateCcw, SendHorizontal, UserRoundCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { api, type PriceTable, type Tenant, type TestChatReply, type TestChatState } from "@/api";
import { Hint, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone, formatTime } from "@/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Shows the file sent (today only the price list; the panel fetches the current one). */
function PriceTableAttachment({ tenant, name }: { tenant: Tenant; name: string }) {
  const table = useQuery({
    queryKey: ["price-table", tenant.id],
    queryFn: () => api<PriceTable>(`/tenants/${tenant.id}/price-table`),
  });
  if (table.isLoading) return <div className="h-32 w-44 animate-pulse rounded-lg bg-muted" />;
  if (table.data?.file?.dataUrl) {
    return <img src={table.data.file.dataUrl} alt={name} className="max-w-56 rounded-lg border" />;
  }
  return <span className="text-sm text-muted-foreground italic">Arquivo: {name}</span>;
}

/** Owner notifications are not stored; they live only on this screen. */
type Notice = { id: string; text: string; createdAt: string };

const DEFAULT_PHONE = "5511999990000";

export function TestChatPage({ tenant }: { tenant: Tenant }) {
  const mobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [state, setState] = useState<TestChatState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const base = `/tenants/${tenant.id}/test-chat`;
  const validPhone = /^\d{10,15}$/.test(phone);

  const load = useCallback(async () => {
    if (!/^\d{10,15}$/.test(phone)) return;
    setState(await api<TestChatState>(`${base}?phone=${phone}`));
  }, [base, phone]);

  useEffect(() => {
    setNotices([]);
    load().catch((e: Error) => toast.error(e.message));
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
  }, [state, notices, pending, reduceMotion]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setPending(text);
    try {
      const result = await api<TestChatReply>(base, { method: "POST", body: { phone, text } });
      const now = new Date().toISOString();
      setNotices((current) => [
        ...current,
        ...result.ownerNotices.map((notice, index) => ({ id: `${now}-${index}`, text: notice, createdAt: now })),
      ]);
      if (result.ownerNotices.length && result.ownerPhoneMissing) {
        toast.info("WhatsApp da dona não cadastrado: no WhatsApp real esse aviso não seria enviado.");
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      setDraft(text);
    } finally {
      setPending(null);
    }
  }

  async function reset() {
    await api(`${base}?phone=${phone}`, { method: "DELETE" });
    setNotices([]);
    await load();
    toast.success("Nova conversa iniciada");
  }

  async function simulateReminder() {
    try {
      await api(`${base}/reminder`, { method: "POST", body: { phone } });
      await load();
      toast.success("Lembrete enviado. Responda 1 ou 2 como a cliente.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function release() {
    await api(`${base}/release`, { method: "POST", body: { phone } });
    await load();
    toast.success(`Conversa devolvida para a ${tenant.assistantName}`);
  }

  const items = [
    ...(state?.messages ?? []).map((m) => ({ kind: "message" as const, id: m.id, createdAt: m.createdAt, message: m })),
    ...notices.map((n) => ({ kind: "notice" as const, id: n.id, createdAt: n.createdAt, notice: n })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      {!mobile && (
        <PageHeader
          title={`Testar a ${tenant.assistantName}`}
          description="Converse como se fosse uma cliente no WhatsApp. Os agendamentos feitos aqui entram na agenda de verdade."
        />
      )}

      <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border bg-card md:h-[calc(100dvh-12rem)]">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cliente
            <Input
              className="h-8 w-40 tabular-nums"
              value={phone}
              inputMode="numeric"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              aria-label="Telefone da cliente simulada"
            />
          </label>
          <span className="text-xs text-muted-foreground">{validPhone ? formatPhone(phone) : "DDI + DDD + número"}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={simulateReminder} disabled={!validPhone || Boolean(pending)}>
            <BellRing /> Simular lembrete
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} disabled={!validPhone || Boolean(pending)}>
            <RotateCcw /> Nova conversa
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {state?.withOwner && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className="font-medium">Com a equipe</span>
                <span className="text-muted-foreground">
                  A {tenant.assistantName} não responde até ser devolvida.
                  {state.handoffReason && ` Pedido: ${state.handoffReason}`}
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={release}>
                  <UserRoundCheck /> Devolver para a {tenant.assistantName}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
          {items.length === 0 && !pending && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Mande a primeira mensagem, por exemplo “oi, quero marcar uma escova amanhã”.
            </p>
          )}
          {items.map((item) =>
            item.kind === "message" ? (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap md:max-w-[70%]",
                  item.message.direction === "inbound"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border bg-card",
                )}
              >
                {item.message.attachment?.kind === "price_table" ? (
                  <PriceTableAttachment tenant={tenant} name={item.message.attachment.name} />
                ) : (
                  item.message.body
                )}
                <div
                  className={cn(
                    "mt-0.5 text-right text-[10px]",
                    item.message.direction === "inbound" ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {formatTime(item.message.createdAt, tenant.timezone)}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-[90%] border-l-2 border-primary/50 pl-3 text-xs whitespace-pre-wrap text-muted-foreground"
              >
                <span className="font-medium text-foreground">Aviso para a equipe no WhatsApp</span>
                {"\n"}
                {item.notice.text}
              </motion.div>
            ),
          )}
          {pending && (
            <>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground opacity-80 md:max-w-[70%]">
                {pending}
              </div>
              {!state?.withOwner && (
                <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md border bg-card px-3 py-3">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full bg-muted-foreground"
                      animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <div ref={bottom} />
        </div>

        <form
          className="flex gap-2 border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            className="h-11 flex-1"
            placeholder="Escreva como a cliente…"
            value={draft}
            disabled={!validPhone}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" size="icon" className="size-11" disabled={!validPhone || !draft.trim() || Boolean(pending)} aria-label="Enviar">
            <SendHorizontal />
          </Button>
        </form>
      </div>
      <div className="mt-2">
        <Hint>É o mesmo motor que responde no WhatsApp. Avisos para a equipe aparecem no meio da conversa.</Hint>
      </div>
    </>
  );
}
