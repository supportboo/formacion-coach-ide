// Análisis de formaciones reales (1.22.0). La persona sube (o importa de Google Meet) la transcripción de una sesión
// en la que ELLA formó a otras personas. Se analiza cómo formó: métricas fijas + revisión con prueba literal.
// Privacidad por diseño:
//  - solo se evalúa a quien forma; el resto de voces se anonimiza («Participante 1…») y solo sirve de contexto;
//  - la transcripción NO se guarda: solo el resultado del análisis;
//  - hace falta confirmar que los asistentes sabían que se grababa y que se analizaría la sesión.
import { env } from "../config/env.js";
import { evidenceEvent, trainingSession } from "../db/schema.js";
import { firstJson } from "./aiContent.js";
import { literal } from "./demonstrate.js";
import type { SvcDeps } from "./org.js";

export interface Line { speaker: string; text: string; start: number | null } // start en segundos

/* ------------------------------------------------------------------ lectura de transcripciones */

const TS = /^\[?(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?\]?$/;
function secs(t: string): number | null {
  const m = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Entiende los formatos habituales: transcripción de Google Meet (Documento → texto: marcas «00:05:12» y
 * «Nombre: texto»), WebVTT (con <v Nombre>), SRT y líneas «Nombre: texto» o «Nombre (00:12): texto».
 */
export function parseTranscript(raw: string): Line[] {
  const out: Line[] = [];
  let cur: number | null = null;
  for (let l of raw.replace(/\r/g, "").split("\n")) {
    l = l.trim();
    if (!l || l === "WEBVTT" || /^\d+$/.test(l) || /^NOTE\b/.test(l)) continue;
    const arrow = /^(\S+)\s+-->\s+(\S+)/.exec(l);                    // VTT/SRT: 00:00:01.000 --> 00:00:04.000
    if (arrow) { cur = secs(arrow[1]!); continue; }
    if (TS.test(l)) { cur = secs(l); continue; }                     // Meet: línea con la marca de tiempo sola
    const v = /^<v\s+([^>]+)>(.*?)(<\/v>)?$/.exec(l);                // VTT con voz
    if (v) { out.push({ speaker: v[1]!.trim(), text: v[2]!.replace(/<[^>]+>/g, "").trim(), start: cur }); continue; }
    const named = /^([^:()\n]{2,60}?)\s*(?:\((\d{1,2}:\d{2}(?::\d{2})?)\))?\s*:\s+(.+)$/.exec(l); // Nombre (00:12): texto
    if (named && !/^https?$/i.test(named[1]!)) {
      out.push({ speaker: named[1]!.trim(), text: named[3]!.trim(), start: named[2] ? secs(named[2]) : cur });
      continue;
    }
    if (out.length) out[out.length - 1]!.text += " " + l;               // continuación de la intervención anterior
  }
  // Une intervenciones seguidas de la misma persona.
  const merged: Line[] = [];
  for (const x of out) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === x.speaker) last.text += " " + x.text; else merged.push({ ...x });
  }
  return merged.filter((x) => x.text.trim());
}

export function speakers(lines: Line[]): { name: string; words: number }[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.speaker, (m.get(l.speaker) ?? 0) + l.text.split(/\s+/).length);
  return [...m].map(([name, words]) => ({ name, words })).sort((a, b) => b.words - a.words);
}

/* ------------------------------------------------------------------ métricas fijas (sin IA) */

const CHECKS = /(¿(se )?(entiende|entendéis|entendido|tiene sentido|alguna (duda|pregunta)|dudas|preguntas|me explico|queda claro|lo veis|vale)\b|\?\s*$)/i;
const EXAMPLE = /\b(por ejemplo|imagina|imaginad|pongamos|un caso|el otro día|os cuento|mirad este)\b/i;

export interface Metrics {
  durationMin: number | null; trainerShare: number; trainerQuestions: number; checks: number; examples: number;
  participantTurns: number; participants: number; longestMonologueMin: number | null; wordsPerMin: number | null;
}

export function metrics(lines: Line[], trainer: string): Metrics {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const total = lines.reduce((a, l) => a + words(l.text), 0) || 1;
  const mine = lines.filter((l) => l.speaker === trainer);
  const myWords = mine.reduce((a, l) => a + words(l.text), 0);
  const starts = lines.map((l) => l.start).filter((x): x is number => x != null);
  const dur = starts.length >= 2 ? (Math.max(...starts) - Math.min(...starts)) / 60 : null;
  let longest: number | null = null;
  lines.forEach((l, i) => {
    if (l.speaker !== trainer || l.start == null) return;
    const next = lines.slice(i + 1).find((x) => x.start != null)?.start;
    if (next != null) longest = Math.max(longest ?? 0, (next - l.start) / 60);
  });
  const sentences = mine.flatMap((l) => l.text.split(/(?<=[.!?¿¡])\s+/));
  return {
    durationMin: dur != null ? Math.round(dur) : null,
    trainerShare: Math.round((myWords / total) * 100),
    trainerQuestions: sentences.filter((s) => /\?\s*$/.test(s.trim())).length,
    checks: sentences.filter((s) => CHECKS.test(s) && /entiend|sentido|duda|pregunta|claro|explico|veis|vale/i.test(s)).length,
    examples: mine.filter((l) => EXAMPLE.test(l.text)).length,
    participantTurns: lines.filter((l) => l.speaker !== trainer).length,
    participants: new Set(lines.filter((l) => l.speaker !== trainer).map((l) => l.speaker)).size,
    longestMonologueMin: longest != null ? Math.round(longest * 10) / 10 : null,
    wordsPerMin: dur ? Math.round(myWords / dur) : null,
  };
}

/** Anonimiza a todo el que no forma y recorta: solo contexto para entender la sesión. */
export function forModel(lines: Line[], trainer: string, maxChars = 28_000): string {
  const alias = new Map<string, string>();
  const name = (s: string) => s === trainer ? "FORMADOR" : (alias.get(s) ?? alias.set(s, `Participante ${alias.size + 1}`).get(s)!);
  const t = (s: number | null) => s == null ? "" : `[${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}] `;
  // También los nombres dichos dentro de las frases («Buena pregunta, Carlos») se sustituyen por su alias.
  for (const l of lines) name(l.speaker);
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subs = [...new Set(lines.map((l) => l.speaker))].flatMap((full) => {
    const first = full.split(/\s+/)[0]!;
    return [full, ...(first.length >= 3 && first !== full ? [first] : [])]
      .map((n) => ({ n, re: new RegExp(`(^|[^\\p{L}])${esc(n)}(?![\\p{L}])`, "giu"), to: name(full) }));
  }).sort((a, b) => b.n.length - a.n.length);
  const scrub = (x: string) => subs.reduce((acc, r) => acc.replace(r.re, (_m, pre: string) => pre + r.to), x);
  let out = "";
  for (const l of lines) {
    const row = `${t(l.start)}${name(l.speaker)}: ${scrub(l.speaker === trainer ? l.text : l.text.slice(0, 400))}\n`;
    if (out.length + row.length > maxChars) { out += "[…transcripción recortada…]\n"; break; }
    out += row;
  }
  return out;
}

/* ------------------------------------------------------------------ revisión con prueba literal */

export const CRITERIA = [
  "Abre con el objetivo de la sesión y lo que se llevarán los asistentes",
  "Sigue una estructura que se puede seguir (anuncia partes, transiciones claras)",
  "Aterriza con ejemplos o casos concretos",
  "Comprueba que se entiende (pregunta, pide que lo apliquen o lo expliquen)",
  "Hace participar al grupo (preguntas abiertas, práctica, turno de dudas)",
  "Responde bien a las preguntas del grupo",
  "Cierra con resumen y siguiente paso o tarea",
];

const SYS = `Eres un formador de formadores sénior de SkillUp. Analizas la transcripción de una sesión real en la que el FORMADOR enseñó algo a su equipo.
Evalúa SOLO al FORMADOR, nunca a los participantes. Nada sobre personalidad: conductas observables.
Para cada criterio: "cumple" = "si" | "parcial" | "no" y "cita" = fragmento LITERAL dicho por el FORMADOR (3-25 palabras, copiado tal cual) que lo demuestra; si no hay, "no" y "".
Además:
- "momentos": 2-3 momentos concretos (con "cita" literal del FORMADOR y "mejora": cómo lo haría mejor, una frase).
- "dudas": hasta 5 dudas o dificultades que mostraron los participantes (parafraseadas, sin nombres): indican qué reforzar en esa formación.
- "errores": afirmaciones del FORMADOR que parezcan incorrectas o imprecisas sobre el tema (con "cita" literal y "por_que"), o [] si no hay.
- "necesidades": 1-3 habilidades de formador que más le ayudaría trabajar (p. ej. «comprobar comprensión», «estructurar»).
- "recomendados": ids del CATÁLOGO (solo esos ids) que más le ayudarían, por su tema o por su forma de formar; [] si ninguno encaja.
- "bien" y "mejorar": una frase cada una. Español de España, tuteo.
Devuelve SOLO JSON: {"criterios":[{"criterio":"…","cumple":"si","cita":"…"}],"momentos":[{"cita":"…","mejora":"…"}],"dudas":["…"],"errores":[{"cita":"…","por_que":"…"}],"necesidades":["…"],"recomendados":["id"],"bien":"…","mejorar":"…"}`;

export interface Analysis {
  score: number;
  criterios: { criterio: string; cumple: "si" | "parcial" | "no"; cita: string }[];
  momentos: { cita: string; mejora: string }[];
  dudas: string[]; errores: { cita: string; por_que: string }[]; necesidades: string[]; recomendados: string[];
  bien: string; mejorar: string;
}

const clip = (s: unknown, n: number) => typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";

export async function analyze(a: { orgId: string; userId: string; title: string; topic: string; lines: Line[]; trainer: string; catalog: Record<string, string> }): Promise<Analysis | null> {
  const { llm } = await import("../container.js");
  const trainerText = a.lines.filter((l) => l.speaker === a.trainer).map((l) => l.text).join("\n");
  const cat = Object.entries(a.catalog).map(([id, t]) => `${id}: ${t}`).join("\n");
  const content = `SESIÓN: ${a.title}\nTEMA: ${a.topic || "(no indicado)"}\nCRITERIOS:\n${CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nCATÁLOGO:\n${cat}\n\nTRANSCRIPCIÓN:\n${forModel(a.lines, a.trainer)}`;
  const out = firstJson<Record<string, unknown>>(await llm.generate({ system: SYS, messages: [{ role: "user", content }], model: env.MODEL_SENIOR, maxTokens: 1800, kind: "session_analysis", orgId: a.orgId, userId: a.userId, timeoutMs: 90_000 }).catch(() => "{}"));
  if (!out || !Array.isArray(out.criterios)) return null;
  const got = out.criterios as { cumple?: unknown; cita?: unknown }[];
  // Sin cita literal del formador, el criterio no cuenta (la IA no puede dar por bueno lo que no se dijo).
  const criterios = CRITERIA.map((c, i) => {
    const g = got[i] ?? {}, cita = clip(g.cita, 300), v = String(g.cumple);
    const ok = (v === "si" || v === "parcial") && literal(cita, trainerText);
    return { criterio: c, cumple: (ok ? v : "no") as "si" | "parcial" | "no", cita: ok ? cita : "" };
  });
  const arr = (x: unknown) => Array.isArray(x) ? x : [];
  const momentos = arr(out.momentos).map((m: { cita?: unknown; mejora?: unknown }) => ({ cita: clip(m?.cita, 300), mejora: clip(m?.mejora, 300) }))
    .filter((m) => m.mejora && literal(m.cita, trainerText)).slice(0, 3);
  const errores = arr(out.errores).map((m: { cita?: unknown; por_que?: unknown }) => ({ cita: clip(m?.cita, 300), por_que: clip(m?.por_que, 300) }))
    .filter((m) => m.por_que && literal(m.cita, trainerText)).slice(0, 3);
  const pts: number[] = criterios.map((c) => c.cumple === "si" ? 100 : c.cumple === "parcial" ? 50 : 0);
  return {
    score: Math.round(pts.reduce((x, y) => x + y, 0) / pts.length), criterios, momentos, errores,
    dudas: arr(out.dudas).map((x) => clip(x, 200)).filter(Boolean).slice(0, 5),
    necesidades: arr(out.necesidades).map((x) => clip(x, 120)).filter(Boolean).slice(0, 3),
    recomendados: arr(out.recomendados).map(String).filter((id) => id in a.catalog).slice(0, 3),
    bien: clip(out.bien, 300), mejorar: clip(out.mejorar, 300),
  };
}

export async function save(deps: SvcDeps, a: { orgId: string; userId: string; title: string; topic: string; skillKey: string | null; source: "subida" | "meet"; heldAt: Date | null; metrics: Metrics; analysis: Analysis }): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(trainingSession).values({
    id, organizationId: a.orgId, userId: a.userId, title: a.title.slice(0, 200), topic: a.topic.slice(0, 200) || null, skillKey: a.skillKey,
    source: a.source, heldAt: a.heldAt, metrics: a.metrics as unknown as Record<string, unknown>, analysis: a.analysis as unknown as Record<string, unknown>, score: a.analysis.score,
  });
  // Formar a otros en una sesión real es la evidencia de transferencia más fuerte que no es un acompañamiento completo.
  if (a.skillKey) await deps.db.insert(evidenceEvent).values({
    id: deps.newId(), organizationId: a.orgId, userId: a.userId, skillKey: a.skillKey, type: "formacion_real", dimension: "transferencia",
    context: a.title.slice(0, 300), score: a.analysis.score, independence: "enseno", aiHelp: "ninguna", detail: { sessionId: id },
  });
  return id;
}
