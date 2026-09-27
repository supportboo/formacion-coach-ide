import { db } from "./db/index.js";
import { makeEmbeddings } from "./rag/embeddings.js";
import { PgVectorStore } from "./rag/store.js";
import { makeLlm, type Llm, type LlmCall } from "./agents/llm.js";
import type { ChatDeps } from "./agents/chat.js";
import { newId } from "./util/id.js";
import { makeUsageRecorder, orgCost } from "./services/costs.js";
import { env } from "./config/env.js";
import { applyTerms, extractLearned, glossaryPrompt, learnTerm, LEARN_INSTRUCTION, LEARNING_KINDS, orgTerms } from "./services/glossary.js";

// Singletons de la app.
export const emb = makeEmbeddings();
const rawLlm = makeLlm(makeUsageRecorder({ db, newId }));

// Tope de gasto de IA por empresa/día (red de seguridad anti-abuso, un solo punto para los 17 endpoints).
// Se comprueba ANTES de generar; si la empresa ya superó su tope hoy, se bloquea con mensaje claro.
export const llm: Llm = {
  async generate(call: LlmCall): Promise<string> {
    if (call.orgId && env.ORG_AI_DAILY_CAP_USD > 0) {
      const spent = await orgCost({ db, newId }, call.orgId, 1).then((c) => c.usd).catch(() => 0);
      if (spent >= env.ORG_AI_DAILY_CAP_USD) {
        throw new Error("Se ha alcanzado el límite de uso de IA de tu empresa por hoy. Vuelve mañana o pide al administrador que lo amplíe.");
      }
    }
    // Glosario que aprende (services/glossary.ts): la terminología corregida por el equipo va en el prompt de
    // TODAS las llamadas, se corrige en la salida y, en conversación, el agente marca las correcciones nuevas.
    const terms = await orgTerms(db, call.orgId).catch(() => []);
    const learning = !!(call.orgId && call.userId && LEARNING_KINDS.has(call.kind || ""));
    const out = await rawLlm.generate({ ...call, system: call.system + glossaryPrompt(terms) + (learning ? LEARN_INSTRUCTION : "") });
    const { clean, learned } = extractLearned(out);
    if (learning) for (const t of learned) await learnTerm(db, newId, call.orgId!, call.userId!, t).catch(() => false);
    return applyTerms(clean, learned.length ? await orgTerms(db, call.orgId).catch(() => terms) : terms);
  },
};
export const store = new PgVectorStore(db, newId);
export const chatDeps: ChatDeps = { db, store, emb, llm, newId };
export { db, newId };
