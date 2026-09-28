import { describe, expect, it } from "vitest";
import { can, scopeOf } from "../src/auth/capabilities.js";
import {
  accessFor, beaconSchema, blockScores, completionFunnel, dailySeries, dayKey, isOnline, liveState, median, retentionCutoff,
  RETENTION_DAYS, streakDays, stuckSignals, teamResolvedAsOrg, visibleText, watch, watchersOf, WATCH_TTL_MS, type EvRow,
} from "../src/services/activity.js";
import { historyToLlm, mergeTurns } from "../src/agents/chat.js";

const NOW = new Date("2026-09-28T10:00:00Z");
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);
const ev = (sec: number, p: Partial<EvRow> = {}): EvRow => ({
  kind: "hb", page: "/app/curso.html", source: "outbound-sales", section: 2, sectionTitle: "Objeciones", scrollPct: 40,
  activeSec: 20, meta: null, createdAt: ago(sec), ...p,
});

describe("capabilities: live supervision", () => {
  const r = (role: string) => ({ role, platformAdmin: false });
  it("coach and team leader follow and intervene at team scope", () => {
    for (const role of ["coach", "team_leader"]) {
      expect(scopeOf(r(role), "activity.read")).toBe("team");
      expect(can(r(role), "activity.intervene", "team")).toBe(true);
      expect(can(r(role), "activity.read", "org")).toBe(false);
    }
  });
  it("admin and direccion at org scope", () => {
    for (const role of ["admin", "direccion"]) {
      expect(can(r(role), "activity.read", "org")).toBe(true);
      expect(can(r(role), "activity.intervene", "org")).toBe(true);
    }
  });
  it("inspirador only sees aggregated metrics, never follows people", () => {
    const a = accessFor(r("inspirador"));
    expect(a.metrics).toBe("org");
    expect(a.read).toBeNull();
    expect(a.intervene).toBeNull();
  });
  it("empleado has nothing", () => {
    expect(accessFor(r("empleado"))).toEqual({ metrics: null, read: null, intervene: null });
  });
  it("superadmin is global", () => {
    expect(accessFor({ role: "empleado", platformAdmin: true })).toEqual({ metrics: "global", read: "global", intervene: "global" });
  });
  it("team scope is resolved as the whole org (no team structure yet)", () => {
    expect(teamResolvedAsOrg("team")).toBe(true);
    expect(teamResolvedAsOrg("org")).toBe(false);
  });
});

describe("online window and retention", () => {
  it("online means a heartbeat within the last 60 s", () => {
    expect(isOnline(ago(59), NOW)).toBe(true);
    expect(isOnline(ago(60), NOW)).toBe(true);
    expect(isOnline(ago(61), NOW)).toBe(false);
    expect(isOnline(null, NOW)).toBe(false);
  });
  it("events older than 90 days are cut", () => {
    expect(RETENTION_DAYS).toBe(90);
    expect(retentionCutoff(NOW).toISOString()).toBe("2026-06-30T10:00:00.000Z");
  });
});

describe("liveState", () => {
  it("tracks current section, continuous time in it and today's active time", () => {
    const s = liveState([
      ev(900, { section: 1, sectionTitle: "Intro" }), ev(600), ev(300), ev(20, { kind: "video", meta: { title: "Llamada en frío" }, activeSec: 0 }), ev(10),
    ], NOW)!;
    expect(s.online).toBe(true);
    expect(s.idle).toBe(false);
    expect(s.section).toBe(2);
    expect(s.sectionSinceSec).toBe(600);
    expect(s.activeSecToday).toBe(80);
    expect(s.lastActions[0]!.label).toBe("Abrió un vídeo · Llamada en frío");
  });
  it("online without real interaction for 90 s is idle", () => {
    const s = liveState([ev(200), ev(40, { activeSec: 0 }), ev(20, { activeSec: 0 })], NOW)!;
    expect(s.online).toBe(true);
    expect(s.idle).toBe(true);
  });
  it("ignores supervisor nudges as learner activity", () => {
    expect(liveState([ev(10, { kind: "nudge", page: null })], NOW)).toBeNull();
  });
});

describe("stuck signals", () => {
  const base = { lastSeenAt: ago(10), blockAttempts: [], openRoleplays: [] };
  it("flags 12+ min on the same section only while online", () => {
    const s = liveState([ev(13 * 60), ev(10)], NOW);
    expect(stuckSignals({ ...base, state: s }, NOW).map((x) => x.code)).toEqual(["seccion"]);
    const short = liveState([ev(11 * 60), ev(10)], NOW);
    expect(stuckSignals({ ...base, state: short }, NOW)).toEqual([]);
  });
  it("flags two fails of the same block quiz with no pass after them", () => {
    const f = (sec: number, passed: boolean) => ({ source: "outbound-sales", block: 1, passed, at: ago(sec) });
    expect(stuckSignals({ ...base, state: null, blockAttempts: [f(300, false), f(200, false)] }, NOW)[0]!.label).toBe("2 suspensos en el test del bloque 2");
    expect(stuckSignals({ ...base, state: null, blockAttempts: [f(300, false), f(200, false), f(100, true)] }, NOW)).toEqual([]);
  });
  it("flags roleplays open for 30+ min and 7+ days without activity", () => {
    const s = stuckSignals({ state: null, lastSeenAt: ago(8 * 86400), blockAttempts: [], openRoleplays: [{ createdAt: ago(31 * 60), turns: 2 }, { createdAt: ago(60), turns: 0 }] }, NOW);
    expect(s.map((x) => x.code)).toEqual(["roleplay", "inactivo"]);
    expect(s[1]!.label).toBe("Sin actividad desde hace 8 días");
  });
});

describe("chat transcript and human coach turns", () => {
  it("never shows the internal instructions curso.html prepends", () => {
    expect(visibleText({ sender: "user", content: "[Eres Diego, tutor. Responde breve.] ¿Y si me dicen que no?", display: null })).toBe("¿Y si me dicen que no?");
    expect(visibleText({ sender: "user", content: "[Eres Diego. Actualiza el contexto. Texto plano, sin símbolos.] ", display: null })).toBeNull();
    expect(visibleText({ sender: "user", content: "[interno]", display: "hola" })).toBe("hola");
    expect(visibleText({ sender: "user", content: "hola", display: null })).toBe("hola");
  });
  it("the tutor sees the human message, marked, merged with its own turn", () => {
    const msgs = mergeTurns(historyToLlm([
      { sender: "user", content: "duda" }, { sender: "agent", content: "respuesta" },
      { sender: "coach", content: "Prueba con el guion 2", authorName: "Marta", authorRole: "Coach" },
    ]));
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual({ role: "assistant", content: "respuesta\n\n[Mensaje de Marta, Coach] Prueba con el guion 2" });
  });
});

describe("watchers (learner indicator)", () => {
  it("a supervisor stays visible while the detail keeps refreshing, then expires", () => {
    watch("o1", "u1", { userId: "s1", name: "Marta", role: "Coach" }, 1000);
    expect(watchersOf("o1", "u1", 1000 + WATCH_TTL_MS)).toEqual([{ name: "Marta", role: "Coach" }]);
    expect(watchersOf("o1", "u1", 1001 + WATCH_TTL_MS)).toEqual([]);
    expect(watchersOf("o2", "u1", 1000)).toEqual([]); // otra empresa
  });
});

describe("beacon validation", () => {
  it("accepts a normal batch and rejects server-only kinds or oversized batches", () => {
    expect(beaconSchema.safeParse({ events: [{ kind: "hb", page: "/app/curso.html", source: "outbound-sales", section: 3, scrollPct: 50, activeSec: 20 }] }).success).toBe(true);
    expect(beaconSchema.safeParse({ events: [{ kind: "nudge" }] }).success).toBe(false);
    expect(beaconSchema.safeParse({ events: [{ kind: "hb", source: "../etc" }] }).success).toBe(false);
    expect(beaconSchema.safeParse({ events: Array.from({ length: 41 }, () => ({ kind: "hb" })) }).success).toBe(false);
  });
});

describe("metrics", () => {
  it("daily series zero-fills and buckets by Spanish day", () => {
    const s = dailySeries([
      { userId: "a", hour: new Date("2026-09-27T22:30:00Z"), activeSec: 600, sessions: 1 }, // 28-sep 00:30 en Madrid
      { userId: "b", hour: new Date("2026-09-28T08:00:00Z"), activeSec: 300, sessions: 2 },
      { userId: "a", hour: new Date("2026-09-26T10:00:00Z"), activeSec: 120, sessions: 1 },
    ], 3, NOW);
    expect(s.map((d) => d.day)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
    expect(s[2]).toEqual({ day: "2026-09-28", activeMin: 15, users: 2, sessions: 3 });
    expect(s[1]).toEqual({ day: "2026-09-27", activeMin: 0, users: 0, sessions: 0 });
  });
  it("streak counts consecutive active days up to today (or yesterday)", () => {
    const d = (n: number) => dayKey(new Date(NOW.getTime() - n * 86400000));
    expect(streakDays(new Set([d(0), d(1), d(2), d(4)]), NOW)).toBe(3);
    expect(streakDays(new Set([d(1), d(2)]), NOW)).toBe(2);
    expect(streakDays(new Set(), NOW)).toBe(0);
  });
  it("completion funnel counts distinct people per stage", () => {
    const f = completionFunnel({
      started: [{ userId: "a", source: "x" }, { userId: "b", source: "x" }, { userId: "c", source: "x" }],
      blocks: [
        { userId: "a", source: "x", kind: "block", passed: true, status: "corregido" },
        { userId: "a", source: "x", kind: "block", passed: true, status: "corregido" },
        { userId: "b", source: "x", kind: "block", passed: false, status: "corregido" },
        { userId: "a", source: "x", kind: "final", passed: true, status: "corregido" },
      ],
      certs: [{ userId: "a", source: "x" }],
    });
    expect(f).toEqual([{ source: "x", started: 3, blockPassed: 1, finalTaken: 1, certified: 1 }]);
  });
  it("block scores: average, pass rate and n, hardest first", () => {
    const b = blockScores([
      { source: "x", block: 0, score: 90, passed: true }, { source: "x", block: 0, score: 70, passed: true },
      { source: "x", block: 1, score: 40, passed: false }, { source: "x", block: 1, score: 80, passed: true },
      { source: "x", block: 1, score: null, passed: null },
    ]);
    expect(b).toEqual([
      { source: "x", block: 1, n: 2, avg: 60, passRate: 50 },
      { source: "x", block: 0, n: 2, avg: 80, passRate: 100 },
    ]);
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("heatmap, AI summaries and help gating", () => {
  it("heatmap buckets active minutes by Spanish weekday and hour", async () => {
    const { heatmap } = await import("../src/services/activity.js");
    const g = heatmap([{ hour: new Date("2026-09-28T08:00:00Z"), activeSec: 600 }]); // lunes 10:00 en Madrid
    expect(g[0]![10]).toBe(10);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(10);
  });
  it("org facts say «Sin datos» instead of inventing", async () => {
    const { orgFacts } = await import("../src/services/activity.js");
    const f = orgFacts({
      days: 30, members: 4, active: { dau: 0, wau: 0, mau: 0 }, totals: { activeMin: 0, sessions: 0, onlineNow: 0 }, series: [], heatmap: [],
      funnel: [], blockScores: [], timeToCertifyDays: { median: null, n: 0 },
      roleplays: { started: 0, closed: 0, abandoned: 0, avgScore: null, scoredN: 0 }, struggling: [],
    } as never);
    expect(f).toContain("Embudo por curso: Sin datos.");
    expect(f).toContain("Notas por bloque: Sin datos.");
    expect(f).toContain("Tiempo hasta certificarse: Sin datos.");
  });
  it("summaries are cached per target for 15 min and use the given (fast) model", async () => {
    const { summarize } = await import("../src/services/activity.js");
    const calls: { model?: string; kind?: string }[] = [];
    const llm = { generate: async (c: { model?: string; kind?: string }) => { calls.push(c); return "Cómo va: **bien**"; } };
    const a = { orgId: "oS", supervisorId: "s", target: "u9", kind: "person" as const, facts: "x", model: "fast-model" };
    const r1 = await summarize(llm, a);
    const r2 = await summarize(llm, a);
    expect(r1.text).toBe("Cómo va: bien");
    expect(r2.cached).toBe(true);
    expect(calls).toEqual([expect.objectContaining({ model: "fast-model", kind: "supervision_summary" })]);
    await summarize(llm, { ...a, refresh: true });
    expect(calls).toHaveLength(2);
  });
  it("supervision help is never given to an employee; inspirador gets metrics only", async () => {
    const { helpSteps } = await import("../src/services/activity.js");
    expect(helpSteps(accessFor({ role: "empleado", platformAdmin: false }))).toEqual([]);
    const insp = helpSteps(accessFor({ role: "inspirador", platformAdmin: false })).map((s) => s.h);
    expect(insp).toContain("Métricas de uso");
    expect(insp).not.toContain("Escribir en su chat");
    expect(helpSteps(accessFor({ role: "coach", platformAdmin: false })).map((s) => s.h)).toContain("Escribir en su chat");
  });
});
