import { and, eq, inArray } from "drizzle-orm";
import {
  agentMessage, agentThread, appliedCase, auditLog, certificate, coaching,
  enrollment, fundaeParticipation, levelByCompetency, onboardingProfile,
  pointsLedger, rewardGrant, testAttempt, user, validation,
} from "../db/schema.js";
import type { SvcDeps } from "./org.js";

/**
 * Derecho de acceso/portabilidad (RGPD art. 15/20): todo lo que sabemos de este usuario
 * dentro de su organización. Nombre/email vienen de better-auth (tabla `user`); el resto
 * son registros de aprendizaje/validación acotados por organizationId.
 */
export async function exportUserData(deps: SvcDeps, orgId: string, userId: string) {
  const [profile] = await deps.db.select().from(user).where(eq(user.id, userId));

  return {
    identity: profile ? { id: profile.id, name: profile.name, email: profile.email } : null,
    onboarding: await deps.db.select().from(onboardingProfile)
      .where(and(eq(onboardingProfile.organizationId, orgId), eq(onboardingProfile.userId, userId))),
    enrollments: await deps.db.select().from(enrollment)
      .where(and(eq(enrollment.organizationId, orgId), eq(enrollment.userId, userId))),
    levels: await deps.db.select().from(levelByCompetency)
      .where(and(eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.userId, userId))),
    testAttempts: await deps.db.select().from(testAttempt)
      .where(and(eq(testAttempt.organizationId, orgId), eq(testAttempt.userId, userId))),
    appliedCases: await deps.db.select().from(appliedCase)
      .where(and(eq(appliedCase.organizationId, orgId), eq(appliedCase.userId, userId))),
    validationsGiven: await deps.db.select().from(validation)
      .where(and(eq(validation.organizationId, orgId), eq(validation.validatorId, userId))),
    coachingAsCoach: await deps.db.select().from(coaching)
      .where(and(eq(coaching.organizationId, orgId), eq(coaching.coachId, userId))),
    coachingAsLearner: await deps.db.select().from(coaching)
      .where(and(eq(coaching.organizationId, orgId), eq(coaching.learnerId, userId))),
    points: await deps.db.select().from(pointsLedger)
      .where(and(eq(pointsLedger.organizationId, orgId), eq(pointsLedger.userId, userId))),
    certificates: await deps.db.select().from(certificate)
      .where(and(eq(certificate.organizationId, orgId), eq(certificate.userId, userId))),
    rewardGrants: await deps.db.select().from(rewardGrant)
      .where(and(eq(rewardGrant.organizationId, orgId), eq(rewardGrant.userId, userId))),
    fundaeParticipation: await deps.db.select().from(fundaeParticipation)
      .where(and(eq(fundaeParticipation.organizationId, orgId), eq(fundaeParticipation.userId, userId))),
    chatThreads: await deps.db.select().from(agentThread)
      .where(and(eq(agentThread.organizationId, orgId), eq(agentThread.userId, userId))),
  };
}

/**
 * Derecho al olvido (RGPD art. 17), con el límite del art. 17.3: se conserva lo exigido por
 * obligación legal (FUNDAE, 4 años) o interés legítimo de auditoría (niveles/certificados/
 * puntos — dejan de ser identificables una vez borrada la identidad en `user`).
 * Se borra: identidad (user → cascada session/account/member, schema.ts onDelete:"cascade"),
 * texto libre (mensajes de chat, perfil de onboarding, redacción del caso).
 * Se conserva (sin texto libre, solo IDs/números): enrollment, levelByCompetency, testAttempt,
 * certificate, rewardGrant, pointsLedger, coaching, fundaeParticipation.
 */
export async function eraseUserData(deps: SvcDeps, orgId: string, userId: string): Promise<void> {
  const myThreads = await deps.db.select({ id: agentThread.id }).from(agentThread)
    .where(and(eq(agentThread.organizationId, orgId), eq(agentThread.userId, userId)));
  const threadIds = myThreads.map((t) => t.id);
  if (threadIds.length > 0) {
    await deps.db.delete(agentMessage).where(inArray(agentMessage.threadId, threadIds));
  }
  await deps.db.delete(agentThread).where(and(eq(agentThread.organizationId, orgId), eq(agentThread.userId, userId)));
  await deps.db.delete(onboardingProfile).where(and(eq(onboardingProfile.organizationId, orgId), eq(onboardingProfile.userId, userId)));
  await deps.db.update(appliedCase).set({ submission: null })
    .where(and(eq(appliedCase.organizationId, orgId), eq(appliedCase.userId, userId)));
  await deps.db.insert(auditLog).values({
    id: deps.newId(), organizationId: orgId, userId: null,
    action: "privacy.erase", meta: { erasedUserId: userId },
  });
  // Borra identidad real (nombre/email). session/account/member caen en cascada.
  await deps.db.delete(user).where(eq(user.id, userId));
}
