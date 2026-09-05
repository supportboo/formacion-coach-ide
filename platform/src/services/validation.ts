import { and, eq, gte, inArray } from "drizzle-orm";
import { appliedCase, auditLog, evidence, levelByCompetency, rubric, validation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import { getLevel, setLevelAtLeast } from "./learning.js";

export interface RubricCriterion { label: string; weight?: number }

/** Define la rúbrica visible de una competencia (se publica antes del ejercicio). */
export async function setRubric(
  deps: SvcDeps, orgId: string, competencyId: string, criteria: RubricCriterion[],
): Promise<string> {
  if (criteria.length === 0) throw new Error("la rúbrica necesita al menos un criterio");
  const id = deps.newId();
  await deps.db.insert(rubric).values({ id, organizationId: orgId, competencyId, criteria });
  return id;
}

/** Abre un caso práctico (enunciado con el contexto real del alumno). */
export async function createCase(
  deps: SvcDeps, args: { orgId: string; userId: string; competencyId: string; pathId?: string; prompt: string },
): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(appliedCase).values({
    id, organizationId: args.orgId, userId: args.userId, competencyId: args.competencyId,
    pathId: args.pathId ?? null, prompt: args.prompt, status: "borrador",
  });
  return id;
}

/** El alumno entrega su resolución -> queda pendiente de validación humana. */
export async function submitCase(deps: SvcDeps, orgId: string, caseId: string, submission: string): Promise<void> {
  const [c] = await deps.db.select().from(appliedCase)
    .where(and(eq(appliedCase.id, caseId), eq(appliedCase.organizationId, orgId)));
  if (!c) throw new Error("caso no encontrado en esta organización");
  if (c.status !== "borrador") throw new Error(`el caso no está en borrador (está: ${c.status})`);
  await deps.db.update(appliedCase)
    .set({ submission, status: "entregado", submittedAt: new Date() })
    .where(eq(appliedCase.id, caseId));
}

export type EvidenceKind = "documento" | "video" | "audio" | "url" | "kpi";

/** Adjunta una prueba (documento/vídeo/enlace/KPI) a un caso, para que el validador la revise. */
export async function addEvidence(
  deps: SvcDeps,
  args: { orgId: string; caseId: string; userId: string; kind: EvidenceKind; url?: string; note?: string },
): Promise<string> {
  const [c] = await deps.db.select({ id: appliedCase.id }).from(appliedCase)
    .where(and(eq(appliedCase.id, args.caseId), eq(appliedCase.organizationId, args.orgId)));
  if (!c) throw new Error("caso no encontrado en esta organización");
  const id = deps.newId();
  await deps.db.insert(evidence).values({
    id, organizationId: args.orgId, ownerType: "applied_case", ownerId: args.caseId,
    kind: args.kind, url: args.url ?? null, note: args.note ?? null, createdBy: args.userId,
  });
  return id;
}

export function listEvidence(deps: SvcDeps, orgId: string, caseId: string) {
  return deps.db.select().from(evidence)
    .where(and(eq(evidence.organizationId, orgId), eq(evidence.ownerType, "applied_case"), eq(evidence.ownerId, caseId)));
}

/** ¿Puede esta persona validar esta competencia? Nivel 3+ en ella, o admin/inspirador (bootstrap). */
export async function canValidate(
  deps: SvcDeps, orgId: string, validatorId: string, validatorRole: string, competencyId: string,
): Promise<boolean> {
  if (validatorRole === "admin" || validatorRole === "inspirador") return true;
  return (await getLevel(deps, orgId, validatorId, competencyId)) >= 3;
}

/** Cola de casos entregados que este validador puede revisar (sus competencias de referente, o todas si admin/inspirador). */
export async function listPendingCases(
  deps: SvcDeps, orgId: string, validatorId: string, validatorRole: string,
): Promise<Array<typeof appliedCase.$inferSelect>> {
  if (validatorRole === "admin" || validatorRole === "inspirador") {
    return deps.db.select().from(appliedCase)
      .where(and(eq(appliedCase.organizationId, orgId), eq(appliedCase.status, "entregado")));
  }
  const referente = await deps.db.select({ competencyId: levelByCompetency.competencyId })
    .from(levelByCompetency)
    .where(and(
      eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.userId, validatorId),
      gte(levelByCompetency.level, 3),
    ));
  const compIds = referente.filter((r) => r.competencyId).map((r) => r.competencyId!);
  if (compIds.length === 0) return [];
  return deps.db.select().from(appliedCase).where(and(
    eq(appliedCase.organizationId, orgId), eq(appliedCase.status, "entregado"),
    inArray(appliedCase.competencyId, compIds),
  ));
}

/** ¿Hay un caso entregado pendiente de validar? Bloquea progreso/generación (gate). */
export async function hasPendingCase(
  deps: SvcDeps, orgId: string, userId: string, competencyId: string,
): Promise<boolean> {
  const [c] = await deps.db.select({ id: appliedCase.id }).from(appliedCase)
    .where(and(
      eq(appliedCase.organizationId, orgId),
      eq(appliedCase.userId, userId),
      eq(appliedCase.competencyId, competencyId),
      eq(appliedCase.status, "entregado"),
    ));
  return !!c;
}

/**
 * Gate de progreso/coste: si hay un caso entregado sin validar, no se avanza ni se
 * genera contenido nuevo (evita quemar IA en quien no está aplicando lo anterior).
 */
export async function assertCanProgress(
  deps: SvcDeps, orgId: string, userId: string, competencyId: string,
): Promise<void> {
  if (await hasPendingCase(deps, orgId, userId, competencyId)) {
    throw new Error("tienes un caso pendiente de validar: practica y espera la validación antes de seguir");
  }
}

export interface ValidateInput {
  orgId: string; caseId: string; validatorId: string; validatorRole: string;
  decision: "aprobado" | "rechazado"; feedback?: string;
}

/**
 * Validación humana del caso. Si se aprueba, el alumno sube a Nivel 2 (Aplica).
 * Un nivel 3+ (o admin/inspirador en bootstrap) valida. No autoservicio.
 */
export async function validateCase(deps: SvcDeps, input: ValidateInput): Promise<{ status: string; level: number }> {
  const [c] = await deps.db.select().from(appliedCase)
    .where(and(eq(appliedCase.id, input.caseId), eq(appliedCase.organizationId, input.orgId)));
  if (!c) throw new Error("caso no encontrado en esta organización");
  if (c.status !== "entregado") throw new Error(`el caso no está entregado (está: ${c.status})`);
  if (c.userId === input.validatorId) throw new Error("nadie valida su propio caso");
  if (!(await canValidate(deps, input.orgId, input.validatorId, input.validatorRole, c.competencyId))) {
    throw new Error("el validador no es referente (nivel 3+) ni responsable de esta competencia");
  }

  await deps.db.insert(validation).values({
    id: deps.newId(), organizationId: input.orgId, caseId: input.caseId,
    validatorId: input.validatorId, decision: input.decision, feedback: input.feedback ?? null,
  });
  const status = input.decision === "aprobado" ? "aprobado" : "rechazado";
  await deps.db.update(appliedCase).set({ status }).where(eq(appliedCase.id, input.caseId));

  if (input.decision === "aprobado") {
    await setLevelAtLeast(deps, input.orgId, c.userId, c.competencyId, 2);
  }
  await deps.db.insert(auditLog).values({
    id: deps.newId(), organizationId: input.orgId, userId: input.validatorId,
    action: "case.validate", meta: { caseId: input.caseId, decision: input.decision, learner: c.userId },
  });

  const level = await getLevel(deps, input.orgId, c.userId, c.competencyId);
  return { status, level };
}
