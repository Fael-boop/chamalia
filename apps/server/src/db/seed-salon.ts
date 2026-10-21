// Example beauty salon for demos and UI review: "Studio Bella (exemplo)".
//   npm run db:seed:salon
// Deletes and recreates ONLY this example tenant (slug "studio-bella"), with
// 3 professionals, hair and nail services, full agenda today and tomorrow, busy week.
import { loadConfig } from "../config.js";
import { addDays, utcToZoned, zonedToUtc } from "../lib/time.js";
import { createDb } from "./client.js";

const SLUG = "studio-bella";
const TIMEZONE = "America/Sao_Paulo";

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error("DATABASE_URL não está definida no .env");
  process.exit(1);
}
const sql = createDb(config.DATABASE_URL);

const SERVICES = [
  { key: "corte-f", name: "Corte feminino", durationMinutes: 60, priceCents: 9000, area: "hair" },
  { key: "escova", name: "Escova", durationMinutes: 45, priceCents: 6000, area: "hair" },
  { key: "hidratacao", name: "Hidratação", durationMinutes: 60, priceCents: 8000, area: "hair" },
  { key: "corte-m", name: "Corte masculino", durationMinutes: 30, priceCents: 5000, area: "hair" },
  { key: "manicure", name: "Manicure", durationMinutes: 45, priceCents: 3500, area: "nails" },
  { key: "pedicure", name: "Pedicure", durationMinutes: 45, priceCents: 4000, area: "nails" },
  { key: "pe-mao", name: "Pé e mão", durationMinutes: 90, priceCents: 7000, area: "nails" },
] as const;

const PROFESSIONALS = [
  { name: "Ana", area: "hair" },
  { name: "Juliana", area: "hair" },
  { name: "Carla", area: "nails" },
] as const;

const CUSTOMERS = [
  "Mariana Souza", "Beatriz Lima", "Camila Rocha", "Fernanda Alves", "Patrícia Gomes", "Renata Dias",
  "Larissa Melo", "Juliana Prado", "Aline Costa", "Vanessa Ribeiro", "Tatiane Moura", "Gabriela Nunes",
  "Débora Castro", "Priscila Freitas", "Carolina Teixeira", "Roberta Pires", "Sabrina Lopes", "Natália Cardoso",
];

// Today's agenda per professional: [time, service key, status]. Past slots become "completed".
const TODAY: Record<string, [string, (typeof SERVICES)[number]["key"], string][]> = {
  Ana: [
    ["09:00", "corte-f", "confirmed"], ["10:00", "escova", "confirmed"], ["11:00", "hidratacao", "scheduled"],
    ["13:00", "corte-f", "confirmed"], ["14:00", "escova", "cancelled"], ["15:00", "corte-m", "scheduled"],
    ["16:00", "corte-f", "confirmed"], ["17:30", "escova", "scheduled"],
  ],
  Juliana: [
    ["09:30", "escova", "confirmed"], ["10:30", "corte-f", "confirmed"], ["12:00", "corte-m", "scheduled"],
    ["13:30", "hidratacao", "confirmed"], ["15:00", "escova", "scheduled"], ["16:00", "corte-f", "confirmed"],
    ["17:30", "hidratacao", "scheduled"],
  ],
  Carla: [
    ["09:00", "pe-mao", "confirmed"], ["10:30", "manicure", "confirmed"], ["11:30", "pedicure", "scheduled"],
    ["13:00", "manicure", "confirmed"], ["14:00", "pe-mao", "confirmed"], ["16:00", "manicure", "scheduled"],
    ["17:00", "pedicure", "cancelled"], ["18:00", "manicure", "scheduled"],
  ],
};

try {
  const now = new Date();
  const today = utcToZoned(now, TIMEZONE).date;

  await sql.begin(async (tx) => {
    await tx`delete from tenants where slug = ${SLUG}`;
    const [tenant] = await tx<{ id: string }[]>`
      insert into tenants ${tx({
        slug: SLUG,
        name: "Studio Bella (exemplo)",
        businessType: "beauty_salon",
        assistantName: "Lia",
        ownerName: "Bella",
        address: "Rua das Flores, 120",
        addressNeighborhood: "Centro",
        addressCity: "São Paulo - SP",
        extraInfo: "Aceitamos Pix, débito e crédito.\nAtraso de mais de 15 minutos precisa remarcar.",
        minNoticeMinutes: 60,
      })}
      returning id
    `;
    const tenantId = tenant!.id;

    await tx`
      insert into faq_entries ${tx(
        [
          { question: "Tem estacionamento?", answer: "Temos sim! Estacionamento conveniado na rua de trás, com 1 hora grátis." },
          { question: "Aceita cartão parcelado?", answer: "Aceitamos crédito em até 3x sem juros, débito e Pix." },
          { question: "Atende crianças?", answer: "Atendemos sim, corte infantil a partir de 4 anos, sempre com um responsável junto." },
        ].map((f) => ({ tenantId, ...f })),
        "tenantId", "question", "answer",
      )}
    `;

    const services = await tx<{ id: string; name: string }[]>`
      insert into services ${tx(
        SERVICES.map(({ name, durationMinutes, priceCents }) => ({ tenantId, name, durationMinutes, priceCents })),
        "tenantId", "name", "durationMinutes", "priceCents",
      )}
      returning id, name
    `;
    const serviceByKey = Object.fromEntries(
      SERVICES.map((s) => [s.key, { ...s, id: services.find((row) => row.name === s.name)!.id }]),
    );

    const professionals = await tx<{ id: string; name: string }[]>`
      insert into professionals ${tx(PROFESSIONALS.map(({ name }) => ({ tenantId, name })), "tenantId", "name")}
      returning id, name
    `;
    const professionalByName = Object.fromEntries(professionals.map((p) => [p.name, p.id]));

    await tx`
      insert into professional_services ${tx(
        PROFESSIONALS.flatMap((p) =>
          SERVICES.filter((s) => s.area === p.area).map((s) => ({
            tenantId,
            professionalId: professionalByName[p.name]!,
            serviceId: serviceByKey[s.key]!.id,
          })),
        ),
        "tenantId", "professionalId", "serviceId",
      )}
    `;

    // Monday to Saturday, 09:00-19:00.
    await tx`
      insert into business_hours ${tx(
        [1, 2, 3, 4, 5, 6].map((weekday) => ({ tenantId, weekday, opensAt: "09:00", closesAt: "19:00" })),
        "tenantId", "weekday", "opensAt", "closesAt",
      )}
    `;

    const customers = await tx<{ id: string }[]>`
      insert into customers ${tx(
        CUSTOMERS.map((name, index) => ({ tenantId, name, phone: `55119${String(70000000 + index * 1379).padStart(8, "0")}` })),
        "tenantId", "name", "phone",
      )}
      returning id
    `;

    type Row = { tenantId: string; customerId: string; serviceId: string; professionalId: string; startsAt: Date; endsAt: Date; status: string; source: string };
    const rows: Row[] = [];
    let customerIndex = 0;
    const nextCustomer = () => customers[customerIndex++ % customers.length]!.id;
    const add = (day: string, time: string, key: (typeof SERVICES)[number]["key"], professional: string, status: string) => {
      const service = serviceByKey[key]!;
      const startsAt = zonedToUtc(day, time, TIMEZONE);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60000);
      const finalStatus = status !== "cancelled" && endsAt < now ? "completed" : status;
      rows.push({
        tenantId,
        customerId: nextCustomer(),
        serviceId: service.id,
        professionalId: professionalByName[professional]!,
        startsAt,
        endsAt,
        status: finalStatus,
        source: rows.length % 3 === 0 ? "panel" : "whatsapp",
      });
    };

    // Today and tomorrow full (so there is always a busy day ahead to review), rest of the week lighter.
    for (const day of [today, addDays(today, 1)]) {
      for (const [professional, list] of Object.entries(TODAY)) {
        for (const [time, key, status] of list) add(day, time, key, professional, status);
      }
    }
    for (let offset = 2; offset <= 7; offset++) {
      const day = addDays(today, offset);
      if (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) continue;
      const shift = offset % 3;
      add(day, ["09:00", "10:00", "11:00"][shift]!, "corte-f", "Ana", "confirmed");
      add(day, "14:00", offset % 2 ? "escova" : "hidratacao", "Ana", "scheduled");
      add(day, ["09:30", "13:00", "15:30"][shift]!, "escova", "Juliana", "confirmed");
      add(day, "16:30", "corte-m", "Juliana", "scheduled");
      add(day, ["10:00", "11:00", "14:00"][shift]!, "manicure", "Carla", "confirmed");
      add(day, "16:00", "pe-mao", "Carla", offset % 2 ? "scheduled" : "confirmed");
    }

    await tx`
      insert into appointments ${tx(
        rows,
        "tenantId", "customerId", "serviceId", "professionalId", "startsAt", "endsAt", "status", "source",
      )}
    `;
    console.log(`Studio Bella (exemplo) criado: ${professionals.length} profissionais, ${services.length} serviços, ${customers.length} clientes, ${rows.length} agendamentos (hoje: ${today}).`);
  });
} finally {
  await sql.end();
}
