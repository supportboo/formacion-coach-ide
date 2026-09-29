import { describe, expect, it } from "vitest";
import { statesOf, type Raw } from "../src/services/capability.js";

const NOW = new Date("2026-09-29T12:00:00Z");
const d = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);
function raw(over: Partial<Raw> = {}): Raw {
  return {
    now: NOW, blocks: [], finals: [], roleplays: [], micro: [], cases: [], checkins: [], mentees: [],
    levels: new Map(), competencies: new Map([["c1", "Reclutamiento de partners"]]), courseToCompetency: new Map(),
    titles: { "reclutamiento-partners": "Reclutamiento de Partners" }, totalBlocks: new Map([["reclutamiento-partners", 4]]),
    ...over,
  };
}

describe("estado de capacidad (V2 fase 1)", () => {
  it("sin evidencias no inventa nada", () => {
    expect(statesOf(raw())).toEqual([]);
  });

  it("un curso sin vincular es una capacidad propia; cuenta la mejor nota por bloque y la cobertura", () => {
    const [s] = statesOf(raw({ blocks: [
      { source: "reclutamiento-partners", block: 0, score: 60, passed: false, at: d(10) },
      { source: "reclutamiento-partners", block: 0, score: 90, passed: true, at: d(9) },
      { source: "reclutamiento-partners", block: 1, score: 80, passed: false, at: d(8) },
    ] }));
    expect(s!.key).toBe("curso:reclutamiento-partners");
    expect(s!.level).toBeNull();
    expect(s!.dims.conocimiento.value).toBe(43); // media 85 × 2/4 bloques
    expect(s!.next!.title).toMatch(/bloque 2/);   // el más flojo por debajo de 85
    expect(s!.confidence.label).toBe("baja");
  });

  it("vinculado a una competencia, suma con los casos validados y muestra el nivel oficial", () => {
    const [s] = statesOf(raw({
      courseToCompetency: new Map([["reclutamiento-partners", "c1"]]), levels: new Map([["c1", 2]]),
      blocks: [0, 1, 2, 3].map((b) => ({ source: "reclutamiento-partners", block: b, score: 90, passed: true, at: d(60 - b) })),
      finals: [{ source: "reclutamiento-partners", score: 85, passed: true, at: d(40) }],
      roleplays: [{ source: "reclutamiento-partners#1", competencyId: "libre", topic: "discovery", score: 7, at: d(30) }],
      cases: [{ competencyId: "c1", at: d(20) }, { competencyId: "c1", at: d(5) }],
      checkins: [{ competencyId: "c1", aplica: "si", at: d(3) }],
    }));
    expect(s!.key).toBe("comp:c1");
    expect(s!.name).toBe("Reclutamiento de partners");
    expect(s!.level).toBe(2);
    expect(s!.dims.conocimiento.value).toBe(87);   // 0,6·85 + 0,4·90
    expect(s!.dims.aplicacion.value).toBe(90);     // 0,5·70 + 2·20 + 15
    expect(s!.dims.autonomia.value).toBe(80);      // 2·30 + 20 examen
    expect(s!.dims.transferencia.value).toBe(0);
    expect(s!.confidence.label).toBe("alta");
    expect(s!.checklist.find((c) => c.label === "Caso real validado")!.done).toBe(true);
    expect(s!.next!.title).toMatch(/Acompaña/);
  });

  it("la vigencia baja con el tiempo y propone refrescar", () => {
    const [s] = statesOf(raw({ blocks: [0, 1, 2, 3].map((b) => ({ source: "reclutamiento-partners", block: b, score: 95, passed: true, at: d(200) })) }));
    expect(s!.vigencia!.label).toBe("baja");
    expect(s!.next!.title).toMatch(/Refresca/);
  });

  it("acompañar a otros es transferencia", () => {
    const [s] = statesOf(raw({ levels: new Map([["c1", 3]]), mentees: [
      { competencyId: "c1", status: "logrado", at: d(30) }, { competencyId: "c1", status: "activo", at: d(2) },
    ] }));
    expect(s!.dims.transferencia.value).toBe(45);
    expect(s!.checklist.find((c) => c.label === "Ha acompañado a otra persona")!.done).toBe(true);
  });
});
