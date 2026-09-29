import { describe, expect, it } from "vitest";
import { firstJson } from "../src/services/aiContent.js";

describe("firstJson", () => {
  it("parses clean JSON", () => {
    expect(firstJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips prose and markdown fences", () => {
    expect(firstJson<{ ok: boolean }>('Aquí tienes:\n```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });
  it("repairs a truncated exam (tokens ran out mid-array)", () => {
    const truncated = '{"questions":[{"q":"¿1?","options":["a","b","c","d"]},{"q":"¿2?","options":["a","b",';
    const r = firstJson<{ questions: { q: string; options: string[] }[] }>(truncated);
    expect(r.questions.length).toBeGreaterThanOrEqual(1); // salvaged, not a crash
    expect(r.questions[0]!.options).toEqual(["a", "b", "c", "d"]); // first (complete) question intact
  });
  it("repairs a truncated string value", () => {
    const r = firstJson<{ titulo: string; modulos: unknown[] }>('{"titulo":"Ruta","modulos":[{"t":"algo incompl');
    expect(r.titulo).toBe("Ruta");
    expect(Array.isArray(r.modulos)).toBe(true);
  });
  it("throws when there is no object at all", () => {
    expect(() => firstJson("lo siento, no puedo")).toThrow();
  });
});
