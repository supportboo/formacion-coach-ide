// Recursos por curso (vídeos, podcasts, libros y herramientas) con agente de calidad y afiliación.
// Marc, 28-09-2026: recursos en todos los cursos, elegidos por IA y verificados (sin revisión humana), puntuados en
// CALIDAD, VALOR y RELEVANCIA; primero se exige calidad y, entre lo que la pasa, sube lo que podemos rentabilizar.
// Fuentes con datos medidos: YouTube (videos.ts), Apple Podcasts (iTunes Search API), Open Library. La IA solo propone
// libros y herramientas y juzga relevancia y autoridad. Google Books no se usa: sin clave, su cuota compartida está agotada.
import { and, eq } from "drizzle-orm";
import { videoCache } from "../db/schema.js";
import { env } from "../config/env.js";
import { AFFILIATE_BOOST, TOOL_AFFILIATES } from "../config/affiliates.js";
import type { SvcDeps } from "./org.js";
import type { Lang } from "./lang.js";
import * as videosSvc from "./videos.js";
import { firstJson } from "./aiContent.js";

export type Kind = "video" | "podcast" | "book" | "tool";
export const KINDS: Kind[] = ["video", "podcast", "book", "tool"];
export interface Scores { calidad: number; valor: number; relevancia: number; total: number }
export interface Resource {
  kind: Kind; id: string; title: string; by: string; url: string; image?: string; nivel: string; why: string;
  evidence: string[]; scores: Scores; affiliate: boolean; meta?: Record<string, string | number | undefined>;
}
export interface OlDoc {
  key: string; title: string; author_name?: string[]; first_publish_year?: number; edition_count?: number; language?: string[];
  ratings_average?: number; ratings_count?: number; want_to_read_count?: number; already_read_count?: number; currently_reading_count?: number;
}
export interface Podcast { collectionId: number; collectionName: string; artistName: string; trackCount: number; releaseDate: string; primaryGenreName?: string; collectionViewUrl: string; artworkUrl600?: string }
export interface Judgement { relevancia: number; autoridad: number; nivel: string; motivo: string }

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const nf = (n: number) => n.toLocaleString("es-ES");
const MIN_RELEVANCE = 60, MIN_TOTAL = 50;
const TTL_MS = 14 * 864e5;

export function total(calidad: number, valor: number, relevancia: number): number {
  return clamp(0.4 * calidad + 0.25 * valor + 0.35 * relevancia);
}
export function keep(s: Scores): boolean { return s.relevancia >= MIN_RELEVANCE && s.total >= MIN_TOTAL; }

/* ---------------------------------- Notas (puras) ---------------------------------- */

const readers = (d: OlDoc) => (d.want_to_read_count ?? 0) + (d.already_read_count ?? 0) + (d.currently_reading_count ?? 0);

/** Libro: valoración media bayesiana (10 votos a 3,8), reediciones y autoridad; sin valoraciones no se inventa nota. */
export function scoreBook(d: OlDoc, j: Judgement): Scores {
  const n = d.ratings_count ?? 0;
  const rating = n > 0 && d.ratings_average ? ((10 * 3.8 + d.ratings_average * n) / (10 + n) - 3) / 1.5 * 100 : null;
  const editions = Math.min(1, Math.log10(d.edition_count ?? 1) / 1.5) * 100;
  const parts = rating === null ? [[editions, 0.35], [j.autoridad, 0.65]] : [[rating, 0.5], [editions, 0.2], [j.autoridad, 0.3]];
  const calidad = clamp(parts.reduce((s, [v, w]) => s + clamp(v!) * w!, 0));
  const valor = clamp(Math.log10(readers(d) + 1) / 4 * 100);
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

/** Vídeo: «me gusta» y comentarios por visita + autoridad del canal; valor = alcance y canal. */
export function scoreVideo(v: videosSvc.VideoItem, j: Judgement): Scores {
  const views = Math.max(0, v.views || 0);
  const likeRate = views ? (v.likes || 0) / views : 0, commentRate = views ? (v.comments || 0) / views : 0;
  const calidad = clamp(55 * Math.min(1, likeRate / 0.04) + 20 * Math.min(1, commentRate / 0.005) + 0.25 * j.autoridad);
  const reach = Math.min(1, Math.log10(views + 1) / 6), subs = v.subscribers < 0 ? 0.5 : Math.min(1, Math.log10((v.subscribers || 0) + 1) / 6);
  const valor = clamp(70 * reach + 30 * subs);
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

/** Podcast: Apple no publica valoraciones por API; calidad = autoridad + que siga activo; valor = constancia (episodios). */
export function scorePodcast(p: Podcast, j: Judgement, now = Date.now()): Scores {
  const monthsIdle = p.releaseDate ? (now - Date.parse(p.releaseDate)) / (30.4 * 864e5) : 99;
  const active = monthsIdle <= 2 ? 100 : Math.max(0, 100 - (monthsIdle - 2) * 10); // 12 meses parado = 0
  const calidad = clamp(0.6 * j.autoridad + 0.4 * active);
  const valor = clamp(Math.min(1, Math.log10((p.trackCount || 0) + 1) / 2.5) * 100); // ~300 episodios satura
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

/** Herramienta: sin métricas públicas comparables; la web tiene que responder y el agente juzga madurez y adopción. */
export function scoreTool(j: Judgement): Scores {
  const calidad = clamp(j.autoridad), valor = clamp(j.autoridad * 0.8);
  return { calidad, valor, relevancia: clamp(j.relevancia), total: total(calidad, valor, j.relevancia) };
}

/** El autor propuesto tiene que coincidir con el de Open Library (por apellido). */
export function authorMatches(proposed: string, found: string[] = []): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").trim();
  const surname = norm(proposed).split(/\s+/).filter((w) => w.length > 2).pop();
  return !!surname && found.some((a) => norm(a).split(/\s+/).includes(surname));
}

export function bookEvidence(d: OlDoc, spanish?: { title: string }): string[] {
  const ev: string[] = [];
  if (d.ratings_count) ev.push(`${d.ratings_average?.toFixed(1).replace(".", ",")} ★ (${nf(d.ratings_count)} ${d.ratings_count === 1 ? "valoración" : "valoraciones"})`);
  if (readers(d)) ev.push(`${nf(readers(d))} lectores`);
  if (d.edition_count) ev.push(`${nf(d.edition_count)} ediciones${d.first_publish_year ? ` desde ${d.first_publish_year}` : ""}`);
  if (!spanish) ev.push("Edición original");
  return ev;
}
export function videoEvidence(v: videosSvc.VideoItem): string[] {
  const ev = [`${nf(v.views)} visitas`];
  if (v.views && v.likes) ev.push(`${((v.likes / v.views) * 100).toFixed(1).replace(".", ",")} % «me gusta»`);
  ev.push(`${Math.round(v.durationSeconds / 60)} min`);
  return ev;
}
export function podcastEvidence(p: Podcast): string[] {
  const ev = [`${nf(p.trackCount)} episodios`];
  if (p.releaseDate) ev.push(`último: ${new Date(p.releaseDate).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}`);
  return ev;
}

/* ---------------------------------- Afiliación ---------------------------------- */

export function amazonUrl(title: string, author: string, isbn?: string, tag = env.AMAZON_ES_TAG): string | null {
  if (!tag) return null;
  const q = isbn || `${title} ${author}`;
  return `https://www.amazon.es/s?k=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`;
}
export function toolAffiliate(url: string): { url: string; program: string } | null {
  let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return TOOL_AFFILIATES[host] ?? null;
}
/** Orden dentro de cada tipo: todo ya ha pasado el control de calidad; lo rentabilizable sube un poco. */
export function rank(items: Resource[]): Resource[] {
  return [...items].sort((a, b) => (b.scores.total + (b.affiliate ? AFFILIATE_BOOST : 0)) - (a.scores.total + (a.affiliate ? AFFILIATE_BOOST : 0)));
}

/* ---------------------------------- Fuentes externas ---------------------------------- */

const OL = "https://openlibrary.org";
const OL_FIELDS = "key,title,author_name,first_publish_year,edition_count,language,ratings_average,ratings_count,want_to_read_count,already_read_count,currently_reading_count";
const UA = { "user-agent": "SkillUp/1.0 (support@boomatik.com)" };

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (r.ok) return (await r.json()) as T;
      if (r.status < 500) return null;
    } catch { /* one retry */ }
  }
  return null;
}

export async function findWork(title: string, author: string): Promise<OlDoc | null> {
  const d = await getJson<{ docs: OlDoc[] }>(`${OL}/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5&fields=${OL_FIELDS}`);
  const docs = (d?.docs ?? []).filter((x) => authorMatches(author, x.author_name));
  return docs.sort((a, b) => (b.ratings_count ?? 0) - (a.ratings_count ?? 0))[0] ?? null;
}
export async function spanishEdition(workKey: string): Promise<{ title: string; isbn?: string } | null> {
  const d = await getJson<{ entries: { title: string; languages?: { key: string }[]; isbn_13?: string[]; isbn_10?: string[] }[] }>(`${OL}${workKey}/editions.json?limit=100`);
  const e = d?.entries?.find((x) => x.languages?.some((l) => l.key === "/languages/spa"));
  return e ? { title: e.title, isbn: e.isbn_13?.[0] ?? e.isbn_10?.[0] } : null;
}
/** Edición en castellano: dentro de la obra o, si Open Library la registra como obra aparte, por el título que dio el agente. */
export async function spanishFor(doc: OlDoc, author: string, titleEs?: string): Promise<{ title: string; isbn?: string } | null> {
  const inWork = await spanishEdition(doc.key);
  if (inWork || !titleEs) return inWork;
  const tr = await findWork(titleEs, author);
  return tr?.language?.includes("spa") ? { title: tr.title } : null;
}

const COUNTRY: Record<Lang, string> = { es: "ES", en: "US", ca: "ES", pt: "PT", fr: "FR" };
async function podcasts(term: string, lang: Lang): Promise<Podcast[]> {
  const d = await getJson<{ results: Podcast[] }>(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=12&country=${COUNTRY[lang]}&term=${encodeURIComponent(term)}`);
  return (d?.results ?? []).filter((p) => p.collectionViewUrl && p.trackCount > 0);
}

/** La web de la herramienta tiene que existir (2xx/3xx; 401/403/405 = existe pero bloquea bots). */
async function siteExists(url: string): Promise<boolean> {
  if (!/^https:\/\//.test(url)) return false;
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: UA, signal: AbortSignal.timeout(8000) });
    return r.ok || [401, 403, 405].includes(r.status);
  } catch { return false; }
}

/* ---------------------------------- Agente de calidad ---------------------------------- */

async function llmJson(system: string, content: string, maxTokens: number): Promise<unknown> {
  const { llm } = await import("../container.js");
  const out = await llm.generate({ system, messages: [{ role: "user", content }], model: env.MODEL_SENIOR, maxTokens, kind: "resources", lang: "es" });
  return firstJson(out);
}

const PROPOSE_SYS = `Eres documentalista experto en formación profesional B2B. Para el curso que te doy propón:
- hasta 8 libros publicados de verdad, de autores con experiencia contrastada, que ayuden a aplicar el curso (obras de referencia y guías prácticas; nada de autoayuda genérica). Si conoces con seguridad el título de su edición en castellano, añádelo en "title_es".
- hasta 6 herramientas de software reales que un profesional use para aplicar lo del curso, con la URL oficial de su web (https).
Solo lo que puedas nombrar con seguridad: todo se verifica y lo que no existe se descarta.
Devuelve SOLO JSON: {"books":[{"title":"título original","author":"nombre y apellido","title_es":"…"}],"tools":[{"name":"…","url":"https://…","what":"para qué sirve, en 10 palabras"}]}`;

const JUDGE_SYS = `Eres el agente de calidad de SkillUp. Para cada candidato juzga como experto, sin inventar datos:
- relevancia (0-100): cuánto ayuda a aplicar ESTE curso en la práctica.
- autoridad (0-100): experiencia y reconocimiento del autor, canal, podcast o herramienta en esta materia. Si no lo conoces, 40.
- nivel: "inicial" | "intermedio" | "avanzado".
- motivo: qué aporta, en 15 palabras como máximo, en español de España, dirigido al alumno.
Devuelve SOLO JSON: {"items":[{"id":"…","relevancia":0,"autoridad":0,"nivel":"…","motivo":"…"}]}`;

function toJudgement(x: Partial<Judgement> | undefined): Judgement | null {
  if (!x || typeof x.relevancia !== "number") return null;
  return { relevancia: x.relevancia, autoridad: typeof x.autoridad === "number" ? x.autoridad : 40, nivel: String(x.nivel || "intermedio"), motivo: String(x.motivo || "").slice(0, 160) };
}

type Proposal = { books?: { title: string; author: string; title_es?: string }[]; tools?: { name: string; url: string; what?: string }[] };

/** Pool del curso: candidatos verificados + juicio del agente + notas + afiliación, agrupado por tipo. */
export async function build(deps: SvcDeps, topic: string, outline: string, lang: Lang): Promise<Record<Kind, Resource[]>> {
  const brief = `CURSO: ${topic}\nTEMARIO:\n${outline.slice(0, 2500)}`;
  const term = await videosSvc.queryFor(topic, lang).catch(() => topic);
  const [proposal, vidPool, pods] = await Promise.all([
    llmJson(PROPOSE_SYS, brief, 1400).catch((e) => { console.warn("[resources] propose failed", String(e).slice(0, 200)); return null; }) as Promise<Proposal | null>,
    videosSvc.forTopic(deps, topic, lang).catch((e) => { console.warn("[resources] videos failed", String(e).slice(0, 200)); return null; }),
    podcasts(term, lang),
  ]);

  const books: { doc: OlDoc; es: { title: string; isbn?: string } | null }[] = [];
  for (const b of (proposal?.books ?? []).slice(0, 8)) {
    if (!b?.title || !b?.author) continue;
    const doc = await findWork(b.title, b.author);
    if (doc) books.push({ doc, es: lang === "es" ? await spanishFor(doc, b.author, b.title_es) : null });
  }
  const toolsIn = (proposal?.tools ?? []).slice(0, 6).filter((t) => t?.name && t?.url);
  const toolsOk = (await Promise.all(toolsIn.map(async (t) => ((await siteExists(t.url)) ? t : null)))).filter((t): t is NonNullable<typeof t> => !!t);
  const seen = new Set<string>();
  const vids = [...(vidPool?.masValorados ?? []), ...(vidPool?.masVistos ?? [])]
    .filter((v) => (seen.has(v.youtubeId) ? false : (seen.add(v.youtubeId), true))).slice(0, 12);
  const podsIn = pods.slice(0, 10);

  const cand = [
    ...books.map((b, i) => ({ id: "b" + i, tipo: "libro", titulo: b.doc.title, autor: b.doc.author_name?.[0], año: b.doc.first_publish_year })),
    ...vids.map((v, i) => ({ id: "v" + i, tipo: "vídeo", titulo: v.title, canal: v.channel })),
    ...podsIn.map((p, i) => ({ id: "p" + i, tipo: "podcast", titulo: p.collectionName, autor: p.artistName, categoria: p.primaryGenreName })),
    ...toolsOk.map((t, i) => ({ id: "t" + i, tipo: "herramienta", titulo: t.name, web: t.url, uso: t.what })),
  ];
  const out: Record<Kind, Resource[]> = { video: [], podcast: [], book: [], tool: [] };
  if (!cand.length) { console.warn("[resources] no candidates", { topic, lang }); return out; }
  const judged = await llmJson(JUDGE_SYS, `${brief}\n\nCANDIDATOS:\n${JSON.stringify(cand)}`, 2500)
    .catch((e) => { console.warn("[resources] judge failed", String(e).slice(0, 200)); return null; }) as { items?: (Partial<Judgement> & { id: string })[] } | null;
  const byId = new Map((judged?.items ?? []).map((x) => [x.id, toJudgement(x)]));

  const push = (r: Resource) => { if (keep(r.scores)) out[r.kind].push(r); };
  books.forEach(({ doc, es }, i) => {
    const j = byId.get("b" + i); if (!j) return;
    const author = doc.author_name?.[0] ?? "";
    const aff = amazonUrl(es?.title ?? doc.title, author, es?.isbn);
    push({ kind: "book", id: doc.key, title: es?.title ?? doc.title, by: author + (doc.first_publish_year ? ` · ${doc.first_publish_year}` : ""),
      url: aff ?? OL + doc.key, image: es?.isbn ? `https://covers.openlibrary.org/b/isbn/${es.isbn}-M.jpg` : undefined,
      nivel: j.nivel, why: j.motivo, evidence: bookEvidence(doc, es ?? undefined), scores: scoreBook(doc, j), affiliate: !!aff });
  });
  vids.forEach((v, i) => {
    const j = byId.get("v" + i); if (!j) return;
    push({ kind: "video", id: v.youtubeId, title: v.title, by: v.channel, url: `https://www.youtube.com/watch?v=${v.youtubeId}`, image: v.thumbnail,
      nivel: j.nivel, why: j.motivo, evidence: videoEvidence(v), scores: scoreVideo(v, j), affiliate: false, meta: { youtubeId: v.youtubeId, durationSeconds: v.durationSeconds } });
  });
  podsIn.forEach((p, i) => {
    const j = byId.get("p" + i); if (!j) return;
    push({ kind: "podcast", id: String(p.collectionId), title: p.collectionName, by: p.artistName, url: p.collectionViewUrl, image: p.artworkUrl600,
      nivel: j.nivel, why: j.motivo, evidence: podcastEvidence(p), scores: scorePodcast(p, j), affiliate: false });
  });
  toolsOk.forEach((t, i) => {
    const j = byId.get("t" + i); if (!j) return;
    const aff = toolAffiliate(t.url);
    push({ kind: "tool", id: t.url, title: t.name, by: new URL(t.url).hostname.replace(/^www\./, ""), url: aff?.url ?? t.url,
      nivel: j.nivel, why: j.motivo, evidence: t.what ? [t.what] : [], scores: scoreTool(j), affiliate: !!aff });
  });
  for (const k of KINDS) out[k] = rank(out[k]);
  console.info("[resources]", topic.slice(0, 60), lang, JSON.stringify({
    candidates: { books: books.length, videos: vids.length, podcasts: podsIn.length, tools: toolsOk.length }, judged: byId.size,
    kept: Object.fromEntries(KINDS.map((k) => [k, out[k].length])),
  }));
  return out;
}

/* ---------------------------------- Caché (video_cache, sort_type «res2:<lang>») ---------------------------------- */

const isEmpty = (g: Record<Kind, Resource[]>) => KINDS.every((k) => !g[k]?.length);

export async function forCourse(deps: SvcDeps, topic: string, outline: string, lang: Lang): Promise<Record<Kind, Resource[]>> {
  const sortType = `res2:${lang}`, key = topic.slice(0, 200);
  const [row] = await deps.db.select().from(videoCache).where(and(eq(videoCache.topic, key), eq(videoCache.sortType, sortType))).limit(1);
  if (row && Date.now() - new Date(row.fetchedAt).getTime() < TTL_MS) return row.videos as Record<Kind, Resource[]>;
  const fresh = await build(deps, topic, outline, lang);
  if (isEmpty(fresh)) return fresh; // nunca se guarda un resultado vacío: se reintenta en la siguiente visita
  if (row) await deps.db.update(videoCache).set({ videos: fresh, fetchedAt: new Date() }).where(eq(videoCache.id, row.id));
  else await deps.db.insert(videoCache).values({ id: deps.newId(), topic: key, sortType, videos: fresh });
  return fresh;
}

/* ---------------------------------- Personalización por alumno ---------------------------------- */

/** Cuántos recursos «para ti» según el tiempo semanal de la bienvenida ([ritmo]). */
export function countFor(ritmo: string | null): number {
  if (!ritmo) return 4;
  if (/menos de 1/i.test(ritmo)) return 2;
  if (/5 horas|m[aá]s/i.test(ritmo)) return 8;
  return 4;
}

/** Orden de las pestañas según el formato preferido del Team DNA. */
export function tabOrder(formato: string | null): Kind[] {
  if (formato === "texto") return ["book", "video", "podcast", "tool"];
  if (formato === "audio" || formato === "conversacion") return ["podcast", "video", "book", "tool"];
  return ["video", "podcast", "book", "tool"];
}

/** «Para ti»: el mejor de cada tipo en el orden de su formato preferido, hasta el número que permite su tiempo. */
export function forYou(groups: Record<Kind, Resource[]>, formato: string | null, ritmo: string | null): Resource[] {
  const order = tabOrder(formato), n = countFor(ritmo), out: Resource[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const k of order) { const r = groups[k]?.[round]; if (r && out.length < n) { out.push(r); added = true; } }
    if (!added) break;
  }
  return out;
}
