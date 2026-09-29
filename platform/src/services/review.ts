// Repaso espaciado con errores reales (1.20.0, arquitectura V2 fase 6a). No «repasa el módulo 4»: «hace 18 días
// fallaste esto». Solo preguntas de opción múltiple (corrección exacta, coste cero de IA).
// ponytail: las preguntas abiertas falladas no entran; añadirlas cuando haya corrección con IA barata para repasos.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assessmentAttempt, evidenceEvent } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

const DAY = 86_400_000;
export const MIN_GAP_DAYS = 2;      // no se repasa lo que se falló hace menos de 2 días
export const RELEARN_DAYS = 7;      // tras el primer acierto, el segundo repaso espera una semana
export const DONE_AFTER = 2;        // dos aciertos espaciados = aprendido, sale del repaso
export const MAX_ITEMS = 3;

export interface ErrorItem { key: string; source: string; block: number; q: string; options: string[]; correct: number; explain: string; failedAt: Date }
export interface Reviewed { key: string; correct: boolean; at: Date }

export const keyOf = (source: string, q: string) => createHash("sha1").update(`${source}|${q.trim().toLowerCase()}`).digest("hex").slice(0, 16);

/** Errores que tocan hoy: los más antiguos primero, sin los ya aprendidos ni los que esperan su semana. */
export function due(errors: ErrorItem[], reviews: Reviewed[], now: Date): ErrorItem[] {
  const hist = new Map<string, { ok: number; lastOk: number; lastFail: number }>();
  for (const r of reviews) {
    const h = hist.get(r.key) ?? { ok: 0, lastOk: 0, lastFail: 0 };
    if (r.correct) { h.ok++; h.lastOk = Math.max(h.lastOk, r.at.getTime()); } else h.lastFail = Math.max(h.lastFail, r.at.getTime());
    hist.set(r.key, h);
  }
  const latest = new Map<string, ErrorItem>();
  for (const e of errors) { const p = latest.get(e.key); if (!p || e.failedAt > p.failedAt) latest.set(e.key, e); }
  return [...latest.values()].filter((e) => {
    if (now.getTime() - e.failedAt.getTime() < MIN_GAP_DAYS * DAY) return false;
    const h = hist.get(e.key);
    if (!h) return true;
    if (h.ok >= DONE_AFTER) return false;
    if (h.lastOk > h.lastFail && now.getTime() - h.lastOk < RELEARN_DAYS * DAY) return false;
    return true;
  }).sort((a, b) => a.failedAt.getTime() - b.failedAt.getTime()).slice(0, MAX_ITEMS);
}

export async function load(deps: SvcDeps, orgId: string, userId: string): Promise<{ errors: ErrorItem[]; reviews: Reviewed[] }> {
  const [atts, evs] = await Promise.all([
    deps.db.select().from(assessmentAttempt).where(and(eq(assessmentAttempt.organizationId, orgId), eq(assessmentAttempt.userId, userId), eq(assessmentAttempt.status, "corregido"))),
    deps.db.select({ context: evidenceEvent.detail, score: evidenceEvent.score, at: evidenceEvent.createdAt }).from(evidenceEvent)
      .where(and(eq(evidenceEvent.organizationId, orgId), eq(evidenceEvent.userId, userId), eq(evidenceEvent.type, "repaso"))),
  ]);
  const errors: ErrorItem[] = [];
  for (const a of atts) {
    const qs = (a.questions || []) as { type?: string; q?: string; options?: string[]; correct?: number; explain?: string }[];
    const rs = (a.results || []) as { earned?: number; max?: number }[];
    qs.forEach((it, i) => {
      const r = rs[i];
      if (it.type !== "mc" || !it.q || !Array.isArray(it.options) || typeof it.correct !== "number" || !r || (r.earned ?? 0) >= (r.max ?? 1)) return;
      errors.push({ key: keyOf(a.source, it.q), source: a.source, block: a.block, q: it.q, options: it.options, correct: it.correct, explain: it.explain || "", failedAt: a.gradedAt ?? a.startedAt });
    });
  }
  const reviews = evs.map((e) => ({ key: String((e.context as { key?: string } | null)?.key ?? ""), correct: (e.score ?? 0) >= 100, at: e.at })).filter((r) => r.key);
  return { errors, reviews };
}

/* ---- sesión: la respuesta correcta se queda en el servidor hasta que contesta */
interface Session { orgId: string; userId: string; items: (ErrorItem & { shown: number[] })[]; answered: Set<number>; expires: number }
// ponytail: en memoria de proceso, como exámenes y demostraciones.
const sessions = new Map<string, Session>();

function shuffle(n: number, rng: () => number): number[] {
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
  return idx;
}

export function open(id: string, orgId: string, userId: string, items: ErrorItem[], rng: () => number = Math.random) {
  const withOrder = items.map((it) => ({ ...it, shown: shuffle(it.options.length, rng) }));
  sessions.set(id, { orgId, userId, items: withOrder, answered: new Set(), expires: Date.now() + 3_600_000 });
  return withOrder.map((it, i) => ({ i, q: it.q, options: it.shown.map((k) => it.options[k]!), source: it.source, block: it.block, failedAt: it.failedAt.toISOString() }));
}

/** Corrige una respuesta (índice en el orden mostrado). Una sola vez por pregunta. */
export function answer(id: string, who: { orgId: string; userId: string }, i: number, choice: number) {
  const s = sessions.get(id);
  if (!s || s.orgId !== who.orgId || s.userId !== who.userId || s.expires < Date.now()) return null;
  const it = s.items[i];
  if (!it || s.answered.has(i)) return null;
  s.answered.add(i);
  if (s.answered.size === s.items.length) sessions.delete(id);
  const correctShown = it.shown.indexOf(it.correct);
  return { correct: choice === correctShown, correctIndex: correctShown, explain: it.explain, item: it };
}

export async function record(deps: SvcDeps, orgId: string, userId: string, it: ErrorItem, correct: boolean): Promise<void> {
  await deps.db.insert(evidenceEvent).values({
    id: deps.newId(), organizationId: orgId, userId, skillKey: `curso:${it.source}`, type: "repaso", dimension: "conocimiento",
    context: it.q.slice(0, 500), score: correct ? 100 : 0, independence: "independiente", aiHelp: "ninguna",
    detail: { key: it.key, source: it.source, block: it.block },
  });
}
