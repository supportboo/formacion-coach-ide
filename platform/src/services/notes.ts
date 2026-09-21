// Anotaciones del alumno sobre el propio curso (subrayados, notas, preguntas, marcar para repasar).
// Cada usuario tiene su versión: acotado por organización + usuario. Base de "el curso como superficie".
import { and, desc, eq, ne } from "drizzle-orm";
import { annotation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export interface NoteInput {
  source: string; card?: number; cardTitle?: string;
  kind: "highlight" | "note" | "question" | "review" | "insight";
  quote?: string; body?: string;
}

export function list(deps: SvcDeps, orgId: string, userId: string, source: string) {
  return deps.db.select().from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, source)))
    .orderBy(desc(annotation.createdAt));
}

/** Todas las anotaciones del usuario (para la vista "Mi curso"), de todos los cursos. */
export function listAll(deps: SvcDeps, orgId: string, userId: string) {
  return deps.db.select().from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId)))
    .orderBy(desc(annotation.createdAt));
}

export async function create(deps: SvcDeps, orgId: string, userId: string, d: NoteInput): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(annotation).values({
    id, organizationId: orgId, userId, source: d.source, card: d.card ?? 0,
    cardTitle: d.cardTitle ?? null, kind: d.kind, quote: d.quote ?? null, body: d.body ?? null,
  });
  return id;
}

export async function remove(deps: SvcDeps, orgId: string, userId: string, id: string) {
  // Never let a user delete their own account-state row (would reset them to "approved").
  await deps.db.delete(annotation)
    .where(and(eq(annotation.id, id), eq(annotation.organizationId, orgId), eq(annotation.userId, userId), ne(annotation.source, "cuenta")));
}
