import { describe, expect, it } from "vitest";
import { validEvaluation, validScenario } from "../src/services/micropractice.js";

describe("welcome micro-practice", () => {
  it("accepts only a complete scenario", () => {
    expect(validScenario({ escenario: "Una consultora te dice que ya trabaja con otro ERP y no quiere ampliar.", pregunta: "¿Qué le preguntas?" })).toBe(true);
    expect(validScenario({ escenario: "corto", pregunta: "?" })).toBe(false);
  });
  it("requires a usable deliverable, not a score", () => {
    const ok = { bien: "Preguntaste por su cartera.", mejorar: "Propón un siguiente paso concreto.", entregable: { titulo: "Tus preguntas", items: ["¿Qué clientes…?", "¿Qué os frena…?"] } };
    expect(validEvaluation(ok)).toBe(true);
    expect(validEvaluation({ ...ok, entregable: { titulo: "x", items: ["uno"] } })).toBe(false);
    expect(validEvaluation({ nota: 7 })).toBe(false);
  });
});
