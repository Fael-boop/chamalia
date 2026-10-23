import postgres from "postgres";

export type Sql = postgres.Sql;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Supabase requires TLS; a Postgres on the same machine or Docker network (dotless service name) does not use it. */
export function needsTls(hostname: string): boolean {
  return !LOCAL_HOSTS.has(hostname) && hostname.includes(".");
}

export function createDb(databaseUrl: string): Sql {
  const url = new URL(databaseUrl);
  return postgres(databaseUrl, {
    ssl: needsTls(url.hostname) ? "require" : false,
    // Supabase "transaction pooler" (port 6543) does not support prepared statements.
    prepare: url.port !== "6543",
    max: 10,
    onnotice: () => {},
    // Columns come back in camelCase: starts_at -> startsAt.
    transform: postgres.camel,
  });
}
