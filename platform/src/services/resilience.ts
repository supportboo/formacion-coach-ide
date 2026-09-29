// Mapa de resiliencia del conocimiento (1.21.0, arquitectura V2 fase 8). Para dirección: no «quién está conectado»,
// sino dónde tiene la empresa riesgo de perder capacidad. Solo niveles oficiales (N0-N4) y acompañamientos: nunca la
// ficha privada ni conversaciones. Reglas fijas y explicables.
import { and, eq } from "drizzle-orm";
import { coaching, competency, levelByCompetency, member, user } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export type Risk = "sin_cobertura" | "critico" | "alto" | "medio" | "bajo";
export interface Input {
  competencies: { id: string; name: string; critical: boolean }[];
  levels: { userId: string; competencyId: string; level: number }[];
  coachings: { coachId: string; learnerId: string; competencyId: string; status: string }[];
  names: Map<string, string>;
}

const RISK_ORDER: Record<Risk, number> = { sin_cobertura: 0, critico: 1, alto: 2, medio: 3, bajo: 4 };

/** Riesgo por nº de personas que la aplican solas (N2+) y referentes (N3+). Una competencia crítica sube un escalón. */
export function riskOf(autonomous: number, referentes: number, critical: boolean): Risk {
  let r: Risk = autonomous === 0 ? "sin_cobertura" : autonomous === 1 ? "alto" : autonomous === 2 || referentes === 0 ? "medio" : "bajo";
  if (critical && r === "alto") r = "critico";
  if (critical && r === "medio") r = "alto";
  return r;
}

export function resilience(inp: Input) {
  const name = (id: string) => inp.names.get(id) || "Sin nombre";
  const at = (compId: string, min: number) => inp.levels.filter((l) => l.competencyId === compId && l.level >= min);
  const activeLoad = new Map<string, number>();
  for (const c of inp.coachings) if (c.status === "activo") activeLoad.set(c.coachId, (activeLoad.get(c.coachId) ?? 0) + 1);

  const competencies = inp.competencies.map((c) => {
    const auto = at(c.id, 2), refs = at(c.id, 3);
    const learning = inp.levels.filter((l) => l.competencyId === c.id && l.level === 1);
    const risk = riskOf(auto.length, refs.length, c.critical);
    // Qué hacer: quien ya la domina (preferible referente, con menos acompañamientos activos) acompaña a quien la está aprendiendo.
    let action: string | null = null;
    if (risk !== "bajo") {
      const mentors = [...auto].sort((a, b) => b.level - a.level || (activeLoad.get(a.userId) ?? 0) - (activeLoad.get(b.userId) ?? 0));
      const coached = new Set(inp.coachings.filter((k) => k.competencyId === c.id && k.status === "activo").map((k) => k.learnerId));
      const candidates = learning.filter((l) => !coached.has(l.userId)).slice(0, 2);
      if (!auto.length) action = learning.length ? `Nadie la aplica todavía: prioriza que ${learning.slice(0, 2).map((l) => name(l.userId)).join(" y ")} entreguen su caso real.` : "Nadie la está aprendiendo: asigna el curso vinculado a dos personas.";
      else if (candidates.length) action = `Propón a ${name(mentors[0]!.userId)} acompañar a ${candidates.map((l) => name(l.userId)).join(" y ")} en dos prácticas.`;
      else action = `Solo ${auto.length === 1 ? "una persona la domina" : `${auto.length} personas la dominan`}: elige a alguien que la aprenda y que ${name(mentors[0]!.userId)} le acompañe.`;
    }
    return {
      competencyId: c.id, name: c.name, critical: c.critical, risk,
      autonomous: auto.length, referentes: refs.length, learning: learning.length,
      holders: auto.sort((a, b) => b.level - a.level).map((l) => ({ name: name(l.userId), level: l.level })),
      why: `${auto.length} persona(s) la aplican solas (N2 o más), ${refs.length} referente(s) (N3 o más)${c.critical ? "; es crítica" : ""}.`,
      action,
    };
  }).sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.name.localeCompare(b.name));

  // Personas clave: sostienen varias competencias como referentes, o son la única que aplica alguna.
  const onlyOne = new Map<string, string[]>();
  for (const c of competencies) if (c.autonomous === 1) {
    const holder = inp.levels.find((l) => l.competencyId === c.competencyId && l.level >= 2)!.userId;
    onlyOne.set(holder, [...(onlyOne.get(holder) ?? []), c.name]);
  }
  const refsBy = new Map<string, { name: string; level: number }[]>();
  const compName = new Map(inp.competencies.map((c) => [c.id, c.name]));
  for (const l of inp.levels) if (l.level >= 3 && compName.has(l.competencyId)) refsBy.set(l.userId, [...(refsBy.get(l.userId) ?? []), { name: compName.get(l.competencyId)!, level: l.level }]);
  const keyPeople = [...new Set([...onlyOne.keys(), ...[...refsBy].filter(([, v]) => v.length >= 2).map(([k]) => k)])].map((id) => ({
    name: name(id), holds: refsBy.get(id) ?? [], onlyHolderOf: onlyOne.get(id) ?? [],
  })).sort((a, b) => b.onlyHolderOf.length - a.onlyHolderOf.length || b.holds.length - a.holds.length);

  // Cadenas de transferencia: quién formó a quién (acompañamientos logrados), por competencia.
  const chains: { competency: string; path: string[] }[] = [];
  for (const c of inp.competencies) {
    const edges = inp.coachings.filter((k) => k.competencyId === c.id && k.status === "logrado");
    const learners = new Set(edges.map((e) => e.learnerId));
    const walk = (id: string, path: string[], seen: Set<string>) => {
      const next = edges.filter((e) => e.coachId === id && !seen.has(e.learnerId));
      if (!next.length) { if (path.length > 1) chains.push({ competency: c.name, path: path.map(name) }); return; }
      for (const e of next) walk(e.learnerId, [...path, e.learnerId], new Set([...seen, e.learnerId]));
    };
    for (const root of new Set(edges.map((e) => e.coachId))) if (!learners.has(root)) walk(root, [root], new Set([root]));
  }

  // El coach como multiplicador: a cuántos acompañó y cuántos llegaron a aplicarlo solos.
  const coachStats = new Map<string, { total: number; logrado: number; activo: number; fallido: number }>();
  for (const k of inp.coachings) {
    const s = coachStats.get(k.coachId) ?? { total: 0, logrado: 0, activo: 0, fallido: 0 };
    s.total++; if (k.status === "logrado") s.logrado++; else if (k.status === "activo") s.activo++; else if (k.status === "fallido") s.fallido++;
    coachStats.set(k.coachId, s);
  }
  const coaches = [...coachStats].map(([id, s]) => {
    const closed = s.logrado + s.fallido;
    return { name: name(id), ...s, rate: closed ? Math.round((s.logrado / closed) * 100) : null, teaches: s.logrado >= 2 && closed > 0 && s.logrado / closed >= 0.6 };
  }).sort((a, b) => b.logrado - a.logrado || b.total - a.total);

  const counts = competencies.reduce((m, c) => ({ ...m, [c.risk]: (m[c.risk] ?? 0) + 1 }), {} as Partial<Record<Risk, number>>);
  return { competencies, keyPeople, chains: chains.slice(0, 30), coaches, counts };
}

export async function load(deps: SvcDeps, orgId: string): Promise<Input> {
  const [comps, levels, coachings, people] = await Promise.all([
    deps.db.select({ id: competency.id, name: competency.name, critical: competency.critical }).from(competency).where(eq(competency.organizationId, orgId)),
    deps.db.select({ userId: levelByCompetency.userId, competencyId: levelByCompetency.competencyId, level: levelByCompetency.level }).from(levelByCompetency).where(eq(levelByCompetency.organizationId, orgId)),
    deps.db.select({ coachId: coaching.coachId, learnerId: coaching.learnerId, competencyId: coaching.competencyId, status: coaching.status }).from(coaching).where(eq(coaching.organizationId, orgId)),
    deps.db.select({ id: user.id, name: user.name }).from(member).innerJoin(user, eq(member.userId, user.id)).where(and(eq(member.organizationId, orgId))),
  ]);
  const inOrg = new Set(people.map((p) => p.id));
  return {
    competencies: comps.map((c) => ({ ...c, critical: !!c.critical })),
    levels: levels.filter((l) => inOrg.has(l.userId)),
    coachings: coachings.filter((k) => inOrg.has(k.coachId) && inOrg.has(k.learnerId)),
    names: new Map(people.map((p) => [p.id, p.name])),
  };
}
