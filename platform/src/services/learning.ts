import { and, eq, sql } from "drizzle-orm";
import { enrollment, levelByCompetency, onboardingProfile, testAttempt } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export interface OnboardingInput { orgId: string; userId: string; sector?: string; puesto?: string; motivo?: string }

/** Onboarding: por qué / para qué / sector / puesto. Alimenta la personalización de la ruta. */
export async function startOnboarding(deps: SvcDeps, input: OnboardingInput): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(onboardingProfile).values({
    id, organizationId: input.orgId, userId: input.userId,
    sector: input.sector ?? null, puesto: input.puesto ?? null, motivo: input.motivo ?? null,
  });
  return id;
}

export async function enroll(
  deps: SvcDeps, orgId: string, userId: string, pathId: string, competencyId?: string,
): Promise<string> {
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
