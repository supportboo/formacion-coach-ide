// Supervisión en directo (1.3.0): actividad ligera de las páginas de aprendizaje, tablero en directo,
// ficha por persona, intervención humana en el chat del tutor y métricas de uso de la empresa.
//
// Garantías (Estatuto de los Trabajadores art. 20.3 y 20 bis, LOPDGDD art. 87-89): transparente y
// proporcionado. No hay grabación de pantalla, teclado ni cámara: solo página, curso, sección, % de lectura,
// tiempo activo y acciones. La persona ve SIEMPRE un aviso con el nombre de quien la sigue y cuando un humano
// le escribe; la empresa puede desactivar el seguimiento en directo; los eventos se guardan 90 días como
// máximo; entran en la exportación y el borrado RGPD (services/privacy.ts). Todo acotado por organizationId.
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityEvent, agentMessage, agentThread, assessmentAttempt, auditLog, certificate, companyConfig, member,
  pointsLedger, roleplaySession, teamDna, teamProfile, user,
} from "../db/schema.js";
import { scopeOf, type CapCtx, type Scope } from "../auth/capabilities.js";
import type { SvcDeps } from "./org.js";

export const ONLINE_WINDOW_MS = 60_000;      // en línea = latido en los últimos 60 s
export const IDLE_AFTER_MS = 90_000;         // en línea pero sin interacción real en 90 s = inactivo
export const RETENTION_DAYS = 90;            // máximo legal que nos fijamos para los eventos
export const STUCK_SECTION_MIN = 12;         // minutos en la misma sección sin avanzar
export const STUCK_FAILS = 2;                // suspensos del mismo test de bloque sin aprobarlo después
export const ROLEPLAY_ABANDON_MIN = 30;      // roleplay abierto y sin cerrar
export const INACTIVE_DAYS = 7;              // sin actividad
export const SESSION_GAP_MS = 30 * 60_000;   // una sesión termina tras 30 min sin actividad
export const WATCH_TTL_MS = 30_000;          // el aviso «te está siguiendo» dura mientras la ficha siga abierta
export const MAX_ACTIVE_SEC = 60;            // un latido nunca declara más de 60 s activos

/* ---------------------------------------------------------------- permisos */

export interface Access { metrics: Scope | null; read: Scope | null; intervene: Scope | null }
export function accessFor(ctx: CapCtx): Access {
  return {
    metrics: scopeOf(ctx, "activity.metrics"),
    read: scopeOf(ctx, "activity.read"),
    intervene: scopeOf(ctx, "activity.intervene"),
  };
}
/**
 * La plataforma aún no tiene equipos (no hay relación responsable -> persona en el esquema), así que el
 * alcance «team» se resuelve como toda la empresa. Se devuelve como aviso a la UI; nunca se inventan equipos.
 */
export function teamResolvedAsOrg(scope: Scope | null): boolean { return scope === "team"; }

/* ---------------------------------------------------------------- entrada del alumno */

const CLIENT_KINDS = [
  "hb", "page", "section", "video", "quiz_start", "quiz_end", "roleplay_start", "roleplay_turn", "roleplay_end", "chat_msg",
] as const;
export const eventSchema = z.object({
  kind: z.enum(CLIENT_KINDS),
  page: z.string().max(80).regex(/^[a-z0-9._\/-]*$/i).optional(),
  source: z.string().max(120).regex(/^[a-z0-9-]+$/i).optional(),
  section: z.number().int().min(0).max(1000).optional(),
  sectionTitle: z.string().max(200).optional(),
  scrollPct: z.number().int().min(0).max(100).optional(),
  activeSec: z.number().int().min(0).max(600).optional(),
  meta: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .refine((m) => Object.keys(m).length <= 12, "demasiados campos").optional(),
});
export const beaconSchema = z.object({ events: z.array(eventSchema).min(1).max(40) });
export type ClientEvent = z.infer<typeof eventSchema>;

export async function recordEvents(deps: SvcDeps, orgId: string, userId: string, events: ClientEvent[]): Promise<void> {
  await deps.db.insert(activityEvent).values(events.map((e) => ({
    id: deps.newId(), organizationId: orgId, userId, kind: e.kind,
    page: e.page ?? null, source: e.source ?? null, section: e.section ?? null,
    sectionTitle: e.sectionTitle ?? null, scrollPct: e.scrollPct ?? null,
    activeSec: Math.min(MAX_ACTIVE_SEC, e.activeSec ?? 0), meta: e.meta ?? null,
  })));
}

/* ---------------------------------------------------------------- reglas puras (con tests) */

export const isOnline = (lastAt: Date | null | undefined, now: Date) => !!lastAt && now.getTime() - lastAt.getTime() <= ONLINE_WINDOW_MS;
export const retentionCutoff = (now: Date, days = RETENTION_DAYS) => new Date(now.getTime() - days * 86_400_000);

const MADRID = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
/** Día natural en España (YYYY-MM-DD): el «hoy» de las métricas es el de la empresa, no el UTC del servidor. */
export const dayKey = (d: Date) => MADRID.format(d);

export interface EvRow {
  kind: string; page: string | null; source: string | null; section: number | null; sectionTitle: string | null;
  scrollPct: number | null; activeSec: number; meta: Record<string, unknown> | null; createdAt: Date;
}
export interface LiveState {
  online: boolean; idle: boolean; lastAt: string;
  page: string | null; source: string | null; section: number | null; sectionTitle: string | null; scrollPct: number | null;
  sectionSinceSec: number | null; // tiempo continuado en la sección actual
  activeSecToday: number;
  lastActions: { kind: string; label: string; at: string }[];
}

const ACTION_LABEL: Record<string, string> = {
  page: "Abrió la página", section: "Pasó de sección", video: "Abrió un vídeo", quiz_start: "Empezó un test",
  quiz_end: "Terminó un test", roleplay_start: "Empezó un roleplay", roleplay_turn: "Respondió en el roleplay",
  roleplay_end: "Terminó un roleplay", chat_msg: "Escribió al tutor",
};
export function actionLabel(e: Pick<EvRow, "kind" | "meta" | "sectionTitle">): string {
  const base = ACTION_LABEL[e.kind] || e.kind;
  const m = e.meta || {};
  if (e.kind === "quiz_end" && typeof m.score === "number") return `${base} · ${m.score}/100${m.passed === true ? " (aprobado)" : m.passed === false ? " (no aprobado)" : ""}`;
  if (e.kind === "video" && typeof m.title === "string") return `${base} · ${m.title}`;
  if (e.kind === "section" && e.sectionTitle) return `${base} · ${e.sectionTitle}`;
  return base;
}

/** Estado en directo a partir de los eventos del alumno (orden cronológico ascendente). */
export function liveState(events: EvRow[], now: Date): LiveState | null {
  const own = events.filter((e) => e.kind !== "nudge" && e.kind !== "notice");
  const last = own[own.length - 1];
  if (!last) return null;
  let cur: EvRow | undefined;
  for (let i = own.length - 1; i >= 0; i--) { if (own[i]!.page) { cur = own[i]; break; } }
  let since: Date | null = null;
  if (cur && cur.section != null) {
    since = cur.createdAt;
    for (let i = own.indexOf(cur); i >= 0; i--) {
      const e = own[i]!;
      if (!e.page) continue;
      if (e.source !== cur.source || e.section !== cur.section) break;
      since = e.createdAt;
    }
  }
  const today = dayKey(now);
  const activeSecToday = own.filter((e) => dayKey(e.createdAt) === today).reduce((a, e) => a + (e.activeSec || 0), 0);
  const recentActive = own.some((e) => (e.activeSec || 0) > 0 && now.getTime() - e.createdAt.getTime() <= IDLE_AFTER_MS)
    || own.some((e) => e.kind !== "hb" && now.getTime() - e.createdAt.getTime() <= IDLE_AFTER_MS);
  const online = isOnline(last.createdAt, now);
  return {
    online, idle: online && !recentActive, lastAt: last.createdAt.toISOString(),
    page: cur?.page ?? null, source: cur?.source ?? null, section: cur?.section ?? null,
    sectionTitle: cur?.sectionTitle ?? null, scrollPct: cur?.scrollPct ?? null,
    sectionSinceSec: since ? Math.max(0, Math.round((now.getTime() - since.getTime()) / 1000)) : null,
    activeSecToday,
    lastActions: own.filter((e) => e.kind !== "hb").slice(-5).reverse()
      .map((e) => ({ kind: e.kind, label: actionLabel(e), at: e.createdAt.toISOString() })),
  };
}

export interface Signal { code: "seccion" | "suspensos" | "roleplay" | "inactivo"; label: string }
export interface SignalInput {
  state: LiveState | null;
  lastSeenAt: Date | null;
  blockAttempts: { source: string; block: number; passed: boolean | null; at: Date }[]; // solo corregidos
  openRoleplays: { createdAt: Date; turns: number }[];
}
/** Señales de atasco: reglas simples y explicables, cada una con su umbral a la vista. */
export function stuckSignals(inp: SignalInput, now: Date): Signal[] {
  const out: Signal[] = [];
  const s = inp.state;
  if (s?.online && s.sectionSinceSec != null && s.sectionSinceSec >= STUCK_SECTION_MIN * 60) {
    out.push({ code: "seccion", label: `${Math.floor(s.sectionSinceSec / 60)} min en la misma sección` });
  }
  const byBlock = new Map<string, { passed: boolean | null; at: Date }[]>();
  for (const a of inp.blockAttempts) {
    const k = `${a.source}#${a.block}`;
    (byBlock.get(k) ?? byBlock.set(k, []).get(k)!).push(a);
  }
  for (const [k, list] of byBlock) {
    list.sort((x, y) => x.at.getTime() - y.at.getTime());
    const lastPass = list.map((x) => x.passed === true).lastIndexOf(true);
    const failsAfter = list.slice(lastPass + 1).filter((x) => x.passed === false).length;
    if (failsAfter >= STUCK_FAILS) out.push({ code: "suspensos", label: `${failsAfter} suspensos en el test del bloque ${Number(k.split("#")[1]) + 1}` });
  }
  const abandoned = inp.openRoleplays.filter((r) => now.getTime() - r.createdAt.getTime() >= ROLEPLAY_ABANDON_MIN * 60_000);
  if (abandoned.length) out.push({ code: "roleplay", label: abandoned.length > 1 ? `${abandoned.length} roleplays sin terminar` : "Roleplay sin terminar" });
  if (inp.lastSeenAt && now.getTime() - inp.lastSeenAt.getTime() >= INACTIVE_DAYS * 86_400_000) {
    out.push({ code: "inactivo", label: `Sin actividad desde hace ${Math.floor((now.getTime() - inp.lastSeenAt.getTime()) / 86_400_000)} días` });
  }
  return out;
}

/** Texto visible de un mensaje del chat: nunca las instrucciones internas que curso.html antepone para la IA. */
export function visibleText(m: { sender: string; content: string; display: string | null }): string | null {
  if (m.display != null) return m.display;
  if (m.sender !== "user") return m.content;
  if (!m.content.startsWith("[")) return m.content;
  const i = m.content.lastIndexOf(".] ");
  const rest = i >= 0 ? m.content.slice(i + 3).trim() : "";
  return rest || null; // null = mensaje interno (síntesis de memoria, evaluación de ejercicio)
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Filas horarias (usuario, hora, s activos, sesiones que empiezan) -> serie diaria de los últimos `days` días. */
export function dailySeries(rows: { userId: string; hour: Date; activeSec: number; sessions: number }[], days: number, now: Date) {
  const out: { day: string; activeMin: number; users: number; sessions: number }[] = [];
  const idx = new Map<string, { active: number; users: Set<string>; sessions: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = dayKey(new Date(now.getTime() - i * 86_400_000));
    if (!idx.has(d)) { idx.set(d, { active: 0, users: new Set(), sessions: 0 }); out.push({ day: d, activeMin: 0, users: 0, sessions: 0 }); }
  }
  for (const r of rows) {
    const b = idx.get(dayKey(r.hour)); if (!b) continue;
    b.active += r.activeSec; b.users.add(r.userId); b.sessions += r.sessions;
  }
  for (const o of out) { const b = idx.get(o.day)!; o.activeMin = Math.round(b.active / 60); o.users = b.users.size; o.sessions = b.sessions; }
  return out;
}

/** Días seguidos con actividad hasta hoy (o hasta ayer si hoy aún no ha entrado). */
export function streakDays(activeDays: Set<string>, now: Date): number {
  let n = 0, i = activeDays.has(dayKey(now)) ? 0 : 1;
  while (activeDays.has(dayKey(new Date(now.getTime() - i * 86_400_000)))) { n++; i++; }
  return n;
}

export interface FunnelInput {
  started: { userId: string; source: string }[];
  blocks: { userId: string; source: string; kind: string; passed: boolean | null; status: string }[];
  certs: { userId: string; source: string }[];
}
/** Embudo por curso: empezado -> algún bloque aprobado -> examen final hecho -> certificado (personas distintas). */
export function completionFunnel(inp: FunnelInput) {
  const per = new Map<string, { started: Set<string>; block: Set<string>; final: Set<string>; cert: Set<string> }>();
  const get = (s: string) => per.get(s) ?? per.set(s, { started: new Set(), block: new Set(), final: new Set(), cert: new Set() }).get(s)!;
  for (const r of inp.started) get(r.source).started.add(r.userId);
  for (const a of inp.blocks) {
    const f = get(a.source); f.started.add(a.userId);
    if (a.kind === "block" && a.passed === true) f.block.add(a.userId);
    if (a.kind === "final" && a.status === "corregido") f.final.add(a.userId);
  }
  for (const c of inp.certs) { const f = get(c.source); f.started.add(c.userId); f.cert.add(c.userId); }
  return [...per.entries()].map(([source, f]) => ({
    source, started: f.started.size, blockPassed: f.block.size, finalTaken: f.final.size, certified: f.cert.size,
  })).sort((a, b) => b.started - a.started);
}

/** Nota media por bloque (solo tests corregidos): dónde se atasca la gente. */
export function blockScores(attempts: { source: string; block: number; score: number | null; passed: boolean | null }[]) {
  const m = new Map<string, { source: string; block: number; scores: number[]; passed: number }>();
  for (const a of attempts) {
    if (a.score == null) continue;
    const k = `${a.source}#${a.block}`;
    const b = m.get(k) ?? m.set(k, { source: a.source, block: a.block, scores: [], passed: 0 }).get(k)!;
    b.scores.push(a.score); if (a.passed) b.passed++;
  }
  return [...m.values()].map((b) => ({
    source: b.source, block: b.block, n: b.scores.length,
    avg: Math.round(b.scores.reduce((x, y) => x + y, 0) / b.scores.length), passRate: Math.round((b.passed / b.scores.length) * 100),
  })).sort((a, b) => a.avg - b.avg);
}

/* ---------------------------------------------------------------- mantenimiento y ajustes */

let lastCleanup = 0;
/** Borra eventos de más de 90 días. Sin cron: se hace de paso, como mucho una vez por hora y proceso. */
export async function cleanupOld(deps: SvcDeps, now = new Date()): Promise<void> {
  if (now.getTime() - lastCleanup < 3_600_000) return;
  lastCleanup = now.getTime();
  await deps.db.delete(activityEvent).where(lt(activityEvent.createdAt, retentionCutoff(now)));
}

export async function liveEnabled(deps: SvcDeps, orgId: string): Promise<boolean> {
  const [row] = await deps.db.select({ on: companyConfig.liveSupervision }).from(companyConfig).where(eq(companyConfig.organizationId, orgId));
  return row ? row.on : true;
}
export async function setLiveEnabled(deps: SvcDeps, orgId: string, on: boolean): Promise<void> {
  await deps.db.insert(companyConfig).values({ organizationId: orgId, liveSupervision: on })
    .onConflictDoUpdate({ target: companyConfig.organizationId, set: { liveSupervision: on, updatedAt: new Date() } });
}

/* ---------------------------------------------------------------- quién está siguiendo a quién */

// ponytail: presencia en memoria del proceso (como util/rateLimit); pasar a Redis si hay más de una instancia.
const watching = new Map<string, Map<string, { name: string; role: string; at: number }>>();
export function watch(orgId: string, learnerId: string, sup: { userId: string; name: string; role: string }, now = Date.now()): void {
  const k = `${orgId}:${learnerId}`;
  const m = watching.get(k) ?? watching.set(k, new Map()).get(k)!;
  m.set(sup.userId, { name: sup.name, role: sup.role, at: now });
}
export function watchersOf(orgId: string, learnerId: string, now = Date.now()): { name: string; role: string }[] {
  const m = watching.get(`${orgId}:${learnerId}`);
  if (!m) return [];
  for (const [id, w] of m) if (now - w.at > WATCH_TTL_MS) m.delete(id);
  return [...m.values()].map((w) => ({ name: w.name, role: w.role }));
}

/* ---------------------------------------------------------------- respuesta al latido del alumno */

export async function inbox(deps: SvcDeps, orgId: string, userId: string) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await deps.db.select().from(activityEvent).where(and(
    eq(activityEvent.organizationId, orgId), eq(activityEvent.userId, userId),
    inArray(activityEvent.kind, ["nudge", "notice"]), gte(activityEvent.createdAt, retentionCutoff(new Date())),
  )).orderBy(asc(activityEvent.createdAt));
  const pending = rows.filter((r) => r.kind === "nudge" && r.createdAt >= since && !(r.meta && r.meta.seenAt));
  for (const p of pending) {
    await deps.db.update(activityEvent).set({ meta: { ...(p.meta || {}), seenAt: new Date().toISOString() } })
      .where(and(eq(activityEvent.id, p.id), eq(activityEvent.organizationId, orgId)));
  }
  const live = await liveEnabled(deps, orgId);
  return {
    live,
    watchers: live ? watchersOf(orgId, userId) : [],
    nudges: pending.map((p) => ({ id: p.id, at: p.createdAt.toISOString(), ...(p.meta || {}) })),
    // El aviso informativo se vuelve a mostrar si ya no queda constancia (retención de 90 días): se reinforma.
    notice: !rows.some((r) => r.kind === "notice"),
  };
}
export async function ackNotice(deps: SvcDeps, orgId: string, userId: string): Promise<void> {
  await deps.db.insert(activityEvent).values({ id: deps.newId(), organizationId: orgId, userId, kind: "notice", meta: { version: 1 } });
}

/* ---------------------------------------------------------------- tablero en directo */

async function lastSeenMap(deps: SvcDeps, orgId: string) {
  const rows = await deps.db.select({ userId: activityEvent.userId, at: sql<Date>`max(${activityEvent.createdAt})` })
    .from(activityEvent).where(and(eq(activityEvent.organizationId, orgId), ne(activityEvent.kind, "nudge"), ne(activityEvent.kind, "notice")))
    .groupBy(activityEvent.userId);
  return new Map(rows.map((r) => [r.userId, r.at ? new Date(r.at) : null]));
}

async function recentEventsByUser(deps: SvcDeps, orgId: string, since: Date, userId?: string) {
  const rows = await deps.db.select({
    userId: activityEvent.userId, kind: activityEvent.kind, page: activityEvent.page, source: activityEvent.source,
    section: activityEvent.section, sectionTitle: activityEvent.sectionTitle, scrollPct: activityEvent.scrollPct,
    activeSec: activityEvent.activeSec, meta: activityEvent.meta, createdAt: activityEvent.createdAt,
  }).from(activityEvent).where(and(
    eq(activityEvent.organizationId, orgId), gte(activityEvent.createdAt, since),
    ...(userId ? [eq(activityEvent.userId, userId)] : []),
  )).orderBy(asc(activityEvent.createdAt));
  const by = new Map<string, EvRow[]>();
  for (const r of rows) (by.get(r.userId) ?? by.set(r.userId, []).get(r.userId)!).push(r);
  return by;
}

async function signalInputs(deps: SvcDeps, orgId: string, now: Date, userId?: string) {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const atts = await deps.db.select({
    userId: assessmentAttempt.userId, source: assessmentAttempt.source, block: assessmentAttempt.block,
    passed: assessmentAttempt.passed, at: assessmentAttempt.startedAt,
  }).from(assessmentAttempt).where(and(
    eq(assessmentAttempt.organizationId, orgId), eq(assessmentAttempt.kind, "block"), eq(assessmentAttempt.status, "corregido"),
    gte(assessmentAttempt.startedAt, since), ...(userId ? [eq(assessmentAttempt.userId, userId)] : []),
  ));
  const rps = await deps.db.select({ userId: roleplaySession.userId, createdAt: roleplaySession.createdAt, transcript: roleplaySession.transcript })
    .from(roleplaySession).where(and(
      eq(roleplaySession.organizationId, orgId), eq(roleplaySession.status, "activo"),
      gte(roleplaySession.createdAt, new Date(now.getTime() - 7 * 86_400_000)), ...(userId ? [eq(roleplaySession.userId, userId)] : []),
    ));
  const a = new Map<string, SignalInput["blockAttempts"]>();
  for (const r of atts) (a.get(r.userId) ?? a.set(r.userId, []).get(r.userId)!).push({ source: r.source, block: r.block, passed: r.passed, at: r.at });
  const p = new Map<string, SignalInput["openRoleplays"]>();
  for (const r of rps) (p.get(r.userId) ?? p.set(r.userId, []).get(r.userId)!).push({ createdAt: r.createdAt, turns: (r.transcript || []).length });
  return { attempts: a, roleplays: p };
}

export async function board(deps: SvcDeps, orgId: string, now = new Date()) {
  const [members, seen, events, sig] = await Promise.all([
    deps.db.select({ userId: member.userId, role: member.orgRole, name: user.name })
      .from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, orgId)),
    lastSeenMap(deps, orgId),
    recentEventsByUser(deps, orgId, new Date(now.getTime() - 2 * 3_600_000)),
    signalInputs(deps, orgId, now),
  ]);
  const people = members.map((m) => {
    const state = liveState(events.get(m.userId) ?? [], now);
    const lastSeenAt = seen.get(m.userId) ?? null;
    return {
      userId: m.userId, name: m.name, role: m.role, lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null, state,
      signals: stuckSignals({ state, lastSeenAt, blockAttempts: sig.attempts.get(m.userId) ?? [], openRoleplays: sig.roleplays.get(m.userId) ?? [] }, now),
    };
  });
  people.sort((a, b) => Number(!!b.state?.online) - Number(!!a.state?.online) || b.signals.length - a.signals.length
    || String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  return { now: now.toISOString(), onlineWindowSec: ONLINE_WINDOW_MS / 1000, people };
}

/* ---------------------------------------------------------------- ficha de una persona */

export async function isMember(deps: SvcDeps, orgId: string, userId: string): Promise<{ name: string; role: string } | null> {
  const [m] = await deps.db.select({ name: user.name, role: member.orgRole }).from(member).innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  return m ?? null;
}

export async function transcript(deps: SvcDeps, orgId: string, userId: string, maxThreads = 6, maxMsgs = 80) {
  const threads = await deps.db.select().from(agentThread)
    .where(and(eq(agentThread.organizationId, orgId), eq(agentThread.userId, userId)))
    .orderBy(desc(agentThread.createdAt)).limit(maxThreads);
  const out = [];
  for (const t of threads) {
    const msgs = await deps.db.select().from(agentMessage)
      .where(and(eq(agentMessage.organizationId, orgId), eq(agentMessage.threadId, t.id)))
      .orderBy(desc(agentMessage.createdAt)).limit(maxMsgs);
    const shown = msgs.reverse().map((m) => ({
      id: m.id, sender: m.sender, text: visibleText(m), authorName: m.authorName, authorRole: m.authorRole, at: m.createdAt.toISOString(),
    })).filter((m) => m.text != null);
    out.push({ threadId: t.id, source: t.source, createdAt: t.createdAt.toISOString(), lastAt: shown.length ? shown[shown.length - 1]!.at : t.createdAt.toISOString(), messages: shown });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

async function activeDaysAndTime(deps: SvcDeps, orgId: string, userId: string, now: Date) {
  const rows = await hourly(deps, orgId, new Date(now.getTime() - 30 * 86_400_000), userId);
  const series = dailySeries(rows, 30, now);
  const days = new Set(series.filter((d) => d.activeMin > 0 || d.sessions > 0).map((d) => d.day));
  const sum = (n: number) => series.slice(-n).reduce((a, d) => a + d.activeMin, 0);
  return { series, streak: streakDays(days, now), activeMinToday: sum(1), activeMin7d: sum(7), activeMin30d: sum(30), sessions7d: series.slice(-7).reduce((a, d) => a + d.sessions, 0) };
}

export async function personDetail(deps: SvcDeps, orgId: string, userId: string, titles: Record<string, string>, opts: { live: boolean }, now = new Date()) {
  const who = await isMember(deps, orgId, userId);
  if (!who) return null;
  const [events, seen, sig, atts, certs, rps, pts, dna, prof, time, chats] = await Promise.all([
    recentEventsByUser(deps, orgId, new Date(now.getTime() - 7 * 86_400_000), userId),
    lastSeenMap(deps, orgId),
    signalInputs(deps, orgId, now, userId),
    deps.db.select({ source: assessmentAttempt.source, kind: assessmentAttempt.kind, block: assessmentAttempt.block, score: assessmentAttempt.score, passed: assessmentAttempt.passed, status: assessmentAttempt.status, startedAt: assessmentAttempt.startedAt })
      .from(assessmentAttempt).where(and(eq(assessmentAttempt.organizationId, orgId), eq(assessmentAttempt.userId, userId))).orderBy(asc(assessmentAttempt.startedAt)),
    deps.db.select({ title: certificate.title, code: certificate.code, evidence: certificate.evidence, issuedAt: certificate.issuedAt })
      .from(certificate).where(and(eq(certificate.organizationId, orgId), eq(certificate.userId, userId))),
    deps.db.select({ topic: roleplaySession.topic, persona: roleplaySession.persona, status: roleplaySession.status, score: roleplaySession.score, source: roleplaySession.source, createdAt: roleplaySession.createdAt, closedAt: roleplaySession.closedAt })
      .from(roleplaySession).where(and(eq(roleplaySession.organizationId, orgId), eq(roleplaySession.userId, userId))).orderBy(desc(roleplaySession.createdAt)).limit(20),
    deps.db.select({ total: sql<number>`coalesce(sum(${pointsLedger.points}),0)::int` }).from(pointsLedger)
      .where(and(eq(pointsLedger.organizationId, orgId), eq(pointsLedger.userId, userId))),
    deps.db.select({ archetype: teamDna.archetype, primary: teamDna.primary }).from(teamDna).where(and(eq(teamDna.organizationId, orgId), eq(teamDna.userId, userId))),
    deps.db.select({ brief: teamProfile.brief, completedAt: teamProfile.completedAt }).from(teamProfile).where(and(eq(teamProfile.organizationId, orgId), eq(teamProfile.userId, userId))),
    activeDaysAndTime(deps, orgId, userId, now),
    transcript(deps, orgId, userId),
  ]);
  const evs = events.get(userId) ?? [];
  const state = liveState(evs, now);
  const lastSeenAt = seen.get(userId) ?? null;
  // Progreso por curso: tests de bloque (mejor nota e intentos), examen final, certificado.
  const courses = new Map<string, { source: string; title: string; blocks: Map<number, { best: number | null; attempts: number; passed: boolean }>; finals: { score: number | null; passed: boolean | null; at: string }[]; certificate: string | null }>();
  const course = (s: string) => courses.get(s) ?? courses.set(s, { source: s, title: titles[s] || s, blocks: new Map(), finals: [], certificate: null }).get(s)!;
  for (const a of atts) {
    const c = course(a.source);
    if (a.kind === "final") { if (a.status === "corregido") c.finals.push({ score: a.score, passed: a.passed, at: a.startedAt.toISOString() }); continue; }
    const b = c.blocks.get(a.block) ?? { best: null, attempts: 0, passed: false };
    if (a.status === "corregido") { b.attempts++; if (a.score != null) b.best = Math.max(b.best ?? 0, a.score); if (a.passed) b.passed = true; }
    c.blocks.set(a.block, b);
  }
  for (const ct of certs) { const s = (ct.evidence as { source?: string } | null)?.source; if (s) course(s).certificate = ct.code; }
  for (const e of evs) if (e.source && titles[e.source]) course(e.source);
  return {
    person: { userId, name: who.name, role: who.role },
    lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    live: opts.live ? state : null,
    signals: stuckSignals({ state, lastSeenAt, blockAttempts: sig.attempts.get(userId) ?? [], openRoleplays: sig.roleplays.get(userId) ?? [] }, now),
    time,
    points: pts[0]?.total ?? 0,
    courses: [...courses.values()].map((c) => ({
      source: c.source, title: c.title, certificate: c.certificate, finals: c.finals,
      blocks: [...c.blocks.entries()].sort((a, b) => a[0] - b[0]).map(([i, b]) => ({ block: i, ...b })),
    })),
    certificates: certs.map((c) => ({ title: c.title, code: c.code, issuedAt: c.issuedAt.toISOString() })),
    roleplays: rps.map((r) => ({ topic: r.topic || r.persona, status: r.status, score: r.score, source: r.source, createdAt: r.createdAt.toISOString(), closedAt: r.closedAt ? r.closedAt.toISOString() : null })),
    profile: dna[0] || prof[0]?.completedAt ? {
      archetype: dna[0]?.archetype ?? null,
      brief: prof[0]?.completedAt && prof[0].brief ? prof[0].brief.slice(0, 400) : null,
    } : null,
    timeline: evs.filter((e) => e.kind !== "hb" && e.kind !== "notice").slice(-60).reverse().map((e) => ({
      kind: e.kind, label: e.kind === "nudge" ? `Aviso de ${String((e.meta || {}).authorName || "un responsable")}` : actionLabel(e),
      source: e.source, sectionTitle: e.sectionTitle, at: e.createdAt.toISOString(),
    })),
    chats,
  };
}

/* ---------------------------------------------------------------- intervención humana */

export const ROLE_LABEL: Record<string, string> = {
  coach: "Coach", team_leader: "Team Leader", inspirador: "Inspirador", admin: "Admin", direccion: "Dirección", superadmin: "Soporte SkillUp",
};
export const interveneSchema = z.object({ text: z.string().trim().min(1).max(1500), threadId: z.string().max(64).optional() });

export async function intervene(deps: SvcDeps, a: {
  orgId: string; learnerId: string; author: { userId: string; name: string; role: string }; text: string; threadId?: string;
}) {
  let thread: { id: string; source: string | null } | undefined;
  if (a.threadId) {
    [thread] = await deps.db.select({ id: agentThread.id, source: agentThread.source }).from(agentThread)
      .where(and(eq(agentThread.id, a.threadId), eq(agentThread.organizationId, a.orgId), eq(agentThread.userId, a.learnerId)));
    if (!thread) throw new Error("esa conversación no es de esta persona");
  } else {
    [thread] = await deps.db.select({ id: agentThread.id, source: agentThread.source }).from(agentThread)
      .where(and(eq(agentThread.organizationId, a.orgId), eq(agentThread.userId, a.learnerId)))
      .orderBy(desc(agentThread.createdAt)).limit(1);
  }
  const authorRole = ROLE_LABEL[a.author.role] || a.author.role;
  let messageId: string | null = null;
  if (thread) {
    messageId = deps.newId();
    await deps.db.insert(agentMessage).values({
      id: messageId, organizationId: a.orgId, threadId: thread.id, sender: "coach", content: a.text, display: a.text,
      authorId: a.author.userId, authorName: a.author.name, authorRole,
    });
  }
  await deps.db.insert(activityEvent).values({
    id: deps.newId(), organizationId: a.orgId, userId: a.learnerId, kind: "nudge", source: thread?.source ?? null,
    meta: { text: a.text, authorName: a.author.name, authorRole, threadId: thread?.id ?? null, messageId },
  });
  await deps.db.insert(auditLog).values({
    id: deps.newId(), organizationId: a.orgId, userId: a.author.userId, action: "supervision.intervene",
    meta: { learnerId: a.learnerId, threadId: thread?.id ?? null, messageId, chars: a.text.length },
  });
  return { threadId: thread?.id ?? null, messageId, source: thread?.source ?? null };
}

/** Mensajes humanos nuevos en un hilo del propio alumno (su chat los consulta mientras está abierto). */
export async function humanMessagesSince(deps: SvcDeps, orgId: string, userId: string, threadId: string, after: Date) {
  const [t] = await deps.db.select({ id: agentThread.id }).from(agentThread)
    .where(and(eq(agentThread.id, threadId), eq(agentThread.organizationId, orgId), eq(agentThread.userId, userId)));
  if (!t) return [];
  const rows = await deps.db.select().from(agentMessage).where(and(
    eq(agentMessage.organizationId, orgId), eq(agentMessage.threadId, threadId), eq(agentMessage.sender, "coach"), gte(agentMessage.createdAt, after),
  )).orderBy(asc(agentMessage.createdAt));
  return rows.map((m) => ({ id: m.id, text: m.content, authorName: m.authorName, authorRole: m.authorRole, at: m.createdAt.toISOString() }));
}

/* ---------------------------------------------------------------- métricas de la empresa */

/** Por usuario y hora: segundos activos, eventos y sesiones que empiezan (hueco > 30 min). */
async function hourly(deps: SvcDeps, orgId: string, since: Date, userId?: string) {
  const res = await deps.db.execute(sql`
    select user_id, date_trunc('hour', created_at) as hour, sum(active_sec)::int as active_sec,
           count(*) filter (where gap is null or gap > ${SESSION_GAP_MS / 1000} * interval '1 second')::int as sessions
    from (
      select user_id, created_at, active_sec,
             created_at - lag(created_at) over (partition by user_id order by created_at) as gap
      from activity_event
      where organization_id = ${orgId} and kind not in ('nudge', 'notice') and created_at >= ${since}
        ${userId ? sql`and user_id = ${userId}` : sql``}
    ) t
    group by 1, 2`);
  return (res as unknown as { user_id: string; hour: Date | string; active_sec: number; sessions: number }[])
    .map((r) => ({ userId: r.user_id, hour: new Date(r.hour), activeSec: Number(r.active_sec) || 0, sessions: Number(r.sessions) || 0 }));
}

export async function orgMetrics(deps: SvcDeps, orgId: string, titles: Record<string, string>, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [members, rows, distinct, started, atts, certs, rps, b] = await Promise.all([
    deps.db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, orgId)),
    hourly(deps, orgId, since),
    deps.db.execute(sql`
      select count(distinct user_id) filter (where created_at >= ${new Date(now.getTime() - 86_400_000)})::int as dau,
             count(distinct user_id) filter (where created_at >= ${new Date(now.getTime() - 7 * 86_400_000)})::int as wau,
             count(distinct user_id) filter (where created_at >= ${new Date(now.getTime() - 30 * 86_400_000)})::int as mau
      from activity_event where organization_id = ${orgId} and kind not in ('nudge', 'notice')
        and created_at >= ${new Date(now.getTime() - 30 * 86_400_000)}`),
    deps.db.selectDistinct({ userId: activityEvent.userId, source: activityEvent.source }).from(activityEvent)
      .where(and(eq(activityEvent.organizationId, orgId), sql`${activityEvent.source} is not null`, ne(activityEvent.kind, "nudge"))),
    deps.db.select({ userId: assessmentAttempt.userId, source: assessmentAttempt.source, kind: assessmentAttempt.kind, block: assessmentAttempt.block, score: assessmentAttempt.score, passed: assessmentAttempt.passed, status: assessmentAttempt.status, startedAt: assessmentAttempt.startedAt })
      .from(assessmentAttempt).where(eq(assessmentAttempt.organizationId, orgId)),
    deps.db.select({ userId: certificate.userId, evidence: certificate.evidence, issuedAt: certificate.issuedAt }).from(certificate).where(eq(certificate.organizationId, orgId)),
    deps.db.select({ status: roleplaySession.status, score: roleplaySession.score, createdAt: roleplaySession.createdAt })
      .from(roleplaySession).where(and(eq(roleplaySession.organizationId, orgId), gte(roleplaySession.createdAt, since))),
    board(deps, orgId, now),
  ]);
  const dist = (distinct as unknown as { dau: number; wau: number; mau: number }[])[0] ?? { dau: 0, wau: 0, mau: 0 };
  const series = dailySeries(rows, days, now);
  const courseCerts = certs.map((c) => ({ userId: c.userId, source: String((c.evidence as { source?: string } | null)?.source || ""), issuedAt: c.issuedAt })).filter((c) => c.source);
  // Tiempo hasta certificarse: desde el primer test del curso hasta el certificado (días, mediana).
  const firstTest = new Map<string, number>();
  for (const a of atts) { const k = `${a.userId}#${a.source}`; const t = a.startedAt.getTime(); if (!firstTest.has(k) || t < firstTest.get(k)!) firstTest.set(k, t); }
  const ttc = courseCerts.map((c) => { const f = firstTest.get(`${c.userId}#${c.source}`); return f ? (c.issuedAt.getTime() - f) / 86_400_000 : null; }).filter((x): x is number => x != null && x >= 0);
  const closed = rps.filter((r) => r.status === "cerrado"), scored = closed.filter((r) => r.score != null);
  const title = (s: string) => titles[s] || s;
  return {
    days, members: members.length,
    active: { dau: dist.dau, wau: dist.wau, mau: dist.mau },
    totals: {
      activeMin: series.reduce((a, d) => a + d.activeMin, 0), sessions: series.reduce((a, d) => a + d.sessions, 0),
      onlineNow: b.people.filter((p) => p.state?.online).length,
    },
    series,
    funnel: completionFunnel({ started: started.filter((s) => !!s.source && !!titles[s.source!]) as { userId: string; source: string }[], blocks: atts, certs: courseCerts })
      .map((f) => ({ ...f, title: title(f.source) })),
    blockScores: blockScores(atts.filter((a) => a.kind === "block" && a.status === "corregido")).map((x) => ({ ...x, title: title(x.source) })),
    timeToCertifyDays: { median: ttc.length ? Math.round(median(ttc)! * 10) / 10 : null, n: ttc.length },
    roleplays: {
      started: rps.length, closed: closed.length, abandoned: rps.filter((r) => r.status !== "cerrado" && now.getTime() - r.createdAt.getTime() >= ROLEPLAY_ABANDON_MIN * 60_000).length,
      avgScore: scored.length ? Math.round((scored.reduce((a, r) => a + (r.score || 0), 0) / scored.length) * 10) / 10 : null, scoredN: scored.length,
    },
    struggling: b.people.filter((p) => p.signals.length).slice(0, 10).map((p) => ({ userId: p.userId, name: p.name, signals: p.signals })),
  };
}

/* ---------------------------------------------------------------- RGPD */

export async function exportActivity(deps: SvcDeps, orgId: string, userId: string) {
  return deps.db.select().from(activityEvent).where(and(eq(activityEvent.organizationId, orgId), eq(activityEvent.userId, userId)));
}
export async function eraseActivity(deps: SvcDeps, orgId: string, userId: string): Promise<void> {
  await deps.db.delete(activityEvent).where(and(eq(activityEvent.organizationId, orgId), eq(activityEvent.userId, userId)));
}
