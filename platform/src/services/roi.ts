import { and, eq, sql } from "drizzle-orm";
import { coaching, levelByCompetency, member, organization, validation } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { dependencyRisks } from "./analytics.js";

/**
 * ROI de SkillUp para una empresa. Doctrina de certeza (LEY #0):
 *  - HECHOS: cuentas reales de la base de datos (competencias aplicadas, validaciones, coaching…).
 *  - ESTIMACIÓN: cada valor en euros sale de SUPUESTOS editables por empresa (coste de un curso
 *    externo, valor de la hora, horas ahorradas…). Nunca se presenta un euro como medido.
 * El marco FUNDAE: la inversión en formación la cubre el crédito FUNDAE (coste neto ~0); lo que
 * SkillUp añade encima es retorno por eficiencia y por transferencia interna de conocimiento.
 */

export interface RoiAssumptions {
  costeCursoExternoPorPersona: number; // € que costaría formar a 1 persona en 1 competencia fuera
  valorHoraEmpleado: number;           // € coste/hora cargado de un empleado
  horasMesPorCompetenciaAplicada: number; // h/mes que ahorra alguien cuando de verdad aplica una competencia
  costeReemplazoPersonaClave: number;  // € de perder y reemplazar a una persona con conocimiento único
  presupuestoFundaeAnual: number | null; // € de crédito FUNDAE que la empresa dedica a formación (opcional)
  costeLicenciaSkillUpAnual: number;   // € que paga la empresa por SkillUp al año (0 si aún no aplica)
}

export const DEFAULT_ASSUMPTIONS: RoiAssumptions = {
  costeCursoExternoPorPersona: 350,
  valorHoraEmpleado: 22,
  horasMesPorCompetenciaAplicada: 2,
  costeReemplazoPersonaClave: 8000,
  presupuestoFundaeAnual: null,
  costeLicenciaSkillUpAnual: 0,
};

export interface RoiFacts {
  personas: number;            // miembros de la empresa
  competenciasAplicadas: number; // (persona×competencia) a nivel >= 2 "Aplica"
  referentes: number;          // (persona×competencia) a nivel >= 3 "Referente/Custodio"
  validacionesAprobadas: number; // casos prácticos validados por un humano
  transferenciasInternas: number; // coaching que llegó a "logrado" (enseñar hasta que aplica)
  riesgosCriticos: number;     // competencias críticas con <=1 referente (bus factor)
}

export interface RoiLine {
  label: string;
  amount: number;              // € anuales
  kind: "ahorro" | "eficiencia";
  base: string;                // el HECHO en que se apoya
  supuesto: string;            // el SUPUESTO editable que lo valora
}

export interface RoiResult {
  facts: RoiFacts;
  assumptions: RoiAssumptions;
  lines: RoiLine[];
  retornoAnual: number;
  riesgoAbiertoEur: number;    // coste potencial si se van las personas clave (informativo, no es retorno)
  fundae: { presupuesto: number | null; cubierto: boolean; costeNeto: number; mensaje: string };
  roiPct: number | null;       // (retorno - coste licencia) / coste licencia; null si no hay coste introducido
  resumenCifras: string;       // línea corta para titulares
}

/** Matemática pura (testeable sin BD). Todo en euros anuales. */
export function roiFromCounts(f: RoiFacts, a: RoiAssumptions): RoiResult {
  const eur = (n: number) => Math.round(n);
  const ahorroFormacion = f.validacionesAprobadas * a.costeCursoExternoPorPersona;
  const ahorroTransferencia = f.transferenciasInternas * a.costeCursoExternoPorPersona;
  const gananciaEficiencia = f.competenciasAplicadas * a.horasMesPorCompetenciaAplicada * 12 * a.valorHoraEmpleado;
  const lines: RoiLine[] = [
    { label: "Formación que no has comprado fuera", amount: eur(ahorroFormacion), kind: "ahorro",
      base: `${f.validacionesAprobadas} competencias validadas por un responsable`, supuesto: `${a.costeCursoExternoPorPersona} €/curso externo por persona` },
    { label: "Conocimiento propagado dentro (compañero a compañero)", amount: eur(ahorroTransferencia), kind: "ahorro",
      base: `${f.transferenciasInternas} transferencias internas logradas`, supuesto: `${a.costeCursoExternoPorPersona} €/curso externo evitado` },
    { label: "Eficiencia por aplicar lo aprendido", amount: eur(gananciaEficiencia), kind: "eficiencia",
      base: `${f.competenciasAplicadas} competencias en uso real (nivel Aplica o superior)`, supuesto: `${a.horasMesPorCompetenciaAplicada} h/mes × ${a.valorHoraEmpleado} €/h` },
  ];
  const retornoAnual = eur(ahorroFormacion + ahorroTransferencia + gananciaEficiencia);
  const riesgoAbiertoEur = eur(f.riesgosCriticos * a.costeReemplazoPersonaClave);
  const cubierto = a.presupuestoFundaeAnual != null && a.presupuestoFundaeAnual > 0;
  const costeNeto = cubierto ? 0 : a.costeLicenciaSkillUpAnual;
  const fundae = {
    presupuesto: a.presupuestoFundaeAnual,
    cubierto,
    costeNeto,
    mensaje: cubierto
      ? `Tu inversión en formación (hasta ${eur(a.presupuestoFundaeAnual!)} € de crédito FUNDAE) queda cubierta: coste neto 0. Todo lo de abajo es beneficio limpio encima de eso.`
      : "Introduce tu crédito FUNDAE anual para ver que la formación te sale a coste neto cero y el resto es beneficio.",
  };
  const roiPct = a.costeLicenciaSkillUpAnual > 0
    ? Math.round(((retornoAnual - a.costeLicenciaSkillUpAnual) / a.costeLicenciaSkillUpAnual) * 100)
    : null;
  return {
    facts: f, assumptions: a, lines, retornoAnual, riesgoAbiertoEur, fundae, roiPct,
    resumenCifras: `${eur(retornoAnual)} € de retorno anual estimado con ${f.competenciasAplicadas} competencias ya en uso y ${f.transferenciasInternas} transferencias internas.`,
  };
}

/** Lee los supuestos de la empresa (guardados en organization.metadata.roi), con defaults. */
export async function getAssumptions(deps: SvcDeps, orgId: string): Promise<RoiAssumptions> {
  const [o] = await deps.db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, orgId));
  let saved: Partial<RoiAssumptions> = {};
  try { const m = o?.metadata ? JSON.parse(o.metadata) : {}; if (m && m.roi) saved = m.roi; } catch { /* metadata no-JSON */ }
  return { ...DEFAULT_ASSUMPTIONS, ...saved };
}

/** Guarda supuestos (merge) en organization.metadata.roi sin pisar el resto del metadata. */
export async function saveAssumptions(deps: SvcDeps, orgId: string, partial: Partial<RoiAssumptions>): Promise<RoiAssumptions> {
  const [o] = await deps.db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, orgId));
  let meta: Record<string, unknown> = {};
  try { meta = o?.metadata ? JSON.parse(o.metadata) : {}; } catch { meta = {}; }
  const merged = { ...DEFAULT_ASSUMPTIONS, ...(meta.roi as object || {}), ...partial };
  meta.roi = merged;
  await deps.db.update(organization).set({ metadata: JSON.stringify(meta) }).where(eq(organization.id, orgId));
  return merged as RoiAssumptions;
}

async function countRows(deps: SvcDeps, tbl: any, where: any): Promise<number> {
  const r = await deps.db.select({ c: sql<number>`count(*)::int` }).from(tbl).where(where);
  return r[0]?.c ?? 0;
}

/** Reúne los HECHOS de la BD y calcula el ROI con los supuestos de la empresa. */
export async function computeRoi(deps: SvcDeps, orgId: string, override?: Partial<RoiAssumptions>): Promise<RoiResult> {
  const a = { ...(await getAssumptions(deps, orgId)), ...override };
  const [personas, aplicadas, referentes, validaciones, transferencias, risks] = await Promise.all([
    countRows(deps, member, eq(member.organizationId, orgId)),
    countRows(deps, levelByCompetency, and(eq(levelByCompetency.organizationId, orgId), sql`${levelByCompetency.level} >= 2`)),
    countRows(deps, levelByCompetency, and(eq(levelByCompetency.organizationId, orgId), sql`${levelByCompetency.level} >= 3`)),
    countRows(deps, validation, and(eq(validation.organizationId, orgId), eq(validation.decision, "aprobado"))),
    countRows(deps, coaching, and(eq(coaching.organizationId, orgId), eq(coaching.status, "logrado"))),
    dependencyRisks(deps, orgId),
  ]);
  const facts: RoiFacts = {
    personas, competenciasAplicadas: aplicadas, referentes,
    validacionesAprobadas: validaciones, transferenciasInternas: transferencias, riesgosCriticos: risks.length,
  };
  return roiFromCounts(facts, a);
}

/**
 * El "agente de ROI": lee las cifras ya calculadas y escribe un informe corto, elegante y honesto
 * para el cliente. No inventa números (recibe los del cálculo) y deja claro qué es HECHO y qué es
 * ESTIMACIÓN. Español de España, sin markdown ni símbolos, tono de valor para dirección.
 */
export async function roiNarrative(llm: Llm, orgName: string, r: RoiResult, opts: { orgId: string; userId?: string }): Promise<string> {
  const datos = JSON.stringify({
    empresa: orgName, facts: r.facts, retornoAnual: r.retornoAnual, lineas: r.lines,
    fundae: r.fundae, riesgoAbiertoEur: r.riesgoAbiertoEur, roiPct: r.roiPct, supuestos: r.assumptions,
  });
  const system =
    "Eres el analista de ROI de Brandooers SkillUp. Escribes para la dirección de una empresa cliente. "
    + "Objetivo: que vean, con orgullo y claridad, el valor que ya les aporta SkillUp y por qué merece la pena seguir. "
    + "Usa SOLO los números que te doy; no inventes ni redondees a tu antojo. Distingue lo que es HECHO (competencias en uso, "
    + "validaciones, transferencias internas) de lo que es ESTIMACIÓN en euros (sale de supuestos editables). "
    + "Si hay crédito FUNDAE, explica que la formación les sale a coste neto cero y que el retorno por eficiencia y por que el "
    + "conocimiento se quede dentro es beneficio limpio encima. Menciona el riesgo de dependencia como algo que estamos reduciendo. "
    + "Español de España, cálido y profesional. Sin markdown, sin símbolos, sin emojis. 3 párrafos cortos como máximo.";
  return llm.generate({
    system, messages: [{ role: "user", content: "Datos del cálculo (no inventes fuera de esto):\n" + datos + "\n\nEscribe el informe para la dirección de " + orgName + "." }],
    maxTokens: 500, orgId: opts.orgId, userId: opts.userId, kind: "chat",
  });
}
