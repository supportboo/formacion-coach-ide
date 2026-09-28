import { and, asc, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { agentMessage, agentThread, annotation, auditLog, levelByCompetency } from "../db/schema.js";
import type { Embeddings } from "../rag/embeddings.js";
import { retrieve } from "../rag/rag.js";
import type { VectorStore } from "../rag/store.js";
import { resolveAgent, type AgentContext } from "./registry.js";
import type { Llm, LlmMessage } from "./llm.js";
import { getOnboardingProfile } from "../services/learning.js";

export interface ChatDeps {
  db: DB;
  store: VectorStore;
  emb: Embeddings;
  llm: Llm;
  newId: () => string;
}

export interface ChatInput {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  role: string;
  threadId?: string;
  message: string;
  /** Texto que el alumno ve de su mensaje (sin instrucciones internas). Lo lee el responsable que le acompaña. */
  display?: string;
  /** Curso del hilo (slug), para ordenar las conversaciones en la supervisión. */
  source?: string;
}

export interface ChatResult { threadId: string; reply: string; /** id del mensaje de la IA, para valorarlo (feedback). */ messageId: string }

/**
 * Un turno de conversación de un usuario con SU agente de rol.
 * Todo va acotado a organizationId (multi-tenant). Persiste mensajes + auditoría.
 */
export async function chat(deps: ChatDeps, input: ChatInput): Promise<ChatResult> {
  const agent = resolveAgent(input.role);

  // 1) hilo (crear o validar pertenencia a la org)
  let threadId = input.threadId;
  if (threadId) {
    const [t] = await deps.db.select().from(agentThread)
      .where(and(eq(agentThread.id, threadId), eq(agentThread.organizationId, input.orgId), eq(agentThread.userId, input.userId)));
    // Stale or someone else's thread id (e.g. another profile in the same browser): start fresh.
    if (!t) threadId = undefined;
  }
  if (!threadId) {
    threadId = deps.newId();
    await deps.db.insert(agentThread).values({
      id: threadId, organizationId: input.orgId, userId: input.userId,
      role: input.role, title: (input.display ?? input.message).slice(0, 60), source: input.source ?? null,
    });
  }

  // 2) recuperar contexto RAG de la org + perfil (sector/puesto) para personalizar como ya hace aiContent
  const hits = await retrieve(deps.store, deps.emb, input.orgId, input.message, 5);
  const profile = await getOnboardingProfile({ db: deps.db, newId: deps.newId }, input.orgId, input.userId);
  const [ruta, avance, estilo, freno, objetivo, empresaResumen, perfil] = await Promise.all([
    learnerRoute(deps.db, input.orgId, input.userId),
    learnerProgress(deps.db, input.orgId, input.userId),
    learnerStyle(deps.db, input.orgId, input.userId),
    onboardingMarker(deps.db, input.orgId, input.userId, "[freno]"),
    onboardingMarker(deps.db, input.orgId, input.userId, "[objetivo]"),
    companySummary(deps.db, input.orgId, input.userId),
    onboardingMarker(deps.db, input.orgId, input.userId, "[perfil]"), // Team DNA v2 (teamprofile.ts)
  ]);
  const ctx: AgentContext = {
    orgName: input.orgName, userName: input.userName,
    contextSnippets: hits.map((h) => h.content),
    sector: profile?.sector, puesto: profile?.puesto, ruta, avance, estilo, freno, objetivo, empresaResumen, perfil,
  };

  // 3) historial reciente del hilo
  const history = await deps.db.select().from(agentMessage)
    .where(and(eq(agentMessage.threadId, threadId), eq(agentMessage.organizationId, input.orgId)))
    .orderBy(asc(agentMessage.createdAt));
  const msgs = historyToLlm(history);
  msgs.push({ role: "user", content: input.message });
  const humanJoined = history.some((m) => m.sender === "coach");

  // 4) generar
  const reply = await deps.llm.generate({
    system: agent.system(ctx) + (humanJoined ? HUMAN_COACH_NOTE : ""), messages: mergeTurns(msgs), model: agent.model,
    orgId: input.orgId, userId: input.userId, kind: "chat",
  });

  // 5) persistir + auditar
  const messageId = deps.newId();
  await deps.db.insert(agentMessage).values([
    { id: deps.newId(), organizationId: input.orgId, threadId, sender: "user", content: input.message, display: input.display ?? null },
    { id: messageId, organizationId: input.orgId, threadId, sender: "agent", content: reply },
  ]);
  await deps.db.insert(auditLog).values({
    id: deps.newId(), organizationId: input.orgId, userId: input.userId,
    action: "agent.chat", meta: { role: input.role, threadId, retrieved: hits.length },
  });

  return { threadId, reply, messageId };
}

// 1.3.0: un responsable humano (coach, team leader, admin…) puede escribir en este mismo hilo.
export const HUMAN_COACH_NOTE = "\n\nACOMPAÑAMIENTO HUMANO: en esta conversación también participa una persona real del equipo del alumno (coach, team leader o responsable). Sus mensajes llegan marcados como [Mensaje de <nombre>, <rol>]. No los contradigas ni los corrijas: apoya su indicación, continúa en su línea y, si el alumno le responde a esa persona, deja que sea ella quien conteste lo que le pregunta directamente. Nunca te hagas pasar por esa persona.";

type StoredMsg = { sender: string; content: string; authorName?: string | null; authorRole?: string | null };
/** Historial guardado → turnos del modelo. Los mensajes humanos del responsable van como contexto marcado. */
export function historyToLlm(history: StoredMsg[]): LlmMessage[] {
  return history.map((m) => m.sender === "coach"
    ? { role: "assistant" as const, content: `[Mensaje de ${m.authorName || "tu responsable"}, ${m.authorRole || "responsable"}] ${m.content}` }
    : { role: m.sender === "user" ? "user" as const : "assistant" as const, content: m.content });
}

/** Une turnos seguidos del mismo rol (un mensaje humano justo tras la IA) para cualquier proveedor. */
export function mergeTurns(msgs: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ ...m });
  }
  return out;
}

/** Módulos de la ruta del alumno (guardada como nota source='ruta' body '[ruta-plan] <json>'). */
async function learnerRoute(db: DB, orgId: string, userId: string): Promise<string[]> {
  const rows = await db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, "ruta")))
    .orderBy(desc(annotation.createdAt));
  const plan = rows.find((r) => String(r.body || "").startsWith("[ruta-plan]"));
  if (!plan) return [];
  try {
    const p = JSON.parse(String(plan.body).slice("[ruta-plan]".length).trim()) as { modulos?: { titulo?: string }[] };
    return (p.modulos || []).map((m) => m.titulo || "").filter(Boolean).slice(0, 8);
  } catch { return []; }
}

/** Cómo dijo el alumno que aprende mejor (nota onboarding [estilo]); guía el FORMATO, no el fondo. */
async function learnerStyle(db: DB, orgId: string, userId: string): Promise<string | null> {
  return onboardingMarker(db, orgId, userId, "[estilo]");
}

/** Lee un marcador del onboarding del alumno ([freno], [objetivo], [estilo]...). El más reciente gana. */
async function onboardingMarker(db: DB, orgId: string, userId: string, marker: string): Promise<string | null> {
  const rows = await db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, "onboarding")))
    .orderBy(desc(annotation.createdAt));
  const r = rows.find((x) => String(x.body || "").startsWith(marker));
  return r ? String(r.body).slice(marker.length).trim() || null : null;
}

/** Resumen real de la web de la empresa (nota onboarding "[Empresa <fuente>] <resumen>"), para ejemplos de lo suyo. */
async function companySummary(db: DB, orgId: string, userId: string): Promise<string | null> {
  const rows = await db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, "onboarding")))
    .orderBy(desc(annotation.createdAt));
  const r = rows.find((x) => String(x.body || "").startsWith("[Empresa "));
  if (!r) return null;
  const body = String(r.body);
  const end = body.indexOf("]");
  return end > 0 ? body.slice(end + 1).trim().slice(0, 400) : null;
}

/** Resumen breve del nivel actual del alumno, sin exponer la mecánica de puntos. */
async function learnerProgress(db: DB, orgId: string, userId: string): Promise<string | null> {
  const rows = await db.select({ level: levelByCompetency.level }).from(levelByCompetency)
    .where(and(eq(levelByCompetency.organizationId, orgId), eq(levelByCompetency.userId, userId)));
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.level));
  return `va por Nivel ${max} en ${rows.length} competencia${rows.length > 1 ? "s" : ""}`;
}
