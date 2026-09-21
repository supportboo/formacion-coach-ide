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

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** ¿Se refieren a lo mismo? Contención en cualquier dirección, sin acentos ni mayúsculas — nunca
 *  una IA "adivinando": si no hay coincidencia de texto real, no hay match, y no se inventa uno. */
// Palabras vacías que no cuentan como coincidencia de puesto/sector.
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "para", "por", "con", "a", "un", "una"]);
function words(s: string): string[] {
  return normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
}
export function textMatches(a: string, b: string): boolean {
  const na = normalizeText(a), nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Coincidencia por palabra significativa compartida (p.ej. "técnico de taller" ↔ "técnico de motos").
  const wa = new Set(words(a));
  return words(b).some((w) => wa.has(w));
}

export interface MatchedPath { pathId: string; title: string; competencyId: string; competencyName: string }

/**
 * Empareja el sector/puesto en texto libre del onboarding contra el catálogo real de la empresa
 * (sector → puesto → competencia → ruta), determinista y sin coste de IA. Prioriza el puesto (más
 * específico); si no hay match de puesto, cae al sector y coge todos sus puestos. Sin coincidencia
 * real → lista vacía, nunca una ruta inventada (doctrina de certeza).
 */
export async function matchProfileToPaths(
  deps: SvcDeps, orgId: string, profile: { sector?: string | null; puesto?: string | null },
): Promise<MatchedPath[]> {
  if (!profile.puesto && !profile.sector) return [];

  const [sectors, puestos, competencies, paths] = await Promise.all([
    listSectors(deps, orgId), listPuestos(deps, orgId), listCompetencies(deps, orgId), listPaths(deps, orgId),
  ]);

  let matchedPuestoIds = profile.puesto
    ? puestos.filter((p) => textMatches(profile.puesto!, p.name)).map((p) => p.id)
    : [];

  if (matchedPuestoIds.length === 0 && profile.sector) {
    const matchedSectorIds = new Set(sectors.filter((s) => textMatches(profile.sector!, s.name)).map((s) => s.id));
    matchedPuestoIds = puestos.filter((p) => p.sectorId && matchedSectorIds.has(p.sectorId)).map((p) => p.id);
  }
  if (matchedPuestoIds.length === 0) return [];

  const puestoIdSet = new Set(matchedPuestoIds);
  const matchedCompetencies = competencies.filter((c) => c.puestoId && puestoIdSet.has(c.puestoId));
  const competencyIdSet = new Set(matchedCompetencies.map((c) => c.id));
  const competencyNameById = new Map(matchedCompetencies.map((c) => [c.id, c.name]));

  return paths
    .filter((p) => p.competencyId && competencyIdSet.has(p.competencyId))
    .map((p) => ({
      pathId: p.id, title: p.title,
      competencyId: p.competencyId!, competencyName: competencyNameById.get(p.competencyId!) ?? "",
    }));
}
