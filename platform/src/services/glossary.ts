// Glosario que aprende: cuando alguien corrige cómo se dice o se escribe un término («se dice partner manager»,
// «es Nextdoo, no NextTodo»), el agente lo marca, se guarda para TODA la empresa y desde entonces:
//   - va en el prompt de todas las llamadas a la IA de esa empresa (tutores, asistente, roleplay, contenido),
//   - se corrige en lo que escribe la IA aunque se le escape,
//   - se corrige en el dictado por voz (el navegador pide la lista a /api/agent/terms).
// Se guarda como nota (source='glossary', kind='term', body 'incorrecto => correcto'): sin tabla nueva.
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { annotation } from "../db/schema.js";

export interface Term { wrong: string; right: string }

// Correcciones de Marc que valen para todas las empresas (errores reales del dictado y de la IA).
export const BASE_TERMS: Term[] = [
  { wrong: "NextTodo", right: "Nextdoo" },
  { wrong: "Next todo", right: "Nextdoo" },
  { wrong: "Next do", right: "Nextdoo" },
  { wrong: "Nextdo", right: "Nextdoo" },
  { wrong: "panel manager", right: "partner manager" },
  { wrong: "Boomatic", right: "Boomatik" },
  { wrong: "Brandoers", right: "Brandooers" },
];

// Solo en conversación: ahí es donde el usuario corrige. En JSON de contenido no se pide la marca.
export const LEARNING_KINDS = new Set(["chat", "roleplay", "orchestrator"]);
export const LEARN_INSTRUCTION = "\n\nAPRENDIZAJE DE TÉRMINOS: si el usuario te corrige cómo se dice o se escribe un término (una marca, un cargo, un nombre, un producto), acepta la corrección con naturalidad, úsala desde ya y añade AL FINAL de tu respuesta, en una línea aparte, exactamente: [[TERMINO: forma incorrecta => forma correcta]]. Solo si hay una corrección real de un término; nunca en otro caso.";

const SOURCE = "glossary";
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; terms: Term[] }>();

function parse(body: string | null): Term | null {
  const m = /^(.+?)\s*=>\s*(.+)$/.exec(String(body || "").trim());
  return m && m[1] && m[2] ? { wrong: m[1].trim(), right: m[2].trim() } : null;
}

/** Términos vigentes de la empresa (los suyos ganan a los base; la corrección más reciente gana). */
export async function orgTerms(db: DB, orgId: string | null | undefined): Promise<Term[]> {
  if (!orgId) return BASE_TERMS;
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.terms;
  const rows = await db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.source, SOURCE)))
    .orderBy(desc(annotation.createdAt)).limit(300);
  // De la más reciente a la más antigua (las de la empresa antes que las base). Si una corrección nueva dice que X
  // es lo correcto, cualquier regla anterior que tuviera X como incorrecto se descarta: nunca hay bucles.
  const byWrong = new Map<string, Term>(), rights = new Set<string>();
  const add = (t: Term | null) => {
    if (!t) return;
    const kw = t.wrong.toLowerCase(), kr = t.right.toLowerCase();
    if (byWrong.has(kw) || rights.has(kw) || (kw !== kr && byWrong.has(kr))) return;
    byWrong.set(kw, t); rights.add(kr);
  };
  rows.forEach((r) => add(parse(r.body)));
  BASE_TERMS.forEach(add);
  const terms = [...byWrong.values()];
  cache.set(orgId, { at: Date.now(), terms });
  return terms;
}

export async function learnTerm(db: DB, newId: () => string, orgId: string, userId: string, t: Term): Promise<boolean> {
  const wrong = t.wrong.trim().slice(0, 60), right = t.right.trim().slice(0, 60);
  if (wrong.length < 2 || right.length < 2 || wrong === right) return false;
  await db.insert(annotation).values({ id: newId(), organizationId: orgId, userId, source: SOURCE, kind: "term", body: `${wrong} => ${right}` });
  cache.delete(orgId);
  return true;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/** Sustituye cada forma incorrecta por la correcta (palabra completa, sin distinguir mayúsculas). */
export function applyTerms(text: string, terms: Term[]): string {
  let out = text;
  for (const t of terms) {
    if (t.wrong === t.right) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(t.wrong)}(?![\\p{L}\\p{N}])`, "giu"), t.right);
  }
  return out;
}

export function glossaryPrompt(terms: Term[]): string {
  if (!terms.length) return "";
  const byRight = new Map<string, string[]>();
  for (const t of terms) byRight.set(t.right, [...(byRight.get(t.right) || []), t.wrong]);
  return "\n\nTERMINOLOGÍA OBLIGATORIA (aprendida de las correcciones del equipo; escríbelo siempre así): "
    + [...byRight.entries()].map(([r, ws]) => `«${r}» (nunca ${ws.map((w) => `«${w}»`).join(" ni ")})`).join("; ") + ".";
}

/** Saca las marcas [[TERMINO: a => b]] de la respuesta: devuelve el texto limpio y lo aprendido. */
export function extractLearned(reply: string): { clean: string; learned: Term[] } {
  const learned: Term[] = [];
  const clean = reply.replace(/\[\[\s*T[EÉ]RMINO\s*:\s*(.+?)\s*=>\s*(.+?)\s*\]\]/giu, (_m, a: string, b: string) => {
    learned.push({ wrong: a.replace(/^[«"']|[»"']$/g, ""), right: b.replace(/^[«"']|[»"']$/g, "") });
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { clean, learned };
}
