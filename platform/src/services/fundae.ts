import { and, eq } from "drizzle-orm";
import { fundaeAction, fundaeParticipation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export const MIN_HORAS = 2;              // acción formativa bonificable mínima (RD 694/2017)
export const CONTROL_THRESHOLD = 0.75;   // finaliza con ≥75% de los controles (Orden TMS/368/2019)

export interface ActionInput {
  orgId: string; title: string; horas: number; tutorId: string;
  competencyId?: string; relatedPuesto?: string; esCertProfesionalidad?: boolean;
}

/** Crea una acción formativa. Valida el mínimo de 2h y exige tutor-formador. */
export async function createAction(deps: SvcDeps, input: ActionInput): Promise<string> {
  if (input.horas < MIN_HORAS) throw new Error(`acción no bonificable: mínimo ${MIN_HORAS} horas`);
  if (!input.tutorId) throw new Error("FUNDAE exige tutor-formador (un coach interno vale)");
  const id = deps.newId();
  await deps.db.insert(fundaeAction).values({
    id, organizationId: input.orgId, title: input.title, horas: input.horas, tutorId: input.tutorId,
    competencyId: input.competencyId ?? null, relatedPuesto: input.relatedPuesto ?? null,
    esCertProfesionalidad: input.esCertProfesionalidad ?? false,
  });
  return id;
}

/** Registra participación en teleformación. Finaliza con ≥75% de los controles (no por horas). */
export async function recordParticipation(
  deps: SvcDeps, args: { orgId: string; actionId: string; userId: string; controlsTotal: number; controlsDone: number },
): Promise<{ finalizado: boolean }> {
  if (args.controlsTotal <= 0) throw new Error("controlsTotal debe ser > 0");
  const finalizado = args.controlsDone / args.controlsTotal >= CONTROL_THRESHOLD;
  await deps.db.insert(fundaeParticipation).values({
    id: deps.newId(), organizationId: args.orgId, actionId: args.actionId, userId: args.userId,
    controlsTotal: args.controlsTotal, controlsDone: args.controlsDone, finalizado,
  });
  return { finalizado };
}

export interface Justification {
  action: { id: string; title: string; horas: number; modalidad: string; tutorId: string };
  bonificable: boolean;
  motivoNoBonificable: string | null;
  participants: { userId: string; controlsTotal: number; controlsDone: number; finalizado: boolean }[];
}

/**
 * Paquete justificativo para que la EMPRESA CLIENTE comunique como "empresa bonificada".
 * Boomatik = proveedor docente (no entidad organizadora de terceros salvo inscripción).
 */
export async function exportJustification(deps: SvcDeps, orgId: string, actionId: string): Promise<Justification> {
  const [a] = await deps.db.select().from(fundaeAction)
    .where(and(eq(fundaeAction.id, actionId), eq(fundaeAction.organizationId, orgId)));
  if (!a) throw new Error("acción no encontrada en esta organización");

  let motivo: string | null = null;
  if (a.horas < MIN_HORAS) motivo = `duración < ${MIN_HORAS}h`;
  else if (a.esCertProfesionalidad) motivo = "conduce a certificado de profesionalidad (requiere acreditación)";
  else if (!a.tutorId) motivo = "sin tutor-formador";

  const parts = await deps.db.select().from(fundaeParticipation)
    .where(and(eq(fundaeParticipation.organizationId, orgId), eq(fundaeParticipation.actionId, actionId)));

  return {
    action: { id: a.id, title: a.title, horas: a.horas, modalidad: a.modalidad, tutorId: a.tutorId },
    bonificable: motivo === null,
    motivoNoBonificable: motivo,
    participants: parts.map((p) => ({
      userId: p.userId, controlsTotal: p.controlsTotal, controlsDone: p.controlsDone, finalizado: p.finalizado,
    })),
  };
}
