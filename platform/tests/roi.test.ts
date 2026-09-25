import { describe, expect, it } from "vitest";
import { roiFromCounts, DEFAULT_ASSUMPTIONS, type RoiFacts } from "../src/services/roi.js";

const facts: RoiFacts = {
  personas: 8, competenciasAplicadas: 10, referentes: 4,
  validacionesAprobadas: 5, transferenciasInternas: 2, riesgosCriticos: 1,
};

describe("roiFromCounts", () => {
  it("suma ahorro de formación + transferencia + eficiencia", () => {
    const r = roiFromCounts(facts, DEFAULT_ASSUMPTIONS);
    // 5*350 + 2*350 + (10*2*12*22) = 1750 + 700 + 5280 = 7730
    expect(r.retornoAnual).toBe(7730);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[2]?.amount).toBe(5280);
  });

  it("FUNDAE cubierto -> coste neto 0 cuando hay presupuesto", () => {
    const r = roiFromCounts(facts, { ...DEFAULT_ASSUMPTIONS, presupuestoFundaeAnual: 50000 });
    expect(r.fundae.cubierto).toBe(true);
    expect(r.fundae.costeNeto).toBe(0);
  });

  it("roiPct solo cuando hay coste de licencia; null si no", () => {
    expect(roiFromCounts(facts, DEFAULT_ASSUMPTIONS).roiPct).toBeNull();
    const r = roiFromCounts(facts, { ...DEFAULT_ASSUMPTIONS, costeLicenciaSkillUpAnual: 588 });
    expect(r.roiPct).toBe(Math.round(((7730 - 588) / 588) * 100));
  });

  it("riesgo abierto en euros = riesgos críticos * coste de reemplazo", () => {
    const r = roiFromCounts(facts, DEFAULT_ASSUMPTIONS);
    expect(r.riesgoAbiertoEur).toBe(8000);
  });
});
