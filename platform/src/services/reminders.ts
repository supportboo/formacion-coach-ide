import { and, eq } from "drizzle-orm";
import { appliedCase } from "../db/schema.js";
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

  return out;
}
