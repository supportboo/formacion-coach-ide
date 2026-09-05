import { eq } from "drizzle-orm";
import { careerPath } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import { getLevel } from "./learning.js";

export interface CareerRequirement { competencyId: string; minLevel: number }

export async function definePath(
  deps: SvcDeps,
  args: { orgId: string; fromPuestoId?: string; toPuestoId: string; requirements: CareerRequirement[] },
): Promise<string> {
  if (args.requirements.length === 0) throw new Error("un plan de carrera necesita al menos un requisito");
  const id = deps.newId();
  await deps.db.insert(careerPath).values({
    id, organizationId: args.orgId, fromPuestoId: args.fromPuestoId ?? null,
    toPuestoId: args.toPuestoId, requirements: args.requirements,
  });
  return id;
}

export const listPaths = (deps: SvcDeps, orgId: string) =>
  deps.db.select().from(careerPath).where(eq(careerPath.organizationId, orgId));

export interface PathProgress {
  pathId: string; toPuestoId: string; eligible: boolean;
  requirements: (CareerRequirement & { currentLevel: number; met: boolean })[];
}

/** Progreso real de un empleado hacia cada plan de carrera de su empresa (nunca inventado, solo niveles reales). */
export async function myProgress(deps: SvcDeps, orgId: string, userId: string): Promise<PathProgress[]> {
  const paths = await listPaths(deps, orgId);
  const out: PathProgress[] = [];
  for (const p of paths) {
    const requirements = await Promise.all(p.requirements.map(async (r) => {
      const currentLevel = await getLevel(deps, orgId, userId, r.competencyId);
      return { ...r, currentLevel, met: currentLevel >= r.minLevel };
    }));
    out.push({ pathId: p.id, toPuestoId: p.toPuestoId, eligible: requirements.every((r) => r.met), requirements });
  }
  return out;
}
