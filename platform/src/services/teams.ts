// Equipos (1.16.0, auditoría 28-09): el alcance «mi equipo» de coaches y team leaders se resuelve con asignaciones
// explícitas (team_assignment) y con las relaciones de coaching que ya tiene cada coach. Sin asignaciones, el equipo está
// VACÍO: antes se ampliaba a toda la empresa. Admin, dirección y superadmin siguen viendo la empresa entera.
import { and, eq, inArray } from "drizzle-orm";
import { coaching, member, teamAssignment } from "../db/schema.js";
import type { Scope } from "../auth/capabilities.js";
import type { SvcDeps } from "./org.js";

/** null = sin restricción (toda la empresa); un Set = solo esas personas (puede estar vacío). */
export type Allowed = Set<string> | null;

export async function allowedLearners(deps: SvcDeps, orgId: string, supervisorId: string, scope: Scope | null): Promise<Allowed> {
  if (scope === "org" || scope === "global") return null;
  if (scope !== "team") return new Set();
  const [assigned, coached] = await Promise.all([
    deps.db.select({ id: teamAssignment.learnerUserId }).from(teamAssignment)
      .where(and(eq(teamAssignment.organizationId, orgId), eq(teamAssignment.managerUserId, supervisorId))),
    deps.db.select({ id: coaching.learnerId }).from(coaching)
      .where(and(eq(coaching.organizationId, orgId), eq(coaching.coachId, supervisorId))),
  ]);
  return new Set([...assigned, ...coached].map((r) => r.id));
}

export function canSee(allowed: Allowed, userId: string): boolean {
  return allowed === null || allowed.has(userId);
}

export async function list(deps: SvcDeps, orgId: string) {
  return deps.db.select({ managerUserId: teamAssignment.managerUserId, learnerUserId: teamAssignment.learnerUserId })
    .from(teamAssignment).where(eq(teamAssignment.organizationId, orgId));
}

/** Sustituye el equipo de un responsable. Solo personas de la misma empresa. */
export async function setTeam(deps: SvcDeps, orgId: string, managerUserId: string, learnerIds: string[], by: string): Promise<number> {
  const ids = [...new Set(learnerIds.filter((x) => x && x !== managerUserId))];
  const members = ids.length ? await deps.db.select({ id: member.userId }).from(member)
    .where(and(eq(member.organizationId, orgId), inArray(member.userId, ids))) : [];
  const valid = members.map((m) => m.id);
  await deps.db.delete(teamAssignment).where(and(eq(teamAssignment.organizationId, orgId), eq(teamAssignment.managerUserId, managerUserId)));
  if (valid.length) await deps.db.insert(teamAssignment).values(valid.map((learnerUserId) => ({ id: deps.newId(), organizationId: orgId, managerUserId, learnerUserId, createdBy: by })));
  return valid.length;
}
