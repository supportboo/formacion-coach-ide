import { and, eq, inArray } from "drizzle-orm";
import { teamDna } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { FAMILIES, FAMILY_LABEL, type Family } from "./teamdna.js";
import { firstJson } from "./aiContent.js";

/**
 * Moderación interdepartamental (R4).
 *
 * El conocimiento transversal que la herramienta capta (fortalezas reales del equipo vía Team DNA
 * y buenas prácticas ya validadas) sirve para MEDIAR entre departamentos con intereses en conflicto
 * (p. ej. preventa vs postventa): leer por qué chocan a partir de sus fortalezas, proponer consenso
 * y buenas prácticas, y realimentar esas prácticas al cerebro para generar armonía y comunicación
 * interdepartamental. Doctrina anti-invención: solo se usa lo que está en los datos reales.
 *
 * Nota de alcance honesta: hoy los dos "departamentos" los define quien modera (lista de personas o
 * por puesto), porque el modelo aún no tiene una entidad "departamento" de primera clase. La lógica y
 * la mediación son reales; el paso siguiente es tagear departamentos y darle su panel a dirección.
 */

export interface GroupInput { nombre: string; userIds: string[] }
export interface GroupProfile { nombre: string; n: number; pesos: Record<Family, number>; dominante: Family | null }

/** Perfil de fortalezas de un grupo, promediando el Team DNA real de sus miembros (0 personas -> sin datos). */
async function groupProfile(deps: SvcDeps, orgId: string, g: GroupInput): Promise<GroupProfile> {
  const empty = { vision: 0, accion: 0, analisis: 0, personas: 0 } as Record<Family, number>;
  if (!g.userIds.length) return { nombre: g.nombre, n: 0, pesos: empty, dominante: null };
  const rows = await deps.db.select().from(teamDna)
    .where(and(eq(teamDna.organizationId, orgId), inArray(teamDna.userId, g.userIds)));
  const sum = { ...empty };
  for (const r of rows) for (const f of FAMILIES) sum[f] += Number(r.weights?.[f] ?? 0);
  const n = rows.length;
  const pesos = {} as Record<Family, number>;
  for (const f of FAMILIES) pesos[f] = n ? Math.round(sum[f] / n) : 0;
  const dominante = n ? FAMILIES.reduce((a, b) => (pesos[b] > pesos[a] ? b : a), FAMILIES[0]!) : null;
  return { nombre: g.nombre, n, pesos, dominante };
}

export interface ModerationInput {
  orgId: string; grupoA: GroupInput; grupoB: GroupInput; conflicto: string;
  contexto?: string[]; // buenas prácticas validadas (del RAG) para fundamentar el consejo
}
export interface ModerationResult {
  diagnostico: string; causaProbable: string; consenso: string[]; buenasPracticas: string[]; siguientePaso: string;
  perfiles: { a: GroupProfile; b: GroupProfile };
}

export async function moderateBetween(deps: SvcDeps, llm: Llm, input: ModerationInput): Promise<ModerationResult> {
  const [a, b] = await Promise.all([
    groupProfile(deps, input.orgId, input.grupoA),
    groupProfile(deps, input.orgId, input.grupoB),
  ]);
  const fmt = (p: GroupProfile) =>
    `${p.nombre} (${p.n} personas con Team DNA): ${FAMILIES.map((f) => `${FAMILY_LABEL[f]} ${p.pesos[f]}%`).join(", ")}`
    + (p.dominante ? `; fuerza dominante ${FAMILY_LABEL[p.dominante]}` : "; sin Team DNA suficiente");
  const ctx = (input.contexto && input.contexto.length)
    ? `\n\nBuenas prácticas YA validadas en la empresa (reutilízalas si encajan; no inventes otras):\n- ${input.contexto.join("\n- ")}`
    : "";
  const system =
    "Eres moderador interdepartamental de una empresa. Reduces el conflicto de intereses entre dos departamentos y los llevas a un consenso con buenas prácticas, usando SOLO los datos reales que te doy (perfiles de fortalezas del equipo y buenas prácticas validadas). "
    + "No inventes cifras, causas ni acuerdos que no se deriven de esos datos. No culpes a ningún lado: el objetivo es armonía y que ambos rindan mejor. Español de España, concreto. "
    + 'Responde SOLO JSON válido, sin markdown: {"diagnostico":"por qué chocan, leído de sus fortalezas","causaProbable":"1 frase","consenso":["acuerdos concretos y equilibrados"],"buenasPracticas":["prácticas reutilizables para que no vuelva a pasar"],"siguientePaso":"1 acción medible para esta semana"}.';
  const content = `DEPARTAMENTO A -> ${fmt(a)}\nDEPARTAMENTO B -> ${fmt(b)}\n\nCONFLICTO DECLARADO:\n${input.conflicto}${ctx}`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content }], maxTokens: 900, orgId: input.orgId, kind: "moderation",
  });
  const r = firstJson<Omit<ModerationResult, "perfiles">>(out);
  return {
    diagnostico: r.diagnostico, causaProbable: r.causaProbable,
    consenso: Array.isArray(r.consenso) ? r.consenso : [],
    buenasPracticas: Array.isArray(r.buenasPracticas) ? r.buenasPracticas : [],
    siguientePaso: r.siguientePaso, perfiles: { a, b },
  };
}
