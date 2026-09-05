import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { agentMessage, agentThread, auditLog } from "../db/schema.js";
import type { Embeddings } from "../rag/embeddings.js";
import { retrieve } from "../rag/rag.js";
import type { VectorStore } from "../rag/store.js";
import { resolveAgent, type AgentContext } from "./registry.js";
import type { Llm, LlmMessage } from "./llm.js";

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
}

export interface ChatResult { threadId: string; reply: string }

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
      .where(and(eq(agentThread.id, threadId), eq(agentThread.organizationId, input.orgId)));
    if (!t) throw new Error("hilo no encontrado en esta organización");
  } else {
    threadId = deps.newId();
    await deps.db.insert(agentThread).values({
      id: threadId, organizationId: input.orgId, userId: input.userId,
      role: input.role, title: input.message.slice(0, 60),
    });
  }

  // 2) recuperar contexto RAG de la org
  const hits = await retrieve(deps.store, deps.emb, input.orgId, input.message, 5);
  const ctx: AgentContext = {
    orgName: input.orgName, userName: input.userName,
    contextSnippets: hits.map((h) => h.content),
  };

  // 3) historial reciente del hilo
  const history = await deps.db.select().from(agentMessage)
    .where(and(eq(agentMessage.threadId, threadId), eq(agentMessage.organizationId, input.orgId)))
    .orderBy(asc(agentMessage.createdAt));
  const msgs: LlmMessage[] = history.map((m) => ({
    role: m.sender === "user" ? "user" : "assistant", content: m.content,
  }));
  msgs.push({ role: "user", content: input.message });

  // 4) generar
  const reply = await deps.llm.generate({ system: agent.system(ctx), messages: msgs, model: agent.model });

  // 5) persistir + auditar
  await deps.db.insert(agentMessage).values([
    { id: deps.newId(), organizationId: input.orgId, threadId, sender: "user", content: input.message },
    { id: deps.newId(), organizationId: input.orgId, threadId, sender: "agent", content: reply },
  ]);
  await deps.db.insert(auditLog).values({
    id: deps.newId(), organizationId: input.orgId, userId: input.userId,
    action: "agent.chat", meta: { role: input.role, threadId, retrieved: hits.length },
  });

  return { threadId, reply };
}
