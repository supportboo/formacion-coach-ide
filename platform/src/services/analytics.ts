import { and, eq, gte, sql } from "drizzle-orm";
import { coaching, competency, levelByCompetency, member } from "../db/schema.js";
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

/** El salpicadero del responsable. Todo son datos medidos, nunca inventados. */
export async function panelSummary(deps: SvcDeps, orgId: string): Promise<PanelSummary> {
  return {
    coverage: await coverage(deps, orgId),
    risks: await dependencyRisks(deps, orgId),
    internalTransfer: await internalTransferRate(deps, orgId),
  };
}
