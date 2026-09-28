// Recursos por sección (libros + vídeos de YouTube) con agente de calidad. Petición de Marc (28-09-2026): recursos en
// todos los cursos, elegidos por IA, verificados que existen y puntuados con métricas de CALIDAD, VALOR y RELEVANCIA.
// La IA solo propone libros y juzga relevancia/autoridad; lo demás sale de datos medidos (Open Library y YouTube).
// Google Books no se usa: sin clave propia su cuota compartida está agotada (comprobado 28-09).
import { and, eq } from "drizzle-orm";
import { videoCache } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";
import type { Lang } from "./lang.js";
import * as videosSvc from "./videos.js";
import { firstJson } from "./aiContent.js";

export interface Scores { calidad: number; valor: number; relevancia: number; total: number }
interface Base { id: string; title: string; nivel: string; why: string; evidence: string[]; scores: Scores }
export interface BookRes extends Base { kind: "book"; author: string; year?: number; editionLang: string; isbn?: string; url: string }
export interface VideoRes extends Base { kind: "video"; youtubeId: string; channel: string; thumbnail: string; durationSeconds: number }
export type Resource = BookRes | VideoRes;

export interface OlDoc {
  key: string; title: string; author_name?: string[]; first_publish_year?: number; edition_count?: number; language?: string[];
  ratings_average?: number; ratings_count?: number; want_to_read_count?: number; already_read_count?: number; currently_reading_count?: number;
}
export interface Judgement { relevancia: number; autoridad: number; nivel: string; motivo: string }

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const nf = (n: number) => n.toLocaleString("es-ES");
const MIN_RELEVANCE = 60;
const MIN_TOTAL = 50;
const TTL_MS = 14 * 864e5; // una llamada al agente por tema+idioma cada 2 semanas

/** Nota total: la relevancia pesa mucho para que un recurso muy popular pero fuera de tema no se cuele. */
export function total(calidad: number, valor: number, relevancia: number): number {
  return clamp(0.4 * calidad + 0.25 * valor + 0.35 * relevancia);
}

/** Libro: calidad = valoración corregida por nº de valoraciones (media bayesiana, 10 votos a 3,8), reediciones y
 * autoridad del autor según el agente. Sin valoraciones no se inventa: esa parte no cuenta y se reparte el peso. */
export function scoreBook(d: OlDoc, j: Judgement): Scores {
  const n = d.ratings_count ?? 0;
  const rating = n > 0 && d.ratings_average ? ((10 * 3.8 + d.ratings_average * n) / (10 + n) - 3) / 1.5 * 100 : null;
  const editions = Math.min(1, Math.log10((d.edition_count ?? 1)) / 1.5) * 100; // ~32 ediciones satura
  const parts = rating === null ? [[editions, 0.35], [j.autoridad, 0.65]] : [[rating, 0.5], [editions, 0.2], [j.autoridad, 0.3]];
  const calidad = clamp(parts.reduce((s, [v, w]) => s + clamp(v!) * w!, 0));
  const readers = (d.want_to_read_count ?? 0) + (d.already_read_count ?? 0) + (d.currently_reading_count ?? 0);
  const valor = clamp(Math.log10(readers + 1) / 4 * 100); // 10.000 lectores satura
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

/** Vídeo: calidad = «me gusta» y comentarios por visita (mismas saturaciones que videos.ts) + autoridad del canal
 * según el agente; valor = alcance (visitas) y tamaño del canal. YouTube oculta a veces «me gusta»: cuenta 0. */
export function scoreVideo(v: videosSvc.VideoItem, j: Judgement): Scores {
  const views = Math.max(0, v.views || 0);
  const likeRate = views ? (v.likes || 0) / views : 0, commentRate = views ? (v.comments || 0) / views : 0;
  const calidad = clamp(55 * Math.min(1, likeRate / 0.04) + 20 * Math.min(1, commentRate / 0.005) + 0.25 * j.autoridad);
  const reach = Math.min(1, Math.log10(views + 1) / 6), subs = v.subscribers < 0 ? 0.5 : Math.min(1, Math.log10((v.subscribers || 0) + 1) / 6);
  const valor = clamp(70 * reach + 30 * subs);
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

export function keep(s: Scores): boolean { return s.relevancia >= MIN_RELEVANCE && s.total >= MIN_TOTAL; }

/** El autor propuesto por la IA tiene que coincidir con el de Open Library (por apellido), si no es otro libro. */
export function authorMatches(proposed: string, found: string[] = []): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").trim();
  const surname = norm(proposed).split(/\s+/).filter((w) => w.length > 2).pop();
  return !!surname && found.some((a) => norm(a).split(/\s+/).includes(surname));
}

export function bookEvidence(d: OlDoc, spanish?: { title: string }): string[] {
  const ev: string[] = [];
  if (d.ratings_count) ev.push(`${d.ratings_average?.toFixed(1).replace(".", ",")} ★ (${nf(d.ratings_count)} ${d.ratings_count === 1 ? "valoración" : "valoraciones"})`);
  const readers = (d.want_to_read_count ?? 0) + (d.already_read_count ?? 0) + (d.currently_reading_count ?? 0);
  if (readers) ev.push(`${nf(readers)} lectores en Open Library`);
  if (d.edition_count) ev.push(`${nf(d.edition_count)} ediciones${d.first_publish_year ? ` desde ${d.first_publish_year}` : ""}`);
  ev.push(spanish ? `En castellano: «${spanish.title}»` : "Sin edición en castellano localizada");
  return ev;
}

export function videoEvidence(v: videosSvc.VideoItem): string[] {
  const ev = [`${nf(v.views)} visitas`];
  if (v.views && v.likes) ev.push(`${((v.likes / v.views) * 100).toFixed(1).replace(".", ",")} % «me gusta»`);
  if (v.subscribers > 0) ev.push(`canal de ${nf(v.subscribers)} suscriptores`);
  ev.push(`${Math.round(v.durationSeconds / 60)} min`);
  return ev;
}

/* ---------------------------------- Fuentes externas ---------------------------------- */

const OL = "https://openlibrary.org";
const OL_FIELDS = "key,title,author_name,first_publish_year,edition_count,language,ratings_average,ratings_count,want_to_read_count,already_read_count,currently_reading_count";

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "SkillUp/1.0 (support@boomatik.com)" }, signal: AbortSignal.timeout(8000) });
      if (r.ok) return (await r.json()) as T;
      if (r.status < 500) return null;
    } catch { /* retry once */ }
  }
  return null;
}

export async function findWork(title: string, author: string): Promise<OlDoc | null> {
  const q = `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5&fields=${OL_FIELDS}`;
  const d = await getJson<{ docs: OlDoc[] }>(`${OL}/search.json?${q}`);
  const docs = (d?.docs ?? []).filter((x) => authorMatches(author, x.author_name));
  // La obra con más valoraciones es la original; las ediciones traducidas acumulan pocas.
  return docs.sort((a, b) => (b.ratings_count ?? 0) - (a.ratings_count ?? 0))[0] ?? null;
}

/** Edición en castellano: primero dentro de la obra; si Open Library registra la traducción como obra aparte, se busca
 * por el título en castellano que dio el agente y solo se acepta si Open Library confirma el idioma. */
export async function spanishFor(doc: OlDoc, author: string, titleEs?: string): Promise<{ title: string; isbn?: string } | null> {
  const inWork = await spanishEdition(doc.key);
  if (inWork || !titleEs) return inWork;
  const tr = await findWork(titleEs, author);
  return tr?.language?.includes("spa") ? { title: tr.title } : null;
}

export async function spanishEdition(workKey: string): Promise<{ title: string; isbn?: string } | null> {
  const d = await getJson<{ entries: { title: string; languages?: { key: string }[]; isbn_13?: string[]; isbn_10?: string[] }[] }>(`${OL}${workKey}/editions.json?limit=100`);
  const e = d?.entries?.find((x) => x.languages?.some((l) => l.key === "/languages/spa"));
  return e ? { title: e.title, isbn: e.isbn_13?.[0] ?? e.isbn_10?.[0] } : null;
}

/* ---------------------------------- Agente de calidad ---------------------------------- */

async function llmJson(system: string, content: string, maxTokens: number): Promise<unknown> {
  const { llm } = await import("../container.js");
  const out = await llm.generate({ system, messages: [{ role: "user", content }], model: env.MODEL_SENIOR, maxTokens, kind: "resources", lang: "es" });
  return firstJson(out);
}

const PROPOSE_SYS = `Eres bibliotecario experto en formación profesional B2B. Propón hasta 8 libros publicados de verdad, de autores con experiencia contrastada, que ayuden a aplicar en la práctica la sección de curso que te doy. Prioriza obras de referencia y guías aplicables; nada de autoayuda genérica ni libros que no puedas nombrar con seguridad (se verificarán uno a uno y los inexistentes se descartan).
Si conoces con seguridad el título de su edición en castellano, añádelo en "title_es".
Devuelve SOLO JSON: {"books":[{"title":"título original","author":"nombre y apellido","title_es":"título en castellano u omitido"}]}`;

const JUDGE_SYS = `Eres el agente de calidad de SkillUp. Para cada recurso candidato juzga, con criterio de experto y sin inventar datos:
- relevancia (0-100): cuánto ayuda a aplicar ESTA sección concreta (no el tema en general).
- autoridad (0-100): experiencia y reconocimiento del autor o canal en esta materia. Si no lo conoces, 40.
- nivel: "inicial" | "intermedio" | "avanzado".
- motivo: una frase de 20 palabras como máximo, en español de España, de por qué sirve para esta sección.
Devuelve SOLO JSON: {"items":[{"id":"...","relevancia":0,"autoridad":0,"nivel":"...","motivo":"..."}]}`;

function toJudgement(x: Partial<Judgement> | undefined): Judgement | null {
  if (!x || typeof x.relevancia !== "number") return null;
  return { relevancia: x.relevancia, autoridad: typeof x.autoridad === "number" ? x.autoridad : 40, nivel: String(x.nivel || "intermedio"), motivo: String(x.motivo || "").slice(0, 200) };
}

/** Candidatos verificados + juicio del agente + notas. Resultado por tema e idioma (no depende del alumno). */
export async function build(deps: SvcDeps, topic: string, section: string, lang: Lang): Promise<Resource[]> {
  const brief = `TEMA: ${topic}\nSECCIÓN:\n${section.slice(0, 1500)}`;
  const [proposal, videos] = await Promise.all([
    llmJson(PROPOSE_SYS, brief, 900).catch(() => null) as Promise<{ books?: { title: string; author: string; title_es?: string }[] } | null>,
    videosSvc.forTopic(deps, topic, lang).catch(() => null),
  ]);

  const books: { doc: OlDoc; es: { title: string; isbn?: string } | null }[] = [];
  for (const b of (proposal?.books ?? []).slice(0, 8)) {
    if (!b?.title || !b?.author) continue;
    const doc = await findWork(b.title, b.author);
    if (!doc) continue; // no existe o el autor no coincide: fuera
    books.push({ doc, es: lang === "es" ? await spanishFor(doc, b.author, b.title_es) : null });
  }
  const vids = (videos?.masValorados ?? []).slice(0, 10);

  const cand = [
    ...books.map((b, i) => ({ id: "b" + i, tipo: "libro", titulo: b.doc.title, autor: b.doc.author_name?.[0], año: b.doc.first_publish_year })),
    ...vids.map((v, i) => ({ id: "v" + i, tipo: "vídeo", titulo: v.title, canal: v.channel, minutos: Math.round(v.durationSeconds / 60) })),
  ];
  if (!cand.length) return [];
  const judged = await llmJson(JUDGE_SYS, `${brief}\n\nCANDIDATOS:\n${JSON.stringify(cand)}`, 1500).catch(() => null) as { items?: (Partial<Judgement> & { id: string })[] } | null;
  const byId = new Map((judged?.items ?? []).map((x) => [x.id, toJudgement(x)]));

  const out: Resource[] = [];
  books.forEach(({ doc, es }, i) => {
    const j = byId.get("b" + i); if (!j) return;
    const scores = scoreBook(doc, j);
    if (!keep(scores)) return;
    out.push({ kind: "book", id: doc.key, title: es?.title ?? doc.title, author: doc.author_name?.[0] ?? "", year: doc.first_publish_year,
      editionLang: es ? "es" : "original", isbn: es?.isbn, url: OL + doc.key, nivel: j.nivel, why: j.motivo, evidence: bookEvidence(doc, es ?? undefined), scores });
  });
  vids.forEach((v, i) => {
    const j = byId.get("v" + i); if (!j) return;
    const scores = scoreVideo(v, j);
    if (!keep(scores)) return;
    out.push({ kind: "video", id: v.youtubeId, youtubeId: v.youtubeId, title: v.title, channel: v.channel, thumbnail: v.thumbnail,
      durationSeconds: v.durationSeconds, nivel: j.nivel, why: j.motivo, evidence: videoEvidence(v), scores });
  });
  return out.sort((a, b) => b.scores.total - a.scores.total);
}

/* ---------------------------------- Caché (reutiliza video_cache: sort_type «res:<lang>») ---------------------------------- */

export async function forTopic(deps: SvcDeps, topic: string, section: string, lang: Lang): Promise<Resource[]> {
  const sortType = `res:${lang}`, key = topic.slice(0, 200);
  const [row] = await deps.db.select().from(videoCache).where(and(eq(videoCache.topic, key), eq(videoCache.sortType, sortType))).limit(1);
  if (row && Date.now() - new Date(row.fetchedAt).getTime() < TTL_MS) return row.videos as Resource[];
  const fresh = await build(deps, topic, section, lang);
  if (row) await deps.db.update(videoCache).set({ videos: fresh, fetchedAt: new Date() }).where(eq(videoCache.id, row.id));
  else await deps.db.insert(videoCache).values({ id: deps.newId(), topic: key, sortType, videos: fresh });
  return fresh;
}

/* ---------------------------------- Personalización por alumno ---------------------------------- */

/** Cuántos recursos según el tiempo semanal declarado en la bienvenida ([ritmo]). */
export function countFor(ritmo: string | null): number {
  if (!ritmo) return 4;
  if (/menos de 1/i.test(ritmo)) return 2;
  if (/5 horas|m[aá]s/i.test(ritmo)) return 8;
  return 4;
}

/** Orden según el formato preferido del Team DNA: leer → libros primero; ver/escuchar → vídeos primero; conversar → alternos. */
export function orderFor(items: Resource[], formato: string | null): Resource[] {
  const books = items.filter((r) => r.kind === "book"), vids = items.filter((r) => r.kind === "video");
  if (formato === "texto") return [...books, ...vids];
  if (formato === "video" || formato === "audio") return [...vids, ...books];
  const mixed: Resource[] = [];
  for (let i = 0; i < Math.max(books.length, vids.length); i++) { if (books[i]) mixed.push(books[i]!); if (vids[i]) mixed.push(vids[i]!); }
  return mixed;
}

export function personalize(items: Resource[], formato: string | null, ritmo: string | null): Resource[] {
  return orderFor(items, formato).slice(0, countFor(ritmo));
}
