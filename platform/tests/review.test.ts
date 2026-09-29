import { describe, expect, it } from "vitest";
import { answer, due, open, type ErrorItem } from "../src/services/review.js";

const NOW = new Date("2026-09-30T10:00:00Z");
const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const err = (key: string, days: number): ErrorItem => ({ key, source: "outbound-sales", block: 2, q: `¿${key}?`, options: ["a", "b", "c", "d"], correct: 0, explain: "porque sí", failedAt: d(days) });

describe("repaso espaciado con errores reales (1.20.0)", () => {
  it("no repasa lo fallado hace menos de 2 días y pone primero lo más antiguo", () => {
    expect(due([err("x", 1), err("y", 20), err("z", 5)], [], NOW).map((e) => e.key)).toEqual(["y", "z"]);
  });
  it("tras un acierto espera una semana; con dos aciertos sale del repaso; un fallo lo vuelve a traer", () => {
    const e = [err("x", 30)];
    expect(due(e, [{ key: "x", correct: true, at: d(3) }], NOW)).toHaveLength(0);
    expect(due(e, [{ key: "x", correct: true, at: d(8) }], NOW)).toHaveLength(1);
    expect(due(e, [{ key: "x", correct: true, at: d(20) }, { key: "x", correct: true, at: d(9) }], NOW)).toHaveLength(0);
    expect(due(e, [{ key: "x", correct: true, at: d(3) }, { key: "x", correct: false, at: d(1) }], NOW)).toHaveLength(1);
  });
  it("como mucho 3 y la correcta nunca sale del servidor antes de responder", () => {
    const items = due(["a", "b", "c", "d"].map((k, i) => err(k, 10 + i)), [], NOW);
    expect(items).toHaveLength(3);
    const pub = open("s1", "o", "u", items, () => 0.5);
    expect(JSON.stringify(pub)).not.toContain("correct");
    const shownCorrect = pub[0]!.options.indexOf("a");
    expect(answer("s1", { orgId: "o", userId: "otra" }, 0, shownCorrect)).toBeNull();
    expect(answer("s1", { orgId: "o", userId: "u" }, 0, shownCorrect)!.correct).toBe(true);
    expect(answer("s1", { orgId: "o", userId: "u" }, 0, shownCorrect)).toBeNull(); // una sola vez
  });
});
