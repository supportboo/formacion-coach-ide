import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  appliedCase, coaching, competency, enrollment, evidence, levelByCompetency, member, roiStudy, testAttempt, validation,
} from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { dependencyRisks } from "./analytics.js";
import { summarizeCheckins } from "./followup.js";

/**
 * Informe de ROI de la formación con metodología reconocida:
 *  - Niveles 1-4 de Kirkpatrick (reacción, aprendizaje, comportamiento/aplicación, resultados)
 *    medidos por la plataforma: cada indicador con fórmula, fuente, periodo, n y certeza.
 *  - Nivel 5 (ROI) de la ROI Methodology de Phillips SOLO con datos que introduce la empresa:
 *    costes completos (fully loaded), métrica de negocio con antes/después o grupo de control,
 *    aislamiento del efecto y ajuste por confianza. Sin esos datos: "Sin datos suficientes".
 *  - Intangibles: se listan, nunca se convierten a euros (principio 11 de Phillips).
 * Cero valores por defecto en euros: lo que no introduce la empresa es "sin datos".
 */

/* ------------------------------------------------------------------ Fuentes (leídas) */
export interface Source { id: string; author: string; year: string; title: string; url: string; usedFor: string }
export const SOURCES: Source[] = [
  { id: "phillips-roi", author: "ROI Institute (Jack J. Phillips y Patti P. Phillips)", year: "s. f.", title: "ROI Methodology: los cinco niveles, BCR y ROI",
    url: "https://roiinstitute.net/roi-methodology/", usedFor: "Niveles 1-5, fórmulas BCR = beneficios / costes y ROI (%) = beneficios netos / costes × 100." },
  { id: "phillips-workbook", author: "ROI Institute", year: "2022", title: "Measuring ROI in Learning and Development (workbook): 12 Guiding Principles, aislamiento, ajuste por confianza, categorías de coste",
    url: "https://roiinstitute.net/wp-content/uploads/2022/03/Measuring-ROI-in-Learning-and-Development_Workbook-1.pdf",
    usedFor: "Principios conservadores (alternativa más conservadora, aislar el efecto, ajustar estimaciones por confianza, solo el primer año, costes completos, intangibles sin monetizar) y ajuste mejora × atribución × confianza." },
  { id: "kirkpatrick", author: "Kirkpatrick Partners", year: "s. f.", title: "The Kirkpatrick Model (cuatro niveles)",
    url: "https://www.kirkpatrickpartners.com/the-kirkpatrick-model/", usedFor: "Definición de los niveles 1 (reacción), 2 (aprendizaje), 3 (comportamiento) y 4 (resultados)." },
  { id: "baldwin-ford", author: "Baldwin, T. T. y Ford, J. K.", year: "1988", title: "Transfer of training: A review and directions for future research. Personnel Psychology, 41, 63-105",
    url: "https://flip.tools/wp-content/uploads/2023/11/01.-Transfer-of-training-1988_Baldwin-Ford.pdf",
    usedFor: "La transferencia exige generalizar lo aprendido al puesto y mantenerlo en el tiempo: por eso medimos aplicación en el puesto (seguimiento) y no solo aprobados." },
  { id: "dunlosky", author: "Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J. y Willingham, D. T.", year: "2013",
    title: "Improving Students' Learning With Effective Learning Techniques. Psychological Science in the Public Interest, 14(1), 4-58",
    url: "https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html",
    usedFor: "La práctica con pruebas y la práctica distribuida tienen utilidad alta; releer y subrayar, baja. Justifica medir pruebas e intentos, no horas de pantalla." },
  { id: "roediger-karpicke", author: "Roediger, H. L. y Karpicke, J. D.", year: "2006",
    title: "Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249-255",
    url: "https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/",
    usedFor: "Efecto de la evaluación: hacer pruebas mejora la retención a días y semanas frente a reestudiar." },
  { id: "cepeda", author: "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T. y Rohrer, D.", year: "2006",
    title: "Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132, 354-380",
    url: "https://augmentingcognition.com/assets/Cepeda2006.pdf",
    usedFor: "Metaanálisis (839 comparaciones): espaciar la práctica mejora la retención; base para exigir casos repartidos en semanas y para medir retención diferida." },
  { id: "murre-dros", author: "Murre, J. M. J. y Dros, J.", year: "2015", title: "Replication and Analysis of Ebbinghaus' Forgetting Curve. PLOS ONE, 10(7), e0120644",
    url: "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0120644",
    usedFor: "Réplica de la curva del olvido: sin repaso lo aprendido se pierde; un aprobado puntual no prueba retención." },
  { id: "fundae", author: "FUNDAE (Fundación Estatal para la Formación en el Empleo)", year: "s. f.", title: "Bonificación de acciones formativas programadas por la empresa",
    url: "https://www.fundae.es/empresas/home/como-bonificarte/bonificaci%C3%B3n-acciones-programadas",
    usedFor: "El crédito sale de la cuota de formación profesional de la propia empresa y las empresas de más de 5 personas deben cofinanciar: la bonificación no hace la formación gratis ni se resta del ROI." },
  { id: "iso30414", author: "The Conference Board (resumen de ISO 30414:2018)", year: "s. f.", title: "Overview of ISO 30414 Human Capital Reporting Standards",
    url: "https://www.conference-board.org/pdf_free/Overview-of-ISO-30414-Human-Capita-Reporting-Standards-Conference-Board.pdf",
    usedFor: "Métricas de «Skills and capabilities»: coste total de formación, % de personas formadas, tasa de competencia de la plantilla, sucesión. Inspiran cobertura y riesgo de dependencia." },
  { id: "nist-wilson", author: "NIST/SEMATECH", year: "s. f.", title: "e-Handbook of Statistical Methods: confidence intervals for proportions (Wilson)",
    url: "https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm",
    usedFor: "Intervalo de confianza del 95 % (Wilson) de cada porcentaje, útil con muestras pequeñas." },
];

/* ------------------------------------------------------------------ Entradas de la empresa (Zod) */
const eur = z.number().min(0).max(100_000_000);
export const costsSchema = z.object({
  licencia: eur.nullable(),              // lo pagado por la plataforma en el periodo
  horasParticipantes: z.number().min(0).max(10_000_000).nullable(), // horas de trabajo dedicadas a formarse
  costeHoraCargado: eur.nullable(),      // coste/hora con salario + cargas sociales (fully loaded)
  costesInternos: eur.nullable(),        // tiempo de validadores, coordinación, administración
  otrosCostes: eur.nullable(),           // desarrollo de contenido, evaluación, materiales…
  bonificacionFundae: eur.nullable(),    // bonificación FUNDAE aplicada (informativo, no resta del ROI)
}).partial();
export type RoiCosts = z.infer<typeof costsSchema>;

export const impactSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  unidad: z.string().trim().max(40).default(""),
  sentido: z.enum(["subir", "bajar"]),                 // qué es mejorar: que la métrica suba o baje
  valorAntes: z.number().nullable(),                   // valor MENSUAL antes del programa
  valorDespues: z.number().nullable(),                 // valor MENSUAL después
  fuenteDatos: z.string().trim().max(200).default(""), // de dónde sale (ERP, CRM, calidad…)
  metodo: z.enum(["antes_despues", "grupo_control"]),
  mejoraGrupoControl: z.number().nullable().default(null), // mejora mensual del grupo que NO se formó
  atribucionPct: z.number().min(0).max(100).nullable().default(null), // % de la mejora atribuible a la formación
  confianzaPct: z.number().min(0).max(100).nullable().default(null),  // confianza en esa estimación
  metodoAtribucion: z.string().trim().max(200).default(""), // quién estimó y cómo
  valorEuroPorUnidad: eur.nullable(),                  // valor en € de 1 unidad de la métrica
  fuenteValor: z.string().trim().max(200).default(""), // de dónde sale ese valor (contabilidad, margen…)
  mesesBeneficio: z.number().int().min(1).max(12).default(12), // principio 9: como mucho el primer año
});
export type ImpactInput = z.infer<typeof impactSchema>;

export const studySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  costs: costsSchema.optional(),
  impacts: z.array(impactSchema).max(10).optional(),
  intangibles: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});
export type StudyInput = z.infer<typeof studySchema>;

/* ------------------------------------------------------------------ Matemática pura (testeable) */
export type Certainty = "medido" | "estimado" | "sin_datos";

/** Intervalo de confianza del 95 % de Wilson para una proporción (NIST e-Handbook). null si n = 0. */
export function wilson(successes: number, n: number, z95 = 1.96): [number, number] | null {
  if (n <= 0) return null;
  const p = successes / n, z2 = z95 * z95;
  const centre = p + z2 / (2 * n);
  const half = z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const den = 1 + z2 / n;
  return [Math.max(0, (centre - half) / den), Math.min(1, (centre + half) / den)];
}

/** Aviso por tamaño de muestra. Umbral 30: convención habitual para tratar una media como estable. */
export function sampleCaveat(n: number): string | null {
  if (n === 0) return null;
  if (n < 10) return `Muestra muy pequeña (n = ${n}): orientativo, no concluyente.`;
  if (n < 30) return `Muestra pequeña (n = ${n}): interpretar con cautela.`;
  return null;
}

const COST_LABELS: Record<string, string> = {
  licencia: "Coste de la plataforma en el periodo",
  horasParticipantes: "Horas de trabajo dedicadas a formarse",
  costeHoraCargado: "Coste por hora con cargas sociales",
  costesInternos: "Coste del tiempo interno (validadores, coordinación)",
  otrosCostes: "Otros costes (contenido, evaluación, materiales)",
};

export interface CostResult { total: number | null; lines: { label: string; amount: number | null }[]; missing: string[] }

/** Costes completos (principio 10). Todos los campos obligatorios: 0 se introduce a mano, null = falta. */
export function fullyLoadedCosts(c: RoiCosts | undefined): CostResult {
  const v = (k: keyof RoiCosts) => (c?.[k] ?? null) as number | null;
  const missing = Object.keys(COST_LABELS).filter((k) => v(k as keyof RoiCosts) == null).map((k) => COST_LABELS[k]!);
  const hours = v("horasParticipantes"), rate = v("costeHoraCargado");
  const participant = hours != null && rate != null ? hours * rate : null;
  const lines = [
    { label: COST_LABELS.licencia!, amount: v("licencia") },
    { label: "Tiempo de las personas formándose (horas × coste/hora)", amount: participant },
    { label: COST_LABELS.costesInternos!, amount: v("costesInternos") },
    { label: COST_LABELS.otrosCostes!, amount: v("otrosCostes") },
  ];
  const total = missing.length ? null : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  return { total, lines, missing };
}

export interface ImpactResult {
  nombre: string; unidad: string; metodo: ImpactInput["metodo"];
  mejoraMensual: number | null;         // mejora bruta (en el sentido de "mejor")
  mejoraAislada: number | null;         // tras restar control o aplicar atribución × confianza
  beneficio: number | null;             // € en el periodo de beneficio (máx. 12 meses)
  formula: string; missing: string[]; input: ImpactInput;
}

/**
 * Una métrica de negocio a euros (Phillips): mejora = después − antes (o al revés si mejorar es bajar);
 * aislamiento = restar la mejora del grupo de control, o aplicar % atribuido × % de confianza;
 * beneficio = mejora aislada × € por unidad × meses (máx. 12, solo el primer año).
 */
export function impactBenefit(i: ImpactInput): ImpactResult {
  const missing: string[] = [];
  if (i.valorAntes == null) missing.push("valor antes");
  if (i.valorDespues == null) missing.push("valor después");
  if (i.valorEuroPorUnidad == null) missing.push("valor en € por unidad");
  if (!i.fuenteValor) missing.push("fuente del valor en €");
  if (i.metodo === "grupo_control" && i.mejoraGrupoControl == null) missing.push("mejora del grupo de control");
  if (i.metodo === "antes_despues") {
    if (i.atribucionPct == null) missing.push("% de la mejora atribuible a la formación");
    if (i.confianzaPct == null) missing.push("% de confianza en esa atribución");
  }
  const meses = Math.min(12, Math.max(1, i.mesesBeneficio ?? 12));
  const base = { nombre: i.nombre, unidad: i.unidad, metodo: i.metodo, input: i };
  const raw = i.valorAntes != null && i.valorDespues != null
    ? (i.sentido === "subir" ? i.valorDespues - i.valorAntes : i.valorAntes - i.valorDespues) : null;
  if (missing.length || raw == null) {
    return { ...base, mejoraMensual: raw, mejoraAislada: null, beneficio: null, formula: "", missing };
  }
  const isolated = i.metodo === "grupo_control"
    ? raw - (i.mejoraGrupoControl as number)
    : raw * ((i.atribucionPct as number) / 100) * ((i.confianzaPct as number) / 100);
  const beneficio = isolated * (i.valorEuroPorUnidad as number) * meses;
  const formula = i.metodo === "grupo_control"
    ? `(${fmt(raw)} − ${fmt(i.mejoraGrupoControl as number)} del grupo de control) × ${fmt(i.valorEuroPorUnidad as number)} €/unidad × ${meses} meses`
    : `${fmt(raw)} × ${i.atribucionPct} % atribuido × ${i.confianzaPct} % de confianza × ${fmt(i.valorEuroPorUnidad as number)} €/unidad × ${meses} meses`;
  return { ...base, mejoraMensual: raw, mejoraAislada: isolated, beneficio, formula, missing };
}
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export interface RoiLevel5 {
  computable: boolean;
  beneficios: number | null; costes: number | null;
  roiPct: number | null; bcr: number | null;
  missing: string[];
  certainty: Certainty;
  formula: string;
}

/** Nivel 5. Solo con costes completos y al menos una métrica de negocio completa. Nunca rellena huecos. */
export function roiLevel5(costs: CostResult, impacts: ImpactResult[]): RoiLevel5 {
  const missing = costs.missing.map((m) => "Costes: " + m.toLowerCase());
  const complete = impacts.filter((i) => i.beneficio != null);
  if (!impacts.length) missing.push("Al menos una métrica de negocio con valor antes y después, convertida a euros");
  else if (!complete.length) for (const i of impacts) missing.push(`Métrica «${i.nombre}»: ${i.missing.join(", ")}`);
  const formula = "ROI (%) = (beneficios − costes) / costes × 100 · BCR = beneficios / costes";
  if (missing.length || costs.total == null || costs.total <= 0) {
    if (costs.total === 0) missing.push("Los costes suman 0 €: sin coste no hay ROI que calcular");
    return { computable: false, beneficios: null, costes: costs.total, roiPct: null, bcr: null, missing, certainty: "sin_datos", formula };
  }
  // Principio 6: las métricas incompletas cuentan como "sin mejora" (0 €), no se extrapolan.
  const beneficios = complete.reduce((a, i) => a + (i.beneficio as number), 0);
  return {
    computable: true, beneficios, costes: costs.total,
    roiPct: Math.round(((beneficios - costs.total) / costs.total) * 1000) / 10,
    bcr: Math.round((beneficios / costs.total) * 100) / 100,
    missing: impacts.filter((i) => i.beneficio == null).map((i) => `Métrica «${i.nombre}» sin completar (cuenta como 0 €): ${i.missing.join(", ")}`),
    certainty: "estimado", formula,
  };
}

/** Mejora entre el primer intento de un test y el mejor intento posterior, por persona y ruta. */
export function retryGain(rows: { userId: string; pathId: string; score: number; at: Date }[]): { mean: number | null; n: number } {
  const by = new Map<string, { score: number; at: number }[]>();
  for (const r of rows) {
    const k = r.userId + "|" + r.pathId;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ score: r.score, at: r.at.getTime() });
  }
  const gains: number[] = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.at - b.at);
    gains.push(Math.max(...list.slice(1).map((x) => x.score)) - list[0]!.score);
  }
  return { mean: gains.length ? Math.round((gains.reduce((a, b) => a + b, 0) / gains.length) * 10) / 10 : null, n: gains.length };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/* ------------------------------------------------------------------ Indicadores de la plataforma (niveles 1-4) */
export interface Metric {
  key: string; level: 1 | 2 | 3 | 4; name: string;
  value: number | null; unit: string;
  ci95: [number, number] | null;        // intervalo de confianza (proporciones), en la misma unidad
  n: number; formula: string; source: string; period: string;
  certainty: Certainty; caveat: string | null; evidence: string[]; // ids de SOURCES
}

function metric(m: Omit<Metric, "certainty" | "caveat" | "ci95"> & { ci95?: [number, number] | null; caveat?: string | null }): Metric {
  return {
    ...m, ci95: m.ci95 ?? null,
    certainty: m.value == null ? "sin_datos" : "medido",
    caveat: m.caveat !== undefined ? m.caveat : (m.value == null ? null : sampleCaveat(m.n)),
  };
}
function pctMetric(base: Omit<Metric, "certainty" | "caveat" | "ci95" | "value" | "unit" | "n">, ok: number, n: number): Metric {
  const ci = wilson(ok, n);
  return metric({ ...base, unit: "%", n, value: n ? Math.round((ok / n) * 1000) / 10 : null,
    ci95: ci ? [Math.round(ci[0] * 1000) / 10, Math.round(ci[1] * 1000) / 10] : null });
}

async function studyRow(deps: SvcDeps, orgId: string) {
  const [row] = await deps.db.select().from(roiStudy).where(eq(roiStudy.organizationId, orgId));
  return row ?? null;
}

function range(col: any, from: Date | null, to: Date | null): SQL[] {
  const out: SQL[] = [];
  if (from) out.push(gte(col, from));
  if (to) out.push(lte(col, to));
  return out;
}

export async function platformIndicators(deps: SvcDeps, orgId: string, from: Date | null, to: Date | null, periodLabel: string): Promise<Metric[]> {
  const now = "situación a fecha de hoy";
  const [checkinRows, attempts, enrolls, decisions, members, atApply, coachedRaw, risks, approvals] = await Promise.all([
    deps.db.select({ note: evidence.note }).from(evidence).where(and(eq(evidence.organizationId, orgId),
      eq(evidence.ownerType, "seguimiento"), eq(evidence.kind, "kpi"), ...range(evidence.createdAt, from, to))),
    deps.db.select({ userId: testAttempt.userId, pathId: testAttempt.pathId, score: testAttempt.score, passed: testAttempt.passed, at: testAttempt.createdAt })
      .from(testAttempt).where(and(eq(testAttempt.organizationId, orgId), ...range(testAttempt.createdAt, from, to))),
    deps.db.select({ status: enrollment.status }).from(enrollment).where(and(eq(enrollment.organizationId, orgId), ...range(enrollment.createdAt, from, to))),
    deps.db.select({ decision: validation.decision }).from(validation).where(and(eq(validation.organizationId, orgId), ...range(validation.createdAt, from, to))),
    deps.db.select({ n: sql<number>`count(*)::int` }).from(member).where(eq(member.organizationId, orgId)).then((r) => r[0]?.n ?? 0),
    deps.db.select({ n: sql<number>`count(distinct ${levelByCompetency.userId})::int` }).from(levelByCompetency)
      .where(and(eq(levelByCompetency.organizationId, orgId), gte(levelByCompetency.level, 2))).then((r) => r[0]?.n ?? 0),
    deps.db.select({ n: sql<number>`count(distinct ${coaching.learnerId})::int` }).from(coaching)
      .where(and(eq(coaching.organizationId, orgId), eq(coaching.status, "logrado"))).then((r) => r[0]?.n ?? 0),
    dependencyRisks(deps, orgId),
    // Tiempo hasta la competencia: matrícula -> primera validación aprobada (misma persona y competencia).
    deps.db.select({ userId: appliedCase.userId, competencyId: appliedCase.competencyId, at: validation.createdAt })
      .from(validation).innerJoin(appliedCase, eq(validation.caseId, appliedCase.id))
      .where(and(eq(validation.organizationId, orgId), eq(validation.decision, "aprobado"), ...range(validation.createdAt, from, to))),
  ]);
  const criticalComps = await deps.db.select({ n: sql<number>`count(*)::int` }).from(competency)
    .where(and(eq(competency.organizationId, orgId), eq(competency.critical, true))).then((r) => r[0]?.n ?? 0);
  const enrollAt = await deps.db.select({ userId: enrollment.userId, competencyId: enrollment.competencyId, at: enrollment.createdAt })
    .from(enrollment).where(eq(enrollment.organizationId, orgId));

  const ck = summarizeCheckins(checkinRows.map((r) => r.note));
  const ckAnswered = ck.aplica + ck.parcial + ck.noAplica;
  const passed = attempts.filter((a) => a.passed).length;
  const gain = retryGain(attempts);
  const completed = enrolls.filter((e) => e.status === "completado").length;
  const approved = decisions.filter((d) => d.decision === "aprobado").length;

  const firstEnroll = new Map<string, number>();
  for (const e of enrollAt) { const k = `${e.userId}|${e.competencyId ?? ""}`; const t = e.at.getTime(); if (!firstEnroll.has(k) || t < firstEnroll.get(k)!) firstEnroll.set(k, t); }
  const firstApproval = new Map<string, number>();
  for (const a of approvals) { const k = `${a.userId}|${a.competencyId}`; const t = a.at.getTime(); if (!firstApproval.has(k) || t < firstApproval.get(k)!) firstApproval.set(k, t); }
  const days: number[] = [];
  for (const [k, t] of firstApproval) { const e = firstEnroll.get(k); if (e !== undefined && t >= e) days.push((t - e) / 86_400_000); }
  const ttc = median(days);

  const coached = Math.min(coachedRaw, atApply);

  return [
    // Nivel 1 — Reacción
    metric({ key: "sensacion", level: 1, name: "Valoración de lo aprendido (1 a 5)", unit: "/5", value: ck.sensacionMedia, n: ck.sensacionN,
      formula: "Media de la «sensación» (1-5) que cada persona indica en su seguimiento de aplicación",
      source: "Seguimientos de aplicación (evidence, tipo kpi)", period: periodLabel, evidence: ["kirkpatrick"] }),
    // Nivel 2 — Aprendizaje
    pctMetric({ key: "tests_aprobados", level: 2, name: "Pruebas superadas", formula: "Intentos aprobados / intentos totales × 100",
      source: "Intentos de test (test_attempt)", period: periodLabel, evidence: ["dunlosky", "roediger-karpicke"] }, passed, attempts.length),
    metric({ key: "mejora_intentos", level: 2, name: "Mejora entre el primer intento y el mejor posterior", unit: "puntos", value: gain.mean, n: gain.n,
      formula: "Media, por persona y ruta con 2 o más intentos, de (mejor nota posterior − nota del primer intento)",
      source: "Intentos de test (test_attempt)", period: periodLabel, evidence: ["roediger-karpicke"],
      caveat: gain.n ? [sampleCaveat(gain.n), "No es un pre-test: la plataforma no evalúa antes de formar. Mide progreso con la práctica, no aprendizaje frente a un punto de partida."].filter(Boolean).join(" ") : null }),
    pctMetric({ key: "finalizacion", level: 2, name: "Rutas finalizadas", formula: "Matrículas en estado «completado» / matrículas × 100",
      source: "Matrículas (enrollment)", period: periodLabel, evidence: ["kirkpatrick"] }, completed, enrolls.length),
    pctMetric({ key: "casos_aprobados", level: 2, name: "Casos prácticos aprobados por un referente humano", formula: "Validaciones «aprobado» / validaciones decididas × 100",
      source: "Validaciones humanas (validation)", period: periodLabel, evidence: ["baldwin-ford"] }, approved, decisions.length),
    // Nivel 3 — Comportamiento / aplicación en el puesto
    pctMetric({ key: "aplicacion", level: 3, name: "Personas que dicen aplicar lo aprendido en su trabajo", formula: "Seguimientos «sí» + «en parte» / seguimientos respondidos × 100",
      source: "Seguimientos de aplicación (evidence, tipo kpi). Autodeclarado.", period: periodLabel, evidence: ["baldwin-ford", "kirkpatrick"] }, ck.aplica + ck.parcial, ckAnswered),
    pctMetric({ key: "cobertura", level: 3, name: "Plantilla con al menos una competencia validada (nivel Aplica o superior)", formula: "Personas con nivel ≥ 2 en alguna competencia / miembros × 100",
      source: "Niveles por competencia (level_by_competency), que exigen validación humana", period: now, evidence: ["iso30414", "baldwin-ford"] }, atApply, members),
    metric({ key: "tiempo_competencia", level: 3, name: "Tiempo hasta la competencia (mediana)", unit: "días", value: ttc == null ? null : Math.round(ttc * 10) / 10, n: days.length,
      formula: "Mediana de días desde la matrícula hasta la primera validación aprobada de esa competencia",
      source: "Matrículas + validaciones", period: periodLabel, evidence: ["iso30414"] }),
    pctMetric({ key: "transferencia_interna", level: 3, name: "Personas que llegaron a aplicar con un compañero como coach", formula: "Alumnos con coaching «logrado» / personas con nivel ≥ 2 × 100",
      source: "Coaching (coaching) + niveles", period: now, evidence: ["baldwin-ford"] }, coached, atApply),
    metric({ key: "retencion", level: 3, name: "Retención comprobada semanas después (re-evaluación diferida)", unit: "%", value: null, n: 0,
      formula: "Aprobados en una re-evaluación hecha ≥ 30 días después de validar / re-evaluaciones × 100",
      source: "Aún no se registra: la plataforma no programa re-evaluaciones diferidas", period: periodLabel, evidence: ["cepeda", "murre-dros", "roediger-karpicke"],
      caveat: "Sin esta medida no se puede afirmar que lo aprendido se mantiene en el tiempo." }),
    // Nivel 4 — Resultados que mide la plataforma (organizativos, no monetizados)
    metric({ key: "riesgo_dependencia", level: 4, name: "Competencias críticas que dependen de 0 o 1 persona", unit: "competencias", value: criticalComps ? risks.length : null, n: criticalComps,
      formula: "Competencias marcadas como críticas con ≤ 1 persona en nivel Referente o superior",
      source: "Competencias críticas (n = competencias marcadas como críticas) + niveles", period: now, evidence: ["iso30414"], caveat: null }),
  ];
}

/* ------------------------------------------------------------------ Informe completo */
export interface RoiReport {
  orgName?: string;
  generatedAt: string;
  period: { desde: string | null; hasta: string | null; label: string };
  levels: Metric[];
  costs: CostResult;
  impacts: ImpactResult[];
  roi: RoiLevel5;
  fundae: { bonificacion: number | null; costeNetoEmpresa: number | null; nota: string };
  intangibles: { label: string; value: string; certainty: Certainty }[];
  principles: string[];
  sources: Source[];
  inputs: { periodStart: string | null; periodEnd: string | null; costs: RoiCosts; impacts: ImpactInput[]; intangibles: string[]; updatedAt: string | null };
}

export const PRINCIPLES = [
  "Solo se usan las fuentes más creíbles; si hay dos alternativas, la más conservadora.",
  "El efecto de la formación se aísla (grupo de control, o % atribuido por quien conoce el trabajo, ajustado por su confianza).",
  "Si una métrica no tiene datos de mejora, se asume que no ha mejorado (0 €).",
  "Se cuenta solo el primer año de beneficio.",
  "Los costes se cargan completos: plataforma, tiempo de las personas, tiempo interno y otros.",
  "Lo que no se puede convertir a euros con rigor se informa como intangible, fuera del ROI.",
];

export async function buildReport(deps: SvcDeps, orgId: string): Promise<RoiReport> {
  const row = await studyRow(deps, orgId);
  const from = row?.periodStart ? new Date(row.periodStart + "T00:00:00Z") : null;
  const to = row?.periodEnd ? new Date(row.periodEnd + "T23:59:59Z") : null;
  const label = from || to ? `${row?.periodStart ?? "inicio"} a ${row?.periodEnd ?? "hoy"}` : "todo el histórico";
  const costsIn = costsSchema.safeParse(row?.costs ?? {}).data ?? {};
  const impactsIn = (row?.impacts ?? []).map((i) => impactSchema.safeParse(i)).filter((r) => r.success).map((r) => r.data!);
  const intangiblesIn = row?.intangibles ?? [];

  const levels = await platformIndicators(deps, orgId, from, to, label);
  const costs = fullyLoadedCosts(costsIn);
  const impacts = impactsIn.map(impactBenefit);
  const roi = roiLevel5(costs, impacts);
  const bonif = costsIn.bonificacionFundae ?? null;
  const byKey = new Map(levels.map((m) => [m.key, m]));
  const show = (k: string) => { const m = byKey.get(k); return m?.value == null ? "Sin datos" : `${String(m.value).replace(".", ",")} ${m.unit}`; };

  return {
    generatedAt: new Date().toISOString(),
    period: { desde: row?.periodStart ?? null, hasta: row?.periodEnd ?? null, label },
    levels, costs, impacts, roi,
    fundae: {
      bonificacion: bonif,
      costeNetoEmpresa: costs.total != null && bonif != null ? Math.max(0, costs.total - bonif) : null,
      nota: "La bonificación FUNDAE sale de la cuota de formación profesional que ya paga la empresa y no cubre todo (las empresas de más de 5 personas cofinancian). Se muestra aparte y no se resta en el ROI, que usa costes completos.",
    },
    intangibles: [
      { label: "Competencias críticas en manos de 0 o 1 persona", value: show("riesgo_dependencia"), certainty: byKey.get("riesgo_dependencia")?.certainty ?? "sin_datos" },
      { label: "Aprendizaje entre compañeros (transferencia interna)", value: show("transferencia_interna"), certainty: byKey.get("transferencia_interna")?.certainty ?? "sin_datos" },
      ...intangiblesIn.map((t) => ({ label: t, value: "Declarado por la empresa", certainty: "estimado" as Certainty })),
    ],
    principles: PRINCIPLES,
    sources: SOURCES,
    inputs: { periodStart: row?.periodStart ?? null, periodEnd: row?.periodEnd ?? null, costs: costsIn, impacts: impactsIn, intangibles: intangiblesIn, updatedAt: row?.updatedAt?.toISOString() ?? null },
  };
}

/** Guarda los datos del estudio (merge por bloque). Solo lo que llega se sustituye. */
export async function saveStudy(deps: SvcDeps, orgId: string, userId: string, input: StudyInput): Promise<void> {
  const cur = await studyRow(deps, orgId);
  const next = {
    periodStart: input.periodStart !== undefined ? input.periodStart : cur?.periodStart ?? null,
    periodEnd: input.periodEnd !== undefined ? input.periodEnd : cur?.periodEnd ?? null,
    costs: input.costs ? { ...(cur?.costs ?? {}), ...input.costs } : cur?.costs ?? {},
    impacts: (input.impacts ?? cur?.impacts ?? []) as Record<string, unknown>[],
    intangibles: input.intangibles ?? cur?.intangibles ?? [],
    updatedBy: userId, updatedAt: new Date(),
  };
  await deps.db.insert(roiStudy).values({ organizationId: orgId, ...next })
    .onConflictDoUpdate({ target: roiStudy.organizationId, set: next });
}

/**
 * El analista de ROI redacta para dirección SOLO con las cifras del informe. Si el ROI no es
 * calculable, lo dice y lista lo que falta; nunca da una cifra en euros que no esté en los datos.
 */
export async function roiNarrative(llm: Llm, orgName: string, r: RoiReport, opts: { orgId: string; userId?: string }): Promise<string> {
  const datos = JSON.stringify({
    empresa: orgName, periodo: r.period.label,
    indicadores: r.levels.map((m) => ({ nivel: m.level, nombre: m.name, valor: m.value, unidad: m.unit, n: m.n, ic95: m.ci95, certeza: m.certainty, aviso: m.caveat })),
    costes: r.costs, roi: r.roi, intangibles: r.intangibles,
  });
  const system =
    "Eres el analista de evaluación de la formación de Brandooers SkillUp. Escribes para la dirección de una empresa cliente "
    + "siguiendo Kirkpatrick (niveles 1-4) y la ROI Methodology de Phillips (nivel 5). Reglas estrictas: usa SOLO los números del JSON, "
    + "con su tamaño de muestra (n) y su certeza (medido, estimado, sin datos). Si roi.computable es false, di claramente que no hay "
    + "datos suficientes para calcular el ROI y enumera lo que falta; no des ninguna cifra en euros de beneficio. Si es true, explica que es "
    + "una estimación conservadora con método (aislamiento y confianza) y no un dato medido. Advierte cuando n sea pequeño. Los intangibles no "
    + "se convierten a euros. No prometas resultados. Español de España, profesional. Sin markdown, sin símbolos, sin emojis. 3 párrafos cortos como máximo.";
  return llm.generate({
    system, messages: [{ role: "user", content: "Datos del informe (no inventes fuera de esto):\n" + datos + "\n\nEscribe el resumen para la dirección de " + orgName + "." }],
    maxTokens: 600, orgId: opts.orgId, userId: opts.userId, kind: "chat",
  });
}
