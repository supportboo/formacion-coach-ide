import { and, eq } from "drizzle-orm";
import { competency, learningPath, lesson, puesto, sector } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export const listSectors = (deps: SvcDeps, orgId: string) =>
  deps.db.select().from(sector).where(eq(sector.organizationId, orgId));

export const listPuestos = (deps: SvcDeps, orgId: string) =>
  deps.db.select().from(puesto).where(eq(puesto.organizationId, orgId));

export const listCompetencies = (deps: SvcDeps, orgId: string) =>
  deps.db.select().from(competency).where(eq(competency.organizationId, orgId));

export const listPaths = (deps: SvcDeps, orgId: string) =>
  deps.db.select().from(learningPath).where(eq(learningPath.organizationId, orgId));

export const listLessons = (deps: SvcDeps, orgId: string, pathId: string) =>
  deps.db.select().from(lesson).where(and(eq(lesson.organizationId, orgId), eq(lesson.pathId, pathId)));

export async function getCompetency(deps: SvcDeps, orgId: string, competencyId: string) {
  const [row] = await deps.db.select().from(competency)
    .where(and(eq(competency.id, competencyId), eq(competency.organizationId, orgId)));
  return row ?? null;
}

export async function createSector(deps: SvcDeps, orgId: string, name: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(sector).values({ id, organizationId: orgId, name });
  return id;
}

export async function createPuesto(deps: SvcDeps, orgId: string, name: string, sectorId?: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(puesto).values({ id, organizationId: orgId, name, sectorId: sectorId ?? null });
  return id;
}

export async function createCompetency(
  deps: SvcDeps, orgId: string, name: string, opts: { puestoId?: string; critical?: boolean } = {},
): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(competency).values({
    id, organizationId: orgId, name, puestoId: opts.puestoId ?? null, critical: opts.critical ?? false,
  });
  return id;
}

export async function createPath(deps: SvcDeps, orgId: string, title: string, competencyId?: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(learningPath).values({ id, organizationId: orgId, title, competencyId: competencyId ?? null });
  return id;
}

export interface LessonInput {
  pathId: string; title: string; body: string;
  fuente?: string; fechaRevision?: Date; published?: boolean;
}

/**
 * Añade una lección. Doctrina de certeza: para PUBLICAR es obligatorio fuente + fecha de revisión.
 * Sin ellas, la lección se guarda como borrador (published=false).
 */
export async function addLesson(deps: SvcDeps, orgId: string, input: LessonInput): Promise<string> {
  const wantsPublish = input.published ?? false;
  if (wantsPublish && (!input.fuente || !input.fechaRevision)) {
    throw new Error("no se puede publicar una lección sin fuente y fecha de revisión (doctrina de certeza)");
  }
  const id = deps.newId();
  await deps.db.insert(lesson).values({
    id, organizationId: orgId, pathId: input.pathId, title: input.title, body: input.body,
    fuente: input.fuente ?? null, fechaRevision: input.fechaRevision ?? null, published: wantsPublish,
  });
  return id;
}
