import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createDb, type Sql } from "./client.js";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));

// Arbitrary constant: keeps two deploys from migrating at the same time.
const MIGRATION_LOCK_ID = 7_310_001;

export async function migrate(sql: Sql, log: (message: string) => void = console.log) {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  await sql`alter table schema_migrations enable row level security`;

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`;
    const applied = new Set(
      (await tx<{ name: string }[]>`select name from schema_migrations`).map((row) => row.name),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      log(`Aplicando ${file}...`);
      await tx.unsafe(await readFile(`${migrationsDir}/${file}`, "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    }
  });
  log("Banco atualizado.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no .env");
    process.exit(1);
  }
  const sql = createDb(config.DATABASE_URL);
  try {
    await migrate(sql);
  } finally {
    await sql.end();
  }
}
