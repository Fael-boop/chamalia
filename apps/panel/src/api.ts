const TOKEN_KEY = "chamalia.adminToken";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * "Lembrar de mim" keeps the session in localStorage (survives closing the browser);
 * otherwise it lives in sessionStorage and ends with the tab. An empty token logs out of both.
 */
export function setToken(token: string, remember = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the user will need to log in again on reload.
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/** 402: the business's subscription expired while the panel was open. */
let onExpired: () => void = () => {};
export function setExpiredHandler(handler: () => void) {
  onExpired = handler;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (response.status === 401) onUnauthorized();
  if (response.status === 402) onExpired();
  if (!response.ok) throw new ApiError(response.status, data.message ?? `Erro ${response.status}`);
  return data as T;
}

export type BillingCycle = "monthly" | "annual" | "lifetime";

export type Plan = {
  id: string;
  slug: string;
  name: string;
  /** "Agenda Online + Lia": the WhatsApp assistant and its screens. */
  includesAssistant: boolean;
  priceCentsMonthly: number | null;
  /** Price of 12 months paid at once; null = 12 × monthly. */
  priceCentsYearly: number | null;
  active: boolean;
  tenants: number;
};

export type Payment = {
  id: string;
  planId: string;
  months: number;
  amountCents: number;
  status: "pending" | "paid" | "cancelled";
  method: "pix" | "manual";
  /** The business pressed "Já paguei". */
  reportedAt: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  /** Pix copy-and-paste with the amount (Mercado Pago charge or the agency's own Pix). */
  pixCode: string | null;
  /** Mercado Pago charge: released by itself as soon as it is paid. */
  automatic: boolean;
  expiresAt: string | null;
};

export type BillingTenant = {
  id: string;
  name: string;
  active: boolean;
  planId: string;
  billingCycle: BillingCycle;
  paidUntil: string | null;
  pendingPayments: number;
  reportedPayments: number;
  lastPaidAt: string | null;
};

export type Subscription = {
  tenantName: string;
  plan: Pick<Plan, "id" | "name" | "includesAssistant" | "priceCentsMonthly" | "priceCentsYearly">;
  billingCycle: BillingCycle;
  paidUntil: string | null;
  expired: boolean;
  pending: Payment | null;
  pixAvailable: boolean;
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  assistantName: string;
  businessType: string;
  timezone: string;
  ownerName: string | null;
  ownerPhone: string | null;
  active: boolean;
  address: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  /** Google Maps (or similar) link, sent together with the address. */
  locationUrl: string | null;
  tone: "friendly" | "formal";
  useEmoji: boolean;
  extraInfo: string | null;
  handoffRules: string | null;
  /** Who gets handoffs nobody configured; null = the owner. */
  defaultHandoffProfessionalId: string | null;
  /** Hours without the team writing before a handed-over conversation returns to the assistant. */
  handoffReturnHours: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  whatsappInstance: string | null;
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  ownerName: string | null;
  active: boolean;
  whatsappInstance: string | null;
  upcoming: number;
};

export type NicheStarterService = { name: string; durationMinutes: number; priceCents: number | null };
export type NicheStarterHour = { weekday: number; opensAt: string; closesAt: string };

export type Niche = {
  id: string;
  /** Also the value sent as a tenant's businessType. */
  slug: string;
  label: string;
  place: string;
  customerWord: string;
  starterServices: NicheStarterService[];
  starterHours: NicheStarterHour[];
};

export type SessionInfo = { role: "admin" } | { role: "owner"; tenantId: string; name: string };

export type TenantUser = {
  id: string;
  name: string;
  login: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type Professional = {
  id: string;
  name: string;
  active: boolean;
  /** reception = answers conversations, performs no service. */
  kind: "professional" | "reception";
  notifyPhone: string | null;
  serviceIds: string[];
};

export type WhatsappStatus = {
  available: boolean;
  instance: string | null;
  state: "open" | "connecting" | "close" | "unknown";
  qrCode?: string;
  /** Code typed in the phone instead of scanning the QR. */
  pairingCode?: string;
  /** Connected WhatsApp number (digits). */
  number?: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  active: boolean;
  /** Always handed over to the owner; the assistant never books it. */
  handoff: boolean;
  handoffReason: string | null;
  /** Who resolves it; null = the owner. */
  handoffProfessionalId: string | null;
};

export type PriceTable = {
  body: string | null;
  file: { name: string | null; mime: string | null; size: number; dataUrl: string | null } | null;
};

export type TeamConversation = {
  id: string;
  reason: string | null;
  handoffTo: string | null;
  handoffAt: string | null;
  teamLastAt: string | null;
  lastMessageAt: string;
  customerName: string | null;
  customerPhone: string;
  lastMessage: string | null;
};

export type AssistantRule = { id: string; kind: "always" | "never"; text: string };

export type FaqEntry = { id: string; question: string; answer: string };

export type HandoffTopic = { id: string; topic: string; reason: string | null; professionalId: string | null };

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: "whatsapp" | "panel";
  notes: string | null;
  createdAt: string;
  /** Same value on every service booked together in one visit. */
  comboId: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  priceCents: number | null;
  professionalId: string;
  professionalName: string;
};

export type Slot = { time: string; startsAt: string; professionals: { id: string; name: string }[] };

export type Customer = {
  id: string;
  name: string | null;
  phone: string;
  notes: string | null;
  createdAt: string;
  visits: number;
  lastVisit: string | null;
  nextAppointment: string | null;
};

export type CustomerDetail = {
  id: string;
  name: string | null;
  phone: string;
  notes: string | null;
  createdAt: string;
  appointments: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: AppointmentStatus;
    serviceName: string;
    professionalName: string;
  }[];
};

export type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";

export type BusinessHour = { weekday: number; opensAt: string; closesAt: string };

export type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  attachment: { kind: "price_table"; name: string; mime: string } | null;
};

export type TestChatState = { withOwner: boolean; handoffReason: string | null; messages: ChatMessage[] };

export type TestChatReply = {
  reply: string | null;
  ownerNotices: string[];
  ownerPhoneMissing: boolean;
  withOwner: boolean;
};
