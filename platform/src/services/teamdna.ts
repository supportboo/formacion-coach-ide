import { and, eq } from "drizzle-orm";
import { teamDna } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

// Team DNA: mapa de fortalezas laboral, determinista (sin IA). 4 familias, 12 arquetipos.
// El arquetipo = familia principal (mayor peso) + secundaria (2ª). Es reversible y evoluciona
// con el comportamiento real; aquí calculamos la FOTO inicial a partir de preguntas de situación.
// Doctrina: NO es un test de personalidad clínico (MBTI/DISC); mide qué haces, no quién eres.

export type Family = "vision" | "accion" | "analisis" | "personas";
export const FAMILIES: Family[] = ["vision", "accion", "analisis", "personas"];
export const FAMILY_LABEL: Record<Family, string> = {
  vision: "Visión", accion: "Acción", analisis: "Análisis", personas: "Personas",
};
export const FAMILY_SUB: Record<Family, string> = {
  vision: "El futuro", accion: "El presente", analisis: "Los datos", personas: "El equipo",
};

export interface Archetype { key: string; name: string; primary: Family; secondary: Family; tagline: string; }

// 12 arquetipos = 4 familias principales × 3 secundarias.
export const ARCHETYPES: Archetype[] = [
  { key: "innovador", name: "Innovador", primary: "vision", secondary: "accion", tagline: "Imaginas lo nuevo y lo pones en marcha." },
  { key: "visionario", name: "Visionario", primary: "vision", secondary: "analisis", tagline: "Ves a dónde va todo y lo aterrizas con criterio." },
  { key: "creativo", name: "Creativo", primary: "vision", secondary: "personas", tagline: "Traes ideas frescas y las contagias al equipo." },
  { key: "impulsor", name: "Impulsor", primary: "accion", secondary: "vision", tagline: "Arrancas lo que otros solo imaginan." },
  { key: "ejecutor", name: "Ejecutor", primary: "accion", secondary: "analisis", tagline: "Haces que las cosas pasen, con método." },
  { key: "rematador", name: "Rematador", primary: "accion", secondary: "personas", tagline: "Cierras y no dejas cabos sueltos, con la gente." },
  { key: "estratega", name: "Estratega", primary: "analisis", secondary: "vision", tagline: "Planificas el futuro con los pies en el suelo." },
  { key: "analista", name: "Analista", primary: "analisis", secondary: "accion", tagline: "Mides, entiendes y decides sin humo." },
  { key: "perfeccionista", name: "Perfeccionista", primary: "analisis", secondary: "personas", tagline: "Cuidas la calidad y elevas al equipo." },
  { key: "embajador", name: "Embajador", primary: "personas", secondary: "vision", tagline: "Inspiras y representas lo que se puede llegar a ser." },
  { key: "conector", name: "Conector", primary: "personas", secondary: "accion", tagline: "Unes a la gente para que las cosas salgan." },
  { key: "mentor", name: "Mentor", primary: "personas", secondary: "analisis", tagline: "Enseñas con criterio y haces crecer a los demás." },
];
const BY_PS = new Map(ARCHETYPES.map((a) => [a.primary + ":" + a.secondary, a]));
export function archetypeFor(primary: Family, secondary: Family): Archetype {
  return BY_PS.get(primary + ":" + secondary) ?? ARCHETYPES[0]!;
}
export function archetypeByKey(key: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.key === key);
}

export interface Question { id: string; q: string; options: { family: Family; text: string }[]; }

// Preguntas de SITUACIÓN ("¿qué haces cuando…?"), no "¿eres…?". Cada opción suma a una familia.
export const QUESTIONS: Question[] = [
  { id: "q1", q: "Empieza algo nuevo en tu trabajo. ¿Qué es lo primero que haces?", options: [
    { family: "vision", text: "Imagino a dónde puede llegar y qué podría hacerse distinto." },
    { family: "accion", text: "Me pongo con lo primero que hay que hacer, ya." },
    { family: "analisis", text: "Reúno datos y ordeno la información antes de decidir." },
    { family: "personas", text: "Hablo con la gente a la que afecta para entender qué necesita." } ] },
  { id: "q2", q: "El plan se tuerce a mitad. ¿Cómo reaccionas?", options: [
    { family: "vision", text: "Propongo una forma nueva de plantearlo." },
    { family: "accion", text: "Reacciono rápido y arreglo lo urgente." },
    { family: "analisis", text: "Analizo qué ha fallado antes de mover ficha." },
    { family: "personas", text: "Junto al equipo para decidir juntos el siguiente paso." } ] },
  { id: "q3", q: "Te felicitan por un trabajo. ¿Por qué suele ser?", options: [
    { family: "vision", text: "Por una idea o un enfoque que a nadie se le había ocurrido." },
    { family: "accion", text: "Por sacarlo adelante y a tiempo." },
    { family: "analisis", text: "Por el rigor y que todo cuadra." },
    { family: "personas", text: "Por cómo he tratado y ayudado a la gente." } ] },
  { id: "q4", q: "Tienes una tarde libre en el trabajo. ¿En qué la inviertes?", options: [
    { family: "vision", text: "En pensar cómo mejorar algo de raíz." },
    { family: "accion", text: "En avanzar y quitarme cosas de encima." },
    { family: "analisis", text: "En revisar números y dejarlo todo ordenado." },
    { family: "personas", text: "En ayudar a un compañero o formar a alguien." } ] },
  { id: "q5", q: "En una reunión difícil, ¿qué papel tomas?", options: [
    { family: "vision", text: "El que abre el foco y plantea el hacia dónde." },
    { family: "accion", text: "El que corta la charla y propone pasar a la acción." },
    { family: "analisis", text: "El que pide datos y baja las ideas a la realidad." },
    { family: "personas", text: "El que escucha a todos y busca el acuerdo." } ] },
  { id: "q6", q: "Un cliente te plantea un problema que no esperabas. ¿Qué haces?", options: [
    { family: "vision", text: "Le doy la vuelta y le propongo algo mejor de lo que pedía." },
    { family: "accion", text: "Le resuelvo lo que pueda ahora mismo." },
    { family: "analisis", text: "Estudio el caso a fondo antes de responder." },
    { family: "personas", text: "Me pongo en su lugar y cuido cómo se siente." } ] },
  { id: "q7", q: "¿Qué te frustra más en el día a día?", options: [
    { family: "vision", text: "Hacer siempre lo mismo sin poder cambiar nada." },
    { family: "accion", text: "Que las cosas se queden paradas y no avancen." },
    { family: "analisis", text: "Decidir a ojo, sin datos ni criterio." },
    { family: "personas", text: "Que no se cuide a las personas del equipo." } ] },
  { id: "q8", q: "Cuando aprendes algo nuevo, ¿cómo lo haces mejor?", options: [
    { family: "vision", text: "Viendo el porqué y para qué sirve en grande." },
    { family: "accion", text: "Probándolo con las manos cuanto antes." },
    { family: "analisis", text: "Entendiendo bien cada paso y su lógica." },
    { family: "personas", text: "Comentándolo y practicándolo con otros." } ] },
];

export interface DnaResult {
  weights: Record<Family, number>; // porcentajes enteros que suman 100
  primary: Family; secondary: Family;
  archetypeKey: string; near: string[]; // 2 arquetipos cercanos
}

/** Reparte enteros que suman `total` según fracciones (mayor resto), estable por orden de FAMILIES. */
function toPercents(counts: Record<Family, number>, total: number): Record<Family, number> {
  const sum = FAMILIES.reduce((s, f) => s + counts[f], 0) || 1;
  const raw = FAMILIES.map((f) => ({ f, exact: (counts[f] / sum) * total }));
  const out = {} as Record<Family, number>;
  let used = 0;
  raw.forEach((r) => { out[r.f] = Math.floor(r.exact); used += out[r.f]; });
  raw.map((r) => ({ f: r.f, rem: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.rem - a.rem || FAMILIES.indexOf(a.f) - FAMILIES.indexOf(b.f))
    .slice(0, total - used).forEach((r) => { out[r.f] += 1; });
  return out;
}

/** Ordena las familias por peso (desc), desempate estable por orden de FAMILIES. */
function ranked(weights: Record<Family, number>): Family[] {
  return [...FAMILIES].sort((a, b) => weights[b] - weights[a] || FAMILIES.indexOf(a) - FAMILIES.indexOf(b));
}

/** answers = una familia por pregunta, en el orden de QUESTIONS (o un subconjunto válido). */
export function scoreDna(answers: Family[]): DnaResult {
  const counts = { vision: 0, accion: 0, analisis: 0, personas: 0 } as Record<Family, number>;
  for (const a of answers) if (a in counts) counts[a] += 1;
  const weights = toPercents(counts, 100);
  const [primary, secondary, third] = ranked(weights) as [Family, Family, Family];
  const arch = archetypeFor(primary, secondary);
  // Cercanos: el "espejo" (secundaria como principal) y el que comparte principal con la 3ª familia.
  const mirror = archetypeFor(secondary, primary);
  const sibling = archetypeFor(primary, third);
  const near = [mirror.key, sibling.key].filter((k, i, arr) => k !== arch.key && arr.indexOf(k) === i).slice(0, 2);
  return { weights, primary, secondary, archetypeKey: arch.key, near };
}

/* ---------- Persistencia (una fila por usuario/org, se re-hace al repetir el test) ---------- */

export async function saveDna(deps: SvcDeps, orgId: string, userId: string, r: DnaResult, answers: Family[]): Promise<void> {
  await deps.db.insert(teamDna).values({
    id: deps.newId(), organizationId: orgId, userId,
    weights: r.weights, primary: r.primary, secondary: r.secondary, archetype: r.archetypeKey, near: r.near, answers,
  }).onConflictDoUpdate({
    target: [teamDna.organizationId, teamDna.userId],
    set: { weights: r.weights, primary: r.primary, secondary: r.secondary, archetype: r.archetypeKey, near: r.near, answers, updatedAt: new Date() },
  });
}

export async function getDna(deps: SvcDeps, orgId: string, userId: string) {
  const [row] = await deps.db.select().from(teamDna)
    .where(and(eq(teamDna.organizationId, orgId), eq(teamDna.userId, userId)));
  return row ?? null;
}

/** Agregado para gestores: cuántas personas por arquetipo/familia y el peso medio del equipo. */
export async function teamAggregate(deps: SvcDeps, orgId: string): Promise<{
  total: number; byFamily: Record<Family, number>; byArchetype: Record<string, number>; avgWeights: Record<Family, number>;
}> {
  const rows = await deps.db.select().from(teamDna).where(eq(teamDna.organizationId, orgId));
  const byFamily = { vision: 0, accion: 0, analisis: 0, personas: 0 } as Record<Family, number>;
  const byArchetype: Record<string, number> = {};
  const sum = { vision: 0, accion: 0, analisis: 0, personas: 0 } as Record<Family, number>;
  for (const r of rows) {
    byFamily[r.primary as Family] = (byFamily[r.primary as Family] ?? 0) + 1;
    byArchetype[r.archetype] = (byArchetype[r.archetype] ?? 0) + 1;
    for (const f of FAMILIES) sum[f] += Number(r.weights?.[f] ?? 0);
  }
  const n = rows.length || 1;
  const avgWeights = {} as Record<Family, number>;
  for (const f of FAMILIES) avgWeights[f] = Math.round(sum[f] / n);
  return { total: rows.length, byFamily, byArchetype, avgWeights };
}
