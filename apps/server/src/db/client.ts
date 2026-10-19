import postgres from "postgres";

export type Sql = postgres.Sql;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);

export function createDb(databaseUrl: string): Sql {
  const url = new URL(databaseUrl);
  return postgres(databaseUrl, {
    // Supabase requires TLS; the Postgres inside docker-compose does not use it.
    ssl: LOCAL_HOSTS.has(url.hostname) ? false : "require",
    // Supabase "transaction pooler" (port 6543) does not support prepared statements.
    prepare: url.port !== "6543",
    max: 10,
    onnotice: () => {},
    // Columns come back in camelCase: starts_at -> startsAt.
    transform: postgres.camel,
  });
}
