import { and, eq, sql } from "drizzle-orm";
import { coaching, competency, pointsLedger } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import { getLevel, setLevelAtLeast } from "./learning.js";

export const POINTS_TEACH = 50; // se cobra SOLO cuando el alumno aprueba
export const MULT_CRITICAL = 1.5;
export const MULT_CROSS_TEAM = 1.5;
export const DEFAULT_CAP = 3; // alumnos simultáneos por coach (antifraude: calidad, no volumen)
export const REFERENTE_MENTEES = 2; // mentees a N2 para ascender a Referente (N3)

/** Temporada actual (trimestre). Runtime; los tests pasan season explícito para determinismo. */
export function currentSeason(now = new Date()): string {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

async function activeCoachings(deps: SvcDeps, orgId: string, coachId: string, competencyId: string): Promise<number> {
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(coaching)
    .where(and(
      eq(coaching.organizationId, orgId), eq(coaching.coachId, coachId),
      eq(coaching.competencyId, competencyId), eq(coaching.status, "activo"),
    ));
  return row?.n ?? 0;
}

/**
 * Asigna un coach a un alumno en una competencia. El coach debe poder mentorizar
 * (Nivel 2+ en ella, o admin/inspirador). Antifraude: tope de alumnos simultáneos.
 */
export async function assignCoach(
  deps: SvcDeps,
  args: { orgId: string; coachId: string; coachRole: string; learnerId: string; competencyId: string; cap?: number },
): Promise<string> {
  const cap = args.cap ?? DEFAULT_CAP;
  const canMentor = args.coachRole === "admin" || args.coachRole === "inspirador"
    || (await getLevel(deps, args.orgId, args.coachId, args.competencyId)) >= 2;
  if (!canMentor) throw new Error("el coach debe aplicar la competencia (Nivel 2+) para mentorizar");
  if (args.coachId === args.learnerId) throw new Error("nadie se mentoriza a sí mismo");
  if ((await activeCoachings(deps, args.orgId, args.coachId, args.competencyId)) >= cap) {
    throw new Error(`tope de ${cap} alumnos simultáneos por coach (antifraude)`);
  }
  const id = deps.newId();
  await deps.db.insert(coaching).values({
    id, organizationId: args.orgId, coachId: args.coachId, learnerId: args.learnerId,
    competencyId: args.competencyId, status: "activo",
  });
  return id;
}

async function isCritical(deps: SvcDeps, orgId: string, competencyId: string): Promise<boolean> {
  const [c] = await deps.db.select({ critical: competency.critical }).from(competency)
    .where(and(eq(competency.id, competencyId), eq(competency.organizationId, orgId)));
  return c?.critical ?? false;
}

async function awardPoints(
  deps: SvcDeps, orgId: string, userId: string, season: string, points: number, reason: string, refId?: string,
): Promise<void> {
  await deps.db.insert(pointsLedger).values({
    id: deps.newId(), organizationId: orgId, userId, season, points, reason, refId: refId ?? null,
  });
}

export async function seasonPoints(deps: SvcDeps, orgId: string, userId: string, season: string): Promise<number> {
  const [row] = await deps.db.select({ total: sql<number>`coalesce(sum(${pointsLedger.points}),0)::int` })
    .from(pointsLedger)
    .where(and(eq(pointsLedger.organizationId, orgId), eq(pointsLedger.userId, userId), eq(pointsLedger.season, season)));
  return row?.total ?? 0;
}

/** Comprueba si un coach cumple para ascender a Referente (N3) en una competencia. */
export async function evaluateReferente(deps: SvcDeps, orgId: string, coachId: string, competencyId: string): Promise<number> {
  const level = await getLevel(deps, orgId, coachId, competencyId);
  if (level < 2) return level;
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(coaching)
    .where(and(
      eq(coaching.organizationId, orgId), eq(coaching.coachId, coachId),
      eq(coaching.competencyId, competencyId), eq(coaching.status, "logrado"),
    ));
  if ((row?.n ?? 0) >= REFERENTE_MENTEES) { await setLevelAtLeast(deps, orgId, coachId, competencyId, 3); return 3; }
  return level;
}

/**
 * El alumno ha alcanzado N2 en una competencia. Cierra sus coachings activos como "logrado",
 * paga al coach (con multiplicadores) y evalúa su ascenso a Referente.
 * El punto por enseñar se cobra AQUÍ (cuando el alumno aprueba), no al dar la sesión.
 */
export async function onLearnerReachedN2(
  deps: SvcDeps,
  args: { orgId: string; learnerId: string; competencyId: string; season?: string; crossTeam?: boolean },
): Promise<{ coachesPaid: number }> {
  const season = args.season ?? currentSeason();
  const critical = await isCritical(deps, args.orgId, args.competencyId);
  const rows = await deps.db.select().from(coaching).where(and(
    eq(coaching.organizationId, args.orgId), eq(coaching.learnerId, args.learnerId),
    eq(coaching.competencyId, args.competencyId), eq(coaching.status, "activo"),
  ));
  let paid = 0;
  for (const c of rows) {
    await deps.db.update(coaching).set({ status: "logrado" }).where(eq(coaching.id, c.id));
    let pts = POINTS_TEACH;
    if (critical) pts *= MULT_CRITICAL;
    if (args.crossTeam) pts *= MULT_CROSS_TEAM;
    await awardPoints(deps, args.orgId, c.coachId, season, Math.round(pts), "ensena_a_N2", c.learnerId);
    await evaluateReferente(deps, args.orgId, c.coachId, args.competencyId);
    paid++;
  }
  return { coachesPaid: paid };
}
