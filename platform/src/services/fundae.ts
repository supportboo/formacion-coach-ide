import { and, desc, eq, inArray } from "drizzle-orm";
import { certificate, fundaeAction, fundaeParticipation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

// Reglas verificadas en fuentes oficiales el 28-09-2026 (RD 694/2017, Ley 30/2015, RD 1189/2025, fundae.es).
export const MIN_HORAS = 2;              // acción formativa bonificable mínima (RD 694/2017)
export const MAX_HORAS_DIA = 8;          // máximo de horas por día
export const CONTROL_THRESHOLD = 0.75;   // en teleformación finaliza quien hace ≥75 % de los controles
export const TUTOR_RATIO = 80;           // teleformación: al menos 1 tutor por cada 80 participantes (RD 694/2017 art. 4.2)
export const RLT_DAYS = 15;              // información a la representación legal de los trabajadores
export const NOTIFY_DAYS = 2;            // comunicación de inicio a FUNDAE, días naturales antes
export const DIPLOMA_DAYS = 60;          // diploma en ≤ 2 meses desde el fin
export const KEEP_YEARS = 4;             // conservación de la documentación (RD 1189/2025)

const DAY = 86_400_000;

export interface ActionInput {
  orgId: string; title: string; horas: number; tutorId: string;
  competencyId?: string; relatedPuesto?: string; esCertProfesionalidad?: boolean;
  startDate?: Date; endDate?: Date;
}

/** Crea una acción formativa. Valida el mínimo de 2h y exige tutor-formador. */
export async function createAction(deps: SvcDeps, input: ActionInput): Promise<string> {
  if (input.horas < MIN_HORAS) throw new Error(`acción no bonificable: mínimo ${MIN_HORAS} horas`);
  if (!input.tutorId) throw new Error("FUNDAE exige tutor-formador (un coach interno vale)");
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new Error("la fecha de fin es anterior a la de inicio");
  const id = deps.newId();
  await deps.db.insert(fundaeAction).values({
    id, organizationId: input.orgId, title: input.title, horas: input.horas, tutorId: input.tutorId,
    competencyId: input.competencyId ?? null, relatedPuesto: input.relatedPuesto ?? null,
    esCertProfesionalidad: input.esCertProfesionalidad ?? false,
    startDate: input.startDate ?? null, endDate: input.endDate ?? null,
  });
  return id;
}

export type ActionDates = Partial<Record<"startDate" | "endDate" | "rltInformedAt" | "fundaeNotifiedAt" | "qualitySurveyAt", Date | null>>;

/** Registra las fechas del expediente (null = deshacer). */
export async function updateDates(deps: SvcDeps, orgId: string, actionId: string, dates: ActionDates): Promise<void> {
  const r = await deps.db.update(fundaeAction).set(dates)
    .where(and(eq(fundaeAction.id, actionId), eq(fundaeAction.organizationId, orgId))).returning({ id: fundaeAction.id });
  if (!r.length) throw new Error("acción no encontrada en esta organización");
}

export async function listActions(deps: SvcDeps, orgId: string) {
  return deps.db.select({ id: fundaeAction.id, title: fundaeAction.title, horas: fundaeAction.horas, startDate: fundaeAction.startDate })
    .from(fundaeAction).where(eq(fundaeAction.organizationId, orgId)).orderBy(desc(fundaeAction.createdAt));
}

/** Registra participación en teleformación. Finaliza con ≥75% de los controles (no por horas). */
export async function recordParticipation(
  deps: SvcDeps, args: { orgId: string; actionId: string; userId: string; controlsTotal: number; controlsDone: number },
): Promise<{ finalizado: boolean }> {
  if (args.controlsTotal <= 0) throw new Error("controlsTotal debe ser > 0");
  if (args.controlsDone < 0 || args.controlsDone > args.controlsTotal) throw new Error("controles hechos fuera de rango");
  const [a] = await deps.db.select({ id: fundaeAction.id }).from(fundaeAction)
    .where(and(eq(fundaeAction.id, args.actionId), eq(fundaeAction.organizationId, args.orgId)));
  if (!a) throw new Error("acción no encontrada en esta organización");
  const finalizado = args.controlsDone / args.controlsTotal >= CONTROL_THRESHOLD;
  await deps.db.insert(fundaeParticipation).values({
    id: deps.newId(), organizationId: args.orgId, actionId: args.actionId, userId: args.userId,
    controlsTotal: args.controlsTotal, controlsDone: args.controlsDone, finalizado,
  });
  return { finalizado };
}

export type Estado = "ok" | "falta" | "aviso";
export interface Check { punto: string; estado: Estado; detalle: string }

type ActionRow = typeof fundaeAction.$inferSelect;
type PartRow = { userId: string; finalizado: boolean };

const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
const days = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);

/**
 * Expediente punto por punto (1.17.0, auditoría: antes era solo «bonificable sí/no»).
 * «falta» impide bonificar; «aviso» es algo a vigilar o que aún no toca.
 */
export function expediente(a: ActionRow, parts: PartRow[], diplomas: Set<string>, now = new Date()): Check[] {
  const out: Check[] = [];
  const add = (punto: string, estado: Estado, detalle: string) => out.push({ punto, estado, detalle });
  add("Duración mínima", a.horas >= MIN_HORAS ? "ok" : "falta", `${a.horas} h (mínimo ${MIN_HORAS} h).`);
  add("Tipo de acción", a.esCertProfesionalidad ? "falta" : "ok",
    a.esCertProfesionalidad ? "Conduce a certificado de profesionalidad: requiere acreditación específica." : "No conduce a certificado de profesionalidad.");
  const tutors = a.tutorId ? 1 : 0;
  add("Tutor-formador", !tutors ? "falta" : parts.length > TUTOR_RATIO * tutors ? "falta" : "ok",
    !tutors ? "Sin tutor asignado." : `${parts.length} participantes para ${tutors} tutor (máximo ${TUTOR_RATIO} por tutor en teleformación).`);
  if (!a.startDate || !a.endDate) {
    add("Fechas de inicio y fin", "falta", "Indica cuándo empieza y termina la acción.");
  } else {
    const span = days(a.startDate, a.endDate) + 1;
    add("Fechas de inicio y fin", a.horas <= span * MAX_HORAS_DIA ? "ok" : "falta",
      `Del ${fmt(a.startDate)} al ${fmt(a.endDate)}: ${span} día(s) para ${a.horas} h (máximo ${MAX_HORAS_DIA} h al día).`);
  }
  const start = a.startDate;
  if (!a.rltInformedAt) add("Información a la representación de los trabajadores", start && days(now, start) < RLT_DAYS ? "falta" : "aviso",
    `Pendiente. Debe hacerse al menos ${RLT_DAYS} días antes del inicio; si no, se pierde la bonificación.`);
  else add("Información a la representación de los trabajadores", start && days(a.rltInformedAt, start) < RLT_DAYS ? "falta" : "ok",
    `Informada el ${fmt(a.rltInformedAt)}${start ? ` (${days(a.rltInformedAt, start)} días antes del inicio; mínimo ${RLT_DAYS})` : ""}.`);
  if (!a.fundaeNotifiedAt) add("Comunicación de inicio a FUNDAE", start && days(now, start) < NOTIFY_DAYS ? "falta" : "aviso",
    `Pendiente. Debe comunicarse al menos ${NOTIFY_DAYS} días naturales antes del inicio.`);
  else add("Comunicación de inicio a FUNDAE", start && days(a.fundaeNotifiedAt, start) < NOTIFY_DAYS ? "falta" : "ok",
    `Comunicada el ${fmt(a.fundaeNotifiedAt)}.`);
  const done = parts.filter((p) => p.finalizado);
  add("Participantes que finalizan", !parts.length ? "aviso" : done.length ? "ok" : "aviso",
    parts.length ? `${done.length} de ${parts.length} han hecho al menos el ${CONTROL_THRESHOLD * 100} % de los controles. Solo se bonifica a quien finaliza.` : "Aún no hay participantes registrados.");
  const ended = !!a.endDate && a.endDate <= now;
  add("Cuestionario de calidad", a.qualitySurveyAt ? "ok" : ended ? "falta" : "aviso",
    a.qualitySurveyAt ? `Pasado el ${fmt(a.qualitySurveyAt)}.` : "Pendiente: pásalo a los participantes al terminar y guárdalo.");
  const missing = done.filter((p) => !diplomas.has(p.userId)).length;
  const late = ended && days(a.endDate!, now) > DIPLOMA_DAYS;
  add("Diplomas", !done.length ? "aviso" : missing ? (late ? "falta" : "aviso") : "ok",
    !done.length ? "Se emiten a quien finaliza." : missing ? `${missing} participante(s) que han finalizado sin diploma (plazo: ${DIPLOMA_DAYS} días desde el fin).` : "Todos los que han finalizado tienen diploma.");
  add("Conservación de la documentación", "aviso",
    `Guardar ${KEEP_YEARS} años${a.endDate ? ` (hasta el ${fmt(new Date(a.endDate.getTime() + KEEP_YEARS * 365.25 * DAY))})` : ""}: facturas, registros de la plataforma, controles, cuestionario de calidad y CV del tutor.`);
  return out;
}

export interface Justification {
  action: { id: string; title: string; horas: number; modalidad: string; tutorId: string; startDate: string | null; endDate: string | null };
  bonificable: boolean;
  motivoNoBonificable: string | null;
  expediente: Check[];
  participants: { userId: string; controlsTotal: number; controlsDone: number; finalizado: boolean; diploma: boolean }[];
}

/**
 * Expediente justificativo para que la EMPRESA CLIENTE comunique como "empresa bonificada".
 * Brandooers = proveedor docente (no entidad organizadora de terceros salvo inscripción).
 */
export async function exportJustification(deps: SvcDeps, orgId: string, actionId: string, now = new Date()): Promise<Justification> {
  const [a] = await deps.db.select().from(fundaeAction)
    .where(and(eq(fundaeAction.id, actionId), eq(fundaeAction.organizationId, orgId)));
  if (!a) throw new Error("acción no encontrada en esta organización");
  const parts = await deps.db.select().from(fundaeParticipation)
    .where(and(eq(fundaeParticipation.organizationId, orgId), eq(fundaeParticipation.actionId, actionId)));
  const ids = [...new Set(parts.map((p) => p.userId))];
  const certs = ids.length && a.competencyId ? await deps.db.select({ userId: certificate.userId }).from(certificate)
    .where(and(eq(certificate.organizationId, orgId), eq(certificate.competencyId, a.competencyId), inArray(certificate.userId, ids))) : [];
  const diplomas = new Set(certs.map((c) => c.userId));
  const checks = expediente(a, parts, diplomas, now);
  const faltas = checks.filter((c) => c.estado === "falta");
  return {
    action: { id: a.id, title: a.title, horas: a.horas, modalidad: a.modalidad, tutorId: a.tutorId,
      startDate: a.startDate?.toISOString() ?? null, endDate: a.endDate?.toISOString() ?? null },
    bonificable: faltas.length === 0,
    motivoNoBonificable: faltas.length ? faltas.map((f) => f.punto).join(", ") : null,
    expediente: checks,
    participants: parts.map((p) => ({
      userId: p.userId, controlsTotal: p.controlsTotal, controlsDone: p.controlsDone, finalizado: p.finalizado, diploma: diplomas.has(p.userId),
    })),
  };
}
