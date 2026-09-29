// Demostración sin ayuda y teach-back (1.19.0, arquitectura V2 fase 2).
// - Demostración: un escenario de su trabajo sacado del contenido REAL del curso; responde sin tutor. Evidencia de
//   autonomía «independiente, sin ayuda de la IA de SkillUp».
// - Teach-back: «explícaselo a un compañero nuevo». Los conceptos esperados son los apartados reales del bloque.
//   Evidencia de transferencia; nunca da N3 por sí sola.
// La nota NO la inventa el modelo: el modelo juzga cada criterio con una cita literal de la respuesta; sin cita,
// el criterio no cuenta. La nota se calcula aquí con reglas fijas.
import { env } from "../config/env.js";
import { evidenceEvent } from "../db/schema.js";
import { firstJson } from "./aiContent.js";
import type { CourseBlock } from "./assessment.js";
import type { SvcDeps } from "./org.js";

export type Mode = "demostracion" | "teach_back";
type Verdict = "si" | "parcial" | "no";
export interface Session {
  id: string; orgId: string; userId: string; mode: Mode; skillKey: string; skillName: string;
  block: string; escenario: string; pregunta: string; criterios: string[]; expires: number;
}

// ponytail: sesiones en memoria de proceso (como los exámenes); un reinicio las pierde y la persona empieza otra.
const sessions = new Map<string, Session>();
const TTL = 2 * 3_600_000;
export function takeSession(id: string, who: { orgId: string; userId: string }): Session | null {
  const s = sessions.get(id);
  if (!s || s.orgId !== who.orgId || s.userId !== who.userId) return null;
  sessions.delete(id);
  return s.expires > Date.now() ? s : null;
}

async function ask(system: string, content: string, model: string, maxTokens: number, orgId: string, userId: string): Promise<unknown> {
  const { llm } = await import("../container.js");
  return firstJson(await llm.generate({ system, messages: [{ role: "user", content }], model, maxTokens, kind: "demonstration", orgId, userId }));
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const DEMO_SYS = `Eres formador sénior de SkillUp. Prepara una DEMOSTRACIÓN: un ejercicio que la persona resolverá SOLA, sin tutor.
Con el CONTENIDO DEL BLOQUE (única fuente de verdad) y lo que sabemos de su trabajo, plantea:
- "escenario": 3-4 frases, en segunda persona, una situación realista de su trabajo donde tenga que aplicar lo del bloque. Interlocutor ficticio pero concreto. No inventes datos de su empresa.
- "pregunta": qué tiene que hacer o escribir (por ejemplo, el mensaje que enviaría o lo que diría y por qué).
- "criterios": 3 o 4 CONDUCTAS observables que una buena respuesta debe mostrar, sacadas del contenido del bloque (p. ej. «pregunta por el impacto antes de proponer»). Nada de personalidad.
Español de España. Devuelve SOLO JSON: {"escenario":"…","pregunta":"…","criterios":["…","…","…"]}`;

const JUDGE_SYS = `Eres evaluador de SkillUp. Juzga la respuesta de una persona criterio a criterio.
Para cada criterio: "cumple" = "si" | "parcial" | "no", y "cita" = el fragmento LITERAL de su respuesta que lo demuestra (copiado tal cual, 3-25 palabras). Si no hay fragmento que lo demuestre, "cumple" = "no" y "cita" = "".
"bien": una frase con lo mejor de su respuesta. "mejorar": una frase con UNA mejora concreta. Nada sobre su personalidad.
Español de España, tuteo. Devuelve SOLO JSON: {"criterios":[{"criterio":"…","cumple":"si","cita":"…"}],"bien":"…","mejorar":"…"}`;

const TEACH_SYS = `Eres evaluador de SkillUp. La persona ha explicado un tema a un compañero nuevo (teach-back). Juzga su explicación con los CONCEPTOS ESPERADOS, que salen del contenido real del bloque.
Para cada concepto: "cumple" = "si" | "parcial" | "no" y "cita" = fragmento LITERAL de su explicación (3-25 palabras) que lo cubre, o "" si no lo cubre.
Además: "ejemplo" = fragmento literal donde pone un ejemplo concreto, o "" si no hay; "claridad" 1-5 (5 = un compañero nuevo lo entendería a la primera); "lagunas": 0-3 cosas importantes que faltan o están mal; "bien" y "mejorar": una frase cada una.
Español de España, tuteo. Devuelve SOLO JSON: {"criterios":[{"criterio":"…","cumple":"si","cita":"…"}],"ejemplo":"…","claridad":4,"lagunas":["…"],"bien":"…","mejorar":"…"}`;

function pickBlock(blocks: CourseBlock[], prefer: number[]): CourseBlock | null {
  const ok = blocks.filter((b) => b.text.length > 200);
  if (!ok.length) return null;
  const pref = ok.filter((b) => prefer.includes(b.i));
  const pool = pref.length ? pref : ok;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export async function start(a: {
  orgId: string; userId: string; mode: Mode; skillKey: string; skillName: string; blocks: CourseBlock[]; passedBlocks: number[]; perfil: string; newId: () => string;
}): Promise<Omit<Session, "orgId" | "userId" | "expires" | "criterios"> & { criterios: string[] } | null> {
  const b = pickBlock(a.blocks, a.passedBlocks);
  if (!b) return null;
  let s: Omit<Session, "id" | "orgId" | "userId" | "expires">;
  if (a.mode === "teach_back") {
    const criterios = [...new Set(b.headings.map((h) => clip(h, 90)).filter((h) => h.length > 3))].slice(0, 6);
    if (criterios.length < 2) criterios.push(`Qué es «${b.title}» y para qué sirve`, "Un ejemplo concreto de tu trabajo");
    s = { mode: a.mode, skillKey: a.skillKey, skillName: a.skillName, block: b.title, criterios,
      escenario: `Mañana entra en tu equipo una persona nueva y te toca explicarle «${b.title}».`,
      pregunta: "Explícaselo como se lo contarías tú: qué es, por qué importa y un ejemplo de tu trabajo. Sin mirar el curso." };
  } else {
    const out = await ask(DEMO_SYS, `TEMA: ${a.skillName} · bloque «${b.title}»\nCONTENIDO DEL BLOQUE:\n${clip(b.text, 3500)}\n\nLO QUE SABEMOS DE SU TRABAJO:\n${clip(a.perfil || "(poco todavía: usa una situación típica del puesto)", 1200)}`,
      env.MODEL_FAST, 600, a.orgId, a.userId).catch(() => null) as { escenario?: unknown; pregunta?: unknown; criterios?: unknown } | null;
    const crit = Array.isArray(out?.criterios) ? (out!.criterios as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 5).slice(0, 4) : [];
    if (typeof out?.escenario !== "string" || typeof out?.pregunta !== "string" || crit.length < 2) return null;
    s = { mode: a.mode, skillKey: a.skillKey, skillName: a.skillName, block: b.title, escenario: clip(out.escenario, 900), pregunta: clip(out.pregunta, 300), criterios: crit };
  }
  const id = a.newId();
  sessions.set(id, { ...s, id, orgId: a.orgId, userId: a.userId, expires: Date.now() + TTL });
  return { ...s, id };
}

export interface Judged { criterio: string; cumple: Verdict; cita: string }
export interface Result { score: number; criterios: Judged[]; bien: string; mejorar: string; lagunas: string[]; ejemplo: boolean; claridad: number | null }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
/** Una cita solo vale si aparece de verdad en lo que escribió la persona. */
export function literal(cita: string, respuesta: string): boolean {
  const c = norm(cita);
  return c.split(" ").length >= 3 && norm(respuesta).includes(c);
}

/** Nota con reglas fijas a partir de los veredictos con cita comprobada. */
export function scoreOf(mode: Mode, criterios: Judged[], ejemplo: boolean, claridad: number | null): number {
  const pts: number[] = criterios.map((c) => c.cumple === "si" ? 100 : c.cumple === "parcial" ? 50 : 0);
  const cov = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
  if (mode === "demostracion") return Math.round(cov);
  return Math.round(0.7 * cov + (ejemplo ? 15 : 0) + 15 * (((claridad ?? 1) - 1) / 4));
}

export async function judge(s: Session, respuesta: string): Promise<Result | null> {
  const sys = s.mode === "teach_back" ? TEACH_SYS : JUDGE_SYS;
  const out = await ask(sys, `${s.mode === "teach_back" ? "TEMA" : "ESCENARIO"}: ${s.escenario}\nTAREA: ${s.pregunta}\n${s.mode === "teach_back" ? "CONCEPTOS ESPERADOS" : "CRITERIOS"}:\n${s.criterios.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nRESPUESTA DE LA PERSONA:\n${respuesta}`,
    env.MODEL_SENIOR, 900, s.orgId, s.userId).catch(() => null) as Record<string, unknown> | null;
  if (!out || !Array.isArray(out.criterios)) return null;
  const got = out.criterios as { criterio?: unknown; cumple?: unknown; cita?: unknown }[];
  // Cada criterio pedido, en su orden; si el modelo no lo juzga o la cita no es literal, no cuenta.
  const criterios: Judged[] = s.criterios.map((c, i) => {
    const g = got[i] ?? {};
    const cita = typeof g.cita === "string" ? g.cita : "";
    const v = (["si", "parcial", "no"].includes(String(g.cumple)) ? g.cumple : "no") as Verdict;
    return { criterio: c, cumple: v !== "no" && literal(cita, respuesta) ? v : "no", cita: v !== "no" && literal(cita, respuesta) ? cita : "" };
  });
  const ejemplo = typeof out.ejemplo === "string" && literal(out.ejemplo, respuesta);
  const claridad = s.mode === "teach_back" && Number.isFinite(Number(out.claridad)) ? Math.max(1, Math.min(5, Math.round(Number(out.claridad)))) : null;
  const lagunas = Array.isArray(out.lagunas) ? (out.lagunas as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3).map((x) => clip(x, 200)) : [];
  return {
    score: scoreOf(s.mode, criterios, ejemplo, claridad), criterios, lagunas, ejemplo, claridad,
    bien: typeof out.bien === "string" ? clip(out.bien, 300) : "", mejorar: typeof out.mejorar === "string" ? clip(out.mejorar, 300) : "",
  };
}

export async function record(deps: SvcDeps, s: Session, r: Result): Promise<void> {
  await deps.db.insert(evidenceEvent).values({
    id: deps.newId(), organizationId: s.orgId, userId: s.userId, skillKey: s.skillKey, type: s.mode,
    dimension: s.mode === "teach_back" ? "transferencia" : "autonomia",
    context: `${s.block} · ${s.escenario}`.slice(0, 1000), score: r.score,
    independence: s.mode === "teach_back" ? "enseno" : "independiente", aiHelp: "ninguna",
    detail: { criterios: r.criterios, lagunas: r.lagunas, claridad: r.claridad, ejemplo: r.ejemplo },
  });
}
