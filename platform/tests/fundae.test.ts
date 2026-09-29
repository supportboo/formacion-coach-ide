import { describe, expect, it } from "vitest";
import { expediente } from "../src/services/fundae.js";

const D = (s: string) => new Date(s + "T00:00:00Z");
const base = {
  id: "a1", organizationId: "o", title: "Ventas", competencyId: "c1", modalidad: "teleformacion", horas: 20,
  relatedPuesto: null, tutorId: "t1", esCertProfesionalidad: false, createdAt: D("2026-09-01"),
  startDate: D("2026-11-02"), endDate: D("2026-11-30"), rltInformedAt: D("2026-10-10"), fundaeNotifiedAt: D("2026-10-28"), qualitySurveyAt: null,
};
const estado = (checks: ReturnType<typeof expediente>, punto: string) => checks.find((c) => c.punto.startsWith(punto))?.estado;

describe("expediente FUNDAE (1.17.0)", () => {
  it("con todo en plazo antes del inicio no hay faltas", () => {
    const c = expediente(base, [], new Set(), D("2026-10-29"));
    expect(c.filter((x) => x.estado === "falta")).toEqual([]);
  });
  it("RLT informada con menos de 15 días es falta", () => {
    expect(estado(expediente({ ...base, rltInformedAt: D("2026-10-25") }, [], new Set(), D("2026-10-29")), "Información")).toBe("falta");
  });
  it("sin comunicar a FUNDAE a 1 día del inicio es falta; con margen es pendiente", () => {
    expect(estado(expediente({ ...base, fundaeNotifiedAt: null }, [], new Set(), D("2026-11-01")), "Comunicación")).toBe("falta");
    expect(estado(expediente({ ...base, fundaeNotifiedAt: null }, [], new Set(), D("2026-10-01")), "Comunicación")).toBe("aviso");
  });
  it("más de 80 participantes por tutor es falta", () => {
    const parts = Array.from({ length: 81 }, (_, i) => ({ userId: "u" + i, finalizado: false }));
    expect(estado(expediente(base, parts, new Set(), D("2026-10-29")), "Tutor")).toBe("falta");
  });
  it("más de 8 h al día es falta", () => {
    expect(estado(expediente({ ...base, horas: 20, endDate: D("2026-11-03") }, [], new Set(), D("2026-10-29")), "Fechas")).toBe("falta");
  });
  it("terminada sin cuestionario de calidad es falta; diplomas tarde también", () => {
    const c = expediente(base, [{ userId: "u1", finalizado: true }], new Set(), D("2027-02-15"));
    expect(estado(c, "Cuestionario")).toBe("falta");
    expect(estado(c, "Diplomas")).toBe("falta");
    expect(estado(expediente(base, [{ userId: "u1", finalizado: true }], new Set(["u1"]), D("2027-02-15")), "Diplomas")).toBe("ok");
  });
});
