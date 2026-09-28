// Cuadros de mando por rol (1.4.0): una pregunta por cifra y la acción que dispara.
//   - Superadmin (dueño de la plataforma): salud de cada empresa, economía (coste IA frente a ingresos),
//     rendimiento de los cursos entre empresas, salud técnica y qué aprende el sistema de verdad.
//   - Admin / dirección: adopción, resultados, práctica, Team DNA, ROI y las 3 acciones de la semana.
//   - Team leader / coach: quién necesita ayuda hoy, progreso por persona, pruebas asignadas y validaciones.
// Doctrina: nunca se inventa una cifra. Cada una sale de una tabla, lleva su definición y su n, y si no hay
// datos se dice. Las reglas (salud, riesgo de baja, coste, prioridad de cursos) son funciones puras con tests.
import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import {
  activityEvent, agentMessage, agentThread, aiUsage, annotation, appliedCase, assessmentAttempt, certificate, member, organization,
  pricingTier, ragDocument, roleplaySession, subscription, teamDna, teamProfile,
} from "../db/schema.js";
import * as act from "./activity.js";
import { usdCost } from "./costs.js";
import * as roi from "./roi.js";
import type { SvcDeps } from "./org.js";

const DAY = 86_400_000;
/** El registro de actividad (activity_event) empezó con la 1.3.0: antes de esta fecha no hay datos de uso. */
export const TRACKING_SINCE = "2026-09-28";
/** Tipo de cambio fijo para comparar coste IA ($) con ingresos (€). Estimado; se ajusta con USD_EUR_RATE. */
export const USD_EUR = Number(process.env.USD_EUR_RATE) > 0 ? Number(process.env.USD_EUR_RATE) : 0.92;
export const AI_COST_ALERT_PCT = 20;          // coste IA por encima del 20 % de lo que paga la empresa = alerta
export const HEALTH_WEIGHTS = { adoption: 0.4, progress: 0.35, recency: 0.25 } as const;
export const RECENCY_WINDOW_DAYS = 14;        // actividad hace 0 días = 1; hace 14 o más = 0
export const CHURN_INACTIVE_DAYS = 14;
export const LOW_SEAT_PCT = 30;               // menos del 30 % de la plantilla activa en 30 días
export const FALLING_PCT = 50;                // el uso de 7 días cae a menos de la mitad de los 7 anteriores
export const HARD_BLOCK_AVG = 70;             // nota media de bloque por debajo de 70 = bloque difícil
export const HARD_BLOCK_MIN_N = 3;

const round1 = (x: number) => Math.round(x * 10) / 10;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`; // SQL crudo: postgres-js no acepta Date
export const trackingDays = (now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(TRACKING_SINCE + "T00:00:00Z")) / DAY));

/* ================================================================ reglas puras (con tests) */

export interface HealthIn { seats: number; active30: number | null; learnersWithBlock: number; daysSinceLast: number | null }
export interface Health { score: number | null; adoption: number | null; progress: number | null; recency: number | null }
/**
 * Salud 0-100 = 40 % adopción (personas activas en 30 días / plantilla) + 35 % progreso (personas con algún
 * bloque aprobado / plantilla) + 25 % recencia (1 si hubo actividad hoy, 0 si hace 14 días o más).
 * Una parte sin datos no cuenta como 0: se reparte su peso entre las demás. Sin plantilla, sin nota.
 */
export function healthScore(h: HealthIn): Health {
  if (h.seats <= 0) return { score: null, adoption: null, progress: null, recency: null };
  const adoption = h.active30 == null ? null : Math.min(1, h.active30 / h.seats);
  const progress = Math.min(1, h.learnersWithBlock / h.seats);
  const recency = h.daysSinceLast == null ? 0 : Math.max(0, 1 - h.daysSinceLast / RECENCY_WINDOW_DAYS);
  const parts: [number | null, number][] = [[adoption, HEALTH_WEIGHTS.adoption], [progress, HEALTH_WEIGHTS.progress], [recency, HEALTH_WEIGHTS.recency]];
  const used = parts.filter((p): p is [number, number] => p[0] != null);
  const w = used.reduce((a, p) => a + p[1], 0);
  return {
    score: w ? Math.round((used.reduce((a, p) => a + p[0] * p[1], 0) / w) * 100) : null,
    adoption: adoption == null ? null : Math.round(adoption * 100), progress: Math.round(progress * 100), recency: Math.round(recency * 100),
  };
}

export interface ChurnIn { seats: number; active30: number | null; daysSinceLast: number | null; min7: number | null; minPrev7: number | null; trackingDays: number }
export interface Churn { level: "alto" | "medio" | "bajo"; reasons: string[] }
/** Riesgo de baja con el motivo a la vista. Cada regla solo se aplica si hay datos suficientes para ella. */
export function churnRisk(c: ChurnIn): Churn {
  const reasons: string[] = [];
  let severe = false;
  if (c.seats > 0 && c.daysSinceLast == null) { reasons.push("Nunca ha habido actividad registrada"); severe = true; }
  else if (c.daysSinceLast != null && c.daysSinceLast >= CHURN_INACTIVE_DAYS) {
    reasons.push(`Sin actividad desde hace ${c.daysSinceLast} días`); if (c.daysSinceLast >= 30) severe = true;
  }
  if (c.trackingDays >= 14 && c.min7 != null && c.minPrev7 != null && c.minPrev7 >= 30 && c.min7 < c.minPrev7 * (FALLING_PCT / 100)) {
    reasons.push(`El uso cae un ${Math.round((1 - c.min7 / c.minPrev7) * 100)} % (${c.min7} min en 7 días frente a ${c.minPrev7} min los 7 anteriores)`);
  }
  if (c.trackingDays >= 7 && c.seats >= 3 && c.active30 != null && (c.active30 / c.seats) * 100 < LOW_SEAT_PCT) {
    reasons.push(`Solo ${c.active30} de ${c.seats} personas activas en 30 días`);
  }
  return { level: severe || reasons.length >= 2 ? "alto" : reasons.length ? "medio" : "bajo", reasons };
}

/** Lo que paga la empresa al mes según su plan (asientos × precio por asiento). Null = Sin datos. */
export function monthlyRevenueEur(sub: { status: string; seats: number; tier: string } | null, priceCents: Record<string, number>): number | null {
  if (!sub) return null;
  if (sub.status === "trialing") return 0;
  if (sub.status !== "active" && sub.status !== "past_due") return null;
  const p = priceCents[sub.tier];
  return p == null ? null : round1((sub.seats * p) / 100);
}

/** Coste IA en % de lo que paga la empresa. Null si no paga (no hay ingreso con el que comparar). */
export function costRatio(aiUsd: number, revenueEur: number | null, fx = USD_EUR): number | null {
  if (revenueEur == null || revenueEur <= 0) return null;
  return round1(((aiUsd * fx) / revenueEur) * 100);
}
export const costAlert = (pct: number | null, aiUsd: number, revenueEur: number | null) =>
  (pct != null && pct > AI_COST_ALERT_PCT) || (revenueEur === 0 && aiUsd > 0);

export interface CourseRow {
  source: string; title: string; started: number; blockPassed: number; finalTaken: number; certified: number;
  worstBlock: { block: number; avg: number; n: number; passRate: number } | null;
  finals: { n: number; passed: number }; roleplays: number;
}
/**
 * Qué curso arreglar primero: prioridad = personas que lo empiezan y no se certifican × 1,5 si tiene un bloque
 * difícil (nota media < 70 con n ≥ 3). El motivo es el tramo del embudo donde más gente se queda.
 */
export function rankCourses(rows: CourseRow[]) {
  return rows.filter((r) => r.started > 0).map((r) => {
    const hard = !!r.worstBlock && r.worstBlock.n >= HARD_BLOCK_MIN_N && r.worstBlock.avg < HARD_BLOCK_AVG;
    const lost = r.started - r.certified;
    const drops: [number, string][] = [
      [r.started - r.blockPassed, "entre empezar y aprobar un bloque"],
      [r.blockPassed - r.finalTaken, "entre aprobar bloques y hacer el examen final"],
      [r.finalTaken - r.certified, "entre el examen final y el certificado"],
    ];
    const worst = drops.reduce((a, b) => (b[0] > a[0] ? b : a));
    const reasons: string[] = [];
    if (worst[0] > 0) reasons.push(worst[0] === 1 ? `Se queda 1 persona ${worst[1]}` : `Se quedan ${worst[0]} personas ${worst[1]}`);
    if (hard) reasons.push(`Bloque ${r.worstBlock!.block + 1} difícil: nota media ${r.worstBlock!.avg}/100 (n=${r.worstBlock!.n})`);
    return { ...r, priority: round1(lost * (hard ? 1.5 : 1)), completionPct: Math.round((r.certified / r.started) * 100), reasons };
  }).sort((a, b) => b.priority - a.priority || b.started - a.started);
}

export interface RetoLite { id?: string; tipo?: string; titulo?: string; estado?: string; programadoPara?: string | null; createdAt?: string; score?: number; resultado?: string; curso?: string; byId?: string }
export type RetoStatus = "hecha" | "en_validacion" | "vencida" | "programada" | "pendiente";
/** Estado de una prueba asignada. Vencida = tenía fecha, pasó hace más de 24 h y no está hecha. */
export function retoStatus(r: RetoLite, now: Date): RetoStatus {
  if (r.estado === "hecho") return "hecha";
  if (r.estado === "en_validacion") return "en_validacion";
  const t = r.programadoPara ? Date.parse(r.programadoPara) : NaN;
  if (Number.isFinite(t)) return t > now.getTime() ? "programada" : now.getTime() - t > DAY ? "vencida" : "pendiente";
  return "pendiente";
}

export interface ActionItem { kind: "escribir" | "curso" | "validar" | "pruebas" | "adopcion"; text: string; href: string }
/** Las 3 acciones de la semana para dirección, en orden de urgencia. Solo hechos medidos. */
export function topActions(a: {
  struggling: { userId: string; name: string; signals: { label: string }[] }[];
  courses: ReturnType<typeof rankCourses>;
  pendingValidations: number; overdueTests: number; members: number; active7: number | null; trackingDays: number;
}): ActionItem[] {
  const out: ActionItem[] = [];
  if (a.struggling.length) {
    const p = a.struggling[0]!;
    out.push({ kind: "escribir", href: `/app/en-directo.html?persona=${encodeURIComponent(p.userId)}`,
      text: `Escribe a ${p.name} (${p.signals[0]?.label || "señal de atasco"})${a.struggling.length > 1 ? ` y a ${a.struggling.length - 1} persona${a.struggling.length > 2 ? "s" : ""} más con señales` : ""}.` });
  }
  const c = a.courses[0];
  if (c && c.reasons.length) out.push({ kind: "curso", href: "/app/en-directo.html?tab=metrics", text: `«${c.title}» frena: ${c.reasons.join("; ")}.` });
  if (a.pendingValidations) out.push({ kind: "validar", href: "/app/validar.html", text: `${a.pendingValidations} caso${a.pendingValidations > 1 ? "s" : ""} práctico${a.pendingValidations > 1 ? "s esperan" : " espera"} validación: sin ella no suben de nivel.` });
  if (a.overdueTests) out.push({ kind: "pruebas", href: "/app/asignar.html", text: `${a.overdueTests} prueba${a.overdueTests > 1 ? "s asignadas vencidas" : " asignada vencida"} sin hacer.` });
  if (a.active7 != null && a.trackingDays >= 7 && a.members > 0 && a.members - a.active7 > 0) {
    out.push({ kind: "adopcion", href: "/app/en-directo.html", text: `${a.members - a.active7} de ${a.members} personas sin actividad en 7 días.` });
  }
  return out.slice(0, 3);
}

/* ================================================================ superadmin: cockpit de la plataforma */

const SYSTEM_NOTE_SOURCES = ["onboarding", "ruta", "reto", "glossary", "cuenta", "gcal_token", "video_feedback"];
const PERSONAL_NOTE_KINDS = ["highlight", "note", "question", "review"];

type CountRow = { orgId: string; n: number };
const byOrg = (rows: CountRow[]) => new Map(rows.map((r) => [r.orgId, Number(r.n) || 0]));

export const PERIODS = [7, 30, 90] as const;
export const periodOf = (q: unknown): number => (PERIODS as readonly number[]).includes(Number(q)) ? Number(q) : 30;

/** Días naturales (España) del periodo, del más antiguo a hoy. */
export function periodDays(days: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) { const d = act.dayKey(new Date(now.getTime() - i * DAY)); if (out[out.length - 1] !== d) out.push(d); }
  return out;
}

export async function platformCockpit(deps: SvcDeps, titles: Record<string, string>, days = 30, now = new Date()) {
  const db = deps.db;
  const d7 = new Date(now.getTime() - 7 * DAY), d14 = new Date(now.getTime() - 14 * DAY), d30 = new Date(now.getTime() - 30 * DAY), dP = new Date(now.getTime() - days * DAY);
  const cnt = sql<number>`count(*)::int`;
  const [orgs, members, subs, tiers, actRes, lastAtt, lastMsg, atts, certs, started, rps, usageOrg, usageDay, usageModel,
    profiles, dnas, onboard, glossary, notes, docs, threads, msgs30, pendingCases, dailyAct] = await Promise.all([
    db.select({ id: organization.id, name: organization.name, metadata: organization.metadata, createdAt: organization.createdAt }).from(organization),
    db.select({ orgId: member.organizationId, n: cnt }).from(member).groupBy(member.organizationId),
    db.select().from(subscription),
    db.select().from(pricingTier),
    db.execute(sql`
      select organization_id as org_id,
             count(distinct user_id) filter (where created_at >= ${ts(d7)})::int as a7,
             count(distinct user_id)::int as a30,
             coalesce(sum(active_sec), 0)::int as sec30,
             coalesce(sum(active_sec) filter (where created_at >= ${ts(d7)}), 0)::int as sec7,
             coalesce(sum(active_sec) filter (where created_at >= ${ts(d14)} and created_at < ${ts(d7)}), 0)::int as sec_prev7,
             max(created_at) as last_at
      from activity_event where kind not in ('nudge', 'notice') and created_at >= ${ts(d30)}
      group by 1`),
    db.select({ orgId: assessmentAttempt.organizationId, at: sql<Date>`max(${assessmentAttempt.startedAt})` }).from(assessmentAttempt).groupBy(assessmentAttempt.organizationId),
    db.select({ orgId: agentMessage.organizationId, at: sql<Date>`max(${agentMessage.createdAt})` }).from(agentMessage).where(eq(agentMessage.sender, "user")).groupBy(agentMessage.organizationId),
    // ponytail: todos los intentos en memoria; pasar a agregados SQL cuando haya decenas de miles.
    db.select({ orgId: assessmentAttempt.organizationId, userId: assessmentAttempt.userId, source: assessmentAttempt.source, kind: assessmentAttempt.kind,
      block: assessmentAttempt.block, score: assessmentAttempt.score, passed: assessmentAttempt.passed, status: assessmentAttempt.status }).from(assessmentAttempt),
    db.select({ orgId: certificate.organizationId, userId: certificate.userId, evidence: certificate.evidence, issuedAt: certificate.issuedAt }).from(certificate),
    db.selectDistinct({ orgId: activityEvent.organizationId, userId: activityEvent.userId, source: activityEvent.source }).from(activityEvent)
      .where(sql`${activityEvent.source} is not null and ${activityEvent.kind} not in ('nudge', 'notice')`),
    db.select({ orgId: roleplaySession.organizationId, source: roleplaySession.source, status: roleplaySession.status, createdAt: roleplaySession.createdAt }).from(roleplaySession),
    db.select({ orgId: aiUsage.organizationId, model: aiUsage.model, i: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`, o: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int` })
      .from(aiUsage).where(gte(aiUsage.createdAt, d30)).groupBy(aiUsage.organizationId, aiUsage.model),
    db.select({ day: sql<string>`to_char(${aiUsage.createdAt} at time zone 'Europe/Madrid', 'YYYY-MM-DD')`, model: aiUsage.model,
      i: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`, o: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int` })
      .from(aiUsage).where(gte(aiUsage.createdAt, dP)).groupBy(sql`1`, aiUsage.model),
    db.select({ model: aiUsage.model, n: cnt }).from(aiUsage).where(gte(aiUsage.createdAt, d30)).groupBy(aiUsage.model),
    db.select({ orgId: teamProfile.organizationId, n: cnt }).from(teamProfile).where(sql`${teamProfile.completedAt} is not null`).groupBy(teamProfile.organizationId),
    db.select({ orgId: teamDna.organizationId, n: cnt }).from(teamDna).groupBy(teamDna.organizationId),
    db.select({ orgId: annotation.organizationId, n: sql<number>`count(distinct ${annotation.userId})::int` }).from(annotation).where(eq(annotation.source, "onboarding")).groupBy(annotation.organizationId),
    db.select({ orgId: annotation.organizationId, n: cnt }).from(annotation).where(eq(annotation.source, "glossary")).groupBy(annotation.organizationId),
    db.select({ orgId: annotation.organizationId, n: cnt }).from(annotation)
      .where(and(inArray(annotation.kind, PERSONAL_NOTE_KINDS), notInArray(annotation.source, SYSTEM_NOTE_SOURCES))).groupBy(annotation.organizationId),
    db.select({ orgId: ragDocument.organizationId, n: cnt }).from(ragDocument).groupBy(ragDocument.organizationId),
    db.select({ orgId: agentThread.organizationId, n: cnt }).from(agentThread).groupBy(agentThread.organizationId),
    db.select({ orgId: agentMessage.organizationId, n: cnt }).from(agentMessage).where(and(eq(agentMessage.sender, "user"), gte(agentMessage.createdAt, d30))).groupBy(agentMessage.organizationId),
    db.select({ orgId: appliedCase.organizationId, n: cnt }).from(appliedCase).where(eq(appliedCase.status, "entregado")).groupBy(appliedCase.organizationId),
    db.execute(sql`
      select organization_id as org_id, to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as day,
             count(distinct user_id)::int as users, coalesce(sum(active_sec), 0)::int as sec
      from activity_event where kind not in ('nudge', 'notice') and created_at >= ${ts(dP)}
      group by 1, 2`),
  ]);

  const tDays = trackingDays(now);
  const memberN = byOrg(members as CountRow[]);
  const subBy = new Map(subs.map((s) => [s.organizationId, s]));
  const priceCents = Object.fromEntries(tiers.map((t) => [t.tier, t.pricePerSeatCents]));
  const tierLabel = Object.fromEntries(tiers.map((t) => [t.tier, t.label]));
  const actBy = new Map((actRes as unknown as { org_id: string; a7: number; a30: number; sec30: number; sec7: number; sec_prev7: number; last_at: Date | string | null }[])
    .map((r) => [r.org_id, r]));
  const lastA = new Map(lastAtt.map((r) => [r.orgId, r.at ? new Date(r.at) : null]));
  const lastM = new Map(lastMsg.map((r) => [r.orgId, r.at ? new Date(r.at) : null]));
  const usd = new Map<string | null, number>();
  for (const u of usageOrg) usd.set(u.orgId, (usd.get(u.orgId) ?? 0) + usdCost(u.model, Number(u.i), Number(u.o)));

  // Aprendizaje por empresa (desde siempre, dentro de la retención de cada tabla).
  const certRows = certs.map((c) => ({ orgId: c.orgId, userId: c.userId, source: String((c.evidence as { source?: string } | null)?.source || ""), issuedAt: c.issuedAt }));
  const perOrg = new Map<string, { started: Set<string>; certified: Set<string>; blocks: Set<string>; learners: Set<string>; certs: number; certs30: number }>();
  const po = (o: string) => perOrg.get(o) ?? perOrg.set(o, { started: new Set(), certified: new Set(), blocks: new Set(), learners: new Set(), certs: 0, certs30: 0 }).get(o)!;
  for (const s of started) if (s.source && titles[s.source]) po(s.orgId).started.add(`${s.userId}#${s.source}`);
  for (const a of atts) {
    const p = po(a.orgId); p.started.add(`${a.userId}#${a.source}`);
    if (a.kind === "block" && a.passed === true) { p.blocks.add(`${a.userId}#${a.source}#${a.block}`); p.learners.add(a.userId); }
  }
  for (const c of certRows) { const p = po(c.orgId); p.certs++; if (c.issuedAt >= d30) p.certs30++; if (c.source) p.certified.add(`${c.userId}#${c.source}`); }

  // Series diarias del periodo: por empresa (minutos activos) y globales sin la empresa de pruebas.
  const daysList = periodDays(days, now);
  const dayUsd = new Map<string, number>();
  for (const u of usageDay) dayUsd.set(u.day, (dayUsd.get(u.day) ?? 0) + usdCost(u.model, Number(u.i), Number(u.o)));
  const testOrg = new Set(orgs.filter((o) => /^QA\b/i.test(o.name)).map((o) => o.id));
  const orgTrend = new Map<string, Map<string, number>>();
  const gUsers = new Map<string, number>(), gMin = new Map<string, number>(), gCert = new Map<string, number>();
  for (const r of dailyAct as unknown as { org_id: string; day: string; users: number; sec: number }[]) {
    (orgTrend.get(r.org_id) ?? orgTrend.set(r.org_id, new Map()).get(r.org_id)!).set(r.day, Math.round(Number(r.sec) / 60));
    if (testOrg.has(r.org_id)) continue;
    gUsers.set(r.day, (gUsers.get(r.day) ?? 0) + Number(r.users)); gMin.set(r.day, (gMin.get(r.day) ?? 0) + Number(r.sec) / 60);
  }
  for (const c of certRows) if (!testOrg.has(c.orgId) && c.issuedAt >= dP) { const d = act.dayKey(c.issuedAt); gCert.set(d, (gCert.get(d) ?? 0) + 1); }

  const companies = orgs.map((o) => {
    let status = "activa"; try { const m = o.metadata ? JSON.parse(o.metadata) : {}; if (m && m.status) status = String(m.status); } catch { /* metadata no JSON */ }
    const seats = memberN.get(o.id) ?? 0;
    const a = actBy.get(o.id);
    const lastDates = [a?.last_at ? new Date(a.last_at) : null, lastA.get(o.id) ?? null, lastM.get(o.id) ?? null].filter((d): d is Date => !!d && !isNaN(d.getTime()));
    const last = lastDates.length ? new Date(Math.max(...lastDates.map((d) => d.getTime()))) : null;
    const daysSinceLast = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
    const p = perOrg.get(o.id);
    const active30 = a ? Number(a.a30) : 0, active7 = a ? Number(a.a7) : 0;
    const sub = subBy.get(o.id) ?? null;
    const revenueEur = monthlyRevenueEur(sub, priceCents);
    const aiUsd = Math.round((usd.get(o.id) ?? 0) * 100) / 100;
    const pct = costRatio(aiUsd, revenueEur);
    const inProgress = p ? [...p.started].filter((k) => !p.certified.has(k)).length : 0;
    return {
      orgId: o.id, name: o.name, status, test: testOrg.has(o.id), seats,
      trend: daysList.map((d) => orgTrend.get(o.id)?.get(d) ?? 0),
      active7, active30, activeMin30: a ? Math.round(Number(a.sec30) / 60) : 0,
      coursesInProgress: inProgress, blocksPassed: p?.blocks.size ?? 0, certificates: p?.certs ?? 0, certificates30: p?.certs30 ?? 0,
      lastActivityAt: last ? last.toISOString() : null, daysSinceLast,
      health: healthScore({ seats, active30, learnersWithBlock: p?.learners.size ?? 0, daysSinceLast }),
      churn: churnRisk({ seats, active30, daysSinceLast, min7: a ? Math.round(Number(a.sec7) / 60) : 0, minPrev7: a ? Math.round(Number(a.sec_prev7) / 60) : 0, trackingDays: tDays }),
      plan: sub ? { tier: sub.tier, tierLabel: tierLabel[sub.tier] ?? sub.tier, status: sub.status, seats: sub.seats, pricePerSeatEur: priceCents[sub.tier] != null ? priceCents[sub.tier]! / 100 : null } : null,
      revenueEur, aiUsd30: aiUsd, aiCostPct: pct, costAlert: costAlert(pct, aiUsd, revenueEur),
      pendingValidations: byOrg(pendingCases as CountRow[]).get(o.id) ?? 0,
    };
  }).sort((x, y) => Number(x.test) - Number(y.test) || (x.health.score ?? -1) - (y.health.score ?? -1));

  // Cursos entre empresas (personas distintas: la misma persona en dos empresas cuenta dos veces).
  const k = (o: string, u: string) => `${o}:${u}`;
  const funnel = act.completionFunnel({
    started: started.filter((s) => s.source && titles[s.source]).map((s) => ({ userId: k(s.orgId, s.userId), source: s.source! })),
    blocks: atts.map((a) => ({ userId: k(a.orgId, a.userId), source: a.source, kind: a.kind, passed: a.passed, status: a.status })),
    certs: certRows.filter((c) => c.source).map((c) => ({ userId: k(c.orgId, c.userId), source: c.source })),
  });
  const bScores = act.blockScores(atts.filter((a) => a.kind === "block" && a.status === "corregido"));
  const courses = rankCourses(funnel.map((f) => {
    const finals = atts.filter((a) => a.source === f.source && a.kind === "final" && a.status === "corregido");
    return {
      ...f, title: titles[f.source] || f.source,
      worstBlock: bScores.filter((b) => b.source === f.source && b.n >= HARD_BLOCK_MIN_N)[0] ?? bScores.filter((b) => b.source === f.source)[0] ?? null,
      finals: { n: finals.length, passed: finals.filter((a) => a.passed).length },
      roleplays: rps.filter((r) => r.source === f.source).length,
    };
  }).map((r) => ({ ...r, worstBlock: r.worstBlock ? { block: r.worstBlock.block, avg: r.worstBlock.avg, n: r.worstBlock.n, passRate: r.worstBlock.passRate } : null })));
  const hardestBlocks = bScores.slice(0, 5).map((b) => ({ ...b, title: titles[b.source] || b.source }));

  // Coste IA: tendencia diaria de la plataforma y reparto por modelo (qué proveedor respondió).
  const trend = daysList.map((d) => ({ day: d, usd: Math.round((dayUsd.get(d) ?? 0) * 100) / 100 }));
  const totalCalls = usageModel.reduce((a, m) => a + Number(m.n), 0);
  const real = companies.filter((c) => !c.test);
  const sum = (f: (c: typeof companies[number]) => number) => real.reduce((a, c) => a + f(c), 0);
  const revenueKnown = real.filter((c) => c.revenueEur != null);

  const learnMap = (rows: CountRow[]) => { const m = byOrg(rows); return real.reduce((a, c) => a + (m.get(c.orgId) ?? 0), 0); };
  const seatsReal = sum((c) => c.seats);

  const revenueDay = revenueKnown.length ? round1(revenueKnown.reduce((a, c) => a + (c.revenueEur ?? 0), 0) / 30) : null;
  return {
    generatedAt: now.toISOString(), trackingSince: TRACKING_SINCE, trackingDays: tDays, days,
    series: daysList.map((d) => ({
      day: d, users: gUsers.get(d) ?? 0, activeMin: Math.round(gMin.get(d) ?? 0), certificates: gCert.get(d) ?? 0,
      aiEur: Math.round((dayUsd.get(d) ?? 0) * USD_EUR * 100) / 100, revenueEur: revenueDay,
    })),
    rules: {
      health: `Salud (0-100) = ${HEALTH_WEIGHTS.adoption * 100} % adopción (activas en 30 días / plantilla) + ${HEALTH_WEIGHTS.progress * 100} % progreso (personas con algún bloque aprobado / plantilla) + ${HEALTH_WEIGHTS.recency * 100} % recencia (1 si hubo actividad hoy, 0 si hace ${RECENCY_WINDOW_DAYS} días o más). Si una parte no tiene datos, su peso se reparte entre las demás.`,
      churn: `Riesgo de baja: sin actividad ${CHURN_INACTIVE_DAYS} días o más; uso de 7 días por debajo del ${FALLING_PCT} % de los 7 anteriores (requiere 14 días de seguimiento); menos del ${LOW_SEAT_PCT} % de la plantilla activa en 30 días (requiere 7 días de seguimiento y 3 personas). Alto = 2 motivos o más, o 30 días sin actividad.`,
      cost: `Coste IA de 30 días (tokens reales × precio de lista) convertido a euros con ${String(USD_EUR).replace(".", ",")} €/$ (estimado), dividido entre lo que paga la empresa al mes (asientos × precio del plan). Alerta por encima del ${AI_COST_ALERT_PCT} % o si gasta IA sin pagar.`,
      courses: `Prioridad = personas que empiezan y no se certifican × 1,5 si tiene un bloque con nota media < ${HARD_BLOCK_AVG} (n ≥ ${HARD_BLOCK_MIN_N}).`,
    },
    totals: {
      companies: real.length, seats: seatsReal, active7: sum((c) => c.active7), active30: sum((c) => c.active30),
      atRisk: real.filter((c) => c.churn.level === "alto").length,
      revenueEur: revenueKnown.length ? round1(revenueKnown.reduce((a, c) => a + (c.revenueEur ?? 0), 0)) : null, revenueN: revenueKnown.length,
      aiUsd30: Math.round([...usd.values()].reduce((a, b) => a + b, 0) * 100) / 100,
      aiUsdPlatformOnly: Math.round((usd.get(null) ?? 0) * 100) / 100,
      costAlerts: real.filter((c) => c.costAlert).length,
    },
    companies,
    costTrend: trend,
    courses, hardestBlocks,
    health: {
      errors: null as null, // Sin datos: la plataforma no guarda errores en base de datos (solo en el registro del servidor)
      providers: usageModel.map((m) => ({ model: m.model, calls: Number(m.n), pct: totalCalls ? Math.round((Number(m.n) / totalCalls) * 100) : 0 })).sort((a, b) => b.calls - a.calls),
      calls30: totalCalls,
    },
    learning: {
      seats: seatsReal,
      items: [
        { key: "entrevista", label: "Personas con entrevista inicial", n: learnMap(onboard as CountRow[]), of: seatsReal,
          use: "Objetivo, freno, estilo de aprendizaje y resumen de la web de su empresa: el tutor los lee en cada conversación para adaptar ejemplos y formato." },
        { key: "glosario", label: "Términos corregidos (glosario de empresa)", n: learnMap(glossary as CountRow[]), of: null,
          use: "Van en todas las llamadas a la IA de esa empresa y corrigen el dictado por voz." },
        { key: "conversaciones", label: "Conversaciones con tutores", n: learnMap(threads as CountRow[]), of: null,
          use: "Cada tutor recuerda solo la conversación de esa persona; nunca mezcla las de otras." },
        { key: "mensajes30", label: "Mensajes de alumnos al tutor (30 días)", n: learnMap(msgs30 as CountRow[]), of: null,
          use: "Los responsables ven las últimas preguntas para detectar qué no se entiende." },
        { key: "documentos", label: "Documentos en el cerebro de empresa", n: learnMap(docs as CountRow[]), of: null,
          use: "Lecciones y buenas prácticas curadas: el tutor responde citándolos." },
        { key: "perfil", label: "Perfiles Team DNA completos", n: learnMap(profiles as CountRow[]) || learnMap(dnas as CountRow[]), of: seatsReal,
          use: "Hoy solo los ven sus responsables en la ficha de la persona: todavía NO personalizan al tutor." },
        { key: "notas", label: "Notas y subrayados de alumnos", n: learnMap(notes as CountRow[]), of: null,
          use: "Son de la persona para repasar: el sistema NO aprende de ellas." },
      ],
    },
  };
}
export type Cockpit = Awaited<ReturnType<typeof platformCockpit>>;

/** Hechos medidos de la plataforma, en texto compacto para el resumen con IA. */
export function platformFacts(c: Cockpit): string {
  const L: string[] = [];
  const t = c.totals;
  L.push(`Empresas cliente: ${t.companies}; plantilla total ${t.seats}; activas 7 días ${t.active7}, 30 días ${t.active30} (seguimiento de uso desde el ${c.trackingSince}, ${c.trackingDays} días).`);
  L.push(`Ingresos mensuales por planes: ${t.revenueEur == null ? "Sin datos" : `${t.revenueEur} € (n=${t.revenueN} empresas con plan)`}. Coste IA 30 días: ${t.aiUsd30} $ (${t.aiUsdPlatformOnly} $ del orquestador de plataforma).`);
  const att = c.companies.filter((x) => !x.test && (x.churn.level !== "bajo" || x.costAlert));
  L.push(att.length ? "Empresas con alertas: " + att.map((x) => `${x.name} (salud ${x.health.score ?? "Sin datos"}; riesgo ${x.churn.level}${x.churn.reasons.length ? ": " + x.churn.reasons.join(", ") : ""}${x.costAlert ? `; coste IA ${x.aiUsd30} $ frente a ${x.revenueEur ?? "Sin datos"} €/mes` : ""})`).join(" | ") : "Empresas con alertas: ninguna.");
  L.push(c.courses.length ? "Cursos por prioridad de mejora: " + c.courses.slice(0, 4).map((x) => `${x.title} (empiezan ${x.started}, certificados ${x.certified}${x.reasons.length ? "; " + x.reasons.join("; ") : ""})`).join(" | ") : "Cursos: Sin datos.");
  L.push(c.health.providers.length ? "Llamadas a IA por modelo (30 días): " + c.health.providers.map((p) => `${p.model} ${p.calls} (${p.pct} %)`).join(", ") : "Llamadas a IA: Sin datos.");
  return L.join("\n");
}

/* ================================================================ admin / team leader: cuadro de la empresa */

export async function orgHome(deps: SvcDeps, a: {
  orgId: string; titles: Record<string, string>; view: "empresa" | "equipo";
  retos: { userId: string; reto: RetoLite }[]; pendingValidations: { userId: string; learnerName: string | null }[]; days?: number;
}, now = new Date()) {
  const days = a.days ?? 30;
  const db = deps.db;
  const tDays = trackingDays(now);
  const [b, attempts, certs, members, sub] = await Promise.all([
    act.board(deps, a.orgId, now),
    db.select({ userId: assessmentAttempt.userId, source: assessmentAttempt.source, kind: assessmentAttempt.kind, block: assessmentAttempt.block, score: assessmentAttempt.score, passed: assessmentAttempt.passed, status: assessmentAttempt.status })
      .from(assessmentAttempt).where(eq(assessmentAttempt.organizationId, a.orgId)),
    db.select({ userId: certificate.userId, issuedAt: certificate.issuedAt }).from(certificate).where(eq(certificate.organizationId, a.orgId)),
    db.select({ n: sql<number>`count(*)::int` }).from(member).where(eq(member.organizationId, a.orgId)).then((r) => r[0]?.n ?? 0),
    db.select().from(subscription).where(eq(subscription.organizationId, a.orgId)).then((r) => r[0] ?? null),
  ]);
  const names = new Map(b.people.map((p) => [p.userId, p.name]));
  const tests = a.retos.map((r) => ({
    id: r.reto.id ?? null, learnerId: r.userId, learnerName: names.get(r.userId) ?? "", tipo: r.reto.tipo ?? "", titulo: r.reto.titulo ?? "",
    programadoPara: r.reto.programadoPara ?? null, createdAt: r.reto.createdAt ?? null, score: typeof r.reto.score === "number" ? r.reto.score : null,
    status: retoStatus(r.reto, now),
  }));
  const ORDER: Record<RetoStatus, number> = { vencida: 0, pendiente: 1, programada: 2, en_validacion: 3, hecha: 4 };
  tests.sort((x, y) => ORDER[x.status] - ORDER[y.status] || String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  const testCounts = tests.reduce((m, t) => { m[t.status] = (m[t.status] ?? 0) + 1; return m; }, {} as Record<RetoStatus, number>);
  const pendingN = a.pendingValidations.length;

  // Progreso compacto por persona (tests de bloque corregidos + certificados).
  const per = new Map<string, { courses: Set<string>; blocks: Set<string>; scores: number[]; certs: number }>();
  const pp = (u: string) => per.get(u) ?? per.set(u, { courses: new Set(), blocks: new Set(), scores: [], certs: 0 }).get(u)!;
  for (const x of attempts) {
    const p = pp(x.userId); p.courses.add(x.source);
    if (x.kind === "block" && x.status === "corregido") { if (x.score != null) p.scores.push(x.score); if (x.passed) p.blocks.add(`${x.source}#${x.block}`); }
  }
  for (const c of certs) pp(c.userId).certs++;
  const people = b.people.map((p) => {
    const s = per.get(p.userId);
    return {
      userId: p.userId, name: p.name, role: p.role, lastSeenAt: p.lastSeenAt, online: !!p.state?.online, signals: p.signals,
      courses: s?.courses.size ?? 0, blocksPassed: s?.blocks.size ?? 0, certificates: s?.certs ?? 0,
      avgBlockScore: s?.scores.length ? Math.round(s.scores.reduce((x, y) => x + y, 0) / s.scores.length) : null, scoredN: s?.scores.length ?? 0,
    };
  });

  const base = {
    generatedAt: now.toISOString(), trackingSince: TRACKING_SINCE, trackingDays: tDays, view: a.view, days,
    members, onlineNow: b.people.filter((p) => p.state?.online).length,
    needHelp: people.filter((p) => p.signals.length).sort((x, y) => y.signals.length - x.signals.length),
    people, tests: tests.slice(0, 30), testCounts, pendingValidations: { n: pendingN, people: [...new Set(a.pendingValidations.map((v) => v.learnerName || ""))].filter(Boolean).slice(0, 5) },
  };
  if (a.view === "equipo") return { ...base, company: null };

  const [m, report, cases, dna, prof] = await Promise.all([
    act.orgMetrics(deps, a.orgId, a.titles, days, now),
    roi.buildReport(deps, a.orgId),
    db.select({ status: appliedCase.status, n: sql<number>`count(*)::int` }).from(appliedCase).where(eq(appliedCase.organizationId, a.orgId)).groupBy(appliedCase.status),
    db.select({ n: sql<number>`count(*)::int` }).from(teamDna).where(eq(teamDna.organizationId, a.orgId)).then((r) => r[0]?.n ?? 0),
    db.select({ n: sql<number>`count(*)::int` }).from(teamProfile).where(and(eq(teamProfile.organizationId, a.orgId), sql`${teamProfile.completedAt} is not null`)).then((r) => r[0]?.n ?? 0),
  ]);
  const bs = m.blockScores;
  const courses = rankCourses(m.funnel.map((f) => ({
    ...f, worstBlock: bs.filter((x) => x.source === f.source && x.n >= HARD_BLOCK_MIN_N)[0] ?? bs.filter((x) => x.source === f.source)[0] ?? null,
    finals: { n: 0, passed: 0 }, roleplays: 0,
  })).map((r) => ({ ...r, worstBlock: r.worstBlock ? { block: r.worstBlock.block, avg: r.worstBlock.avg, n: r.worstBlock.n, passRate: r.worstBlock.passRate } : null })));
  const certDay = new Map<string, number>();
  for (const c of certs) { const d = act.dayKey(c.issuedAt); certDay.set(d, (certDay.get(d) ?? 0) + 1); }
  const caseN = Object.fromEntries(cases.map((c) => [c.status, Number(c.n)]));
  const lvl = new Map(report.levels.map((x) => [x.key, x]));
  const pick = (key: string) => { const x = lvl.get(key); return x ? { name: x.name, value: x.value, unit: x.unit, n: x.n, certainty: x.certainty, formula: x.formula } : null; };
  return {
    ...base,
    company: {
      seats: { members, planSeats: sub?.seats ?? null, planStatus: sub?.status ?? null },
      active: m.active, totals: m.totals,
      series: m.series.map((d) => ({ day: d.day, users: d.users, activeMin: d.activeMin, sessions: d.sessions, certificates: certDay.get(d.day) ?? 0 })),
      funnel: m.funnel, blockScores: bs, timeToCertifyDays: m.timeToCertifyDays, courses, heatmap: m.heatmap,
      certificates: certs.length, roleplays: m.roleplays,
      cases: { approved: caseN["aprobado"] ?? 0, pending: caseN["entregado"] ?? 0, rejected: caseN["rechazado"] ?? 0 },
      teamDna: { quick: dna, full: prof, members },
      roi: { computable: report.roi.computable, roiPct: report.roi.roiPct, bcr: report.roi.bcr, missing: report.roi.missing.length, certainty: report.roi.certainty,
        aplicacion: pick("aplicacion"), cobertura: pick("cobertura"), period: report.period.label },
      actions: topActions({ struggling: base.needHelp, courses, pendingValidations: pendingN, overdueTests: testCounts.vencida ?? 0, members, active7: m.active.wau, trackingDays: tDays }),
    },
  };
}
