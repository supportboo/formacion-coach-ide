// Idioma de la plataforma por persona (1.5.0). Una sola fuente: user.lang (null = nunca eligió -> español).
// Lo usan el envoltorio central del LLM (container.ts), la voz, los vídeos y la traducción de cursos.
// Añadir un idioma = añadirlo a LANGS + LANG_INFO (+ diccionario en public/app/i18n.js).
import { eq } from "drizzle-orm";
import { user } from "../db/schema.js";
import type { DB } from "../db/index.js";

export const LANGS = ["es", "en", "ca", "pt", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "es";

// name = cómo se nombra el idioma en la instrucción al modelo; register = registro informal natural;
// region = regionCode de YouTube; b2b = contexto que se añade a los temas cortos del catálogo en la búsqueda.
export const LANG_INFO: Record<Lang, { name: string; register: string; region: string; b2b: string }> = {
  es: { name: "Spanish from Spain (castellano peninsular)", register: "tuteo (tú), never «vos» or voseo forms", region: "ES", b2b: "ventas B2B" },
  en: { name: "English", register: "a natural, friendly and informal register, addressing the user directly as «you»", region: "GB", b2b: "B2B sales" },
  ca: { name: "Catalan (català)", register: "a natural informal register (tracte de tu)", region: "ES", b2b: "vendes B2B" },
  pt: { name: "European Portuguese (português de Portugal)", register: "a natural informal register (tratamento por tu), European Portuguese spelling and vocabulary, never Brazilian forms", region: "PT", b2b: "vendas B2B" },
  fr: { name: "French (français)", register: "a natural informal register (tutoiement)", region: "FR", b2b: "ventes B2B" },
};

export function normalizeLang(x: unknown): Lang | null {
  const s = String(x ?? "").trim().toLowerCase().slice(0, 2);
  return (LANGS as readonly string[]).includes(s) ? (s as Lang) : null;
}

// Contenido COMPARTIDO por la empresa o la plataforma (lecciones, cursos del panel, retos para el equipo,
// moderación, buenas prácticas, curación): se queda en el idioma fuente (español), no en el de quien lo pide.
export const SHARED_KINDS = new Set([
  "course_panel_author", "course_panel_review", "lesson", "best_practice", "curation", "challenge_draft",
  "moderation", "onboarding", "feedback_summary", "translate",
]);

const PLAIN = " Write plain text, because the chat does not render formatting: no markdown (no asterisks, hashes or list dashes) and no emojis.";

/**
 * Regla de idioma que se añade al system prompt. conversational = chats (tutor, ojos, roleplay...).
 * Español + no conversacional -> "" (los prompts ya están en castellano de España).
 */
export function langRule(lang: Lang, conversational: boolean): string {
  if (lang === "es") {
    return conversational
      ? "\n\nTRATO: habla siempre de tú y en castellano de España; nunca uses «vos» ni formas voseantes. Escribe en texto plano, porque el chat no interpreta formato: sin markdown (ni asteriscos, ni almohadillas, ni guiones de lista) y sin emojis."
      : "";
  }
  const i = LANG_INFO[lang];
  if (conversational) {
    return `\n\nLANGUAGE AND REGISTER (mandatory): the user has chosen ${i.name} as the language of the whole platform. Write EVERY reply entirely in ${i.name}, even though these instructions, the course content and earlier messages may be in Spanish. Keep proper names, brand names and product names as they are. Use ${i.register}.${PLAIN} If a JSON format is requested, keep its keys and structure exactly and translate only the values meant for people.`;
  }
  return `\n\nOUTPUT LANGUAGE (mandatory): the person this is for uses the platform in ${i.name}. Write every human-readable text of your output (questions, options, feedback, explanations, titles, summaries) in ${i.name}, with ${i.register}, even though these instructions and the source content are in Spanish. If a JSON or other format is requested, keep keys, structure, codes and enumerated values exactly as specified; only the values meant to be read by people change language.`;
}

/** Instrucción de idioma para UNA llamada al LLM (pura; la usa container.ts). */
export function langSuffix(lang: Lang, kind: string | undefined, conversational: boolean): string {
  if (kind && SHARED_KINDS.has(kind)) return "";
  return langRule(lang, conversational);
}

// Caché en memoria: el idioma se lee en cada llamada al LLM. 60 s y se invalida al cambiarlo.
const cache = new Map<string, { lang: Lang; at: number }>();
const TTL_MS = 60_000;

export async function getUserLang(db: DB, userId: string | undefined | null): Promise<Lang> {
  if (!userId) return DEFAULT_LANG;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.lang;
  const [row] = await db.select({ lang: user.lang }).from(user).where(eq(user.id, userId)).limit(1);
  const lang = normalizeLang(row?.lang) ?? DEFAULT_LANG;
  cache.set(userId, { lang, at: Date.now() });
  return lang;
}

/** Preferencia tal cual (null = nunca eligió), para que el onboarding sepa si preguntar. */
export async function getUserLangChoice(db: DB, userId: string): Promise<Lang | null> {
  const [row] = await db.select({ lang: user.lang }).from(user).where(eq(user.id, userId)).limit(1);
  return normalizeLang(row?.lang);
}

export async function setUserLang(db: DB, userId: string, lang: Lang): Promise<void> {
  await db.update(user).set({ lang, updatedAt: new Date() }).where(eq(user.id, userId));
  cache.set(userId, { lang, at: Date.now() });
}
