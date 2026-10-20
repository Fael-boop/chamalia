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
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  active: boolean;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: "whatsapp" | "panel";
  notes: string | null;
  customerName: string | null;
  customerPhone: string;
  serviceName: string;
  professionalName: string;
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
