import { existsSync } from "node:fs";
import { z } from "zod";

// Carga .env.local si existe (Node 21+). Sin dependencias.
try { if (existsSync(".env.local")) process.loadEnvFile(".env.local"); } catch { /* noop */ }

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/skillup"),
  ANTHROPIC_API_KEY: z.string().optional(),
  EMBEDDINGS_PROVIDER: z.enum(["dev", "openai"]).default("dev"),
  OPENAI_API_KEY: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().default("http://localhost:8080"),
  PORT: z.coerce.number().default(8080),
  DEV_AUTH: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  MODEL_SENIOR: z.string().default("claude-sonnet-4-6"),
  MODEL_FAST: z.string().default("claude-haiku-4-5-20251001"),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
