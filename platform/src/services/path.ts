// Itinerario a especialista (Marc, 28-09-2026): se empieza por lo genérico, se elige una especialidad, se llega a
// especialista y, como coach, se atrae a 1-2 compañeros más a esa área. Todo sale de datos que ya existen: bloques
// aprobados y certificado del curso, nivel Coach (N4) o rol, y notas del propio alumno ([especialidad], [invitacion]).
import { and, desc, eq, like } from "drizzle-orm";
import { annotation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export type Stage = "base" | "especialidad" | "especialista" | "coach";
export const STAGES: Stage[] = ["base", "especialidad", "especialista", "coach"];
/** Cursos de coaching: son el paso a coach, no una especialidad. */
export const COACH_COURSES = new Set(["index", "guia-coach-odoo"]);
/** Compañeros que un coach atrae a su especialidad para cerrar el itinerario. */
export const INVITE_GOAL = 2;

export function stageOf(s: { specialty: string | null; pct: number; certified: boolean; coach: boolean }): Stage {
  if (!s.specialty) return "base";
  if (!s.certified && s.pct < 100) return "especialidad";
  return s.coach ? "coach" : "especialista";
}

/** % del curso: bloques aprobados sobre el total; con certificado, 100. */
export function coursePct(passedBlocks: number, totalBlocks: number, certified: boolean): number {
  if (certified) return 100;
  return totalBlocks > 0 ? Math.min(100, Math.round((passedBlocks / totalBlocks) * 100)) : 0;
}

const marker = (m: string) => and(eq(annotation.source, "onboarding"), like(annotation.body, m + "%"));

export async function getSpecialty(deps: SvcDeps, orgId: string, userId: string): Promise<string | null> {
  const [r] = await deps.db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), marker("[especialidad]")))
    .orderBy(desc(annotation.createdAt)).limit(1);
  return r?.body ? r.body.slice("[especialidad]".length).trim() || null : null;
}

export async function setSpecialty(deps: SvcDeps, orgId: string, userId: string, slug: string): Promise<void> {
  await deps.db.delete(annotation).where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), marker("[especialidad]")));
  await deps.db.insert(annotation).values({ id: deps.newId(), organizationId: orgId, userId, source: "onboarding", kind: "insight", body: "[especialidad] " + slug });
}

export async function invitesSent(deps: SvcDeps, orgId: string, userId: string, slug: string): Promise<number> {
  const rows = await deps.db.select({ id: annotation.id }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), marker("[invitacion] " + slug)));
  return rows.length;
}

export async function recordInvite(deps: SvcDeps, orgId: string, userId: string, slug: string): Promise<number> {
  await deps.db.insert(annotation).values({ id: deps.newId(), organizationId: orgId, userId, source: "onboarding", kind: "insight", body: "[invitacion] " + slug });
  return invitesSent(deps, orgId, userId, slug);
}
