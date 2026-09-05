import { existsSync } from "node:fs";
import { z } from "zod";

// Carga .env.local si existe (Node 21+). Sin dependencias.
try { if (existsSync(".env.local")) process.loadEnvFile(".env.local"); } catch { /* noop */ }

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/skillup"),
  ANTHROPIC_API_KEY: z.string().optional(),
  EMBEDDINGS_PROVIDER: z.enum(["dev", "openai"]).default("dev"),
  OPENAI_API_KEY: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET debe fijarse explícitamente (>=32 chars), sin valor por defecto"),
  BETTER_AUTH_URL: z.string().default("http://localhost:8080"),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("127.0.0.1"), // solo localhost por defecto; nginx hace de proxy
  DEV_AUTH: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  MODEL_SENIOR: z.string().default("claude-sonnet-4-6"),
  MODEL_FAST: z.string().default("claude-haiku-4-5-20251001"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  APP_URL: z.string().default("http://localhost:8080"), // base para redirects de Stripe Checkout
});

export const env = schema.parse(process.env);

// DEV_AUTH acepta identidad (orgId/userId/role) desde cabeceras HTTP sin sesión real.
// Fail-open en producción = acceso admin cross-tenant a cualquiera que llegue al puerto.
if (env.DEV_AUTH && process.env.NODE_ENV === "production") {
  throw new Error("DEV_AUTH=true no está permitido con NODE_ENV=production (bypass de autenticación multi-tenant).");
}

export type Env = typeof env;
