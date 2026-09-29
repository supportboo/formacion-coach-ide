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
  const me = { orgId: "o1", userId: "u1" };
  it("se puede leer una vez y luego desaparece", () => {
    storeExamSession("ex1", ["a", "b"], { ...me, competencyId: "c1" });
    expect(takeExamSession("ex1", me)).toEqual({ correctAnswers: ["a", "b"], competencyId: "c1" });
    expect(takeExamSession("ex1", me)).toBeNull();
  });
  it("un id desconocido devuelve null", () => {
    expect(takeExamSession("no-existe", me)).toBeNull();
  });
  it("otra persona u otra empresa no puede entregarlo ni gastarlo", () => {
    storeExamSession("ex2", ["a"], { ...me, competencyId: "c1" });
    expect(takeExamSession("ex2", { orgId: "o1", userId: "otro" })).toBeNull();
    expect(takeExamSession("ex2", { orgId: "otra", userId: "u1" })).toBeNull();
    expect(takeExamSession("ex2", me)?.competencyId).toBe("c1"); // sigue disponible para su dueño
  });
});
