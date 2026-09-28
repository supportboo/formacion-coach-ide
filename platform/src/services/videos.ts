// Videos externos reales de YouTube, cacheados por tema (cuota API limitada: 10k u/dia, ~200 u por
// tema por refresco). "Brandooers Favs" es senal propia: cuantas veces se ha abierto cada video DENTRO
// de SkillUp, cruzando todas las empresas cliente. Nada de numeros inventados en ningun slider.
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { videoCache, videoEvent } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";
import { LANG_INFO, type Lang } from "./lang.js";

export interface VideoItem {
  youtubeId: string; title: string; channel: string; thumbnail: string;
  views: number; likes: number; publishedAt: string; durationSeconds: number; subscribers: number;
  comments?: number; quality?: number; lang?: string;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h: cuota baja y predecible, datos casi siempre frescos
const API = "https://www.googleapis.com/youtube/v3";

/* ---------- Calidad (1.5.0, petición de Marc: «siempre muy bien valorados y con mucha interacción») ----------
 * Filtro duro (se descarta): Shorts/reels (< 2 min; además la búsqueda pide 4-20 min), pocas vistas o canal pequeño
 * (umbrales por idioma: el catalán tiene mucha menos audiencia en YouTube) y vídeos que no están en el idioma elegido.
 * Nota de calidad 0-100, transparente y solo con datos medidos de la API (nada estimado):
 *   40 · «me gusta» por vista (satura al 4 %)               -> gustó de verdad
 *   20 · comentarios por vista (satura al 0,5 %)            -> genera conversación
 *   25 · alcance: log10(vistas) / 6 (satura en 1 M)         -> probado por mucha gente, amortiguado
 *   10 · canal: log10(suscriptores) / 6 (ocultos = mitad)   -> canal con peso
 *    5 · actualidad: 5 si tiene < 1 año, baja a 0 a los 5 años
 * Si YouTube oculta los «me gusta» o los comentarios, esa parte cuenta 0 (no se inventa). */
const MIN_DURATION = 120;
const MIN_VIEWS: Record<Lang, number> = { es: 10000, en: 10000, pt: 5000, fr: 5000, ca: 1000 };
const MIN_SUBS: Record<Lang, number> = { es: 3000, en: 3000, pt: 2000, fr: 2000, ca: 300 };

export function qualityScore(v: Pick<VideoItem, "views" | "likes" | "subscribers" | "publishedAt"> & { comments?: number }, now = Date.now()): number {
  const views = Math.max(0, v.views || 0);
  const likeRate = views > 0 ? (v.likes || 0) / views : 0;
  const commentRate = views > 0 ? (v.comments || 0) / views : 0;
  const reach = Math.min(1, Math.log10(views + 1) / 6);
  const subs = v.subscribers < 0 ? 0.5 : Math.min(1, Math.log10((v.subscribers || 0) + 1) / 6);
  const ageYears = v.publishedAt ? (now - Date.parse(v.publishedAt)) / (365.25 * 864e5) : NaN;
  const recency = !Number.isFinite(ageYears) ? 0 : ageYears <= 1 ? 1 : Math.max(0, (5 - ageYears) / 4);
  const score = 40 * Math.min(1, likeRate / 0.04) + 20 * Math.min(1, commentRate / 0.005) + 25 * reach + 10 * subs + 5 * recency;
  return Math.round(score * 10) / 10;
}

/** Completa hasta `min` vídeos: primero los que pasan la barra alta; si no llegan (temas de nicho), los siguientes
 * mejor puntuados con un suelo razonable (1.000 vistas, 300 suscriptores u ocultos). Siempre del idioma pedido y
 * ordenados por calidad; nunca se inventa nada. Medido en producción (28-09): con la barra alta sola salía 1 vídeo. */
export function pickQuality(items: VideoItem[], lang: Lang, min = 8, floorViews = 1000): VideoItem[] {
  const ok = items.filter((v) => v.durationSeconds >= MIN_DURATION);
  const strict = ok.filter((v) => passesQuality(v, lang));
  if (strict.length >= min) return strict;
  const rest = ok.filter((v) => !strict.includes(v) && v.views >= floorViews && (v.subscribers < 0 || v.subscribers >= 300))
    .sort((a, b) => q(b) - q(a));
  return strict.concat(rest).slice(0, 50);
}

export function passesQuality(v: VideoItem, lang: Lang): boolean {
  return v.durationSeconds >= MIN_DURATION && v.views >= MIN_VIEWS[lang] && (v.subscribers < 0 || v.subscribers >= MIN_SUBS[lang]);
}

/* ---------- Idioma del vídeo ----------
 * 1) defaultAudioLanguage (idioma hablado que declara el canal), 2) defaultLanguage (idioma de título y
 * descripción), 3) si el canal no declara nada: heurística de palabras funcionales sobre título + descripción. */
const STOP: Record<Lang, string[]> = {
  es: ["el", "los", "las", "con", "por", "para", "que", "del", "cómo", "qué", "más", "pero", "muy", "sin", "tu", "tus", "este", "esta", "hacer", "ventas", "clientes", "cuando", "también", "sobre", "y"],
  en: ["the", "and", "to", "of", "in", "for", "with", "how", "your", "is", "you", "on", "what", "this", "that", "sales", "from", "are", "why", "it"],
  ca: ["amb", "els", "les", "per", "però", "què", "són", "aquest", "aquesta", "dels", "molt", "fer", "pel", "als", "seu", "com", "vendes", "clients", "i", "és"],
  pt: ["os", "as", "com", "para", "não", "uma", "do", "da", "dos", "das", "em", "no", "na", "é", "como", "mais", "você", "seu", "sua", "vendas", "clientes", "e"],
  fr: ["le", "la", "les", "des", "du", "un", "une", "et", "est", "pour", "avec", "dans", "sur", "pas", "vous", "qui", "comment", "votre", "ventes", "clients"],
};
export function detectLang(text: string): Lang | null {
  const words = String(text || "").toLowerCase().replace(/[^\p{L}\s]+/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  let best: Lang | null = null, bestN = 0, second = 0;
  for (const l of Object.keys(STOP) as Lang[]) {
    const set = new Set(STOP[l]);
    const n = words.reduce((a, w) => a + (set.has(w) ? 1 : 0), 0);
    if (n > bestN) { second = bestN; bestN = n; best = l; } else if (n > second) second = n;
  }
  // Exige señal (>= 2 palabras) y ventaja clara sobre el segundo idioma (castellano, catalán y portugués comparten muchas).
  return best && bestN >= 2 && bestN >= second + 2 ? best : null;
}
export function videoInLang(meta: { audio?: string; lang?: string; text: string }, lang: Lang): boolean {
  const pref = (x?: string) => String(x || "").toLowerCase().slice(0, 2);
  if (meta.audio && pref(meta.audio) !== "zx") return pref(meta.audio) === lang; // zxx = sin contenido lingüístico
  if (meta.lang && pref(meta.lang) !== "zx") return pref(meta.lang) === lang;
  return detectLang(meta.text) === lang;
}

function parseDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// Los temas del catalogo son cortos (p.ej. "Outbound Sales") y sin contexto atraen ruido viral ajeno
// a ventas B2B. Se añade "ventas B2B" (en el idioma de búsqueda) salvo que el propio tema ya lo mencione.
export function withContext(topic: string, lang: Lang = "es"): string {
  const t = topic.toLowerCase();
  return /ventas|vendes|vendas|ventes|b2b|comercial|sales/.test(t) ? topic : topic + " " + LANG_INFO[lang].b2b;
}

// El tema de búsqueda llega en español (títulos de curso): para buscar vídeos en otro idioma hay que buscar EN ese
// idioma (medido 28-09: «Prospección comercial B2B» con relevanceLanguage=en daba 1 vídeo). Una llamada mínima al
// modelo barato por tema+idioma, cacheada en memoria; si falla, se busca con el tema original.
const QUERY_LANG: Record<string, string> = { en: "English", ca: "Catalan", pt: "European Portuguese", fr: "French" };
const queryCache = new Map<string, string>();
export async function queryFor(topic: string, lang: Lang): Promise<string> {
  if (lang === "es" || !QUERY_LANG[lang]) return topic;
  const k = lang + ":" + topic;
  const hit = queryCache.get(k); if (hit) return hit;
  try {
    const { llm } = await import("../container.js");
    const out = await llm.generate({
      system: `Translate this YouTube search query about professional training into natural ${QUERY_LANG[lang]} as people would search it. Reply with the query only, no quotes.`,
      messages: [{ role: "user", content: topic.slice(0, 200) }], model: env.MODEL_FAST, maxTokens: 40, kind: "translate", lang: "es",
    });
    const qy = (out.split("\n")[0] ?? "").replace(/^["«']|["»']$/g, "").trim().slice(0, 120) || topic;
    queryCache.set(k, qy); return qy;
  } catch { return topic; }
}

/** Clave de caché (columna sort_type): orden + idioma; cada idioma tiene su propia selección por tema. */
export function cacheKey(sort: string, lang: Lang): string { return `${sort}:${lang}`; }

// Suscriptores por canal (una llamada, hasta 50 canales) para exigir canales con audiencia real.
async function channelSubs(key: string, channelIds: string[]): Promise<Record<string, number>> {
  const uniq = [...new Set(channelIds)].filter(Boolean).slice(0, 50);
  if (!uniq.length) return {};
  const r = await fetch(`${API}/channels?part=statistics&id=${uniq.join(",")}&key=${key}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return {};
  const j = (await r.json()) as { items?: { id: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] };
  const map: Record<string, number> = {};
  (j.items || []).forEach((c) => { map[c.id] = c.statistics?.hiddenSubscriberCount ? -1 : Number(c.statistics?.subscriberCount || 0); });
  return map;
}

// Cuota por llamada (unidades YouTube Data API v3): search.list 100 + videos.list 1 + channels.list 1 = 102 u.
async function searchAndStats(topic: string, order: "date" | "viewCount", lang: Lang, max = 50): Promise<VideoItem[]> {
  // Novedades: un vídeo reciente casi nunca tiene aún 10.000 vistas; suelo más bajo pero siempre por calidad.
  return pickQuality(await searchRaw(topic, order, lang, max), lang, 8, order === "date" ? 300 : 1000);
}
async function searchRaw(topic: string, order: "date" | "viewCount", lang: Lang, max: number): Promise<VideoItem[]> {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return [];
  // videoDuration=medium (4-20 min) ya excluye Shorts (máx 3 min desde oct-2024). relevanceLanguage + regionCode
  // orientan la búsqueda al idioma elegido; el filtro de idioma de abajo lo garantiza. 50 resultados = mismas 100 u.
  const searchUrl = `${API}/search?part=snippet&type=video&videoDuration=medium&relevanceLanguage=${lang}&regionCode=${LANG_INFO[lang].region}&order=${order}&maxResults=${max}` +
    `&q=${encodeURIComponent(withContext(topic, lang))}&key=${key}`;
  const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
  if (!sr.ok) return [];
  const sj = (await sr.json()) as { items?: { id?: { videoId?: string } }[] };
  const ids = (sj.items || []).map((it) => it.id?.videoId).filter((x): x is string => !!x);
  if (!ids.length) return [];
  const statsUrl = `${API}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key}`;
  const vr = await fetch(statsUrl, { signal: AbortSignal.timeout(8000) });
  if (!vr.ok) return [];
  const vj = (await vr.json()) as {
    items?: {
      id: string;
      snippet: { title: string; description?: string; channelId: string; channelTitle: string; publishedAt: string; defaultLanguage?: string; defaultAudioLanguage?: string; thumbnails?: Record<string, { url: string }> };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }[];
  };
  const items = (vj.items || []).filter((v) => videoInLang({ audio: v.snippet.defaultAudioLanguage, lang: v.snippet.defaultLanguage, text: v.snippet.title + " " + (v.snippet.description || "").slice(0, 600) }, lang));
  const subs = await channelSubs(key, items.map((v) => v.snippet.channelId)).catch(() => ({} as Record<string, number>));
  return items.map((v) => {
    const sub = subs[v.snippet.channelId];
    const it: VideoItem = {
      youtubeId: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
      views: Number(v.statistics?.viewCount || 0),
      likes: Number(v.statistics?.likeCount || 0),
      comments: Number(v.statistics?.commentCount || 0),
      publishedAt: v.snippet.publishedAt,
      durationSeconds: parseDuration(v.contentDetails?.duration || ""),
      subscribers: sub == null ? 0 : sub, // -1 = suscriptores ocultos (no descartamos por eso solo)
      lang,
    };
    it.quality = qualityScore(it);
    return it;
  });
}

async function readCache(deps: SvcDeps, topic: string, sortType: string): Promise<VideoItem[] | null> {
  const rows = await deps.db.select().from(videoCache)
    .where(and(eq(videoCache.topic, topic), eq(videoCache.sortType, sortType))).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.fetchedAt).getTime() > CACHE_TTL_MS) return null;
  return row.videos as VideoItem[];
}

async function writeCache(deps: SvcDeps, topic: string, sortType: string, videos: VideoItem[]) {
  const rows = await deps.db.select({ id: videoCache.id }).from(videoCache)
    .where(and(eq(videoCache.topic, topic), eq(videoCache.sortType, sortType))).limit(1);
  if (rows[0]) {
    await deps.db.update(videoCache).set({ videos, fetchedAt: new Date() }).where(eq(videoCache.id, rows[0].id));
  } else {
    await deps.db.insert(videoCache).values({ id: deps.newId(), topic, sortType, videos });
  }
}

const q = (v: VideoItem) => v.quality ?? qualityScore(v);

/** Rankings de un pool ya filtrado (puro): más vistos por vistas; mejor valorados por nota de calidad. */
export function rankPool(pool: VideoItem[]): { masVistos: VideoItem[]; masValorados: VideoItem[] } {
  return { masVistos: [...pool].sort((a, b) => b.views - a.views), masValorados: [...pool].sort((a, b) => q(b) - q(a)) };
}

/** Novedades + más vistos + mejor valorados para UN tema en UN idioma. Cache-first (12 h por tema+idioma).
 * Cuota por refresco de tema+idioma: 2 búsquedas × 102 u = 204 u (límite diario por defecto del proyecto: 10.000 u). */
export async function forTopic(deps: SvcDeps, topic: string, lang: Lang = "es"): Promise<{ novedades: VideoItem[]; masVistos: VideoItem[]; masValorados: VideoItem[]; lang: Lang }> {
  let novedades = await readCache(deps, topic, cacheKey("date", lang));
  const qy = (novedades && (await readCache(deps, topic, cacheKey("viewed", lang)))) ? topic : await queryFor(topic, lang);
  if (!novedades) { novedades = await searchAndStats(qy, "date", lang); await writeCache(deps, topic, cacheKey("date", lang), novedades); }

  let masVistos = await readCache(deps, topic, cacheKey("viewed", lang));
  let masValorados = await readCache(deps, topic, cacheKey("rated", lang));
  if (!masVistos || !masValorados) {
    ({ masVistos, masValorados } = rankPool(await searchAndStats(qy, "viewCount", lang)));
    await writeCache(deps, topic, cacheKey("viewed", lang), masVistos);
    await writeCache(deps, topic, cacheKey("rated", lang), masValorados);
  }
  return { novedades, masVistos, masValorados, lang };
}

/** Junta varios temas (catalogo global, o temas de la ruta activa del usuario) en un unico set de 3 listas,
 * deduplicando por video y reordenando por el criterio real de cada slider. Usado por la pagina global. */
export async function aggregate(deps: SvcDeps, topics: string[], limit = 12, lang: Lang = "es") {
  const perTopic = await Promise.all(topics.map((t) => forTopic(deps, t, lang)));
  function merge(pick: (r: { novedades: VideoItem[]; masVistos: VideoItem[]; masValorados: VideoItem[] }) => VideoItem[], sortKey: (v: VideoItem) => number) {
    const seen = new Set<string>(); const out: VideoItem[] = [];
    perTopic.forEach((r) => pick(r).forEach((v) => { if (!seen.has(v.youtubeId)) { seen.add(v.youtubeId); out.push(v); } }));
    return out.sort((a, b) => sortKey(b) - sortKey(a)).slice(0, limit);
  }
  return {
    novedades: merge((r) => r.novedades, (v) => new Date(v.publishedAt).getTime()),
    masVistos: merge((r) => r.masVistos, (v) => v.views),
    masValorados: merge((r) => r.masValorados, q),
  };
}

/** Registra que alguien ha abierto un video dentro de SkillUp (para Brandooers Favs). Fire-and-forget. */
export async function logWatch(deps: SvcDeps, orgId: string, userId: string, v: { youtubeId: string; title: string; thumbnail: string; lang?: Lang }) {
  await deps.db.insert(videoEvent).values({ id: deps.newId(), organizationId: orgId, userId, youtubeId: v.youtubeId, title: v.title, thumbnail: v.thumbnail, lang: v.lang ?? null });
}

/** Top videos por reproducciones internas, cruzando todas las empresas cliente. Sin cuota de YouTube. */
export async function brandooersFavs(deps: SvcDeps, limit = 12, lang: Lang = "es"): Promise<(VideoItem & { plays: number })[]> {
  // Solo lo visto en el idioma elegido (las filas anteriores a 1.5.0 no tienen idioma: eran todas en español).
  const inLang = lang === "es" ? or(eq(videoEvent.lang, "es"), isNull(videoEvent.lang)) : eq(videoEvent.lang, lang);
  const rows = await deps.db
    .select({ youtubeId: videoEvent.youtubeId, title: videoEvent.title, thumbnail: videoEvent.thumbnail, plays: sql<number>`count(*)`.as("plays") })
    .from(videoEvent).where(inLang).groupBy(videoEvent.youtubeId, videoEvent.title, videoEvent.thumbnail)
    .orderBy(desc(sql`count(*)`)).limit(limit);
  return rows.map((r) => ({
    youtubeId: r.youtubeId, title: r.title, thumbnail: r.thumbnail, plays: Number(r.plays),
    channel: "", views: 0, likes: 0, publishedAt: "", durationSeconds: 0, subscribers: 0,
  }));
}
