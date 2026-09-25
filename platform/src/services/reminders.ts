import { and, eq, gte, inArray } from "drizzle-orm";
import { appliedCase, competency, evidence, levelByCompetency } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import { listPendingCases } from "./validation.js";
import { expiringSoon } from "./rewards.js";

export interface Reminder { kind: string; message: string; refId?: string }

/**
 * Recordatorios calculados en el momento (sin tabla ni cron): casos propios sin entregar hace
 * días, certificados que caducan pronto, y casos de otros pendientes de validar si el usuario
 * puede validar. Siempre datos reales de ahora mismo, nunca una cola que se puede desincronizar.
 */
export async function myReminders(deps: SvcDeps, orgId: string, userId: string, role: string): Promise<Reminder[]> {
  const out: Reminder[] = [];

  const drafts = await deps.db.select().from(appliedCase)
    .where(and(eq(appliedCase.organizationId, orgId), eq(appliedCase.userId, userId), eq(appliedCase.status, "borrador")));
  const STALE_DAYS = 3;
  for (const d of drafts) {
    const ageDays = (Date.now() - d.createdAt.getTime()) / 86_400_000;
    if (ageDays >= STALE_DAYS) {
      out.push({ kind: "caso_sin_entregar", message: `Tienes un caso práctico abierto hace ${Math.floor(ageDays)} días sin entregar.`, refId: d.id });
    }
  }

  const expiring = await expiringSoon(deps, orgId, 30);
  for (const cert of expiring.filter((c) => c.userId === userId)) {
    const days = Math.ceil((cert.expiresAt!.getTime() - Date.now()) / 86_400_000);
    out.push({ kind: "certificado_caduca", message: `Tu certificado "${cert.title}" caduca en ${days} días.`, refId: cert.code });
  }

  if (role !== "empleado") {
    const pending = await listPendingCases(deps, orgId, userId, role);
    if (pending.length > 0) {
      out.push({ kind: "validaciones_pendientes", message: `Tienes ${pending.length} caso(s) esperando tu validación.` });
    }
  }

  // Seguimiento en el tiempo (R3): lo que validó hace semanas -> "¿cómo lo estás aplicando?".
  // Es lo que convierte formación en resultado demostrable. Sin cron: se calcula al abrir el panel.
  out.push(...(await followUpReminders(deps, orgId, userId)));

  return out;
}

const APPLY_AFTER_DAYS = 14; // primer check-in de aplicación tras validar
const RECHECK_DAYS = 30;     // no se vuelve a preguntar por la misma competencia antes de un mes

/** Genera el aviso de seguimiento de aplicación para competencias validadas hace tiempo y sin check-in reciente. */
async function followUpReminders(deps: SvcDeps, orgId: string, userId: string): Promise<Reminder[]> {
  const levels = await deps.db.select({
    competencyId: levelByCompetency.competencyId, updatedAt: levelByCompetency.updatedAt,
  }).from(levelByCompetency).where(and(
    eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.userId, userId),
    gte(levelByCompetency.level, 2),
  ));
  const compIds = levels.map((l) => l.competencyId).filter((x): x is string => !!x);
  if (compIds.length === 0) return [];

  const checkins = await deps.db.select({ ownerId: evidence.ownerId, createdAt: evidence.createdAt })
    .from(evidence).where(and(
      eq(evidence.organizationId, orgId), eq(evidence.createdBy, userId),
      eq(evidence.ownerType, "seguimiento"), eq(evidence.kind, "kpi"),
    ));
  const lastCheckin = new Map<string, number>();
  for (const ci of checkins) {
    const t = ci.createdAt.getTime();
    if (ci.ownerId && t > (lastCheckin.get(ci.ownerId) ?? 0)) lastCheckin.set(ci.ownerId, t);
  }

  const names = await deps.db.select({ id: competency.id, name: competency.name }).from(competency)
    .where(and(eq(competency.organizationId, orgId), inArray(competency.id, compIds)));
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  const out: Reminder[] = [];
  for (const l of levels) {
    if (!l.competencyId) continue;
    const ageDays = (Date.now() - l.updatedAt.getTime()) / 86_400_000;
    const last = lastCheckin.get(l.competencyId);
    const sinceCheck = last ? (Date.now() - last) / 86_400_000 : Infinity;
    if (ageDays >= APPLY_AFTER_DAYS && sinceCheck >= RECHECK_DAYS) {
      out.push({
        kind: "seguimiento_aplicacion", refId: l.competencyId,
        message: `Validaste "${nameById.get(l.competencyId) || "una competencia"}" hace ${Math.floor(ageDays)} días. ¿Cómo lo estás aplicando en tu trabajo?`,
      });
    }
  }
  return out;
}
