// Guardia de uso del chat (Marc, 28-09-2026): palabras prohibidas y tope diario por persona.
// - Palabras prohibidas: lista base (insultos, expresiones sexuales y ofensivas) + lista propia de cada empresa.
//   Si un mensaje las contiene NO se llama a la IA (cero gasto): se responde pidiendo tono profesional y se audita.
//   Detecta trucos habituales: mayúsculas, tildes, letras repetidas y números por letras («1d10t4»).
// - Tope diario de mensajes por persona (CHAT_DAILY_USER_CAP): evita gastar la IA de la empresa en tonterías o en
//   «probar el bot». Es control de coste y abuso, y así se le explica a la persona (ver DATOS en container.ts).
import { and, count, desc, eq, gte } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { agentMessage, agentThread, annotation } from "../db/schema.js";

export const BASE_BANNED = [
  "gilipollas", "cabron", "cabrona", "hijo de puta", "hija de puta", "hijoputa", "hdp", "puta", "puto", "putas", "putos",
  "zorra", "maricon", "marica", "bollera", "subnormal", "retrasado", "retrasada", "mongolo", "mongola", "polla", "pollas",
  "follar", "follando", "follate", "mamada", "chupamela", "comemela", "capullo", "imbecil", "gilipuertas", "mierda",
  "me cago en", "cago en tu", "tonto del culo", "soplapollas", "malparido", "pendejo", "culero", "verga",
];
export const BLOCKED_REPLY = "Prefiero que mantengamos un tono profesional: ese tipo de expresiones no las proceso aquí. Si quieres, seguimos con lo tuyo; ¿en qué te ayudo?";
export const CAP_REPLY = (cap: number) => `Por hoy has llegado al máximo de ${cap} mensajes con los tutores. Mañana seguimos; mientras tanto puedes repasar el curso, hacer los tests o practicar lo aprendido.`;

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

/** minúsculas, sin tildes, números/símbolos a letras, letras repetidas a una, separadores a espacio */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[01345@$7]/g, (ch) => LEET[ch] || ch)
    .replace(/([a-zñ])\1+/g, "$1")
    .replace(/[^a-zñ]+/g, " ").trim();
}

/** Devuelve la palabra prohibida encontrada (como palabra o expresión completa) o null. */
export function findBanned(text: string, list: string[]): string | null {
  const t = ` ${normalize(text)} `;
  for (const w of list) {
    const n = normalize(w);
    if (n && t.includes(` ${n} `)) return w;
  }
  return null;
}

const SOURCE = "banned";
const cache = new Map<string, { at: number; words: string[] }>();

export async function orgBannedWords(db: DB, orgId: string): Promise<string[]> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 60_000) return hit.words;
  const rows = await db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.source, SOURCE))).orderBy(desc(annotation.createdAt)).limit(1);
  const words = String(rows[0]?.body || "").split(/[\n,;]+/).map((w) => w.trim()).filter((w) => w.length >= 2).slice(0, 300);
  cache.set(orgId, { at: Date.now(), words });
  return words;
}

/** Guarda la lista propia de la empresa (sustituye a la anterior; queda el historial en las notas). */
export async function setOrgBannedWords(db: DB, newId: () => string, orgId: string, userId: string, words: string[]): Promise<string[]> {
  const clean = [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 2 && w.length <= 60))].slice(0, 300);
  await db.insert(annotation).values({ id: newId(), organizationId: orgId, userId, source: SOURCE, kind: "list", body: clean.join("\n") });
  cache.delete(orgId);
  return clean;
}

export async function bannedFor(db: DB, orgId: string): Promise<string[]> {
  return [...BASE_BANNED, ...(await orgBannedWords(db, orgId).catch(() => []))];
}

/** Mensajes que la persona ha enviado hoy (UTC) a los tutores. */
export async function userMessagesToday(db: DB, orgId: string, userId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [r] = await db.select({ n: count() }).from(agentMessage)
    .innerJoin(agentThread, eq(agentThread.id, agentMessage.threadId))
    .where(and(eq(agentMessage.organizationId, orgId), eq(agentThread.userId, userId), eq(agentMessage.sender, "user"), gte(agentMessage.createdAt, start)));
  return Number(r?.n || 0);
}
