import type { Llm } from "../agents/llm.js";

/**
 * Los LLM a veces envuelven el JSON en prosa o vallas markdown, o se quedan a medias
 * cuando se agotan los tokens. Extrae el objeto y, si viene truncado, lo repara descartando
 * el último elemento incompleto y cerrando corchetes/llaves abiertos.
 */
export function firstJson<T>(s: string): T {
  const cleaned = s.replace(/```(?:json)?/gi, "");
  const a = cleaned.indexOf("{");
  if (a === -1) throw new Error("la IA no devolvió JSON: " + s.slice(0, 200));
  const b = cleaned.lastIndexOf("}");
  if (b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)) as T; } catch { /* intenta reparar debajo */ }
  }
  const repaired = repairTruncatedJson(cleaned.slice(a));
  if (repaired === null) throw new Error("la IA no devolvió JSON: " + s.slice(0, 200));
  return JSON.parse(repaired) as T;
}

/**
 * Rescata un JSON truncado (tokens agotados): prueba puntos de corte desde el final, cerrando los
 * contenedores abiertos, hasta que uno parsea. Descarta el último elemento a medias. null si nada sirve.
 */
// ponytail: O(n) parse attempts on the error path only; fine for our own prompts' small shapes.
function repairTruncatedJson(s: string): string | null {
  for (let cut = s.length; cut >= 1; cut--) {
    let out = s.slice(0, cut).replace(/,\s*$/, "");
    const open: string[] = [];
    let inStr = false, esc = false, bad = false;
    for (const ch of out) {
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") open.push("}");
      else if (ch === "[") open.push("]");
      else if (ch === "}" || ch === "]") { if (open.pop() !== ch) { bad = true; break; } }
    }
    if (bad || inStr) continue;
    out = out.replace(/,\s*$/, "");
    while (open.length) out += open.pop();
    try { JSON.parse(out); return out; } catch { /* prueba un corte anterior */ }
  }
  return null;
}

const BASE = "Español de España, claro y sin jerga. No inventes cifras ni estudios. Responde SOLO JSON válido, sin markdown.";

export interface ExamQuestion { q: string; options: string[] }
export interface GeneratedExam { questions: ExamQuestion[] }

/** Genera un test de opción múltiple sobre una competencia, adaptado al sector/puesto si se conocen. */
export async function generateExam(
  llm: Llm, args: { competencyName: string; sector?: string; puesto?: string; empresa?: string; n?: number; orgId?: string; userId?: string },
): Promise<GeneratedExam> {
  const n = args.n ?? 5;
  const ctx = [args.sector && `sector: ${args.sector}`, args.puesto && `puesto: ${args.puesto}`, args.empresa && `empresa: ${args.empresa}`]
    .filter(Boolean).join(", ");
  const system = `Eres examinador. Crea ${n} preguntas tipo test (4 opciones, una correcta) sobre "${args.competencyName}"${ctx ? ` para alguien de ${ctx}` : ""}. ${BASE}\nFormato: {"questions":[{"q":"...","options":["a","b","c","d"]}]} (la opción correcta va SIEMPRE en options[0]; el cliente las mezclará).`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content: "Genera el test." }], maxTokens: 2000,
    orgId: args.orgId, userId: args.userId, kind: "exam",
  });
  const exam = firstJson<GeneratedExam>(out);
  // Drop malformed questions (a salvaged truncation can leave a last question with <4 options).
  const questions = (Array.isArray(exam.questions) ? exam.questions : [])
    .filter((q) => q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length >= 4)
    .map((q) => ({ q: q.q, options: q.options.slice(0, 4) }));
  if (!questions.length) throw new Error("no se pudo generar el test, inténtalo de nuevo");
  return { questions };
}

/**
 * Corrige un test de opción múltiple. Determinista (comparación exacta de texto), no vía LLM:
 * ya sabemos la respuesta correcta desde la generación, preguntarle a un LLM introduciría
 * no-determinismo en algo que tiene una respuesta objetivamente correcta (doctrina de certeza).
 */
export function scoreExam(correctAnswers: string[], answers: string[]): number {
  if (correctAnswers.length === 0) return 0;
  const hits = correctAnswers.filter((c, i) => (answers[i] ?? "").trim() === c.trim()).length;
  return Math.round((hits / correctAnswers.length) * 100);
}

/** Sesión de examen en memoria de proceso: guarda la respuesta correcta sin exponerla al cliente. */
const examSessions = new Map<string, { correctAnswers: string[]; expiresAt: number }>();
const EXAM_TTL_MS = 30 * 60_000;

export function storeExamSession(id: string, correctAnswers: string[]): void {
  examSessions.set(id, { correctAnswers, expiresAt: Date.now() + EXAM_TTL_MS });
}
export function takeExamSession(id: string): string[] | null {
  const s = examSessions.get(id);
  examSessions.delete(id); // de un solo uso
  if (!s || s.expiresAt < Date.now()) return null;
  return s.correctAnswers;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!; a[i] = a[j]!; a[j] = tmp;
  }
  return a;
}

/** Baraja las opciones de cada pregunta y devuelve, aparte, la respuesta correcta de cada una (para guardar en sesión). */
export function shuffleExam(exam: GeneratedExam): { questions: ExamQuestion[]; correctAnswers: string[] } {
  const correctAnswers = exam.questions.map((q) => q.options[0] ?? "");
  const questions = exam.questions.map((q) => ({ q: q.q, options: shuffle(q.options) }));
  return { questions, correctAnswers };
}

/** Redacta el caso práctico con el contexto real del empleado (doctrina: nunca genérico). */
export async function generateCasePrompt(
  llm: Llm, args: { competencyName: string; sector?: string; puesto?: string; motivo?: string; empresa?: string; freno?: string; orgId?: string; userId?: string },
): Promise<string> {
  const ctx = [args.sector && `sector ${args.sector}`, args.puesto && `puesto ${args.puesto}`, args.motivo && `motivo: ${args.motivo}`]
    .filter(Boolean).join(", ") || "contexto general (sin sector/puesto declarados, pídeselo en el propio enunciado)";
  const empresa = args.empresa ? ` La empresa real de la persona: ${args.empresa}. Ambienta el caso en ESO (sus clientes, su producto de verdad), no en un genérico del sector.` : "";
  const freno = args.freno ? ` La persona ha dicho que le frena "${args.freno}": diseña el caso para que se enfrente justo a eso, en pequeño, y lo supere practicando.` : "";
  const system = `Eres diseñador de casos prácticos. Redacta UN enunciado de caso real y concreto para demostrar la competencia "${args.competencyName}", ambientado en ${ctx}.${empresa}${freno} Debe ser algo que la persona pueda hacer de verdad en su trabajo esta semana, no un ejercicio abstracto. ${BASE}\nFormato: {"prompt":"..."}`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content: "Genera el caso." }], maxTokens: 500,
    orgId: args.orgId, userId: args.userId, kind: "case",
  });
  return firstJson<{ prompt: string }>(out).prompt;
}

export interface RubricSuggestion { criteria: { label: string; score: number; note: string }[] }

/**
 * Puntuacion sugerida por criterio de rubrica, 0-10, con una nota breve -- SOLO una sugerencia
 * visible para quien valida. La decision de aprobar/rechazar el caso la sigue tomando un humano
 * via validateCase(); esta funcion nunca decide ni escribe en applied_case.
 */
export async function suggestRubricScore(
  llm: Llm,
  args: { prompt: string; submission: string; criteria: { label: string; weight?: number }[]; orgId?: string; userId?: string },
): Promise<RubricSuggestion> {
  const criteriaList = args.criteria.map((c) => `- ${c.label}`).join("\n");
  const system = `Evalúas una entrega de caso práctico contra una rúbrica, criterio por criterio. ${BASE}\n` +
    "Sé exigente y concreto: cita qué falta o sobra, no elogies en vacío. NO decidas si aprueba o no en general, eso no es tu trabajo. " +
    `Rúbrica:\n${criteriaList}\n\nFormato: {"criteria":[{"label":"...","score":0-10,"note":"1 frase, concreta"}]} (un objeto por criterio, en el mismo orden).`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content: `ENUNCIADO:\n${args.prompt}\n\nENTREGA DEL ALUMNO:\n${args.submission}` }],
    maxTokens: 700, orgId: args.orgId, userId: args.userId, kind: "rubric_suggestion",
  });
  return firstJson<RubricSuggestion>(out);
}

export interface GeneratedLesson { title: string; body: string }

/** Borrador de lección (SIEMPRE sin publicar — falta fuente+fecha real, las añade un humano). */
export async function generateLessonDraft(
  llm: Llm, args: { competencyName: string; topic: string; orgId?: string; userId?: string },
): Promise<GeneratedLesson> {
  // Estándar de calidad (guía 0→100): aplicable ya, mucha práctica, estructura fija, cero relleno, sin inventar.
  const system = `Eres diseñador instruccional sénior. Escribe UNA lección práctica y aplicable (350-600 palabras) sobre "${args.topic}" dentro de la competencia "${args.competencyName}".`
    + ` CALIDAD OBLIGATORIA (doctrina "de 0 a 100 práctica"): al grano y aplicable desde la primera frase; casi todo es HACER, la teoría va incrustada dentro del paso que la usa (la mínima imprescindible para ejecutar), nunca en bloques teóricos sueltos; cero relleno (si una frase no cambia lo que la persona hará en su trabajo, bórrala).`
    + ` ESTRUCTURA: (1) para qué te sirve esto en tu trabajo, (2) concepto mínimo, (3) cómo se hace paso a paso, (4) un ejemplo real y concreto, (5) un ejercicio o acción para aplicar hoy, (6) un error común a evitar.`
    + ` Nada de cifras, estudios ni casos inventados; si citas un dato, que sea real. ${BASE}\nFormato: {"title":"...","body":"..."}`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content: "Escribe la lección." }], maxTokens: 1500,
    orgId: args.orgId, userId: args.userId, kind: "lesson",
  });
  return firstJson<GeneratedLesson>(out);
}

export interface BestPractice { title: string; body: string }

/**
 * Destila una BUENA PRÁCTICA reutilizable y ANÓNIMA a partir de un caso práctico que un humano
 * aprobó (enunciado + resolución + feedback). Sin nombres, sin inventar: solo lo que funcionó y por qué.
 * Su salida se ingesta al RAG de la organización, así el tutor aprende de la práctica real del equipo
 * (el "cerebro que crece con el uso"). Nada se pierde: el conocimiento validado se queda en la empresa.
 */
export async function distillBestPractice(
  llm: Llm,
  args: { competencyName: string; prompt: string; submission: string; feedback?: string; orgId?: string; userId?: string },
): Promise<BestPractice> {
  const system = `Extrae UNA buena práctica reutilizable de un caso práctico que un validador humano aprobó, sobre la competencia "${args.competencyName}". `
    + "Anonimiza: nada de nombres de personas ni datos identificativos. No inventes: usa solo lo que esté en el material. "
    + `Escribe qué se hizo bien y por qué funcionó, en 3-6 frases accionables que sirvan a otra persona del equipo ante una situación parecida. ${BASE}\nFormato: {"title":"...","body":"..."}`;
  const content = `ENUNCIADO:\n${args.prompt}\n\nRESOLUCIÓN APROBADA:\n${args.submission}${args.feedback ? `\n\nFEEDBACK DEL VALIDADOR:\n${args.feedback}` : ""}`;
  const out = await llm.generate({
    system, messages: [{ role: "user", content }], maxTokens: 500,
    orgId: args.orgId, userId: args.userId, kind: "best_practice",
  });
  return firstJson<BestPractice>(out);
}
