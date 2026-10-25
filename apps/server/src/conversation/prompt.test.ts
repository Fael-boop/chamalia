import { describe, expect, it } from "vitest";
import type { Tenant } from "../scheduling/service.js";
import {
  buildCurrentContext,
  buildSystemPrompt,
  type PromptData,
} from "./prompt.js";

const baseTenant: Tenant = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "a",
  name: "Salão da Ana",
  assistantName: "Lia",
  businessType: "beauty_salon",
  timezone: "America/Sao_Paulo",
  ownerName: "Ana",
  ownerPhone: null,
  active: true,
  address: "Rua das Flores, 10",
  addressNeighborhood: null,
  addressCity: null,
  locationUrl: null,
  tone: "friendly",
  useEmoji: true,
  extraInfo: "Aceitamos Pix. Estacionamento grátis.",
  handoffRules: null,
  defaultHandoffProfessionalId: null,
  handoffReturnHours: 12,
  minNoticeMinutes: 60,
  bookingHorizonDays: 30,
  whatsappInstance: "chamalia-a",
};

const salon: PromptData = {
  tenant: baseTenant,
  services: [
    {
      id: "s1",
      name: "Corte feminino",
      description: null,
      durationMinutes: 60,
      priceCents: 9000,
      active: true,
      handoff: false,
      handoffReason: null,
      handoffProfessionalId: null,
    },
  ],
  professionals: [{ id: "p1", name: "Ana" }],
  reception: [],
  hours: [
    { professionalId: null, weekday: 2, opensAt: "09:00", closesAt: "18:00" },
  ],
  defaultPerson: null,
  faq: [
    {
      question: "Tem estacionamento?",
      answer: "Sim, grátis, na frente do salão.",
    },
  ],
  rules: [{ kind: "always", text: "chame a cliente de querida" }],
  niche: { place: "salão", customerWord: "cliente" },
  handoffTopics: [
    {
      id: "t1",
      topic: "Química: coloração, mechas e progressiva",
      reason: null,
    },
  ],
  timeOff: [],
  customerName: null,
  now: new Date("2026-10-25T15:00:00Z"),
};

const barbershop: PromptData = {
  ...salon,
  tenant: {
    ...baseTenant,
    id: "00000000-0000-0000-0000-000000000002",
    name: "Barbearia do Zé",
    assistantName: "Bia",
    tone: "formal",
    useEmoji: false,
    extraInfo: "Só aceitamos dinheiro.",
    ownerName: "Zé",
  },
  services: [
    {
      id: "s9",
      name: "Barba",
      description: null,
      durationMinutes: 30,
      priceCents: 3000,
      active: true,
      handoff: false,
      handoffReason: null,
      handoffProfessionalId: null,
    },
  ],
  professionals: [{ id: "p9", name: "Zé" }],
  faq: [{ question: "Aceita cartão?", answer: "Não, só dinheiro." }],
  rules: [{ kind: "never", text: "use gírias" }],
  niche: { place: "barbearia", customerWord: "cliente" },
  handoffTopics: [],
};

describe("each business has its own assistant", () => {
  const a = buildSystemPrompt(salon);
  const b = buildSystemPrompt(barbershop);

  it("never carries another business's data", () => {
    for (const mine of [
      "Salão da Ana",
      "Corte feminino",
      "Estacionamento grátis",
      "chame a cliente de querida",
      "Tem estacionamento?",
      "Química",
    ]) {
      expect(a).toContain(mine);
      expect(b).not.toContain(mine);
    }
    for (const theirs of [
      "Barbearia do Zé",
      "Barba",
      "Só aceitamos dinheiro",
      "use gírias",
      "Aceita cartão?",
    ]) {
      expect(b).toContain(theirs);
      expect(a).not.toContain(theirs);
    }
  });

  it("uses the name and manner configured by each one", () => {
    expect(a).toContain("Você é Lia");
    expect(b).toContain("Você é Bia");
    expect(b).toContain("sem emojis");
    expect(a).not.toContain("sem emojis");
  });

  it("has no salon-only rule in the shared instructions", () => {
    // Química is a topic of the salon that chose it, not a rule for every business.
    expect(b.toLowerCase()).not.toContain("química");
    expect(b.toLowerCase()).not.toContain("progressiva");
    expect(b).toContain("barbearia");
    expect(b).not.toContain("do salão");
  });

  it("keeps the per-conversation part free of business instructions", () => {
    const context = buildCurrentContext({
      tenant: salon.tenant,
      niche: salon.niche,
      customerName: "Maria",
      now: salon.now,
    });
    expect(context).toContain("Maria");
    expect(context).not.toContain("Estacionamento grátis");
  });
});
