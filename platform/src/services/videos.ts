// Videos externos reales de YouTube, cacheados por tema (cuota API limitada: 10k u/dia, ~200 u por
// tema por refresco). "Brandooers Favs" es senal propia: cuantas veces se ha abierto cada video DENTRO
// de SkillUp, cruzando todas las empresas cliente. Nada de numeros inventados en ningun slider.
import { and, desc, eq, sql } from "drizzle-orm";
import { videoCache, videoEvent } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";

export interface VideoItem {
  youtubeId: string; title: string; channel: string; thumbnail: string;
  views: number; likes: number; publishedAt: string; durationSeconds: number;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h: cuota baja y predecible, datos casi siempre frescos
const API = "https://www.googleapis.com/youtube/v3";

function parseDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// Los temas del catalogo son cortos (p.ej. "Outbound Sales") y sin contexto atraen ruido viral ajeno
// a ventas B2B. Se añade "ventas B2B" salvo que el propio tema ya lo mencione.
function withContext(topic: string): string {
  const t = topic.toLowerCase();
  return /ventas|b2b|comercial|sales/.test(t) ? topic : topic + " ventas B2B";
}

async function searchAndStats(topic: string, order: "date" | "viewCount", max = 15): Promise<VideoItem[]> {
  const key = env.YOUTUBE_API_KEY;
  if (!key) return [];
  const searchUrl = `${API}/search?part=snippet&type=video&order=${order}&maxResults=${max}` +
    `&q=${encodeURIComponent(withContext(topic))}&key=${key}`;
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
      snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
      statistics?: { viewCount?: string; likeCount?: string };
      contentDetails?: { duration?: string };
    }[];
  };
  return (vj.items || []).map((v) => ({
    youtubeId: v.id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    thumbnail: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    publishedAt: v.snippet.publishedAt,
    durationSeconds: parseDuration(v.contentDetails?.duration || ""),
  }));
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

/** Novedades + mas vistos + mas valorados para UN tema. Cache-first, refresca en caliente si toca. */
export async function forTopic(deps: SvcDeps, topic: string): Promise<{ novedades: VideoItem[]; masVistos: VideoItem[]; masValorados: VideoItem[] }> {
  let novedades = await readCache(deps, topic, "date");
  if (!novedades) { novedades = await searchAndStats(topic, "date"); await writeCache(deps, topic, "date", novedades); }

  let masVistos = await readCache(deps, topic, "viewed");
  let masValorados = await readCache(deps, topic, "rated");
  if (!masVistos || !masValorados) {
    const pool = await searchAndStats(topic, "viewCount");
    masVistos = [...pool].sort((a, b) => b.views - a.views);
    masValorados = [...pool].sort((a, b) => b.likes - a.likes);
    await writeCache(deps, topic, "viewed", masVistos);
    await writeCache(deps, topic, "rated", masValorados);
  }
  return { novedades, masVistos, masValorados };
}

/** Junta varios temas (catalogo global, o temas de la ruta activa del usuario) en un unico set de 3 listas,
 * deduplicando por video y reordenando por el criterio real de cada slider. Usado por la pagina global. */
export async function aggregate(deps: SvcDeps, topics: string[], limit = 12) {
  const perTopic = await Promise.all(topics.map((t) => forTopic(deps, t)));
  function merge(pick: (r: { novedades: VideoItem[]; masVistos: VideoItem[]; masValorados: VideoItem[] }) => VideoItem[], sortKey: (v: VideoItem) => number) {
    const seen = new Set<string>(); const out: VideoItem[] = [];
    perTopic.forEach((r) => pick(r).forEach((v) => { if (!seen.has(v.youtubeId)) { seen.add(v.youtubeId); out.push(v); } }));
    return out.sort((a, b) => sortKey(b) - sortKey(a)).slice(0, limit);
  }
  return {
    novedades: merge((r) => r.novedades, (v) => new Date(v.publishedAt).getTime()),
    masVistos: merge((r) => r.masVistos, (v) => v.views),
    masValorados: merge((r) => r.masValorados, (v) => v.likes),
  };
}

/** Registra que alguien ha abierto un video dentro de SkillUp (para Brandooers Favs). Fire-and-forget. */
export async function logWatch(deps: SvcDeps, orgId: string, userId: string, v: { youtubeId: string; title: string; thumbnail: string }) {
  await deps.db.insert(videoEvent).values({ id: deps.newId(), organizationId: orgId, userId, youtubeId: v.youtubeId, title: v.title, thumbnail: v.thumbnail });
}

/** Top videos por reproducciones internas, cruzando todas las empresas cliente. Sin cuota de YouTube. */
export async function brandooersFavs(deps: SvcDeps, limit = 12): Promise<(VideoItem & { plays: number })[]> {
  const rows = await deps.db
    .select({ youtubeId: videoEvent.youtubeId, title: videoEvent.title, thumbnail: videoEvent.thumbnail, plays: sql<number>`count(*)`.as("plays") })
    .from(videoEvent).groupBy(videoEvent.youtubeId, videoEvent.title, videoEvent.thumbnail)
    .orderBy(desc(sql`count(*)`)).limit(limit);
  return rows.map((r) => ({
    youtubeId: r.youtubeId, title: r.title, thumbnail: r.thumbnail, plays: Number(r.plays),
    channel: "", views: 0, likes: 0, publishedAt: "", durationSeconds: 0,
  }));
}
