import { describe, expect, it } from "vitest";
import { literal, scoreOf } from "../src/services/demonstrate.js";

describe("revisión con prueba literal (1.19.0)", () => {
  const resp = "Antes de proponer nada le preguntaría cuánto le cuesta hoy gestionar el stock en Excel, y cerraría con una llamada el jueves.";
  it("una cita solo vale si está de verdad en la respuesta (sin importar tildes ni mayúsculas)", () => {
    expect(literal("cuánto le cuesta hoy gestionar el stock", resp)).toBe(true);
    expect(literal("CUANTO LE CUESTA hoy", resp)).toBe(true);
    expect(literal("le ofrecería un descuento", resp)).toBe(false);
    expect(literal("stock", resp)).toBe(false); // demasiado corta para probar nada
  });
  it("la nota sale de reglas fijas", () => {
    const c = (v: "si" | "parcial" | "no") => ({ criterio: "x", cumple: v, cita: "" });
    expect(scoreOf("demostracion", [c("si"), c("parcial"), c("no"), c("si")], false, null)).toBe(63);
    expect(scoreOf("teach_back", [c("si"), c("si")], true, 5)).toBe(100);
    expect(scoreOf("teach_back", [c("si"), c("no")], false, 1)).toBe(35);
  });
});
