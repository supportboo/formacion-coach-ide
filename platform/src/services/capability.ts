// Estado de capacidad (1.18.0, arquitectura V2 fase 1). La unidad deja de ser el curso y pasa a ser la capacidad
// de la persona: persona → evidencias → estado (conocimiento, aplicación, autonomía, transferencia) → siguiente paso.
//
// El «grafo de evidencias» NO es una tabla nueva: se deriva de lo que ya existe (tests, examen final, roleplays,
// micropráctica, casos validados, seguimientos, acompañamientos). Una sola fuente de verdad, sin doble escritura,
// y funciona con todo el histórico desde el primer día. Reglas fijas y explicables: nada de modelos opacos.
// El nivel oficial N0-N4 (level_by_competency) no cambia aquí: se muestra al lado, tal cual.
import { and, eq } from "drizzle-orm";
import {
  appliedCase, assessmentAttempt, coaching, competency, courseCompetency, evidence, evidenceEvent, learnerFact, levelByCompetency,
  roleplaySession, validation,
} from "../db/schema.js";
import type { SvcDeps } from "./org.js";

const DAY = 86_400_000;

export type Dimension = "conocimiento" | "aplicacion" | "autonomia" | "transferencia";
export type EvidenceType = "test_bloque" | "examen_final" | "micropractica" | "roleplay" | "caso_validado" | "aplicacion_real" | "acompanamiento" | "demostracion" | "teach_back" | "formacion_real";

export interface Evidence {
  type: EvidenceType;
  label: string;
  dimension: Dimension;
  score: number | null;        // 0-100 cuando hay nota
  at: Date;
  humanValidated: boolean;      // lo validó una persona (caso real)
  aiHelp: "no_medida" | "ninguna"; // ninguna = hecho sin ayuda de la IA de SkillUp (demostración, teach-back)
}

/* ------------------------------------------------------------------ datos en bruto → evidencias */

export interface Raw {
  now: Date;
  blocks: { source: string; block: number; score: number | null; passed: boolean | null; at: Date }[];
  finals: { source: string; score: number | null; passed: boolean | null; at: Date }[];
  roleplays: { source: string | null; competencyId: string; topic: string | null; score: number | null; at: Date }[];
  micro: { source: string; nivel: string; at: Date }[];
  cases: { competencyId: string; at: Date }[];
  checkins: { competencyId: string; aplica: string; at: Date }[];
  mentees: { competencyId: string; status: string; at: Date }[];
  events: { skillKey: string; type: string; score: number | null; context: string | null; at: Date }[]; // evidence_event
  levels: Map<string, number>;
  competencies: Map<string, string>;             // id → nombre
  courseToCompetency: Map<string, string>;       // slug → competencyId
  titles: Record<string, string>;                 // slug → título
  totalBlocks: Map<string, number | null>;        // slug → nº de bloques
}

const MICRO: Record<string, number> = { inicial: 30, intermedio: 55, avanzado: 80 };
const slugOf = (src: string) => src.replace(/^\//, "").replace(/\.html$/, "").split("#")[0]!;

/** Clave de capacidad: la competencia si el curso está vinculado; si no, el propio curso. */
function keyFor(raw: Raw, slug: string): string {
  const comp = raw.courseToCompetency.get(slug);
  return comp ? `comp:${comp}` : `curso:${slug}`;
}

export function collect(raw: Raw): Map<string, Evidence[]> {
  const out = new Map<string, Evidence[]>();
  const add = (key: string, e: Omit<Evidence, "humanValidated" | "aiHelp"> & { humanValidated?: boolean; aiHelp?: Evidence["aiHelp"] }) =>
    (out.get(key) ?? out.set(key, []).get(key)!).push({ humanValidated: false, aiHelp: "no_medida", ...e });
  // Tests de bloque: la mejor nota de cada bloque (el último intento no borra lo demostrado).
  const best = new Map<string, (typeof raw.blocks)[number]>();
  for (const b of raw.blocks) {
    if (b.score == null) continue;
    const k = `${b.source}#${b.block}`, prev = best.get(k);
    if (!prev || (b.score > (prev.score ?? -1))) best.set(k, b);
  }
  for (const b of best.values()) add(keyFor(raw, b.source), { type: "test_bloque", dimension: "conocimiento", score: b.score, at: b.at,
    label: `Test del bloque ${b.block + 1}${b.passed ? " aprobado" : ""} · ${b.score}/100` });
  for (const f of raw.finals) if (f.score != null) add(keyFor(raw, f.source), { type: "examen_final", dimension: "conocimiento", score: f.score, at: f.at,
    label: `Examen final${f.passed ? " aprobado" : ""} · ${f.score}/100` });
  for (const m of raw.micro) if (MICRO[m.nivel] != null) add(keyFor(raw, m.source), { type: "micropractica", dimension: "aplicacion", score: MICRO[m.nivel]!, at: m.at,
    label: `Micropráctica de inicio · nivel ${m.nivel} (estimación)` });
  for (const r of raw.roleplays) {
    if (r.score == null) continue;
    const key = r.competencyId !== "libre" && raw.competencies.has(r.competencyId) ? `comp:${r.competencyId}` : r.source ? keyFor(raw, slugOf(r.source)) : null;
    if (key) add(key, { type: "roleplay", dimension: "aplicacion", score: r.score * 10, at: r.at, label: `Roleplay${r.topic ? ` «${r.topic}»` : ""} · ${r.score}/10` });
  }
  for (const c of raw.cases) add(`comp:${c.competencyId}`, { type: "caso_validado", dimension: "autonomia", score: null, at: c.at, humanValidated: true,
    label: "Caso real validado por una persona" });
  for (const c of raw.checkins) if (c.aplica === "si" || c.aplica === "parcial") add(`comp:${c.competencyId}`, { type: "aplicacion_real", dimension: "aplicacion", score: c.aplica === "si" ? 100 : 50, at: c.at,
    label: c.aplica === "si" ? "Lo ha aplicado en su trabajo" : "Lo ha aplicado en parte en su trabajo" });
  for (const m of raw.mentees) if (m.status === "logrado" || m.status === "activo") add(`comp:${m.competencyId}`, { type: "acompanamiento", dimension: "transferencia", score: m.status === "logrado" ? 100 : 30, at: m.at,
    label: m.status === "logrado" ? "Ha acompañado a otra persona hasta N2" : "Está acompañando a otra persona" });
  for (const e of raw.events) {
    if (e.score == null) continue;
    const topic = (e.context || "").split(" · ")[0];
    if (e.type === "demostracion") add(e.skillKey, { type: "demostracion", dimension: "autonomia", score: e.score, at: e.at, aiHelp: "ninguna",
      label: `Demostración sin ayuda${topic ? ` («${topic}»)` : ""} · ${e.score}/100` });
    else if (e.type === "formacion_real") add(e.skillKey, { type: "formacion_real", dimension: "transferencia", score: e.score, at: e.at, aiHelp: "ninguna",
      label: `Impartió una formación real${e.context ? ` («${e.context}»)` : ""} · ${e.score}/100` });
    else if (e.type === "teach_back") add(e.skillKey, { type: "teach_back", dimension: "transferencia", score: e.score, at: e.at, aiHelp: "ninguna",
      label: `Lo explicó a un compañero${topic ? ` («${topic}»)` : ""} · ${e.score}/100` });
  }
  for (const list of out.values()) list.sort((a, b) => b.at.getTime() - a.at.getTime());
  return out;
}

/* ------------------------------------------------------------------ evidencias → estado */

export interface DimensionState { value: number; why: string }
export interface SkillState {
  key: string;
  name: string;
  kind: "competencia" | "curso";
  courses: string[];
  level: number | null;           // nivel oficial N0-N4 (solo competencias)
  dims: Record<Dimension, DimensionState>;
  sinAyuda: DimensionState | null;  // mejor demostración sin ayuda: lo que hace cuando la IA no le resuelve el trabajo
  confidence: { value: number; label: "baja" | "media" | "alta"; why: string[] };
  vigencia: { label: "alta" | "media" | "baja"; days: number } | null;
  lastEvidenceAt: string | null;
  checklist: { label: string; done: boolean }[];
  evidence: { type: EvidenceType; label: string; dimension: Dimension; at: string; humanValidated: boolean }[];
  next: { title: string; why: string; href: string | null } | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const ago = (d: number) => d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;

export function stateOf(key: string, ev: Evidence[], raw: Raw): SkillState {
  const isComp = key.startsWith("comp:");
  const id = key.slice(key.indexOf(":") + 1);
  const courses = isComp ? [...raw.courseToCompetency].filter(([, c]) => c === id).map(([s]) => s) : [id];
  const of = (t: EvidenceType) => ev.filter((e) => e.type === t);
  const blocks = of("test_bloque"), finals = of("examen_final"), rps = of("roleplay"), micro = of("micropractica");
  const cases = of("caso_validado"), real = of("aplicacion_real"), mentees = of("acompanamiento");
  const demos = of("demostracion"), teach = of("teach_back"), realT = of("formacion_real");
  const bestReal = realT.length ? Math.max(...realT.map((x) => x.score ?? 0)) : null;
  const bestDemo = demos.length ? Math.max(...demos.map((x) => x.score ?? 0)) : null;
  const bestTeach = teach.length ? Math.max(...teach.map((x) => x.score ?? 0)) : null;
  const total = courses.reduce((a, s) => a + (raw.totalBlocks.get(s) ?? 0), 0);

  // Conocimiento: media de la mejor nota por bloque, ponderada por los bloques hechos; con examen final, pesa más el examen.
  const bAvg = mean(blocks.map((b) => b.score ?? 0));
  const coverage = total ? Math.min(1, blocks.length / total) : blocks.length ? 1 : 0;
  const fBest = finals.length ? Math.max(...finals.map((f) => f.score ?? 0)) : null;
  const know = fBest != null ? clamp(0.6 * fBest + 0.4 * bAvg) : clamp(bAvg * coverage);
  const knowWhy = !blocks.length && fBest == null ? "Sin tests todavía."
    : `${blocks.length}${total ? ` de ${total}` : ""} bloques con test (media ${Math.round(bAvg)}/100)${fBest != null ? `; examen final ${fBest}/100` : ""}.`;

  // Aplicación: la mejor práctica simulada cuenta la mitad; lo aplicado de verdad (casos y seguimientos) suma encima.
  const sim = Math.max(0, ...rps.map((r) => r.score ?? 0), ...micro.map((m) => m.score ?? 0));
  const yes = real.filter((r) => r.score === 100).length, part = real.length - yes;
  const apply = clamp(0.5 * sim + 20 * cases.length + 15 * yes + 8 * part);
  const applyWhy = !sim && !cases.length && !real.length ? "Sin prácticas ni aplicación real todavía."
    : [sim ? `mejor práctica ${Math.round(sim)}/100` : null, cases.length ? `${cases.length} caso(s) real(es) validado(s)` : null,
      real.length ? `${real.length} aplicación(es) en su trabajo` : null].filter(Boolean).join("; ") + ".";

  // Autonomía: lo que ha hecho sola y ha revisado una persona (casos validados) y el examen final aprobado.
  const finalPassed = finals.some((f) => (f.score ?? 0) >= 80);
  const auto = clamp(30 * cases.length + (finalPassed ? 20 : 0) + 0.4 * (bestDemo ?? 0));
  const autoWhy = !cases.length && !finalPassed && bestDemo == null ? "Aún no hay trabajo propio hecho sin ayuda ni revisado por una persona."
    : [cases.length ? `${cases.length} caso(s) validado(s) por una persona` : null, finalPassed ? "examen final aprobado" : null,
      bestDemo != null ? `demostración sin ayuda ${bestDemo}/100` : null].filter(Boolean).join("; ") + ".";

  // Transferencia: a quién ha ayudado a aprender.
  const done = mentees.filter((m) => m.score === 100).length, active = mentees.length - done;
  // El teach-back aporta como mucho 25 puntos: explicar bien no es lo mismo que haber formado a alguien.
  // Una formación real impartida a compañeros aporta hasta 40 (más que explicarlo en un ejercicio, menos que formar a alguien hasta N2).
  const transfer = clamp(35 * done + 10 * active + 0.25 * (bestTeach ?? 0) + 0.4 * (bestReal ?? 0));
  const transferWhy = !mentees.length && bestTeach == null && bestReal == null ? "Todavía no ha acompañado ni explicado el tema a nadie."
    : [mentees.length ? `${done} persona(s) acompañadas hasta N2${active ? `, ${active} en curso` : ""}` : null,
      bestTeach != null ? `lo explicó a un compañero (teach-back ${bestTeach}/100)` : null,
      bestReal != null ? `impartió ${realT.length} formación(es) real(es), la mejor ${bestReal}/100` : null].filter(Boolean).join("; ") + ".";

  // Confianza de la estimación: cuántas evidencias, de cuántos tipos, si las revisó una persona, en cuánto tiempo, y si son recientes.
  const last = ev[0]?.at ?? null, first = ev.at(-1)?.at ?? null;
  const types = new Set(ev.map((e) => e.type)).size;
  const days = last ? Math.floor((raw.now.getTime() - last.getTime()) / DAY) : null;
  const span = last && first ? Math.floor((last.getTime() - first.getTime()) / DAY) : 0;
  const why: string[] = [`${ev.length} evidencia(s) de ${types} tipo(s)`];
  let conf = Math.min(40, 10 * ev.length) + 10 * Math.min(types, 3);
  if (ev.some((e) => e.humanValidated)) { conf += 20; why.push("revisada por una persona"); }
  if (span >= 14) { conf += 10; why.push(`repartidas en ${span} días`); }
  if (days != null && days > 365) { conf -= 30; why.push("la última tiene más de un año"); }
  else if (days != null && days > 120) { conf -= 15; why.push("la última tiene más de 4 meses"); }
  const cv = clamp(ev.length ? conf : 0);

  const title = (s: string) => raw.titles[s] || s;
  const name = isComp ? raw.competencies.get(id) ?? "Competencia" : title(id);
  const blockPassed = blocks.some((b) => (b.score ?? 0) >= 85);
  const state: SkillState = {
    key, name, kind: isComp ? "competencia" : "curso", courses,
    level: isComp ? raw.levels.get(id) ?? 0 : null,
    dims: {
      conocimiento: { value: know, why: knowWhy }, aplicacion: { value: apply, why: applyWhy },
      autonomia: { value: auto, why: autoWhy }, transferencia: { value: transfer, why: transferWhy },
    },
    sinAyuda: bestDemo == null ? null : { value: bestDemo, why: `Mejor demostración hecha sin ayuda de la IA (${demos.length} intento(s)).` },
    confidence: { value: cv, label: cv < 40 ? "baja" : cv < 70 ? "media" : "alta", why },
    vigencia: days == null ? null : { label: days <= 30 ? "alta" : days <= 120 ? "media" : "baja", days },
    lastEvidenceAt: last ? last.toISOString() : null,
    checklist: [
      { label: "Test de conocimiento", done: blockPassed },
      { label: "Examen final", done: finalPassed },
      { label: "Práctica simulada (roleplay)", done: rps.length > 0 },
      { label: "Caso real validado", done: cases.length > 0 },
      { label: "Aplicación real repetida", done: yes >= 2 },
      { label: "Demostración sin ayuda", done: (bestDemo ?? 0) >= 60 },
      { label: "Lo ha explicado a un compañero", done: (bestTeach ?? 0) >= 60 },
      { label: "Ha impartido una formación real", done: realT.length > 0 },
      { label: "Ha acompañado a otra persona", done: done > 0 },
    ],
    evidence: ev.slice(0, 30).map((e) => ({ type: e.type, label: e.label, dimension: e.dimension, at: e.at.toISOString(), humanValidated: e.humanValidated })),
    next: null,
  };
  state.next = nextMove(state, blocks, courses, total, days, bestDemo, bestTeach);
  return state;
}

/** Un solo siguiente paso, con su porqué. Reglas en orden de prioridad. */
function nextMove(s: SkillState, blocks: Evidence[], courses: string[], total: number, days: number | null, bestDemo: number | null, bestTeach: number | null): SkillState["next"] {
  const course = courses[0];
  const demo = (m: string) => `/app/demostrar.html?skill=${encodeURIComponent(s.key)}&modo=${m}`;
  const href = course ? `/app/curso.html?src=/${course}.html` : null;
  const d = s.dims;
  if (days != null && days > 120 && d.conocimiento.value >= 60)
    return { title: "Refresca esta capacidad con un test rápido", why: `Lo demostraste, pero la última evidencia es de ${ago(days)}: toca comprobar que sigue viva.`, href: course ? `/app/evaluacion.html?src=${course}` : href };
  const weak = blocks.filter((b) => (b.score ?? 0) < 85).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  if (weak) return { title: `Repite el test del ${weak.label.split(" · ")[0]!.replace("Test del ", "")}`, why: `Tu mejor nota ahí es ${weak.score}/100; el resto de lo que haces se apoya en esto.`, href: course ? `/app/evaluacion.html?src=${course}` : href };
  if (total && blocks.length < total) return { title: "Sigue con el siguiente bloque del curso", why: `Llevas ${blocks.length} de ${total} bloques con test.`, href };
  if (bestDemo == null && d.conocimiento.value >= 60 && course)
    return { title: "Demuéstralo sin ayuda · 5 minutos", why: "Sabes la teoría; ahora falta ver qué haces tú solo, sin que la IA te resuelva el trabajo. Es la evidencia que más vale.", href: demo("demostracion") };
  if (d.aplicacion.value < 50) return { title: "Practícalo en un roleplay", why: d.conocimiento.value ? "Ya sabes la teoría; ahora falta demostrar que la aplicas en una conversación." : "Practicar pronto ayuda a fijar lo aprendido.", href: "/app/roleplays.html" };
  if (!s.checklist[1]!.done && blocks.length) return { title: "Haz el examen final", why: "Tienes los bloques; el examen confirma que lo dominas en conjunto.", href: course ? `/app/evaluacion.html?src=${course}` : href };
  if (s.kind === "competencia" && d.autonomia.value < 60) return { title: "Entrega un caso real", why: "Es la evidencia que más pesa: trabajo tuyo, en tu contexto, revisado por una persona.", href: "/app/inicio.html" };
  if (bestTeach == null && d.conocimiento.value >= 70 && course)
    return { title: "Explícaselo a un compañero · 5 minutos", why: "Enseñar obliga a ordenar lo que sabes y deja ver qué te falta.", href: demo("teach_back") };
  if (s.kind === "competencia" && (s.level ?? 0) >= 2 && d.transferencia.value < 35) return { title: "Acompaña a un compañero", why: "Enseñar es la prueba de que dominas algo, y el conocimiento se queda en la empresa.", href: "/app/inicio.html" };
  if (!blocks.length) return { title: "Empieza por el primer bloque", why: "Todavía no hay evidencias de esta capacidad.", href };
  return null;
}

/* ------------------------------------------------------------------ carga desde la base de datos */

export async function loadRaw(deps: SvcDeps, orgId: string, userId: string, opts: { titles: Record<string, string>; blockCount: (slug: string) => Promise<number | null> }, now = new Date()): Promise<Raw> {
  const mine = <T extends { organizationId: unknown; userId: unknown }>(t: T) => and(eq(t.organizationId as never, orgId), eq(t.userId as never, userId));
  const [atts, rps, facts, cases, checkins, mentees, levels, comps, links, events] = await Promise.all([
    deps.db.select().from(assessmentAttempt).where(and(mine(assessmentAttempt), eq(assessmentAttempt.status, "corregido"))),
    deps.db.select().from(roleplaySession).where(and(mine(roleplaySession), eq(roleplaySession.status, "cerrado"))),
    deps.db.select().from(learnerFact).where(and(mine(learnerFact), eq(learnerFact.layer, "competencia"), eq(learnerFact.sourceType, "test"))),
    deps.db.select({ competencyId: appliedCase.competencyId, at: validation.createdAt }).from(validation)
      .innerJoin(appliedCase, eq(validation.caseId, appliedCase.id))
      .where(and(eq(appliedCase.organizationId, orgId), eq(appliedCase.userId, userId), eq(validation.decision, "aprobado"))),
    deps.db.select().from(evidence).where(and(eq(evidence.organizationId, orgId), eq(evidence.ownerType, "seguimiento"), eq(evidence.createdBy, userId))),
    deps.db.select().from(coaching).where(and(eq(coaching.organizationId, orgId), eq(coaching.coachId, userId))),
    deps.db.select().from(levelByCompetency).where(mine(levelByCompetency)),
    deps.db.select({ id: competency.id, name: competency.name }).from(competency).where(eq(competency.organizationId, orgId)),
    deps.db.select().from(courseCompetency).where(eq(courseCompetency.organizationId, orgId)),
    deps.db.select().from(evidenceEvent).where(mine(evidenceEvent)),
  ]);
  const at = (a: typeof atts[number]) => a.gradedAt ?? a.submittedAt ?? a.startedAt;
  const slugs = new Set<string>([...atts.map((a) => a.source), ...links.map((l) => l.source)]);
  const totalBlocks = new Map<string, number | null>();
  await Promise.all([...slugs].map(async (s) => totalBlocks.set(s, await opts.blockCount(s).catch(() => null))));
  return {
    now,
    blocks: atts.filter((a) => a.kind === "block").map((a) => ({ source: a.source, block: a.block, score: a.score, passed: a.passed, at: at(a) })),
    finals: atts.filter((a) => a.kind === "final").map((a) => ({ source: a.source, score: a.score, passed: a.passed, at: at(a) })),
    roleplays: rps.map((r) => ({ source: r.source, competencyId: r.competencyId, topic: r.topic, score: r.score, at: r.closedAt ?? r.createdAt })),
    micro: facts.filter((f) => f.scope).map((f) => ({ source: slugOf(f.scope!), nivel: /nivel (inicial|intermedio|avanzado)/.exec(f.text)?.[1] ?? "", at: f.createdAt })),
    cases: cases.map((c) => ({ competencyId: c.competencyId, at: c.at })),
    checkins: checkins.map((e) => {
      let aplica = ""; try { aplica = String((JSON.parse(e.note || "{}") as { aplica?: string }).aplica ?? ""); } catch { /* nota no JSON */ }
      return { competencyId: e.ownerId, aplica, at: e.createdAt };
    }),
    mentees: mentees.map((m) => ({ competencyId: m.competencyId, status: m.status, at: m.createdAt })),
    events: events.map((e) => ({ skillKey: e.skillKey, type: e.type, score: e.score, context: e.context, at: e.createdAt })),
    levels: new Map(levels.map((l) => [l.competencyId, l.level])),
    competencies: new Map(comps.map((c) => [c.id, c.name])),
    courseToCompetency: new Map(links.map((l) => [l.source, l.competencyId])),
    titles: opts.titles, totalBlocks,
  };
}

/** Estado de capacidad de una persona: una entrada por competencia (o curso sin vincular) con evidencias. */
export function statesOf(raw: Raw): SkillState[] {
  const byKey = collect(raw);
  // Competencias con nivel oficial aunque aún no tengan evidencias derivadas.
  for (const [id, lvl] of raw.levels) if (lvl > 0 && !byKey.has(`comp:${id}`)) byKey.set(`comp:${id}`, []);
  return [...byKey].map(([k, ev]) => stateOf(k, ev, raw))
    .sort((a, b) => (b.lastEvidenceAt ?? "").localeCompare(a.lastEvidenceAt ?? ""));
}
