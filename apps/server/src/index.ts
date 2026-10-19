import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";

const config = loadConfig();
const sql = config.DATABASE_URL ? createDb(config.DATABASE_URL) : undefined;
const app = await buildApp(config, sql);

if (sql) {
  await migrate(sql, (message) => app.log.info(message));
} else {
  app.log.warn("DATABASE_URL não definida: rodando sem banco de dados");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app
      .close()
      .then(() => sql?.end())
      .then(() => process.exit(0));
  });
}

await app.listen({ port: config.PORT, host: "0.0.0.0" });
