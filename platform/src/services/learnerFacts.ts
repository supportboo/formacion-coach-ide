// Ficha viva del alumno (1.12.0): lo que sabemos de él para adaptar su formación, cada dato con fuente, evidencia y
// estado. Sustituye como fuente principal a la síntesis suelta y a las notas dispersas (revisión externa del 28-09).
// Reglas fijas en código, no en el prompt: solo lo que el alumno dijo o hizo; la evidencia es una cita literal de su
// texto o el dato se descarta; nada de rasgos psicológicos; «confirmado» solo lo pone el propio alumno.
// PRIVADA del alumno: no se enseña a responsables ni entra en métricas de empresa.
import { and, desc, eq } from "drizzle-orm";
import { learnerFact } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";
import { firstJson } from "./aiContent.js";

export const LAYERS = ["contexto", "objetivo", "caso", "competencia", "preferencia", "estrategia", "aplicacion", "ensenanza"] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_LABEL: Record<Layer, string> = {
  contexto: "Tu trabajo", objetivo: "Tus objetivos", caso: "Casos que tienes entre manos", competencia: "Lo que ya dominas y lo que practicas",
  preferencia: "Cómo prefieres aprender", estrategia: "Lo que te ayuda", aplicacion: "Lo que has aplicado", ensenanza: "A quién ayudas",
};
export type Status = "declarado" | "observado" | "inferido" | "confirmado" | "desactualizado";
export type SourceType = "bienvenida" | "tutor" | "practica" | "para_ti" | "test" | "validacion" | "alumno";
const MAX_FACTS = 80, MAX_OPS = 8;

export interface Fact { id: string; layer: Layer; text: string; status: Status; sourceType: string; sourceRef: string | null; evidence: string | null; scope: string | null; active: boolean; updatedAt: Date }

export async function list(deps: SvcDeps, orgId: string, userId: string, activeOnly = true): Promise<Fact[]> {
  const rows = await deps.db.select().from(learnerFact)
    .where(activeOnly ? and(eq(learnerFact.organizationId, orgId), eq(learnerFact.userId, userId), eq(learnerFact.active, true))
      : and(eq(learnerFact.organizationId, orgId), eq(learnerFact.userId, userId)))
    .orderBy(desc(learnerFact.updatedAt)).limit(MAX_FACTS);
  const now = Date.now();
  return rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now).map((r) => ({ ...r, layer: r.layer as Layer, status: r.status as Status }));
}

/** Lo que usan los prompts: por capas, sin datos retirados ni desactualizados, con su estado para no tratar un
 * «declarado» como hecho comprobado. */
export function summarize(facts: Fact[]): string {
  const useful = facts.filter((f) => f.active && f.status !== "desactualizado");
  return LAYERS.map((l) => {
    const xs = useful.filter((f) => f.layer === l);
    return xs.length ? `${LAYER_LABEL[l]}:\n` + xs.map((f) => `- ${f.text} (${f.status})`).join("\n") : "";
  }).filter(Boolean).join("\n");
}

/* ---------------------------------- Extracción ---------------------------------- */

export interface Op { op: "add" | "update" | "expire"; id?: string; layer?: string; text?: string; evidence?: string }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

/** Filtro determinista de lo que propone el modelo: capa válida, texto corto, evidencia literal del input, ids propios. */
export function sanitizeOps(ops: unknown, input: string, ownIds: Set<string>): Op[] {
  if (!Array.isArray(ops)) return [];
  const src = norm(input);
  const out: Op[] = [];
  for (const raw of ops.slice(0, MAX_OPS)) {
    const o = raw as Op;
    if (!o || !["add", "update", "expire"].includes(o.op)) continue;
    if (o.op !== "add" && (!o.id || !ownIds.has(o.id))) continue;
    if (o.op === "expire") { out.push({ op: "expire", id: o.id }); continue; }
    const text = String(o.text || "").trim().slice(0, 240);
    const evidence = String(o.evidence || "").trim().slice(0, 200);
    if (!text || !evidence || norm(evidence).length < 6 || !src.includes(norm(evidence))) continue; // sin cita literal, fuera
    if (o.op === "add" && !LAYERS.includes(o.layer as Layer)) continue;
    out.push({ op: o.op, id: o.id, layer: o.layer, text, evidence });
  }
  return out;
}

const SYS = `Mantienes la ficha de aprendizaje de un profesional en SkillUp. Te doy su ficha actual y un texto NUEVO que ha escrito él.
Propón como mucho 5 cambios, solo si el texto nuevo aporta algo útil para adaptar su formación:
- add: dato nuevo. Capas: contexto (su puesto, tareas, con quién trata, qué decide), objetivo (qué quiere conseguir), caso (una situación concreta que tiene entre manos: con quién, en qué punto, qué le bloquea), competencia (algo que dice dominar o que le cuesta en una tarea concreta), preferencia (cómo quiere aprender o que le hablen), estrategia (algo que dice que le ayuda), aplicacion (algo que ha aplicado y qué pasó), ensenanza (a quién ayuda o forma).
- update: el texto nuevo cambia un dato existente (usa su id).
- expire: el texto nuevo dice que un dato ya no vale (usa su id).
Reglas:
- Solo lo que él dice. Nada de deducciones sobre su personalidad, emociones, capacidad general o salud.
- Distingue cliente final, posible partner y compañero; si no está claro, no lo inventes.
- "text": una frase corta en tercera persona, concreta ("Prepara una reunión con un distribuidor de material eléctrico de Valencia que lleva el stock en Excel").
- "evidence": cita LITERAL y breve copiada del texto nuevo que lo justifica. Sin cita literal no hay cambio.
- Si no hay nada útil, devuelve {"ops":[]}.
Devuelve SOLO JSON: {"ops":[{"op":"add","layer":"caso","text":"…","evidence":"…"},{"op":"update","id":"…","text":"…","evidence":"…"},{"op":"expire","id":"…"}]}`;

/** Aplica los cambios propuestos. Devuelve cuántos se aplicaron. */
export async function applyOps(deps: SvcDeps, orgId: string, userId: string, ops: Op[], source: { type: SourceType; ref?: string; scope?: string }): Promise<number> {
  const statusFor: Status = source.type === "test" || source.type === "validacion" ? "observado" : "declarado";
  let n = 0;
  for (const o of ops) {
    const own = o.id ? and(eq(learnerFact.id, o.id), eq(learnerFact.organizationId, orgId), eq(learnerFact.userId, userId)) : undefined;
    if (o.op === "expire" && own) { await deps.db.update(learnerFact).set({ status: "desactualizado", updatedAt: new Date() }).where(own); n++; }
    else if (o.op === "update" && own) { await deps.db.update(learnerFact).set({ text: o.text!, evidence: o.evidence!, status: statusFor, sourceType: source.type, sourceRef: source.ref ?? null, updatedAt: new Date() }).where(own); n++; }
    else if (o.op === "add") {
      await deps.db.insert(learnerFact).values({ id: deps.newId(), organizationId: orgId, userId, layer: o.layer!, text: o.text!, evidence: o.evidence!, status: statusFor,
        sourceType: source.type, sourceRef: source.ref ?? null, scope: source.scope ?? null });
      n++;
    }
  }
  return n;
}

export async function extract(deps: SvcDeps, orgId: string, userId: string, input: string, source: { type: SourceType; ref?: string; scope?: string }): Promise<number> {
  const text = input.trim();
  if (text.length < 15) return 0;
  const facts = await list(deps, orgId, userId);
  const { llm } = await import("../container.js");
  const out = await llm.generate({
    system: SYS, model: env.MODEL_FAST, maxTokens: 700, kind: "learner_fact", orgId, userId, lang: "es",
    messages: [{ role: "user", content: `FICHA ACTUAL:\n${facts.map((f) => `[${f.id}] (${f.layer}, ${f.status}) ${f.text}`).join("\n") || "(vacía)"}\n\nTEXTO NUEVO (${source.type}${source.ref ? ", " + source.ref : ""}):\n${text.slice(0, 3000)}` }],
  });
  let parsed: { ops?: unknown }; try { parsed = firstJson(out); } catch { return 0; }
  return applyOps(deps, orgId, userId, sanitizeOps(parsed.ops, text, new Set(facts.map((f) => f.id))), source);
}

// ponytail: cola en memoria, una extracción a la vez por alumno (se pierde si se reinicia el proceso; BullMQ si crece).
const running = new Map<string, Promise<unknown>>();
export function extractLater(deps: SvcDeps, orgId: string, userId: string, input: string, source: { type: SourceType; ref?: string; scope?: string }): void {
  const key = orgId + ":" + userId;
  const prev = running.get(key) ?? Promise.resolve();
  const next = prev.then(() => extract(deps, orgId, userId, input, source)).catch((e) => console.warn("[learner_fact] extract failed", String(e).slice(0, 200)));
  running.set(key, next);
  void next.finally(() => { if (running.get(key) === next) running.delete(key); });
}

/* ---------------------------------- Lo que hace el alumno en su ficha ---------------------------------- */

export async function patch(deps: SvcDeps, orgId: string, userId: string, id: string, p: { text?: string; active?: boolean; confirm?: boolean }): Promise<boolean> {
  const own = and(eq(learnerFact.id, id), eq(learnerFact.organizationId, orgId), eq(learnerFact.userId, userId));
  const [row] = await deps.db.select({ id: learnerFact.id }).from(learnerFact).where(own).limit(1);
  if (!row) return false;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof p.text === "string" && p.text.trim()) { set.text = p.text.trim().slice(0, 240); set.status = "confirmado"; set.sourceType = "alumno"; }
  if (p.confirm) set.status = "confirmado";
  if (typeof p.active === "boolean") set.active = p.active;
  await deps.db.update(learnerFact).set(set).where(own);
  return true;
}

export async function addByLearner(deps: SvcDeps, orgId: string, userId: string, layer: Layer, text: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(learnerFact).values({ id, organizationId: orgId, userId, layer, text: text.trim().slice(0, 240), status: "confirmado", sourceType: "alumno" });
  return id;
}
