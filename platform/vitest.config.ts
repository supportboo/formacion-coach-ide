import { defineConfig } from "vitest/config";

// Tests unitarios (sin base de datos).
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
