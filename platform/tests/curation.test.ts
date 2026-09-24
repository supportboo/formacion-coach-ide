import { describe, expect, it } from "vitest";
import { scrubPII } from "../src/services/curation.js";

describe("scrubPII — el curador no deja pasar datos privados de un usuario a otro", () => {
  it("redacta nombres de miembros (completo y por partes) y email", () => {
    const r = scrubPII("Ana García cerró el trato con cliente@acme.com tras hablar con García.", ["Ana García", "Luis Pérez"]);
    expect(r.text).not.toMatch(/Ana|García|acme\.com/);
    expect(r.text).toContain("[persona]");
    expect(r.text).toContain("[email]");
    expect(r.redacted).toBe(true);
  });
  it("deja intacto el texto sin PII y marca redacted=false", () => {
    const r = scrubPII("La clave fue escuchar antes de proponer y cerrar el siguiente paso.", ["Ana García"]);
    expect(r.text).toBe("La clave fue escuchar antes de proponer y cerrar el siguiente paso.");
    expect(r.redacted).toBe(false);
  });
  it("no redacta partes cortas (<3 letras) para no romper el texto", () => {
    const r = scrubPII("Fue un buen mes.", ["Al Bo"]);
    expect(r.text).toBe("Fue un buen mes.");
  });
});
