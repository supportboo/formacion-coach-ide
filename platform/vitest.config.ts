import { defineConfig } from "vitest/config";

// Tests unitarios (sin base de datos).
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], env: { BETTER_AUTH_SECRET: "test-secret-not-for-prod-min-32-chars-ok" } },
});
