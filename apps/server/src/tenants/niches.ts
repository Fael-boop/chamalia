// Business niches: labels, how customers are called and the starter services
// created with a new client (the owner adjusts them in the panel).

export const BUSINESS_TYPES = [
  "beauty_salon",
  "barbershop",
  "aesthetics",
  "nails",
  "aesthetic_clinic",
  "clinic",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

type StarterService = { name: string; durationMinutes: number; priceCents: number | null };

type Niche = {
  label: string;
  /** How the assistant refers to the place in messages ("o salão"). */
  place: string;
  /** "cliente" or "paciente". */
  customerWord: string;
  services: StarterService[];
};

const service = (name: string, durationMinutes: number, price?: number): StarterService => ({
  name,
  durationMinutes,
  priceCents: price === undefined ? null : price * 100,
});

export const NICHES: Record<BusinessType, Niche> = {
  beauty_salon: {
    label: "Salão de beleza",
    place: "salão",
    customerWord: "cliente",
    services: [
      service("Corte feminino", 60),
      service("Escova", 45),
      service("Hidratação", 60),
      service("Corte masculino", 30),
    ],
  },
  barbershop: {
    label: "Barbearia",
    place: "barbearia",
    customerWord: "cliente",
    services: [service("Corte masculino", 30), service("Barba", 30), service("Corte + barba", 60)],
  },
  aesthetics: {
    label: "Estética",
    place: "espaço",
    customerWord: "cliente",
    services: [service("Limpeza de pele", 60), service("Design de sobrancelha", 30), service("Depilação", 30)],
  },
  nails: {
    label: "Manicure e pedicure",
    place: "espaço",
    customerWord: "cliente",
    services: [service("Manicure", 45), service("Pedicure", 45), service("Pé e mão", 90)],
  },
  aesthetic_clinic: {
    label: "Clínica estética",
    place: "clínica",
    customerWord: "paciente",
    services: [service("Avaliação", 30)],
  },
  clinic: { label: "Clínica", place: "clínica", customerWord: "paciente", services: [service("Consulta", 30)] },
  other: { label: "Outro", place: "estabelecimento", customerWord: "cliente", services: [] },
};

export function nicheOf(businessType: string): Niche {
  return NICHES[businessType as BusinessType] ?? NICHES.other;
}

/** Tuesday to Saturday, 09:00-18:00: a common starting point the owner adjusts. */
export const STARTER_HOURS = [2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "09:00", closesAt: "18:00" }));
