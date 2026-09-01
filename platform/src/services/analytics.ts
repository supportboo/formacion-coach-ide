import { and, eq, gte, sql } from "drizzle-orm";
import {
  appliedCase, baselineSnapshot, coaching, competency, enrollment, levelByCompetency, member, validation,
} from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export interface Coverage {
  competencyId: string; name: string; critical: boolean;
  total: number; atApply: number; pct: number; // atApply = nivel >= 2 (Aplica)
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
      total, atApply, pct: total > 0 ? Math.round((atApply / total) * 100) : 0,
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
export async function internalTransferRate(deps: SvcDeps, orgId: string): Promise<number> {
  const [apply] = await deps.db.select({ n: sql<number>`count(distinct ${levelByCompetency.userId})::int` })
    .from(levelByCompetency)
    .where(and(eq(levelByCompetency.organizationId, orgId), gte(levelByCompetency.level, 2)));
  const total = apply?.n ?? 0;
  if (total === 0) return 0;
  const [coached] = await deps.db.select({ n: sql<number>`count(distinct ${coaching.learnerId})::int` })
    .from(coaching)
    .where(and(eq(coaching.organizationId, orgId), eq(coaching.status, "logrado")));
  return Math.round(((coached?.n ?? 0) / total) * 100) / 100;
}

export interface PanelSummary {
  coverage: Coverage[];
  risks: DependencyRisk[];
  internalTransfer: number; // 0..1
}

/**
 * Tiempo medio (días) desde la matrícula hasta la primera validación aprobada.
 * "Cuánto tarda alguien nuevo en ser autónomo". 0 si aún no hay aprobados.
 */
export async function timeToAutonomyDays(deps: SvcDeps, orgId: string): Promise<number> {
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
  if (diffs.length === 0) return 0;
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
export async function panelSummary(deps: SvcDeps, orgId: string): Promise<PanelSummary & { timeToAutonomyDays: number }> {
  return {
    coverage: await coverage(deps, orgId),
    risks: await dependencyRisks(deps, orgId),
    internalTransfer: await internalTransferRate(deps, orgId),
    timeToAutonomyDays: await timeToAutonomyDays(deps, orgId),
  };
}
