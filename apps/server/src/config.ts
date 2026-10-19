import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),

  // Postgres (Supabase em dev, container no VPS). Obrigatório a partir do item 2.
  DATABASE_URL: optionalString,

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),

  WHATSAPP_PROVIDER: z.enum(["evolution", "meta_cloud"]).default("evolution"),
  EVOLUTION_API_URL: optionalString,
  EVOLUTION_API_KEY: optionalString,
  WEBHOOK_SECRET: optionalString,

  META_ACCESS_TOKEN: optionalString,
  META_APP_SECRET: optionalString,
  META_VERIFY_TOKEN: optionalString,

  DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${problems}`);
  }
  return parsed.data;
}
