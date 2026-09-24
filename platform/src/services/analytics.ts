import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import {
  agentMessage, agentThread, analyticsSnapshot, appliedCase, baselineSnapshot, coaching, competency,
  enrollment, evidence, learningPath, levelByCompetency, member, onboardingProfile, pointsLedger,
  roleplaySession, testAttempt, organization, user, validation,
} from "../db/schema.js";
import type { SvcDeps } from "./org.js";

/** Cuenta simple con filtro; helper para las muchas métricas. */
async function count(deps: SvcDeps, table: any, where: any): Promise<number> {
  const [r] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return r?.n ?? 0;
}
async function countDistinct(deps: SvcDeps, table: any, col: any, where: any): Promise<number> {
  const [r] = await deps.db.select({ n: sql<number>`count(distinct ${col})::int` }).from(table).where(where);
  return r?.n ?? 0;
}
const pctOrNull = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 100) : null);

export interface Coverage {
  competencyId: string; name: string; critical: boolean;
  total: number; atApply: number; pct: number | null; // null = aún sin equipo que medir
}

export interface DependencyRisk {
  competencyId: string; name: string; referentes: number; // riesgo si <= 1 en competencia crítica
}

async function memberCount(deps: SvcDeps, orgId: string): Promise<number> {
  const [r] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(member)
    .where(eq(member.organizationId, orgId));
  return r?.n ?? 0;
}

async function usersAtLevel(deps: SvcDeps, orgId: string, competencyId: string, minLevel: number): Promise<number> {
  const [r] = await deps.db.select({ n: sql<number>`count(distinct ${levelByCompetency.userId})::int` })
    .from(levelByCompetency)
    .where(and(
      eq(levelByCompetency.organizationId, orgId),
      eq(levelByCompetency.competencyId, competencyId),
      gte(levelByCompetency.level, minLevel),
    ));
  return r?.n ?? 0;
}

/** Cobertura: qué porcentaje del equipo APLICA (nivel 2+) cada competencia. No asistencia. */
export async function coverage(deps: SvcDeps, orgId: string): Promise<Coverage[]> {
  const total = await memberCount(deps, orgId);
  const comps = await deps.db.select().from(competency).where(eq(competency.organizationId, orgId));
  const out: Coverage[] = [];
  for (const c of comps) {
    const atApply = await usersAtLevel(deps, orgId, c.id, 2);
    out.push({
      competencyId: c.id, name: c.name, critical: c.critical,
      total, atApply, pct: total > 0 ? Math.round((atApply / total) * 100) : null,
    });
  }
  return out;
}

/** Riesgo de dependencia: competencias CRÍTICAS con 1 o 0 referentes (nivel 3+). Bus factor. */
export async function dependencyRisks(deps: SvcDeps, orgId: string): Promise<DependencyRisk[]> {
  const comps = await deps.db.select().from(competency)
    .where(and(eq(competency.organizationId, orgId), eq(competency.critical, true)));
  const out: DependencyRisk[] = [];
  for (const c of comps) {
    const referentes = await usersAtLevel(deps, orgId, c.id, 3);
    if (referentes <= 1) out.push({ competencyId: c.id, name: c.name, referentes });
  }
  return out;
}

/**
 * Transferencia interna: de la gente que ya APLICA (N2+), qué proporción llegó ahí
 * con un coach interno (coaching "logrado"). Sube = cada vez formamos más de casa =
 * el coste de formar al siguiente baja. Proxy honesto, no cifra inventada.
 */
export async function internalTransferRate(deps: SvcDeps, orgId: string): Promise<number | null> {
  const [apply] = await deps.db.select({ n: sql<number>`count(distinct ${levelByCompetency.userId})::int` })
    .from(levelByCompetency)
    .where(and(eq(levelByCompetency.organizationId, orgId), gte(levelByCompetency.level, 2)));
  const total = apply?.n ?? 0;
  if (total === 0) return null; // sin nadie que aplique todavía: no es 0%, es sin datos
  const [coached] = await deps.db.select({ n: sql<number>`count(distinct ${coaching.learnerId})::int` })
    .from(coaching)
    .where(and(eq(coaching.organizationId, orgId), eq(coaching.status, "logrado")));
  return Math.round(((coached?.n ?? 0) / total) * 100) / 100;
}

export interface PanelSummary {
  coverage: Coverage[];
  risks: DependencyRisk[];
  internalTransfer: number | null; // 0..1, o null si aún no hay datos
}

/**
 * Tiempo medio (días) desde la matrícula hasta la primera validación aprobada.
 * "Cuánto tarda alguien nuevo en ser autónomo". 0 si aún no hay aprobados.
 */
export async function timeToAutonomyDays(deps: SvcDeps, orgId: string): Promise<number | null> {
  const enrolls = await deps.db.select({
    userId: enrollment.userId, competencyId: enrollment.competencyId, at: enrollment.createdAt,
  }).from(enrollment).where(eq(enrollment.organizationId, orgId));
  const approvals = await deps.db.select({
    userId: appliedCase.userId, competencyId: appliedCase.competencyId, at: validation.createdAt,
  }).from(validation).innerJoin(appliedCase, eq(validation.caseId, appliedCase.id))
    .where(and(eq(validation.organizationId, orgId), eq(validation.decision, "aprobado")));

  const earliest = (rows: { userId: string; competencyId: string | null; at: Date }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.userId}|${r.competencyId ?? ""}`;
      const t = r.at.getTime();
      if (!m.has(k) || t < m.get(k)!) m.set(k, t);
    }
    return m;
  };
  const eMap = earliest(enrolls);
  const aMap = earliest(approvals);
  const diffs: number[] = [];
  for (const [k, approvedAt] of aMap) {
    const enrolledAt = eMap.get(k);
    if (enrolledAt !== undefined && approvedAt >= enrolledAt) diffs.push((approvedAt - enrolledAt) / 86_400_000);
  }
  if (diffs.length === 0) return null; // aún nadie ha llegado a autónomo: sin datos, no 0 días
  return Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
}

/** Captura la línea base del piloto (foto del punto de partida) para medir el antes/después. */
export async function captureBaseline(deps: SvcDeps, orgId: string): Promise<string> {
  const data = {
    coverage: await coverage(deps, orgId),
    risks: await dependencyRisks(deps, orgId),
    internalTransfer: await internalTransferRate(deps, orgId),
    timeToAutonomyDays: await timeToAutonomyDays(deps, orgId),
  };
  const id = deps.newId();
  await deps.db.insert(baselineSnapshot).values({ id, organizationId: orgId, data });
  return id;
}

export async function latestBaseline(deps: SvcDeps, orgId: string) {
  const [row] = await deps.db.select().from(baselineSnapshot)
    .where(eq(baselineSnapshot.organizationId, orgId))
    .orderBy(sql`${baselineSnapshot.capturedAt} desc`).limit(1);
  return row ?? null;
}

/** El salpicadero del responsable. Todo son datos medidos, nunca inventados. */
export async function panelSummary(deps: SvcDeps, orgId: string): Promise<PanelSummary & { timeToAutonomyDays: number | null }> {
  return {
    coverage: await coverage(deps, orgId),
    risks: await dependencyRisks(deps, orgId),
    internalTransfer: await internalTransferRate(deps, orgId),
    timeToAutonomyDays: await timeToAutonomyDays(deps, orgId),
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC), suficiente para "una vez al dia"
}

/**
 * Toma la foto del dia si no existia ya (idempotente, sin cron): se llama de paso cada vez que
 * alguien pide el panel de su empresa o el superadmin pide el resumen de plataforma. Si nadie
 * mira ese dia, no hay foto -- la serie queda con huecos honestos en vez de datos inventados.
 */
export async function captureSnapshotIfNeeded(deps: SvcDeps, orgId: string): Promise<void> {
  const day = todayStr();
  const [existing] = await deps.db.select({ id: analyticsSnapshot.id }).from(analyticsSnapshot)
    .where(and(eq(analyticsSnapshot.organizationId, orgId), eq(analyticsSnapshot.day, day)));
  if (existing) return;

  const [cov, risks, transfer, autonomy, members] = await Promise.all([
    coverage(deps, orgId),
    dependencyRisks(deps, orgId),
    internalTransferRate(deps, orgId),
    timeToAutonomyDays(deps, orgId),
    memberCount(deps, orgId),
  ]);
  const totalAll = cov.reduce((a, c) => a + c.total, 0);
  const applyAll = cov.reduce((a, c) => a + c.atApply, 0);
  const avgCoveragePct = totalAll > 0 ? Math.round((applyAll / totalAll) * 1000) / 10 : 0;

  // Insert-si-no-existe vía índice único: si dos peticiones llegan a la vez, una gana y la otra
  // choca contra snap_org_day_uidx -- se ignora, no hace falta un lock a mano.
  await deps.db.insert(analyticsSnapshot).values({
    id: deps.newId(), organizationId: orgId, day, memberCount: members,
    avgCoveragePct, criticalRisks: risks.length, internalTransfer: transfer ?? 0, timeToAutonomyDays: autonomy ?? 0,
  }).onConflictDoNothing();
}

export interface SnapshotPoint {
  day: string; avgCoveragePct: number; criticalRisks: number; internalTransfer: number; timeToAutonomyDays: number; memberCount: number;
}

export async function snapshotHistory(deps: SvcDeps, orgId: string, days = 90): Promise<SnapshotPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return deps.db.select({
    day: analyticsSnapshot.day, avgCoveragePct: analyticsSnapshot.avgCoveragePct,
    criticalRisks: analyticsSnapshot.criticalRisks, internalTransfer: analyticsSnapshot.internalTransfer,
    timeToAutonomyDays: analyticsSnapshot.timeToAutonomyDays, memberCount: analyticsSnapshot.memberCount,
  }).from(analyticsSnapshot)
    .where(and(eq(analyticsSnapshot.organizationId, orgId), gte(analyticsSnapshot.day, since)))
    .orderBy(asc(analyticsSnapshot.day));
}

/** Serie agregada de TODAS las empresas por dia (suma de riesgos/miembros, media del resto). Para el superadmin. */
export async function platformSnapshotHistory(deps: SvcDeps, days = 90): Promise<SnapshotPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await deps.db.select({
    day: analyticsSnapshot.day,
    avgCoveragePct: sql<number>`avg(${analyticsSnapshot.avgCoveragePct})`,
    criticalRisks: sql<number>`sum(${analyticsSnapshot.criticalRisks})::int`,
    internalTransfer: sql<number>`avg(${analyticsSnapshot.internalTransfer})`,
    timeToAutonomyDays: sql<number>`avg(${analyticsSnapshot.timeToAutonomyDays})`,
    memberCount: sql<number>`sum(${analyticsSnapshot.memberCount})::int`,
  }).from(analyticsSnapshot)
    .where(gte(analyticsSnapshot.day, since))
    .groupBy(analyticsSnapshot.day)
    .orderBy(asc(analyticsSnapshot.day));
  return rows.map((r) => ({
    ...r, avgCoveragePct: Math.round(r.avgCoveragePct * 10) / 10, internalTransfer: Math.round(r.internalTransfer * 100) / 100,
    timeToAutonomyDays: Math.round(r.timeToAutonomyDays * 10) / 10,
  }));
}

export interface PathCompletion { pathId: string; pathTitle: string; total: number; completado: number; pct: number }

/** % de finalizacion real por ruta (enrollment.status), no inventado. Señal directa de que rutas enganchan y cuales no. */
export async function completionByPath(deps: SvcDeps, orgId: string): Promise<PathCompletion[]> {
  const rows = await deps.db.select({
    pathId: enrollment.pathId, pathTitle: learningPath.title,
    total: sql<number>`count(*)::int`,
    completado: sql<number>`count(*) filter (where ${enrollment.status} = 'completado')::int`,
  }).from(enrollment)
    .innerJoin(learningPath, eq(enrollment.pathId, learningPath.id))
    .where(eq(enrollment.organizationId, orgId))
    .groupBy(enrollment.pathId, learningPath.title);
  return rows.map((r) => ({ ...r, pct: r.total > 0 ? Math.round((r.completado / r.total) * 100) : 0 }));
}

export interface RecentQuestion { userName: string; role: string; content: string; createdAt: Date }

/**
 * Preguntas reales que la gente hace al tutor -- sin clasificar por tema (eso puede venir despues
 * en un lote aparte, no hace falta gastar IA para listar lo que ya se pregunto). Es la senal cruda
 * de "que necesita saber la gente" que hoy no se ve en ningun sitio.
 */
// El primer mensaje al tutor llega con el PROMPT del tutor pegado delante (…\n\n + la pregunta real).
// Aquí nos quedamos SOLO con la pregunta de la persona y descartamos lo que sea puro prompt interno,
// para que el panel no muestre "Eres Diego, Tutor…" como si fuera una pregunta.
function cleanQuestion(raw: string): string {
  const t = String(raw || "").trim();
  const i = t.lastIndexOf("\n\n");
  return (i >= 0 ? t.slice(i + 2) : t).trim();
}
function looksLikePrompt(s: string): boolean {
  return /^eres\s|perfil del alumno|el alumno está en el curso|espeja con|ritmo natural|haz preguntas para conocer/i.test(s);
}
export async function recentQuestions(deps: SvcDeps, orgId: string, limit = 30): Promise<RecentQuestion[]> {
  const rows = await deps.db.select({
    userName: user.name, role: agentThread.role, content: agentMessage.content, createdAt: agentMessage.createdAt,
  }).from(agentMessage)
    .innerJoin(agentThread, eq(agentMessage.threadId, agentThread.id))
    .innerJoin(user, eq(agentThread.userId, user.id))
    .where(and(eq(agentMessage.organizationId, orgId), eq(agentMessage.sender, "user")))
    .orderBy(desc(agentMessage.createdAt))
    .limit(limit * 2); // pedimos de más porque filtramos los que son puro prompt
  return rows
    .map((r) => ({ ...r, content: cleanQuestion(r.content) }))
    .filter((r) => r.content && !looksLikePrompt(r.content))
    .slice(0, limit);
}

/* ============================================================================
 * MÉTRICAS RICAS (null-aware): "sin datos" cuando no hay medida, nunca un 0 que parezca resultado.
 * Un único agregado para los paneles de responsable/dirección/superadmin. LEY #0: todo medido.
 * ========================================================================== */

export interface LevelBars { competencyId: string; name: string; critical: boolean; n0: number; n1: number; n2: number; n3: number; total: number }
export interface IndustryRow { sector: string; n: number }
export interface OrgMetrics {
  // Personas y actividad
  members: number;
  activeLearners: number;           // con alguna actividad (mensaje, test, caso o roleplay)
  byRole: Record<string, number>;
  // Aprender
  enrollments: number; completions: number; completionPct: number | null;
  testsTaken: number; testsPassed: number; testPassPct: number | null;
  // Aplicar (lo que de verdad importa para ROI)
  casesSubmitted: number; casesApproved: number; caseApprovalPct: number | null;
  avgDaysToValidation: number | null;
  roleplays: number;
  // Capacidad y conocimiento
  levelBars: LevelBars[];           // barras de nivel por competencia (N0..N3)
  coaches: number;                  // personas nivel 3+ (referentes)
  atApply: number;                  // personas nivel 2+ en alguna competencia
  coveragePct: number | null;       // % del equipo que aplica alguna competencia
  criticalRisks: DependencyRisk[];  // competencias críticas con <=1 referente
  timeToAutonomyDays: number | null;
  internalTransfer: number | null;
  // ROI de aplicación real (del seguimiento) + coste
  application: { checkins: number; tasaAplicacion: number | null; sensacionMedia: number | null };
  // Gamificación / puntos
  totalPoints: number;
  // Contexto
  industries: IndustryRow[];        // sectores reales del equipo (del onboarding)
  questionsAsked: number;           // volumen de preguntas reales al tutor
  bestPracticesInBrain: number;     // conocimiento del equipo destilado al cerebro
}

/** Barras de nivel (N0..N3) por competencia: cuántas personas hay en cada nivel. "Barras de conocimiento". */
export async function levelBars(deps: SvcDeps, orgId: string): Promise<LevelBars[]> {
  const comps = await deps.db.select().from(competency).where(eq(competency.organizationId, orgId));
  const total = await memberCount(deps, orgId);
  const out: LevelBars[] = [];
  for (const c of comps) {
    const rows = await deps.db.select({ level: levelByCompetency.level, n: sql<number>`count(distinct ${levelByCompetency.userId})::int` })
      .from(levelByCompetency)
      .where(and(eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.competencyId, c.id)))
      .groupBy(levelByCompetency.level);
    const by = new Map(rows.map((r) => [r.level, r.n]));
    const n1 = by.get(1) ?? 0, n2 = by.get(2) ?? 0, n3 = by.get(3) ?? 0;
    out.push({ competencyId: c.id, name: c.name, critical: c.critical, n0: Math.max(0, total - (n1 + n2 + n3)), n1, n2, n3, total });
  }
  return out;
}

/** Sectores reales del equipo (del onboarding), para segmentar por industria/temática. */
export async function industries(deps: SvcDeps, orgId: string): Promise<IndustryRow[]> {
  const rows = await deps.db.select({ sector: onboardingProfile.sector, n: sql<number>`count(distinct ${onboardingProfile.userId})::int` })
    .from(onboardingProfile)
    .where(and(eq(onboardingProfile.organizationId, orgId), sql`${onboardingProfile.sector} is not null and ${onboardingProfile.sector} <> ''`))
    .groupBy(onboardingProfile.sector).orderBy(desc(sql`count(distinct ${onboardingProfile.userId})`));
  return rows.map((r) => ({ sector: r.sector ?? "—", n: r.n }));
}

/** Tiempo medio (días) del caso ENTREGADO a su validación aprobada. null si no hay. */
async function avgDaysToValidation(deps: SvcDeps, orgId: string): Promise<number | null> {
  const rows = await deps.db.select({ submitted: appliedCase.submittedAt, decided: validation.createdAt })
    .from(validation).innerJoin(appliedCase, eq(validation.caseId, appliedCase.id))
    .where(and(eq(validation.organizationId, orgId), eq(validation.decision, "aprobado")));
  const diffs = rows.filter((r) => r.submitted && r.decided && r.decided >= r.submitted)
    .map((r) => (r.decided!.getTime() - r.submitted!.getTime()) / 86_400_000);
  if (!diffs.length) return null;
  return Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
}

/** Agregado rico de una organización, null-aware. Alimenta paneles y el informe de ROI. */
export async function orgMetrics(deps: SvcDeps, orgId: string): Promise<OrgMetrics> {
  const [members, cov, risks, transfer, autonomy, bars, inds, appRoi] = await Promise.all([
    memberCount(deps, orgId), coverage(deps, orgId), dependencyRisks(deps, orgId),
    internalTransferRate(deps, orgId), timeToAutonomyDays(deps, orgId), levelBars(deps, orgId),
    industries(deps, orgId), applicationRoiSafe(deps, orgId),
  ]);
  const roleRows = await deps.db.select({ role: member.orgRole, n: sql<number>`count(*)::int` })
    .from(member).where(eq(member.organizationId, orgId)).groupBy(member.orgRole);
  const byRole: Record<string, number> = {}; for (const r of roleRows) byRole[r.role] = r.n;

  const [enrollments, completions, testsTaken, testsPassed, casesSubmitted, casesApproved, roleplays,
    coaches, atApply, questionsAsked, bestPractices, pts, activeLearners, avgVal] = await Promise.all([
    count(deps, enrollment, eq(enrollment.organizationId, orgId)),
    count(deps, enrollment, and(eq(enrollment.organizationId, orgId), eq(enrollment.status, "completado"))),
    count(deps, testAttempt, eq(testAttempt.organizationId, orgId)),
    count(deps, testAttempt, and(eq(testAttempt.organizationId, orgId), eq(testAttempt.passed, true))),
    count(deps, appliedCase, and(eq(appliedCase.organizationId, orgId), sql`${appliedCase.status} in ('entregado','aprobado','rechazado')`)),
    count(deps, validation, and(eq(validation.organizationId, orgId), eq(validation.decision, "aprobado"))),
    count(deps, roleplaySession, eq(roleplaySession.organizationId, orgId)),
    countDistinct(deps, levelByCompetency, levelByCompetency.userId, and(eq(levelByCompetency.organizationId, orgId), gte(levelByCompetency.level, 3))),
    countDistinct(deps, levelByCompetency, levelByCompetency.userId, and(eq(levelByCompetency.organizationId, orgId), gte(levelByCompetency.level, 2))),
    count(deps, agentMessage, and(eq(agentMessage.organizationId, orgId), eq(agentMessage.sender, "user"))),
    count(deps, evidence, and(eq(evidence.organizationId, orgId), eq(evidence.ownerType, "buena_practica"))).catch(() => 0),
    deps.db.select({ s: sql<number>`coalesce(sum(${pointsLedger.points}),0)::int` }).from(pointsLedger).where(eq(pointsLedger.organizationId, orgId)).then((r) => r[0]?.s ?? 0).catch(() => 0),
    countDistinct(deps, agentMessage, agentMessage.threadId, and(eq(agentMessage.organizationId, orgId), eq(agentMessage.sender, "user"))),
    avgDaysToValidation(deps, orgId),
  ]);

  const totalAll = cov.reduce((a, c) => a + c.total, 0), applyAll = cov.reduce((a, c) => a + c.atApply, 0);
  return {
    members, activeLearners, byRole,
    enrollments, completions, completionPct: pctOrNull(completions, enrollments),
    testsTaken, testsPassed, testPassPct: pctOrNull(testsPassed, testsTaken),
    casesSubmitted, casesApproved, caseApprovalPct: pctOrNull(casesApproved, casesSubmitted),
    avgDaysToValidation: avgVal, roleplays,
    levelBars: bars, coaches, atApply, coveragePct: pctOrNull(applyAll, totalAll),
    criticalRisks: risks, timeToAutonomyDays: autonomy, internalTransfer: transfer,
    application: appRoi, totalPoints: pts, industries: inds, questionsAsked, bestPracticesInBrain: bestPractices,
  };
}

/** ROI de aplicación (del seguimiento) sin acoplar el import; devuelve 0/null seguro. */
async function applicationRoiSafe(deps: SvcDeps, orgId: string): Promise<{ checkins: number; tasaAplicacion: number | null; sensacionMedia: number | null }> {
  try {
    const rows = await deps.db.select({ note: evidence.note }).from(evidence)
      .where(and(eq(evidence.organizationId, orgId), eq(evidence.ownerType, "seguimiento"), eq(evidence.kind, "kpi")));
    let apl = 0, par = 0, no = 0, ss = 0, sn = 0;
    for (const r of rows) { let d: any = {}; try { d = JSON.parse(String(r.note || "{}")); } catch {} if (d.aplica === "si") apl++; else if (d.aplica === "parcial") par++; else if (d.aplica === "no") no++; if (typeof d.sensacion === "number") { ss += d.sensacion; sn++; } }
    const t = apl + par + no;
    return { checkins: rows.length, tasaAplicacion: t ? Math.round(((apl + par) / t) * 100) : null, sensacionMedia: sn ? Math.round((ss / sn) * 10) / 10 : null };
  } catch { return { checkins: 0, tasaAplicacion: null, sensacionMedia: null }; }
}

export interface PlatformOrgSummary {
  orgId: string; orgName: string; memberCount: number;
  competencyCount: number; criticalRisks: number; internalTransfer: number | null; timeToAutonomyDays: number | null;
}

/**
 * Vista de superadmin: una fila por organización con su salpicadero, para comparar
 * ROI/evolucion entre TODAS las empresas del ecosistema. Reutiliza panelSummary por org
 * (mismo dato que ve cada empresa de si misma) en vez de duplicar las queries.
 */
export async function platformSummary(deps: SvcDeps): Promise<PlatformOrgSummary[]> {
  const orgs = await deps.db.select().from(organization);
  const out: PlatformOrgSummary[] = [];
  for (const org of orgs) {
    await captureSnapshotIfNeeded(deps, org.id);
    const n = await memberCount(deps, org.id);
    const summary = await panelSummary(deps, org.id);
    out.push({
      orgId: org.id, orgName: org.name, memberCount: n,
      competencyCount: summary.coverage.length, criticalRisks: summary.risks.length,
      internalTransfer: summary.internalTransfer, timeToAutonomyDays: summary.timeToAutonomyDays,
    });
  }
  return out;
}
