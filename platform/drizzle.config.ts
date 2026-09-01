import { defineConfig } from "drizzle-kit";

// ponytail: url puede faltar en `generate` (solo genera SQL desde el esquema)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/skillup" },
});
