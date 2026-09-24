import { and, eq, gte } from "drizzle-orm";
import { competency, evidence } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

/**
 * Seguimiento de aplicación (R3) y lado BENEFICIO del ROI (R8).
 *
 * Semanas después de validar una competencia, se le pregunta a la persona cómo la está aplicando
 * de verdad en su trabajo. Su respuesta se guarda como EVIDENCIA real (kind "kpi", ownerType
 * "seguimiento") — antes ese hueco existía en el esquema y no lo escribía nadie. Con esto:
 *  - el conocimiento no se pierde (queda ligado a la competencia y a la persona),
 *  - y por primera vez hay un dato REAL de aplicación con el que demostrar ROI, nunca inventado.
 */
export type Aplica = "si" | "parcial" | "no";

export interface CheckinInput {
  orgId: string; userId: string; competencyId: string;
  aplica: Aplica; impacto?: string; sensacion?: number; // sensacion 1-5 (cómo se siente con lo aprendido)
}

export async function recordCheckin(deps: SvcDeps, input: CheckinInput): Promise<string> {
  // La competencia debe ser de la organización (no cross-tenant).
  const [c] = await deps.db.select({ id: competency.id }).from(competency)
    .where(and(eq(competency.id, input.competencyId), eq(competency.organizationId, input.orgId)));
  if (!c) throw new Error("competencia no encontrada en esta organización");
  const sensacion = typeof input.sensacion === "number" ? Math.min(5, Math.max(1, Math.round(input.sensacion))) : undefined;
  const note = JSON.stringify({ aplica: input.aplica, impacto: (input.impacto || "").slice(0, 800) || undefined, sensacion });
  const id = deps.newId();
  await deps.db.insert(evidence).values({
    id, organizationId: input.orgId, ownerType: "seguimiento", ownerId: input.competencyId,
    kind: "kpi", url: null, note, createdBy: input.userId,
  });
  return id;
}

export interface ApplicationRoi {
  checkins: number;                 // nº de seguimientos capturados (dato real; 0 = sin datos)
  aplica: number; parcial: number; noAplica: number;
  tasaAplicacion: number | null;    // % que aplica (si o parcial) / total, o null si no hay datos
  sensacionMedia: number | null;    // media de sensación 1-5, o null
}

/**
 * Agrega los check-ins de aplicación de la organización en los últimos `days` días.
 * Doctrina: cero cifras inventadas. Si no hay check-ins, todo viene a 0/null (sin datos), nunca un número falso.
 */
export async function applicationRoi(deps: SvcDeps, orgId: string, days = 90): Promise<ApplicationRoi> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await deps.db.select({ note: evidence.note }).from(evidence).where(and(
    eq(evidence.organizationId, orgId), eq(evidence.ownerType, "seguimiento"),
    eq(evidence.kind, "kpi"), gte(evidence.createdAt, since),
  ));
  return summarizeCheckins(rows.map((r) => r.note));
}

/**
 * Agrega las notas de check-in (JSON {aplica, impacto, sensacion}) en el resumen de ROI.
 * Pura y testeable: cero cifras inventadas — sin datos devuelve 0/null, nunca un número falso.
 */
export function summarizeCheckins(notes: (string | null)[]): ApplicationRoi {
  let aplica = 0, parcial = 0, noAplica = 0, sensSum = 0, sensN = 0;
  for (const note of notes) {
    let d: { aplica?: string; sensacion?: number } = {};
    try { d = JSON.parse(String(note || "{}")); } catch { /* nota no-JSON, se ignora */ }
    if (d.aplica === "si") aplica++;
    else if (d.aplica === "parcial") parcial++;
    else if (d.aplica === "no") noAplica++;
    if (typeof d.sensacion === "number") { sensSum += d.sensacion; sensN++; }
  }
  const total = aplica + parcial + noAplica;
  return {
    checkins: notes.length, aplica, parcial, noAplica,
    tasaAplicacion: total ? Math.round(((aplica + parcial) / total) * 100) : null,
    sensacionMedia: sensN ? Math.round((sensSum / sensN) * 10) / 10 : null,
  };
}
