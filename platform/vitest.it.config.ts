import { defineConfig } from "vitest/config";

// Tests de integración (requieren DATABASE_URL con Postgres accesible).
export default defineConfig({
  test: { include: ["itest/**/*.itest.ts"], testTimeout: 20000, hookTimeout: 20000, env: { BETTER_AUTH_SECRET: "test-secret-not-for-prod-min-32-chars-ok" } },
});
