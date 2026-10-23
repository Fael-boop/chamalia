import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, type Appointment, type Professional, type Service, type Tenant } from "@/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export const keys = {
  tenant: (tenantId: string) => ["tenant", tenantId] as const,
  appointments: (tenantId: string, from: string, to: string) => ["appointments", tenantId, from, to] as const,
  allAppointments: (tenantId: string) => ["appointments", tenantId] as const,
  services: (tenantId: string) => ["services", tenantId] as const,
  professionals: (tenantId: string) => ["professionals", tenantId] as const,
  customers: (tenantId: string, search: string) => ["customers", tenantId, search] as const,
  customer: (tenantId: string, id: string) => ["customer", tenantId, id] as const,
  /** professionalId undefined = business hours. */
  hours: (tenantId: string, professionalId?: string) => ["hours", tenantId, professionalId ?? "business"] as const,
};

export const useTenant = (tenantId: string) =>
  useQuery({ queryKey: keys.tenant(tenantId), queryFn: () => api<Tenant>(`/tenants/${tenantId}`) });

/** Agenda for a date range; refreshes every 10 s so new WhatsApp bookings show up. */
export const useAppointments = (tenantId: string, from: string, to: string) =>
  useQuery({
    queryKey: keys.appointments(tenantId, from, to),
    queryFn: () => api<Appointment[]>(`/tenants/${tenantId}/appointments?from=${from}&to=${to}`),
    refetchInterval: 10_000,
    placeholderData: (previous) => previous,
  });

export const useServices = (tenantId: string) =>
  useQuery({ queryKey: keys.services(tenantId), queryFn: () => api<Service[]>(`/tenants/${tenantId}/services`) });

export const useProfessionals = (tenantId: string) =>
  useQuery({
    queryKey: keys.professionals(tenantId),
    queryFn: () => api<Professional[]>(`/tenants/${tenantId}/professionals`),
  });
