// Micropráctica de la bienvenida (1.14.0, revisión externa del 28-09): el primer efecto «me conocen» es un resultado útil,
// no un perfil. Con la situación que la persona quiere resolver se le plantea un escenario corto, responde y sale con algo
// que puede usar ya (preguntas, guion o lista). Se evalúan conductas concretas; nunca personalidad ni capacidad general, y
// no acredita nivel (N1-N4 siguen su propio sistema).
import { env } from "../config/env.js";
import { firstJson } from "./aiContent.js";

export interface Scenario { escenario: string; pregunta: string }
export interface Evaluation { bien: string; mejorar: string; entregable: { titulo: string; items: string[] }; nivel?: "inicial" | "intermedio" | "avanzado" }

const SCEN_SYS = `Eres formador sénior de SkillUp. Con la situación que un profesional quiere resolver, plantéale una micropráctica de un minuto:
un escenario breve y realista de su trabajo (2-3 frases, en segunda persona, con un interlocutor concreto pero ficticio) y UNA pregunta que le obligue a decidir qué haría o diría.
No inventes datos de su empresa: si hay contexto de empresa, úsalo; si no, plantea una situación típica de su puesto. Español de España.
Devuelve SOLO JSON: {"escenario":"…","pregunta":"…"}`;

const EVAL_SYS = `Eres formador sénior de SkillUp. Evalúa la respuesta de un profesional a una micropráctica.
Reglas:
- Juzga solo CONDUCTAS concretas de su respuesta (si explora antes de proponer, si distingue interlocutores, si propone un siguiente paso, si concede demasiado pronto…). Nada sobre su personalidad, emociones o capacidad general.
- «bien»: una frase con lo que hizo bien, citando su respuesta. «mejorar»: una frase con UNA mejora concreta.
- «entregable»: algo que pueda usar YA en su situación real (3-5 elementos): por ejemplo, las preguntas para su próxima conversación, un guion corto o una lista de comprobación.
- No es una nota ni una acreditación: no puntúes. Solo añade "nivel" (inicial | intermedio | avanzado) como estimación provisional de ESTA respuesta en esta tarea, para ajustar la dificultad del curso.
- Español de España, tuteo, directo.
Devuelve SOLO JSON: {"bien":"…","mejorar":"…","entregable":{"titulo":"…","items":["…","…","…"]},"nivel":"intermedio"}`;

export function validScenario(x: unknown): x is Scenario {
  const s = x as Scenario; return !!s && typeof s.escenario === "string" && s.escenario.length > 20 && typeof s.pregunta === "string" && s.pregunta.length > 5;
}
export function validEvaluation(x: unknown): x is Evaluation {
  const e = x as Evaluation;
  return !!e && typeof e.bien === "string" && typeof e.mejorar === "string" && !!e.entregable && typeof e.entregable.titulo === "string"
    && Array.isArray(e.entregable.items) && e.entregable.items.length >= 2 && e.entregable.items.every((i) => typeof i === "string");
}

async function ask(system: string, content: string, model: string, maxTokens: number, orgId: string, userId: string): Promise<unknown> {
  const { llm } = await import("../container.js");
  return firstJson(await llm.generate({ system, messages: [{ role: "user", content }], model, maxTokens, kind: "micropractice", orgId, userId }));
}

export async function scenario(orgId: string, userId: string, situacion: string, rol: string, empresa: string | null): Promise<Scenario | null> {
  const out = await ask(SCEN_SYS, `SITUACIÓN QUE QUIERE RESOLVER: ${situacion}\nSU PUESTO: ${rol || "(no lo ha dicho)"}\n${empresa ? "CONTEXTO DE SU EMPRESA (validado):\n" + empresa : ""}`, env.MODEL_FAST, 400, orgId, userId).catch(() => null);
  return validScenario(out) ? out : null;
}

export async function evaluate(orgId: string, userId: string, s: Scenario, respuesta: string, situacion: string): Promise<Evaluation | null> {
  const out = await ask(EVAL_SYS, `SITUACIÓN REAL: ${situacion}\nESCENARIO: ${s.escenario}\nPREGUNTA: ${s.pregunta}\nSU RESPUESTA: ${respuesta}`, env.MODEL_SENIOR, 700, orgId, userId).catch(() => null);
  if (!validEvaluation(out)) return null;
  const nivel = ["inicial", "intermedio", "avanzado"].includes(String(out.nivel)) ? out.nivel : undefined;
  return { bien: out.bien, mejorar: out.mejorar, entregable: { titulo: out.entregable.titulo, items: out.entregable.items.slice(0, 5) }, nivel };
}
