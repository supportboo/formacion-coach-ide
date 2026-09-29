// Feedback (1.4.0): valoración de cada respuesta de la IA y sugerencias de cualquier rol.
// - Cualquier persona: valora respuestas (una por respuesta, se puede cambiar o quitar), envía sugerencias y ve las suyas.
// - Admin / dirección de la empresa: ve (solo lectura) lo que reporta su gente.
// - Superadmin: todas las empresas, cambia el estado, añade términos al glosario y pide el resumen con IA.
// Al resolverse, quien lo envió ve el aviso la próxima vez que entra (userSeenAt).
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { agentMessage, agentThread, feedback, organization } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { learnTerm } from "./glossary.js";

export const REASONS = ["dato_incorrecto", "fuera_de_tema", "no_lo_entiendo", "voz", "palabra_mal_escrita", "otro"] as const;
export const REASON_LABEL: Record<(typeof REASONS)[number], string> = {
  dato_incorrecto: "Dato incorrecto", fuera_de_tema: "Fuera de tema", no_lo_entiendo: "No lo entiendo",
  voz: "Suena mal o falla la voz", palabra_mal_escrita: "Palabra mal escrita", otro: "Otro",
};
export const TYPES = ["sugerencia", "error", "contenido", "otro"] as const;
export const STATUSES = ["nuevo", "en_revision", "resuelto", "descartado"] as const;

const short = (n: number) => z.string().trim().max(n).optional();

export const rateSchema = z.object({
  messageId: z.string().max(64).optional(),
  ref: z.string().max(200).optional(), // sin id de mensaje (roleplay, evaluación…): referencia estable de la página
  rating: z.enum(["up", "down"]).nullable(), // null = quitar el voto
  reasons: z.array(z.enum(REASONS)).max(6).default([]),
  comment: short(1000),
  answer: short(6000),
  prompt: short(4000),
  page: short(80), course: short(120), block: short(200), agent: short(80),
}).refine((d) => !!(d.messageId || d.ref), { message: "falta la respuesta a valorar" });

export const generalSchema = z.object({
  type: z.enum(TYPES),
  text: z.string().trim().min(3).max(4000),
  page: short(200),
});

export const statusSchema = z.object({ status: z.enum(STATUSES), note: short(2000) });
export const glossarySchema = z.object({ wrong: z.string().trim().min(2).max(60), right: z.string().trim().min(2).max(60) })
  .refine((d) => d.wrong !== d.right, { message: "las dos formas son iguales" });

export const filterSchema = z.object({
  orgId: short(64), kind: z.enum(["rating", "general"]).optional(), rating: z.enum(["up", "down"]).optional(),
  type: z.enum(TYPES).optional(), reason: z.enum(REASONS).optional(), status: z.enum(STATUSES).optional(),
  page: short(80), course: short(120),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Filters = z.infer<typeof filterSchema>;

/** Clave del voto: una por persona y respuesta. Con id de mensaje del chat manda el id; si no, la referencia de la página. */
export function ratingKey(d: { messageId?: string; ref?: string }): string {
  return d.messageId ? `msg:${d.messageId}` : `ref:${d.ref}`;
}

/** Quién ve la bandeja: superadmin todo (y gestiona), admin/dirección su empresa en solo lectura, el resto solo lo suyo. */
export function inboxAccess(ctx: { role: string; platformAdmin: boolean }): { scope: "global" | "org" | "self"; manage: boolean } {
  if (ctx.platformAdmin) return { scope: "global", manage: true };
  if (ctx.role === "admin" || ctx.role === "direccion") return { scope: "org", manage: false };
  return { scope: "self", manage: false };
}

export interface Actor { orgId: string; userId: string; role: string }

export async function rate(deps: SvcDeps, a: Actor, input: z.infer<typeof rateSchema>, userAgent?: string) {
  const key = ratingKey(input);
  if (input.rating === null) {
    await deps.db.delete(feedback).where(and(eq(feedback.organizationId, a.orgId), eq(feedback.userId, a.userId), eq(feedback.targetKey, key)));
    return { rating: null };
  }
  let answer = input.answer ?? null, prompt = input.prompt ?? null;
  if (input.messageId) {
    // Solo respuestas de la IA en hilos propios: nadie valora (ni lee) mensajes de otra persona.
    const [m] = await deps.db.select({ content: agentMessage.content, sender: agentMessage.sender, threadId: agentMessage.threadId, createdAt: agentMessage.createdAt })
      .from(agentMessage).innerJoin(agentThread, eq(agentThread.id, agentMessage.threadId))
      .where(and(eq(agentMessage.id, input.messageId), eq(agentMessage.organizationId, a.orgId), eq(agentThread.userId, a.userId)));
    if (!m || m.sender !== "agent") throw new Error("respuesta no encontrada");
    answer = m.content;
    // Mensaje del alumno justo antes (comparado en JS: los timestamp sin zona no se pasan como parámetro Date).
    const users = await deps.db.select({ content: agentMessage.content, display: agentMessage.display, createdAt: agentMessage.createdAt }).from(agentMessage)
      .where(and(eq(agentMessage.threadId, m.threadId), eq(agentMessage.organizationId, a.orgId), eq(agentMessage.sender, "user")))
      .orderBy(desc(agentMessage.createdAt)).limit(200);
    const prev = users.find((u) => u.createdAt.getTime() <= m.createdAt.getTime());
    // Lo que el alumno escribió (display) y no las instrucciones internas que la página antepone.
    if (prev) prompt = (prev.display ?? prompt ?? prev.content).slice(0, 4000);
  }
  const reasons = input.rating === "down" ? input.reasons : [];
  const comment = input.rating === "down" ? input.comment ?? null : null;
  const values = {
    rating: input.rating, reasons, comment, answerText: answer?.slice(0, 6000) ?? null, promptText: prompt,
    page: input.page ?? null, course: input.course ?? null, block: input.block ?? null, agent: input.agent ?? null,
    role: a.role, userAgent: userAgent?.slice(0, 300) ?? null, messageId: input.messageId ?? null, updatedAt: new Date(),
  };
  await deps.db.insert(feedback).values({ id: deps.newId(), organizationId: a.orgId, userId: a.userId, kind: "rating", targetKey: key, ...values })
    .onConflictDoUpdate({ target: [feedback.organizationId, feedback.userId, feedback.targetKey], set: values });
  return { rating: input.rating, reasons };
}

export async function submitGeneral(deps: SvcDeps, a: Actor, input: z.infer<typeof generalSchema>, userAgent?: string) {
  const id = deps.newId();
  await deps.db.insert(feedback).values({
    id, organizationId: a.orgId, userId: a.userId, kind: "general", type: input.type, comment: input.text,
    page: input.page ?? null, role: a.role, userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return { id };
}

/** Lo que ha enviado la propia persona (sugerencias y pulgares abajo) con su estado. */
export async function mine(deps: SvcDeps, a: Actor) {
  const rows = await deps.db.select().from(feedback)
    .where(and(eq(feedback.organizationId, a.orgId), eq(feedback.userId, a.userId)))
    .orderBy(desc(feedback.createdAt)).limit(40);
  return rows.filter((r) => !(r.kind === "rating" && r.rating === "up")).slice(0, 20).map(publicRow);
}

/** Avisos «se ha resuelto» pendientes de ver; se marcan como vistos al leerlos. */
export async function notices(deps: SvcDeps, a: Actor) {
  const rows = await deps.db.select().from(feedback).where(and(
    eq(feedback.organizationId, a.orgId), eq(feedback.userId, a.userId), eq(feedback.status, "resuelto"), isNull(feedback.userSeenAt),
  )).orderBy(asc(feedback.resolvedAt)).limit(10);
  if (rows.length) {
    await deps.db.update(feedback).set({ userSeenAt: new Date() })
      .where(and(eq(feedback.organizationId, a.orgId), eq(feedback.userId, a.userId), inArray(feedback.id, rows.map((r) => r.id))));
  }
  return rows.map((r) => ({ id: r.id, kind: r.kind, type: r.type, text: (r.comment || r.answerText || "").slice(0, 140), note: r.resolutionNote || "" }));
}

function publicRow(r: typeof feedback.$inferSelect) {
  return {
    id: r.id, kind: r.kind, type: r.type, rating: r.rating, reasons: r.reasons, comment: r.comment, page: r.page, course: r.course,
    block: r.block, agent: r.agent, status: r.status, resolutionNote: r.resolutionNote, createdAt: r.createdAt, resolvedAt: r.resolvedAt,
  };
}

function conditions(f: Filters, orgId: string | null): SQL[] {
  const c: SQL[] = [];
  if (orgId) c.push(eq(feedback.organizationId, orgId));
  if (f.kind) c.push(eq(feedback.kind, f.kind));
  if (f.rating) c.push(eq(feedback.rating, f.rating));
  if (f.type) c.push(eq(feedback.type, f.type));
  if (f.status) c.push(eq(feedback.status, f.status));
  if (f.page) c.push(eq(feedback.page, f.page));
  if (f.course) c.push(eq(feedback.course, f.course));
  if (f.reason) c.push(sql`${feedback.reasons} @> ${JSON.stringify([f.reason])}::jsonb`);
  if (f.from) c.push(gte(feedback.createdAt, new Date(f.from + "T00:00:00Z")));
  if (f.to) c.push(lte(feedback.createdAt, new Date(f.to + "T23:59:59Z")));
  return c;
}

export type Row = typeof feedback.$inferSelect & { orgName: string | null };

// ponytail: agregados en memoria sobre como mucho 5.000 filas filtradas; pasar a GROUP BY en SQL si se queda corto.
const ROW_CAP = 5000;

/** Bandeja: filas filtradas (orgId null = todas las empresas) + agregados. Nunca datos inventados: sin votos, sin %. */
export async function list(deps: SvcDeps, f: Filters, orgId: string | null) {
  const rows: Row[] = await deps.db.select({ f: feedback, orgName: organization.name }).from(feedback)
    .leftJoin(organization, eq(organization.id, feedback.organizationId))
    .where(and(...conditions(f, orgId))).orderBy(desc(feedback.createdAt)).limit(ROW_CAP)
    .then((rs) => rs.map((r) => ({ ...r.f, orgName: r.orgName })));
  const items = (f.rating === "up" ? rows : rows.filter((r) => !(r.kind === "rating" && r.rating === "up"))).slice(0, 300);
  return { items, stats: aggregate(rows), capped: rows.length >= ROW_CAP };
}

interface Bucket { key: string; up: number; down: number; pct: number | null }
const pct = (up: number, down: number) => (up + down ? Math.round((up / (up + down)) * 100) : null);
function weekOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // lunes
  return x.toISOString().slice(0, 10);
}

/** Satisfacción (% de pulgares arriba) por agente, curso, empresa y semana; motivos más repetidos; bloques con más quejas. */
export function aggregate(rows: Array<Pick<Row, "kind" | "rating" | "reasons" | "agent" | "course" | "block" | "orgName" | "organizationId" | "type" | "status" | "createdAt">>) {
  const ratings = rows.filter((r) => r.kind === "rating" && (r.rating === "up" || r.rating === "down"));
  const by = (key: (r: (typeof ratings)[number]) => string | null | undefined): Bucket[] => {
    const m = new Map<string, { up: number; down: number }>();
    for (const r of ratings) {
      const k = key(r); if (!k) continue;
      const b = m.get(k) ?? { up: 0, down: 0 };
      if (r.rating === "up") b.up++; else b.down++;
      m.set(k, b);
    }
    return [...m.entries()].map(([k, b]) => ({ key: k, ...b, pct: pct(b.up, b.down) })).sort((a, b) => (b.up + b.down) - (a.up + a.down));
  };
  const up = ratings.filter((r) => r.rating === "up").length, down = ratings.length - up;
  const reasons = new Map<string, number>();
  for (const r of ratings) if (r.rating === "down") for (const x of r.reasons || []) reasons.set(x, (reasons.get(x) ?? 0) + 1);
  const blocks = new Map<string, { course: string; block: string; down: number; total: number }>();
  for (const r of ratings) {
    if (!r.course) continue;
    const k = r.course + "\u0000" + (r.block || "");
    const b = blocks.get(k) ?? { course: r.course, block: r.block || "", down: 0, total: 0 };
    b.total++; if (r.rating === "down") b.down++;
    blocks.set(k, b);
  }
  const general = rows.filter((r) => r.kind === "general");
  const count = (xs: typeof rows, f: (r: (typeof rows)[number]) => string | null) => xs.reduce<Record<string, number>>((a, r) => { const k = f(r); if (k) a[k] = (a[k] ?? 0) + 1; return a; }, {});
  return {
    ratings: { total: ratings.length, up, down, pct: pct(up, down) },
    byAgent: by((r) => r.agent),
    byCourse: by((r) => r.course),
    byOrg: by((r) => r.orgName || r.organizationId),
    overTime: by((r) => weekOf(new Date(r.createdAt))).sort((a, b) => a.key.localeCompare(b.key)),
    topReasons: [...reasons.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    worstBlocks: [...blocks.values()].filter((b) => b.down > 0).sort((a, b) => b.down - a.down || b.total - a.total).slice(0, 10),
    general: { total: general.length, byType: count(general, (r) => r.type), byStatus: count(rows.filter((r) => r.kind === "general" || r.rating === "down"), (r) => r.status) },
  };
}

export async function getItem(deps: SvcDeps, id: string) {
  const [r] = await deps.db.select().from(feedback).where(eq(feedback.id, id));
  return r ?? null;
}

export async function setStatus(deps: SvcDeps, id: string, status: (typeof STATUSES)[number], note: string | undefined, by: { userId: string; name: string }) {
  const done = status === "resuelto" || status === "descartado";
  await deps.db.update(feedback).set({
    status, resolutionNote: note ?? null, resolverId: by.userId, resolverName: by.name, updatedAt: new Date(),
    resolvedAt: done ? new Date() : null, userSeenAt: null, // un nuevo «resuelto» se vuelve a avisar
  }).where(eq(feedback.id, id));
}

/** «Palabra mal escrita» → glosario de la empresa del reporte (el mismo que aprende del chat) y se da por resuelto. */
export async function addToGlossary(deps: SvcDeps, id: string, t: z.infer<typeof glossarySchema>, by: { userId: string; name: string }) {
  const item = await getItem(deps, id);
  if (!item) throw new Error("no encontrado");
  const ok = await learnTerm(deps.db, deps.newId, item.organizationId, by.userId, t);
  if (!ok) throw new Error("término no válido");
  await setStatus(deps, id, "resuelto", `Añadido al glosario: «${t.wrong}» se escribe «${t.right}».`, by);
  return { ok: true };
}

/* ------------------------------------------------------------ resumen con IA (modelo rápido, caché 1 h) */
const SUMMARY_TTL = 3_600_000;
const summaryCache = new Map<string, { at: number; text: string; basis: number }>();

export function summaryFacts(rows: Row[]): string {
  return rows.slice(0, 150).map((r) => {
    const where = [r.orgName, r.course, r.block, r.agent, r.page].filter(Boolean).join(" · ");
    if (r.kind === "general") return `- Sugerencia (${r.type}) [${where}]: ${String(r.comment || "").slice(0, 300)}`;
    const why = (r.reasons || []).map((x) => REASON_LABEL[x as keyof typeof REASON_LABEL] || x).join(", ");
    return `- Respuesta mal valorada [${where}] motivos: ${why || "sin motivo"}${r.comment ? `; comentario: ${r.comment.slice(0, 200)}` : ""}; respuesta: ${String(r.answerText || "").slice(0, 200)}`;
  }).join("\n");
}

export async function summarize(deps: SvcDeps, llm: Llm, model: string, orgId: string | null, f: Filters, refresh: boolean) {
  const key = (orgId || "all") + JSON.stringify(f);
  const hit = summaryCache.get(key);
  if (!refresh && hit && Date.now() - hit.at < SUMMARY_TTL) return { text: hit.text, basis: hit.basis, cached: true };
  const { items } = await list(deps, f, orgId);
  const real = items.filter((r) => r.status !== "descartado");
  if (!real.length) return { text: null, basis: 0, cached: false }; // sin reportes no hay resumen (nunca inventado)
  const text = await llm.generate({
    system: "Eres analista de calidad de una plataforma de formación con IA. Resume en español de España, en texto plano y sin símbolos de markdown, los problemas que se repiten en los reportes reales que te paso, agrupados por tema, con cuántos reportes los respaldan, y una propuesta concreta de mejora para cada uno. Máximo 8 puntos, del más frecuente al menos. Usa SOLO lo que dicen los reportes; si hay pocos, dilo.",
    messages: [{ role: "user", content: summaryFacts(real) }], model, maxTokens: 700, orgId, kind: "feedback_summary",
  });
  summaryCache.set(key, { at: Date.now(), text, basis: real.length });
  return { text, basis: real.length, cached: false };
}
