import { describe, expect, it } from "vitest";
import {
  AI_COST_ALERT_PCT, churnRisk, costAlert, costRatio, healthScore, monthlyRevenueEur, rankCourses, retoStatus, topActions, trackingDays,
  type CourseRow,
} from "../src/services/dashboards.js";

const NOW = new Date("2026-10-20T10:00:00Z");

describe("healthScore", () => {
  it("weights adoption 40, progress 35, recency 25", () => {
    // 5/10 activas, 2/10 con bloque aprobado, actividad hoy
    expect(healthScore({ seats: 10, active30: 5, learnersWithBlock: 2, daysSinceLast: 0 }).score).toBe(Math.round(100 * (0.4 * 0.5 + 0.35 * 0.2 + 0.25 * 1)));
  });
  it("recency decays to 0 at 14 days and never-active counts as 0", () => {
    expect(healthScore({ seats: 4, active30: 0, learnersWithBlock: 0, daysSinceLast: 14 }).score).toBe(0);
    expect(healthScore({ seats: 4, active30: 0, learnersWithBlock: 0, daysSinceLast: null }).recency).toBe(0);
    expect(healthScore({ seats: 4, active30: 4, learnersWithBlock: 4, daysSinceLast: 7 }).recency).toBe(50);
  });
  it("a part without data spreads its weight instead of counting as zero", () => {
    const h = healthScore({ seats: 10, active30: null, learnersWithBlock: 10, daysSinceLast: 0 });
    expect(h.adoption).toBeNull();
    expect(h.score).toBe(100);
  });
  it("no seats, no score; ratios capped at 100 %", () => {
    expect(healthScore({ seats: 0, active30: 3, learnersWithBlock: 1, daysSinceLast: 0 }).score).toBeNull();
    expect(healthScore({ seats: 2, active30: 5, learnersWithBlock: 5, daysSinceLast: 0 }).score).toBe(100);
  });
});

describe("churnRisk", () => {
  const base = { seats: 10, active30: 8, daysSinceLast: 1, min7: 100, minPrev7: 100, trackingDays: 30 };
  it("healthy company is low risk with no reasons", () => {
    expect(churnRisk(base)).toEqual({ level: "bajo", reasons: [] });
  });
  it("inactivity ≥ 14 days is medium, ≥ 30 or never is high", () => {
    expect(churnRisk({ ...base, daysSinceLast: 15 }).level).toBe("medio");
    expect(churnRisk({ ...base, daysSinceLast: 31 }).level).toBe("alto");
    expect(churnRisk({ ...base, daysSinceLast: null }).reasons[0]).toMatch(/Nunca/);
  });
  it("falling usage needs 14 tracked days and a meaningful previous week", () => {
    expect(churnRisk({ ...base, min7: 20, minPrev7: 100 }).reasons[0]).toMatch(/cae un 80 %/);
    expect(churnRisk({ ...base, min7: 20, minPrev7: 100, trackingDays: 10 }).reasons).toEqual([]);
    expect(churnRisk({ ...base, min7: 5, minPrev7: 20 }).reasons).toEqual([]); // semana anterior < 30 min: ruido
  });
  it("low seat usage needs 7 tracked days and 3 seats; two reasons = high", () => {
    expect(churnRisk({ ...base, active30: 2 }).reasons[0]).toBe("Solo 2 de 10 personas activas en 30 días");
    expect(churnRisk({ ...base, active30: 2, trackingDays: 3 }).reasons).toEqual([]);
    expect(churnRisk({ ...base, seats: 2, active30: 0 }).reasons).toEqual([]);
    expect(churnRisk({ ...base, active30: 2, daysSinceLast: 20 }).level).toBe("alto");
  });
});

describe("economics", () => {
  const price = { texto: 900 };
  it("revenue = seats × price only for paying plans", () => {
    expect(monthlyRevenueEur({ status: "active", seats: 10, tier: "texto" }, price)).toBe(90);
    expect(monthlyRevenueEur({ status: "trialing", seats: 10, tier: "texto" }, price)).toBe(0);
    expect(monthlyRevenueEur({ status: "canceled", seats: 10, tier: "texto" }, price)).toBeNull();
    expect(monthlyRevenueEur({ status: "active", seats: 10, tier: "otro" }, price)).toBeNull();
    expect(monthlyRevenueEur(null, price)).toBeNull();
  });
  it("cost ratio converts dollars and flags above threshold or AI spend without revenue", () => {
    expect(costRatio(10, 100, 0.9)).toBe(9);
    expect(costRatio(10, 0)).toBeNull();
    expect(costRatio(10, null)).toBeNull();
    expect(costAlert(AI_COST_ALERT_PCT + 0.1, 1, 10)).toBe(true);
    expect(costAlert(5, 1, 10)).toBe(false);
    expect(costAlert(null, 3, 0)).toBe(true);
    expect(costAlert(null, 3, null)).toBe(false);
  });
});

describe("rankCourses", () => {
  const row = (p: Partial<CourseRow>): CourseRow => ({
    source: "a", title: "A", started: 10, blockPassed: 8, finalTaken: 5, certified: 4, worstBlock: null, finals: { n: 5, passed: 4 }, roleplays: 0, ...p,
  });
  it("orders by people lost, boosted ×1.5 by a hard block with enough sample", () => {
    const r = rankCourses([
      row({ source: "a", title: "A", started: 10, certified: 4 }), // 6 perdidas
      row({ source: "b", title: "B", started: 8, blockPassed: 3, certified: 3, worstBlock: { block: 1, avg: 55, n: 4, passRate: 25 } }), // 5 × 1,5
      row({ source: "c", title: "C", started: 0 }),
    ]);
    expect(r.map((x) => x.source)).toEqual(["b", "a"]);
    expect(r[0]!.priority).toBe(7.5);
    expect(r[0]!.reasons).toEqual(["Se quedan 5 personas entre empezar y aprobar un bloque", "Bloque 2 difícil: nota media 55/100 (n=4)"]);
  });
  it("small samples do not count as hard", () => {
    const r = rankCourses([row({ worstBlock: { block: 0, avg: 30, n: 2, passRate: 0 } })]);
    expect(r[0]!.priority).toBe(6);
    expect(r[0]!.completionPct).toBe(40);
  });
});

describe("assigned tests and actions", () => {
  it("status of an assigned test", () => {
    expect(retoStatus({ estado: "hecho" }, NOW)).toBe("hecha");
    expect(retoStatus({ estado: "en_validacion" }, NOW)).toBe("en_validacion");
    expect(retoStatus({ estado: "pendiente", programadoPara: "2026-10-21T10:00:00Z" }, NOW)).toBe("programada");
    expect(retoStatus({ estado: "pendiente", programadoPara: "2026-10-20T08:00:00Z" }, NOW)).toBe("pendiente");
    expect(retoStatus({ estado: "pendiente", programadoPara: "2026-10-18T08:00:00Z" }, NOW)).toBe("vencida");
    expect(retoStatus({ estado: "pendiente" }, NOW)).toBe("pendiente");
  });
  it("top actions: at most 3, most urgent first, only measured facts", () => {
    const a = topActions({
      struggling: [{ userId: "u1", name: "Ana", signals: [{ label: "2 suspensos en el test del bloque 3" }] }, { userId: "u2", name: "Luis", signals: [{ label: "x" }] }],
      courses: rankCourses([{ source: "a", title: "Outbound", started: 5, blockPassed: 1, finalTaken: 0, certified: 0, worstBlock: null, finals: { n: 0, passed: 0 }, roleplays: 0 }]),
      pendingValidations: 2, overdueTests: 1, members: 10, active7: 4, trackingDays: 20,
    });
    expect(a.map((x) => x.kind)).toEqual(["escribir", "curso", "validar"]);
    expect(a[0]!.text).toBe("Escribe a Ana (2 suspensos en el test del bloque 3) y a 1 persona más con señales.");
    expect(a[0]!.href).toBe("/app/en-directo.html?persona=u1");
  });
  it("adoption action only after a week of tracking", () => {
    const x = { struggling: [], courses: [], pendingValidations: 0, overdueTests: 0, members: 10, active7: 4 };
    expect(topActions({ ...x, trackingDays: 3 })).toEqual([]);
    expect(topActions({ ...x, trackingDays: 8 })[0]!.text).toBe("6 de 10 personas sin actividad en 7 días.");
  });
  it("tracking days count from 2026-09-28", () => {
    expect(trackingDays(new Date("2026-09-28T20:00:00Z"))).toBe(0);
    expect(trackingDays(NOW)).toBe(22);
  });
});
