// Business niches: labels, how customers are called, and the starter
// services/hours used only when a new client is created. Stored in the
// `niches` table (migration 014) so the agency can add, edit and remove
// niches from the panel instead of needing a code change.

import type { Sql } from "../db/client.js";

export type StarterService = { name: string; durationMinutes: number; priceCents: number | null };
export type StarterHour = { weekday: number; opensAt: string; closesAt: string };

export type Niche = {
  id: string;
  slug: string;
  label: string;
  /** How the assistant refers to the place in messages ("o salão"). */
  place: string;
  /** "cliente" or "paciente". */
  customerWord: string;
  starterServices: StarterService[];
  starterHours: StarterHour[];
};

export async function listNiches(sql: Sql): Promise<Niche[]> {
  return sql<Niche[]>`
    select id, slug, label, place, customer_word, starter_services, starter_hours
    from niches order by label
  `;
}

export async function getNicheBySlug(sql: Sql, slug: string): Promise<Niche | undefined> {
  const [niche] = await sql<Niche[]>`
    select id, slug, label, place, customer_word, starter_services, starter_hours
    from niches where slug = ${slug}
  `;
  return niche;
}

/** Place/customer word for the prompt; a safe fallback if the niche was removed after the tenant was created. */
export async function nicheForPrompt(sql: Sql, businessType: string): Promise<{ place: string; customerWord: string }> {
  const niche = await getNicheBySlug(sql, businessType);
  return niche ? { place: niche.place, customerWord: niche.customerWord } : { place: "estabelecimento", customerWord: "cliente" };
}
