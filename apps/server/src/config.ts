import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    PUBLIC_URL: z.string().url().default("http://localhost:3000"),

    // Postgres (Supabase em dev, container no VPS).
    DATABASE_URL: optionalString,

    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),

    WHATSAPP_PROVIDER: z.enum(["evolution", "meta_cloud"]).default("evolution"),
    EVOLUTION_API_URL: optionalString,
    EVOLUTION_API_KEY: optionalString,
    // Address of this bot as seen from the Evolution container.
    EVOLUTION_WEBHOOK_BASE_URL: z.string().url().default("http://host.docker.internal:3000"),
    WEBHOOK_SECRET: optionalString,

    META_ACCESS_TOKEN: optionalString,
    META_APP_SECRET: optionalString,
    META_VERIFY_TOKEN: optionalString,

    DEFAULT_TIMEZONE: z.string().default("America/Sao_Paulo"),

    // Senha do painel da agência (usuário "admin"). Opcional em desenvolvimento, obrigatória em produção.
    ADMIN_PASSWORD: optionalString,
    // Assina os logins do painel. Trocar desconecta todo mundo.
    SESSION_SECRET: optionalString,
  })
  .refine((env) => env.NODE_ENV !== "production" || (env.ADMIN_PASSWORD?.length ?? 0) >= 12, {
    path: ["ADMIN_PASSWORD"],
    message: "obrigatória em produção, com pelo menos 12 caracteres",
  })
  .refine((env) => env.NODE_ENV !== "production" || (env.SESSION_SECRET?.length ?? 0) >= 32, {
    path: ["SESSION_SECRET"],
    message: "obrigatória em produção, com pelo menos 32 caracteres",
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
