const TOKEN_KEY = "chamalia.adminToken";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
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
  if (!response.ok) throw new ApiError(response.status, data.message ?? `Erro ${response.status}`);
  return data as T;
}

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
  tone: "friendly" | "formal";
  useEmoji: boolean;
  extraInfo: string | null;
  handoffRules: string | null;
  /** Who gets handoffs nobody configured; null = the owner. */
  defaultHandoffProfessionalId: string | null;
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

export type Niche = { value: string; label: string };

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
  createdAt: string;
  visits: number;
  lastVisit: string | null;
  nextAppointment: string | null;
};

export type CustomerDetail = {
  id: string;
  name: string | null;
  phone: string;
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

export type ChatMessage = { id: string; direction: "inbound" | "outbound"; body: string; createdAt: string };

export type TestChatState = { withOwner: boolean; handoffReason: string | null; messages: ChatMessage[] };

export type TestChatReply = {
  reply: string | null;
  ownerNotices: string[];
  ownerPhoneMissing: boolean;
  withOwner: boolean;
};
