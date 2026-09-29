import { describe, expect, it } from "vitest";
import { resilience, riskOf } from "../src/services/resilience.js";

describe("mapa de resiliencia del conocimiento (1.21.0)", () => {
  it("riesgo por personas que la aplican solas; las críticas suben un escalón", () => {
    expect(riskOf(0, 0, false)).toBe("sin_cobertura");
    expect(riskOf(1, 1, false)).toBe("alto");
    expect(riskOf(1, 1, true)).toBe("critico");
    expect(riskOf(3, 0, false)).toBe("medio"); // sin referente que valide y acompañe
    expect(riskOf(3, 1, true)).toBe("bajo");
  });
  it("recomienda que quien la domina acompañe a quien la aprende, detecta personas clave, cadenas y coaches que saben enseñar", () => {
    const r = resilience({
      competencies: [{ id: "neg", name: "Negociación enterprise", critical: true }, { id: "disc", name: "Discovery", critical: false }],
      levels: [
        { userId: "ana", competencyId: "neg", level: 3 }, { userId: "david", competencyId: "neg", level: 1 },
        { userId: "ana", competencyId: "disc", level: 4 }, { userId: "carlos", competencyId: "disc", level: 3 }, { userId: "lucia", competencyId: "disc", level: 2 },
      ],
      coachings: [
        { coachId: "ana", learnerId: "carlos", competencyId: "disc", status: "logrado" },
        { coachId: "carlos", learnerId: "lucia", competencyId: "disc", status: "logrado" },
        { coachId: "ana", learnerId: "marta", competencyId: "disc", status: "logrado" },
      ],
      names: new Map([["ana", "Ana"], ["david", "David"], ["carlos", "Carlos"], ["lucia", "Lucía"], ["marta", "Marta"]]),
    });
    const neg = r.competencies[0]!;
    expect(neg.name).toBe("Negociación enterprise");
    expect(neg.risk).toBe("critico");
    expect(neg.action).toBe("Propón a Ana acompañar a David en dos prácticas.");
    expect(r.keyPeople[0]).toMatchObject({ name: "Ana", onlyHolderOf: ["Negociación enterprise"] });
    expect(r.chains.map((c) => c.path.join(" → "))).toContain("Ana → Carlos → Lucía");
    expect(r.coaches.find((c) => c.name === "Ana")).toMatchObject({ logrado: 2, teaches: true });
  });
});
