import { describe, expect, it } from "vitest";
import { scoreExam, shuffleExam, storeExamSession, takeExamSession } from "../src/services/aiContent.js";

describe("scoreExam (corrección determinista, sin LLM)", () => {
  it("puntúa 100 si todas las respuestas coinciden", () => {
    expect(scoreExam(["a", "b", "c"], ["a", "b", "c"])).toBe(100);
  });
  it("puntúa 0 con array vacío en vez de dividir por cero", () => {
    expect(scoreExam([], [])).toBe(0);
  });
  it("ignora espacios al comparar", () => {
    expect(scoreExam(["a"], [" a "])).toBe(100);
  });
  it("cuenta solo los aciertos reales", () => {
    expect(scoreExam(["a", "b", "c", "d"], ["a", "x", "c", "y"])).toBe(50);
  });
});

describe("shuffleExam", () => {
  it("conserva el conjunto de opciones y devuelve la correcta de cada pregunta", () => {
    const exam = { questions: [{ q: "¿?", options: ["correcta", "b", "c", "d"] }] };
    const { questions, correctAnswers } = shuffleExam(exam);
    expect(correctAnswers).toEqual(["correcta"]);
    expect(questions[0]!.options.slice().sort()).toEqual(["b", "c", "correcta", "d"].sort());
  });
});

describe("sesión de examen (memoria de proceso, un solo uso)", () => {
  it("se puede leer una vez y luego desaparece", () => {
    storeExamSession("ex1", ["a", "b"]);
    expect(takeExamSession("ex1")).toEqual(["a", "b"]);
    expect(takeExamSession("ex1")).toBeNull();
  });
  it("un id desconocido devuelve null", () => {
    expect(takeExamSession("no-existe")).toBeNull();
  });
});
