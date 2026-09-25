import { describe, expect, it } from "vitest";
import { summarizeCheckins } from "../src/services/followup.js";

describe("summarizeCheckins — ROI de aplicación, cero cifras inventadas", () => {
  it("sin check-ins devuelve todo a 0/null, nunca un número falso", () => {
    const r = summarizeCheckins([]);
    expect(r).toEqual({ checkins: 0, aplica: 0, parcial: 0, noAplica: 0, tasaAplicacion: null, sensacionMedia: null });
  });

  it("cuenta aplica/parcial/no y calcula tasa e (aplica+parcial)/total", () => {
    const notes = [
      JSON.stringify({ aplica: "si", sensacion: 5 }),
      JSON.stringify({ aplica: "parcial", sensacion: 3 }),
      JSON.stringify({ aplica: "no" }),
      JSON.stringify({ aplica: "si", sensacion: 4 }),
    ];
    const r = summarizeCheckins(notes);
    expect(r.checkins).toBe(4);
    expect(r.aplica).toBe(2);
    expect(r.parcial).toBe(1);
    expect(r.noAplica).toBe(1);
    expect(r.tasaAplicacion).toBe(75); // (2+1)/4
    expect(r.sensacionMedia).toBe(4);  // (5+3+4)/3
  });

  it("ignora notas no-JSON o corruptas sin romper", () => {
    const r = summarizeCheckins([null, "no es json", JSON.stringify({ aplica: "si" })]);
    expect(r.checkins).toBe(3);
    expect(r.aplica).toBe(1);
    expect(r.tasaAplicacion).toBe(100); // solo 1 con aplica válido, y aplica
    expect(r.sensacionMedia).toBe(null); // ninguna sensación numérica
  });
});
