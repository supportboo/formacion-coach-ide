import { eq } from "drizzle-orm";
import { organization } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

/**
 * Perks por nivel configurables por empresa (gamificación). Se guardan en organization.metadata.perks
 * (sin migración, igual que los supuestos de ROI). Mapa nivel -> recompensa que la empresa promete al
 * llegar a ese nivel de una competencia. Guardarraíl: recompensas NO salariales por defecto el primer año.
 * Niveles: 1 En formación · 2 Aplica · 3 Referente · 4 Custodio.
 */
export type Perks = Record<string, string>; // { "2": "...", "3": "...", "4": "..." }

export const DEFAULT_PERKS: Perks = {
  "2": "Reconocimiento del equipo y autonomía real en esa tarea",
  "3": "Formas a un compañero y cuenta como mérito para tu desarrollo",
  "4": "Referente de la empresa en esa competencia; entra en el plan de carrera",
};

export async function getPerks(deps: SvcDeps, orgId: string): Promise<Perks> {
  const [o] = await deps.db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, orgId));
  try { const m = o?.metadata ? JSON.parse(o.metadata) : {}; if (m && m.perks && typeof m.perks === "object") return { ...DEFAULT_PERKS, ...m.perks }; } catch { /* metadata no-JSON */ }
  return { ...DEFAULT_PERKS };
}

export async function savePerks(deps: SvcDeps, orgId: string, perks: Perks): Promise<Perks> {
  const [o] = await deps.db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, orgId));
  let meta: Record<string, unknown> = {};
  try { meta = o?.metadata ? JSON.parse(o.metadata) : {}; } catch { meta = {}; }
  // Solo niveles válidos 1-4, texto acotado.
  const clean: Perks = {};
  for (const k of ["1", "2", "3", "4"]) if (perks[k] != null) clean[k] = String(perks[k]).slice(0, 200);
  meta.perks = clean;
  await deps.db.update(organization).set({ metadata: JSON.stringify(meta) }).where(eq(organization.id, orgId));
  return { ...DEFAULT_PERKS, ...clean };
}
