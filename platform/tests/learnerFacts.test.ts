import { describe, expect, it } from "vitest";
import { sanitizeOps, summarize, type Fact } from "../src/services/learnerFacts.js";

const input = "Mañana tengo una reunión con un distribuidor de material eléctrico en Valencia que lleva el stock en Excel.";

describe("living learner record: extraction guard", () => {
  it("keeps a fact only when its evidence is a literal quote of what the learner wrote", () => {
    const ops = sanitizeOps([
      { op: "add", layer: "caso", text: "Prepara reunión con un distribuidor de Valencia", evidence: "un distribuidor de material eléctrico en Valencia" },
      { op: "add", layer: "caso", text: "Cliente con 200 empleados", evidence: "tiene 200 empleados" }, // invented: not in the text
    ], input, new Set());
    expect(ops).toHaveLength(1);
    expect(ops[0]!.layer).toBe("caso");
  });

  it("rejects unknown layers and ids that are not the learner's own", () => {
    const ops = sanitizeOps([
      { op: "add", layer: "personalidad", text: "Es inseguro", evidence: "tengo una reunión" },
      { op: "update", id: "someone-else", text: "x", evidence: "tengo una reunión" },
      { op: "expire", id: "mine" },
    ], input, new Set(["mine"]));
    expect(ops).toEqual([{ op: "expire", id: "mine" }]);
  });

  it("never sends retired or outdated facts to the prompts", () => {
    const f = (text: string, status: Fact["status"], active = true) => ({ id: text, layer: "objetivo", text, status, sourceType: "tutor", sourceRef: null, evidence: null, scope: null, active, updatedAt: new Date() }) as Fact;
    const out = summarize([f("cerrar 3 partners", "declarado"), f("antiguo objetivo", "desactualizado"), f("no usar", "confirmado", false)]);
    expect(out).toContain("cerrar 3 partners");
    expect(out).not.toContain("antiguo objetivo");
    expect(out).not.toContain("no usar");
  });
});
