import { describe, expect, it } from "vitest";
import { validClose } from "../src/services/adapt.js";

describe("module close", () => {
  it("requires a usable deliverable and a concrete next action", () => {
    const ok = { entregable: { titulo: "Guion para tu llamada", items: ["Abre con su situación", "Pregunta por su cartera"] }, siguiente: "Llama el jueves a la consultora de Sevilla" };
    expect(validClose(ok)).toBe(true);
    expect(validClose({ ...ok, siguiente: "" })).toBe(false);
    expect(validClose({ entregable: { titulo: "x", items: ["solo uno"] }, siguiente: "algo concreto" })).toBe(false);
  });
});
