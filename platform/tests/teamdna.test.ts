import { describe, expect, it } from "vitest";
import { scoreDna, archetypeFor, QUESTIONS, ARCHETYPES, FAMILIES, type Family } from "../src/services/teamdna.js";

describe("Team DNA scoring", () => {
  it("has 12 distinct archetypes, one per primary×secondary (primary≠secondary)", () => {
    expect(ARCHETYPES).toHaveLength(12);
    const keys = new Set(ARCHETYPES.map((a) => a.key));
    expect(keys.size).toBe(12);
    for (const a of ARCHETYPES) expect(a.primary).not.toBe(a.secondary);
    // every primary×secondary combination is covered
    for (const p of FAMILIES) for (const s of FAMILIES) if (p !== s) expect(archetypeFor(p, s).primary).toBe(p);
  });

  it("weights are integer percentages that sum to 100", () => {
    const ans: Family[] = ["vision", "accion", "analisis", "personas", "vision", "accion", "analisis", "vision"];
    const r = scoreDna(ans);
    const sum = FAMILIES.reduce((s, f) => s + r.weights[f], 0);
    expect(sum).toBe(100);
    for (const f of FAMILIES) expect(Number.isInteger(r.weights[f])).toBe(true);
  });

  it("primary is the top family and picks the matching archetype", () => {
    // mostly Visión, then Acción → Innovador (vision+accion)
    const ans: Family[] = ["vision", "vision", "vision", "vision", "accion", "accion", "analisis", "personas"];
    const r = scoreDna(ans);
    expect(r.primary).toBe("vision");
    expect(r.secondary).toBe("accion");
    expect(r.archetypeKey).toBe("innovador");
    expect(r.weights.vision).toBeGreaterThan(r.weights.accion);
    expect(r.near.length).toBeGreaterThanOrEqual(1);
    expect(r.near).not.toContain("innovador");
  });

  it("a different lean gives a different archetype", () => {
    const ans: Family[] = ["personas", "personas", "personas", "analisis", "analisis", "personas", "vision", "accion"];
    const r = scoreDna(ans);
    expect(r.primary).toBe("personas");
    expect(r.secondary).toBe("analisis");
    expect(r.archetypeKey).toBe("mentor");
  });

  it("every question has exactly 4 options, one per family", () => {
    for (const q of QUESTIONS) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.family)).size).toBe(4);
    }
  });
});
