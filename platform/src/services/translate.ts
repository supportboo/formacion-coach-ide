// Traducción automática de secciones de curso (1.5.0). El curso fuente es español; para quien usa otro idioma,
// cada sección se traduce UNA vez para toda la plataforma y se guarda por (curso, sección, idioma, hash del HTML).
// Garantías: (1) solo se traduce texto que está de verdad en el curso (no sirve para traducir cualquier cosa a costa
// de la empresa); (2) la salida conserva EXACTAMENTE la misma estructura de etiquetas y atributos (enlaces, anclas,
// clases); si no, no se guarda y se muestra el original en español.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { contentTranslation } from "../db/schema.js";
import type { Llm } from "../agents/llm.js";
import type { SvcDeps } from "./org.js";
import { decodeEntities } from "./assessment.js";
import { LANG_INFO, type Lang } from "./lang.js";
import { usdCost } from "./costs.js";

export const MAX_SECTION_HTML = 30_000;

/** Firma estructural: etiquetas en orden con sus atributos (sin alt/title, que sí se traducen). */
export function tagSignature(html: string): string[] {
  const out: string[] = [];
  const rx = /<\s*(\/?)\s*([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const attrs: string[] = [];
    const arx = /([a-z_:][a-z0-9_:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi;
    let a: RegExpExecArray | null;
    const body = (m[3] || "").replace(/\/\s*$/, "");
    while ((a = arx.exec(body))) {
      const name = a[1]!.toLowerCase();
      if (name === "alt" || name === "title") continue;
      attrs.push(name + "=" + (a[2] ?? a[3] ?? a[4] ?? ""));
    }
    out.push((m[1] ? "/" : "") + m[2]!.toLowerCase() + (attrs.length ? "|" + attrs.sort().join("|") : ""));
  }
  return out;
}

export function sameStructure(src: string, out: string): boolean {
  const a = tagSignature(src), b = tagSignature(out);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Texto sin etiquetas ni espacios (para comparar con el curso sin depender de cómo se partió el HTML). */
export function squash(html: string): string {
  return decodeEntities(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "")).replace(/\s+/g, "");
}

/** ¿El fragmento sale del curso? >= 90 % de sus caracteres de texto (por trozos entre etiquetas) está en el curso. */
export function isFromCourse(fragmentHtml: string, courseSquashed: string): boolean {
  const chunks = fragmentHtml.split(/<[^>]*>/).map((t) => decodeEntities(t).replace(/\s+/g, "")).filter((t) => t.length > 0);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total < 20) return false;
  const found = chunks.reduce((n, c) => n + (courseSquashed.includes(c) ? c.length : 0), 0);
  return found / total >= 0.9;
}

export function srcHash(html: string): string { return createHash("sha256").update(html).digest("hex").slice(0, 32); }

/** Quita vallas de código o texto previo que a veces añade el modelo. */
export function cleanOutput(raw: string): string {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
  return s;
}

export function translatePrompt(lang: Lang): string {
  const i = LANG_INFO[lang];
  return `You are a senior professional translator of corporate sales and management training, from Spanish (Spain) into ${i.name}. `
    + "Translate the HTML fragment the user sends. Strict rules: keep EVERY tag and attribute exactly as it is, in the same order and with the same values (href, id, class, data-*, src); "
    + "do not add, remove, merge, split or reorder tags; translate only the human-readable text between the tags (and alt text). "
    + `Translate for meaning and tone, not word for word: natural, professional ${i.name} that a native trainer would write, with ${i.register}. `
    + "Keep proper names, people's names, company, brand and product names unchanged. Keep numbers, currencies and dates accurate. "
    + "Output ONLY the translated HTML fragment: no explanations, no code fences, no comments.";
}

// Traducciones en curso (dos personas abren la misma sección a la vez -> una sola llamada al modelo).
const inflight = new Map<string, Promise<string | null>>();

export async function cached(deps: SvcDeps, course: string, section: number, lang: Lang, hash: string): Promise<string | null> {
  const [row] = await deps.db.select({ html: contentTranslation.html }).from(contentTranslation)
    .where(and(eq(contentTranslation.course, course), eq(contentTranslation.section, section), eq(contentTranslation.lang, lang), eq(contentTranslation.srcHash, hash))).limit(1);
  return row?.html ?? null;
}

/** Traduce (o devuelve de caché) una sección. null = no se pudo con garantías -> el cliente muestra el original. */
export async function translateSection(deps: SvcDeps, llm: Llm, a: { orgId: string; course: string; section: number; lang: Lang; html: string; model: string }): Promise<string | null> {
  const hash = srcHash(a.html);
  const key = [a.course, a.section, a.lang, hash].join(":");
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const out = cleanOutput(await llm.generate({
      system: translatePrompt(a.lang), messages: [{ role: "user", content: a.html }], model: a.model,
      maxTokens: Math.min(8000, Math.ceil(a.html.length / 2.2) + 300), timeoutMs: 90_000, orgId: a.orgId, kind: "translate",
    }));
    if (!out || !sameStructure(a.html, out)) {
      console.warn(`[translate] ${a.course}#${a.section} -> ${a.lang}: estructura distinta, se muestra el original`);
      return null;
    }
    await deps.db.insert(contentTranslation).values({ id: deps.newId(), course: a.course, section: a.section, lang: a.lang, srcHash: hash, html: out })
      .onConflictDoNothing();
    // Estimación para el registro (el coste REAL queda en el ledger ai_usage con kind=translate).
    const estIn = Math.ceil((translatePrompt(a.lang).length + a.html.length) / 3.5), estOut = Math.ceil(out.length / 3.5);
    console.log(`[translate] ${a.course}#${a.section} -> ${a.lang}: ${a.html.length} car., ~${estIn}+${estOut} tokens, ~${usdCost(a.model, estIn, estOut).toFixed(4)} USD (una vez para toda la plataforma)`);
    return out;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
