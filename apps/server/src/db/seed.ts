// Creates a demo tenant ("Barbearia Demo") so the panel and the bot have
// something to show. Safe to run twice: does nothing if the tenant exists.
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error("DATABASE_URL não está definida no .env");
  process.exit(1);
}
const sql = createDb(config.DATABASE_URL);

try {
  await sql.begin(async (tx) => {
    const [existing] = await tx`select id from tenants where slug = 'demo'`;
    if (existing) {
      console.log("Tenant demo já existe, nada a fazer.");
      return;
    }

    const [tenant] = await tx<{ id: string }[]>`
      insert into tenants (slug, name, assistant_name, business_type, owner_name)
      values ('demo', 'Barbearia Demo', 'Lia', 'barbershop', 'Dono da Demo')
      returning id
    `;
    const tenantId = tenant!.id;

    const services = await tx<{ id: string; name: string }[]>`
      insert into services ${tx(
        [
          { tenantId, name: "Corte masculino", durationMinutes: 30, priceCents: 4500 },
          { tenantId, name: "Barba", durationMinutes: 30, priceCents: 3500 },
          { tenantId, name: "Corte + barba", durationMinutes: 60, priceCents: 7000 },
        ],
        "tenantId", "name", "durationMinutes", "priceCents",
      )}
      returning id, name
    `;

    const professionals = await tx<{ id: string }[]>`
      insert into professionals ${tx([{ tenantId, name: "João" }, { tenantId, name: "Carlos" }], "tenantId", "name")}
      returning id
    `;

    await tx`
      insert into professional_services ${tx(
        professionals.flatMap((professional) =>
          services.map((service) => ({ tenantId, professionalId: professional.id, serviceId: service.id })),
        ),
        "tenantId", "professionalId", "serviceId",
      )}
    `;

    // Tuesday to Friday 09:00-12:00 and 13:00-19:00; Saturday 08:00-14:00.
    const hours = [2, 3, 4, 5].flatMap((weekday) => [
      { tenantId, weekday, opensAt: "09:00", closesAt: "12:00" },
      { tenantId, weekday, opensAt: "13:00", closesAt: "19:00" },
    ]);
    hours.push({ tenantId, weekday: 6, opensAt: "08:00", closesAt: "14:00" });
    await tx`insert into business_hours ${tx(hours, "tenantId", "weekday", "opensAt", "closesAt")}`;

    console.log(`Tenant demo criado: ${services.length} serviços, ${professionals.length} profissionais.`);
  });
} finally {
  await sql.end();
}
