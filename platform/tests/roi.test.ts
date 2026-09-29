import { describe, expect, it } from "vitest";
import {
  fullyLoadedCosts, impactBenefit, impactSchema, median, retryGain, roiLevel5, sampleCaveat, studySchema, wilson,
  type ImpactInput,
} from "../src/services/roi.js";

const fullCosts = { licencia: 1000, horasParticipantes: 100, costeHoraCargado: 25, costesInternos: 500, otrosCostes: 0 };

const impact = (over: Partial<ImpactInput> = {}): ImpactInput => impactSchema.parse({
  nombre: "Devoluciones", unidad: "devoluciones", sentido: "bajar", valorAntes: 50, valorDespues: 30,
  metodo: "antes_despues", atribucionPct: 50, confianzaPct: 80, valorEuroPorUnidad: 40, fuenteValor: "Contabilidad 2026",
  mesesBeneficio: 12, ...over,
});

describe("costes completos (principio 10)", () => {
  it("suma plataforma + horas × coste/hora + interno + otros", () => {
    expect(fullyLoadedCosts(fullCosts).total).toBe(1000 + 2500 + 500 + 0);
  });
  it("un campo vacío = no hay total y se dice cuál falta (0 hay que escribirlo)", () => {
    const r = fullyLoadedCosts({ ...fullCosts, costeHoraCargado: null });
    expect(r.total).toBeNull();
    expect(r.missing).toEqual(["Coste por hora con cargas sociales"]);
  });
});

describe("conversión a euros con aislamiento (Phillips)", () => {
  it("antes/después: mejora × % atribuido × % confianza × €/unidad × meses", () => {
    // mejora 20/mes (bajar es mejor) × 0,5 × 0,8 = 8 × 40 € × 12 = 3840 €
    const r = impactBenefit(impact());
    expect(r.mejoraMensual).toBe(20);
    expect(r.mejoraAislada).toBeCloseTo(8);
    expect(r.beneficio).toBeCloseTo(3840);
  });
  it("grupo de control: resta la mejora del grupo no formado, sin ajuste de confianza", () => {
    const r = impactBenefit(impact({ metodo: "grupo_control", mejoraGrupoControl: 5, atribucionPct: null, confianzaPct: null }));
    expect(r.mejoraAislada).toBe(15);
    expect(r.beneficio).toBe(15 * 40 * 12);
  });
  it("nunca más de 12 meses de beneficio (principio 9)", () => {
    expect(impactSchema.safeParse({ ...impact(), mesesBeneficio: 24 }).success).toBe(false);
    expect(impactBenefit({ ...impact(), mesesBeneficio: 24 }).beneficio).toBeCloseTo(3840);
  });
  it("sin atribución o sin fuente del valor no hay euros", () => {
    const r = impactBenefit(impact({ atribucionPct: null, fuenteValor: "" }));
    expect(r.beneficio).toBeNull();
    expect(r.missing).toContain("% de la mejora atribuible a la formación");
    expect(r.missing).toContain("fuente del valor en €");
  });
  it("si la métrica empeora, el beneficio es negativo (no se oculta)", () => {
    expect(impactBenefit(impact({ valorDespues: 60 })).beneficio).toBeLessThan(0);
  });
});

describe("ROI y BCR (nivel 5)", () => {
  it("ROI = (beneficios − costes) / costes × 100 y BCR = beneficios / costes", () => {
    const r = roiLevel5(fullyLoadedCosts(fullCosts), [impactBenefit(impact())]);
    expect(r.computable).toBe(true);
    expect(r.costes).toBe(4000);
    expect(r.beneficios).toBeCloseTo(3840);
    expect(r.roiPct).toBe(-4);
    expect(r.bcr).toBe(0.96);
    expect(r.certainty).toBe("estimado");
  });
  it("sin métricas de negocio -> sin ROI y lista de lo que falta", () => {
    const r = roiLevel5(fullyLoadedCosts(fullCosts), []);
    expect(r.computable).toBe(false);
    expect(r.roiPct).toBeNull();
    expect(r.bcr).toBeNull();
    expect(r.certainty).toBe("sin_datos");
    expect(r.missing.join(" ")).toMatch(/métrica de negocio/);
  });
  it("sin costes completos -> sin ROI aunque haya beneficios", () => {
    const r = roiLevel5(fullyLoadedCosts({ licencia: 1000 }), [impactBenefit(impact())]);
    expect(r.computable).toBe(false);
    expect(r.missing.some((m) => m.startsWith("Costes:"))).toBe(true);
  });
  it("sin ningún dato -> sin ROI", () => {
    expect(roiLevel5(fullyLoadedCosts(undefined), []).computable).toBe(false);
  });
  it("costes 0 -> sin ROI (no se divide por cero)", () => {
    const r = roiLevel5(fullyLoadedCosts({ licencia: 0, horasParticipantes: 0, costeHoraCargado: 0, costesInternos: 0, otrosCostes: 0 }), [impactBenefit(impact())]);
    expect(r.computable).toBe(false);
  });
  it("una métrica incompleta cuenta como 0 € (principio 6), no se extrapola", () => {
    const r = roiLevel5(fullyLoadedCosts(fullCosts), [impactBenefit(impact()), impactBenefit(impact({ nombre: "Ventas", valorEuroPorUnidad: null }))]);
    expect(r.beneficios).toBeCloseTo(3840);
    expect(r.missing[0]).toMatch(/Ventas/);
  });
});

describe("estadística para muestras pequeñas", () => {
  it("Wilson 95 %: 0/0 sin datos, límites dentro de [0,1] y más ancho con n pequeño", () => {
    expect(wilson(0, 0)).toBeNull();
    const [lo, hi] = wilson(5, 10)!;
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    const [lo2, hi2] = wilson(50, 100)!;
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(wilson(0, 3)![0]).toBe(0);
  });
  it("aviso por n", () => {
    expect(sampleCaveat(0)).toBeNull();
    expect(sampleCaveat(4)).toMatch(/muy pequeña/);
    expect(sampleCaveat(20)).toMatch(/cautela/);
    expect(sampleCaveat(30)).toBeNull();
  });
  it("mediana", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("mejora entre intentos: solo persona-ruta con 2+ intentos, primer intento vs mejor posterior", () => {
    const d = (s: string) => new Date(s);
    const r = retryGain([
      { userId: "a", pathId: "p", score: 60, at: d("2026-01-01") },
      { userId: "a", pathId: "p", score: 90, at: d("2026-01-03") },
      { userId: "a", pathId: "p", score: 80, at: d("2026-01-02") },
      { userId: "b", pathId: "p", score: 70, at: d("2026-01-01") },
    ]);
    expect(r).toEqual({ mean: 30, n: 1 });
  });
});

describe("validación de entrada (Zod)", () => {
  it("rechaza % fuera de rango y fechas mal formadas", () => {
    expect(studySchema.safeParse({ impacts: [{ ...impact(), atribucionPct: 150 }] }).success).toBe(false);
    expect(studySchema.safeParse({ periodStart: "01/01/2026" }).success).toBe(false);
    expect(studySchema.safeParse({ costs: { licencia: -1 } }).success).toBe(false);
    expect(studySchema.safeParse({ costs: fullCosts, periodStart: "2026-01-01" }).success).toBe(true);
  });
});
