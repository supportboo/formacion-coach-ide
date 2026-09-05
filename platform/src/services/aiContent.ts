import type { Llm } from "../agents/llm.js";

/** Los LLM a veces envuelven el JSON en prosa pese a la instrucción; extrae el primer objeto. */
function firstJson<T>(s: string): T {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("la IA no devolvió JSON: " + s.slice(0, 200));
  return JSON.parse(s.slice(a, b + 1)) as T;
}

const BASE = "Español de España, claro y sin jerga. No inventes cifras ni estudios. Responde SOLO JSON válido, sin markdown.";

export interface ExamQuestion { q: string; options: string[] }
export interface GeneratedExam { questions: ExamQuestion[] }

/** Genera un test de opción múltiple sobre una competencia, adaptado al sector/puesto si se conocen. */
export async function generateExam(
  llm: Llm, args: { competencyName: string; sector?: string; puesto?: string; n?: number },
): Promise<GeneratedExam> {
  const n = args.n ?? 5;
  const ctx = [args.sector && `sector: ${args.sector}`, args.puesto && `puesto: ${args.puesto}`]
    .filter(Boolean).join(", ");
  const system = `Eres examinador. Crea ${n} preguntas tipo test (4 opciones, una correcta) sobre "${args.competencyName}"${ctx ? ` para alguien de ${ctx}` : ""}. ${BASE}\nFormato: {"questions":[{"q":"...","options":["a","b","c","d"]}]} (la opción correcta va SIEMPRE en options[0]; el cliente las mezclará).`;
  const out = await llm.generate({ system, messages: [{ role: "user", content: "Genera el test." }], maxTokens: 1200 });
  return firstJson<GeneratedExam>(out);
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
  llm: Llm, args: { competencyName: string; sector?: string; puesto?: string; motivo?: string },
): Promise<string> {
  const ctx = [args.sector && `sector ${args.sector}`, args.puesto && `puesto ${args.puesto}`, args.motivo && `motivo: ${args.motivo}`]
    .filter(Boolean).join(", ") || "contexto general (sin sector/puesto declarados, pídeselo en el propio enunciado)";
  const system = `Eres diseñador de casos prácticos. Redacta UN enunciado de caso real y concreto para demostrar la competencia "${args.competencyName}", ambientado en ${ctx}. Debe ser algo que la persona pueda hacer de verdad en su trabajo esta semana, no un ejercicio abstracto. ${BASE}\nFormato: {"prompt":"..."}`;
  const out = await llm.generate({ system, messages: [{ role: "user", content: "Genera el caso." }], maxTokens: 500 });
  return firstJson<{ prompt: string }>(out).prompt;
}

export interface GeneratedLesson { title: string; body: string }

/** Borrador de lección (SIEMPRE sin publicar — falta fuente+fecha real, las añade un humano). */
export async function generateLessonDraft(
  llm: Llm, args: { competencyName: string; topic: string },
): Promise<GeneratedLesson> {
  const system = `Eres autor de formación. Escribe una lección breve (300-500 palabras) sobre "${args.topic}" dentro de la competencia "${args.competencyName}". ${BASE}\nFormato: {"title":"...","body":"..."}`;
  const out = await llm.generate({ system, messages: [{ role: "user", content: "Escribe la lección." }], maxTokens: 1200 });
  return firstJson<GeneratedLesson>(out);
}
