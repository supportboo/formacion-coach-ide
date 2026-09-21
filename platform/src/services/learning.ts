import { and, eq, sql } from "drizzle-orm";
import { competency, enrollment, learningPath, levelByCompetency, onboardingProfile, testAttempt } from "../db/schema.js";
import { matchProfileToPaths, type MatchedPath } from "./catalog.js";
import type { SvcDeps } from "./org.js";

export interface OnboardingInput { orgId: string; userId: string; sector?: string; puesto?: string; motivo?: string }
export interface OnboardingResult { id: string; matchedPaths: MatchedPath[] }

/**
 * Onboarding: por qué / para qué / sector / puesto. Alimenta la personalización de la ruta, y
 * matricula al momento en cualquier ruta del catálogo real de la empresa que encaje con el sector
 * o el puesto (texto, sin IA — ver `matchProfileToPaths`). Sin match real, `matchedPaths` viene
 * vacío: no se inventa una ruta, el responsable la asigna a mano como hasta ahora.
 */
export async function startOnboarding(deps: SvcDeps, input: OnboardingInput): Promise<OnboardingResult> {
  const id = deps.newId();
  await deps.db.insert(onboardingProfile).values({
    id, organizationId: input.orgId, userId: input.userId,
    sector: input.sector ?? null, puesto: input.puesto ?? null, motivo: input.motivo ?? null,
  });

  const matches = await matchProfileToPaths(deps, input.orgId, { sector: input.sector, puesto: input.puesto });
  for (const m of matches) {
    const already = await deps.db.select({ id: enrollment.id }).from(enrollment).where(and(
      eq(enrollment.organizationId, input.orgId), eq(enrollment.userId, input.userId), eq(enrollment.pathId, m.pathId),
    ));
    if (already.length === 0) await enroll(deps, input.orgId, input.userId, m.pathId, m.competencyId);
  }
  return { id, matchedPaths: matches };
}

export async function enroll(
  deps: SvcDeps, orgId: string, userId: string, pathId: string, competencyId?: string,
): Promise<string> {
  // Path and competency must belong to the caller's organization (no cross-tenant enrollments).
  const [p] = await deps.db.select({ id: learningPath.id }).from(learningPath)
    .where(and(eq(learningPath.id, pathId), eq(learningPath.organizationId, orgId)));
  if (!p) throw new Error("ruta no encontrada en esta organización");
  if (competencyId) {
    const [c] = await deps.db.select({ id: competency.id }).from(competency)
      .where(and(eq(competency.id, competencyId), eq(competency.organizationId, orgId)));
    if (!c) throw new Error("competencia no encontrada en esta organización");
  }
  const id = deps.newId();
  await deps.db.insert(enrollment).values({
    id, organizationId: orgId, userId, pathId, competencyId: competencyId ?? null, status: "en_curso",
  });
  return id;
}

/** Sube el nivel de una competencia a AL MENOS `min` (nunca lo baja). Upsert atómico. */
export async function setLevelAtLeast(
  deps: SvcDeps, orgId: string, userId: string, competencyId: string, min: number,
): Promise<void> {
  await deps.db.insert(levelByCompetency)
    .values({ id: deps.newId(), organizationId: orgId, userId, competencyId, level: min })
    .onConflictDoUpdate({
      target: [levelByCompetency.organizationId, levelByCompetency.userId, levelByCompetency.competencyId],
      set: { level: sql`greatest(${levelByCompetency.level}, ${min})`, updatedAt: sql`now()` },
    });
}

export async function getLevel(
  deps: SvcDeps, orgId: string, userId: string, competencyId: string,
): Promise<number> {
  const [row] = await deps.db.select({ level: levelByCompetency.level }).from(levelByCompetency)
    .where(and(
      eq(levelByCompetency.organizationId, orgId),
      eq(levelByCompetency.userId, userId),
      eq(levelByCompetency.competencyId, competencyId),
    ));
  return row?.level ?? 0;
}

/** Quién está a qué nivel en una competencia (para que un validador/team_leader vea a quién puede formar). */
export function listLevelsForCompetency(deps: SvcDeps, orgId: string, competencyId: string) {
  return deps.db.select({ userId: levelByCompetency.userId, level: levelByCompetency.level })
    .from(levelByCompetency)
    .where(and(eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.competencyId, competencyId)));
}

/** Mis inscripciones (para el dashboard del empleado). */
export function listMyEnrollments(deps: SvcDeps, orgId: string, userId: string) {
  return deps.db.select().from(enrollment)
    .where(and(eq(enrollment.organizationId, orgId), eq(enrollment.userId, userId)));
}

export async function getOnboardingProfile(deps: SvcDeps, orgId: string, userId: string) {
  const [row] = await deps.db.select().from(onboardingProfile)
    .where(and(eq(onboardingProfile.organizationId, orgId), eq(onboardingProfile.userId, userId)))
    .orderBy(sql`${onboardingProfile.createdAt} desc`).limit(1);
  return row ?? null;
}

export interface KnowledgeTestInput {
  orgId: string; userId: string; pathId: string; competencyId: string;
  score: number; passThreshold?: number;
}

/**
 * Registra un test de conocimiento. Si aprueba, desbloquea Nivel 1 (En formación).
 * El test SOLO desbloquea N1 — subir a Aplica/Referente exige validación humana (Fase 3).
 */
export async function recordKnowledgeTest(
  deps: SvcDeps, input: KnowledgeTestInput,
): Promise<{ passed: boolean; level: number }> {
  const threshold = input.passThreshold ?? 70;
  const passed = input.score >= threshold;
  await deps.db.insert(testAttempt).values({
    id: deps.newId(), organizationId: input.orgId, userId: input.userId,
    pathId: input.pathId, competencyId: input.competencyId, score: input.score, passed,
  });
  if (passed) {
    await setLevelAtLeast(deps, input.orgId, input.userId, input.competencyId, 1);
    await deps.db.update(enrollment)
      .set({ status: "test_ok" })
      .where(and(
        eq(enrollment.organizationId, input.orgId),
        eq(enrollment.userId, input.userId),
        eq(enrollment.pathId, input.pathId),
      ));
  }
  const level = await getLevel(deps, input.orgId, input.userId, input.competencyId);
  return { passed, level };
}
