import { db } from "./db/index.js";
import { makeEmbeddings } from "./rag/embeddings.js";
import { PgVectorStore } from "./rag/store.js";
import { makeLlm } from "./agents/llm.js";
import type { ChatDeps } from "./agents/chat.js";
import { newId } from "./util/id.js";
import { makeUsageRecorder } from "./services/costs.js";

// Singletons de la app.
export const emb = makeEmbeddings();
export const llm = makeLlm(makeUsageRecorder({ db, newId }));
export const store = new PgVectorStore(db, newId);
export const chatDeps: ChatDeps = { db, store, emb, llm, newId };
export { db, newId };
