import { describe, expect, it } from "vitest";
import { reminderText, type DueReminder } from "./reminders.js";

const base: DueReminder = {
  appointmentId: "a",
  tenantId: "t",
  timezone: "America/Sao_Paulo",
  tenantName: "Salão da Ana",
  assistantName: "Lia",
  whatsappInstance: "x",
  customerPhone: "5511999990000",
  customerName: "Ana Paula",
  serviceName: "Corte feminino",
  professionalName: "Luciana",
  // Tuesday 2026-10-20 10:30 in São Paulo (UTC-3).
  startsAt: new Date("2026-10-20T13:30:00Z"),
};

describe("reminderText", () => {
  it("says tomorrow, the first name, time and how to reschedule", () => {
    const text = reminderText(base, new Date("2026-10-19T15:00:00Z"));
    expect(text).toContain("Oi, Ana! Aqui é Lia, atendente virtual.");
    expect(text).toContain("amanhã (terça, 20/10) às 10h30");
    expect(text).toContain("Corte feminino com Luciana (Salão da Ana)");
    expect(text).toContain("responda 2");
  });

  it("says today for same-day appointments and works without a name", () => {
    const text = reminderText({ ...base, customerName: null, startsAt: new Date("2026-10-20T21:00:00Z") }, new Date("2026-10-20T12:00:00Z"));
    expect(text).toMatch(/^Oi! Aqui é Lia, atendente virtual\. .*hoje às 18h:/);
  });
});
