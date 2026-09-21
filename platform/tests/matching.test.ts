import { describe, expect, it } from "vitest";
import { textMatches } from "../src/services/catalog.js";

describe("textMatches (P3: emparejamiento de puesto/sector)", () => {
  it("acentos y mayúsculas no importan", () => {
    expect(textMatches("Técnico", "tecnico")).toBe(true);
  });
  it("contención en cualquier dirección", () => {
    expect(textMatches("técnico de taller", "técnico")).toBe(true);
  });
  it("coincidencia por palabra significativa compartida", () => {
    expect(textMatches("técnico de taller de motos", "técnico de automoción")).toBe(true);
    expect(textMatches("responsable de recepción", "recepción")).toBe(true);
  });
  it("las palabras vacías no cuentan como coincidencia", () => {
    expect(textMatches("jefe de cocina", "jefe de sala")).toBe(true); // comparten "jefe"
    expect(textMatches("de la en", "por con para")).toBe(false); // solo stopwords
  });
  it("puestos sin nada en común no casan", () => {
    expect(textMatches("comercial", "contable")).toBe(false);
  });
});
