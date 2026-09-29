import { describe, expect, it } from "vitest";
import { applyTerms, BASE_TERMS, extractLearned, glossaryPrompt } from "../src/services/glossary.js";

describe("glossary", () => {
  it("corrige formas incorrectas como palabra completa, sin distinguir mayúsculas", () => {
    expect(applyTerms("Hablamos con el Panel  Manager de NextTodo y de nexttodo.", BASE_TERMS))
      .toBe("Hablamos con el partner manager de Nextdoo y de Nextdoo.");
    expect(applyTerms("Nextdoor y Nextdoo no se tocan", BASE_TERMS)).toBe("Nextdoor y Nextdoo no se tocan");
  });
  it("saca las marcas de aprendizaje de la respuesta", () => {
    const r = extractLearned("Tienes razón, es partner manager.\n\n[[TERMINO: panel manager => partner manager]]");
    expect(r.clean).toBe("Tienes razón, es partner manager.");
    expect(r.learned).toEqual([{ wrong: "panel manager", right: "partner manager" }]);
    expect(extractLearned("Sin correcciones.").learned).toEqual([]);
  });
  it("el prompt agrupa por forma correcta", () => {
    expect(glossaryPrompt([{ wrong: "NextTodo", right: "Nextdoo" }, { wrong: "Nextdo", right: "Nextdoo" }]))
      .toContain("«Nextdoo» (nunca «NextTodo» ni «Nextdo»)");
    expect(glossaryPrompt([])).toBe("");
  });
});
