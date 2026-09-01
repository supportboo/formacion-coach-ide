import type { DB } from "../db/index.js";
import { ragDocument } from "../db/schema.js";
import type { Embeddings } from "./embeddings.js";
import type { Chunk, Hit, VectorStore } from "./store.js";

/** Trocea texto en fragmentos ~size respetando límites de frase/párrafo. */
export function chunkText(text: string, size = 600): string[] {
  const parts = text.split(/\n\s*\n/).flatMap((p) => p.split(/(?<=[.!?])\s+/));
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    const piece = p.trim();
    if (!piece) continue;
    if ((cur + " " + piece).trim().length > size && cur) { chunks.push(cur.trim()); cur = piece; }
    else cur = cur ? cur + " " + piece : piece;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Embebe una lista de fragmentos → Chunk[]. */
export async function embedChunks(emb: Embeddings, texts: string[]): Promise<Chunk[]> {
  const vecs = await emb.embed(texts);
  return texts.map((content, idx) => ({ idx, content, embedding: vecs[idx]! }));
}

/** Recupera los k fragmentos más relevantes de una organización para una consulta. */
export async function retrieve(
  store: VectorStore, emb: Embeddings, orgId: string, query: string, k = 5,
): Promise<Hit[]> {
  const [qv] = await emb.embed([query]);
  return store.search(orgId, qv!, k);
}

export interface IngestInput { title: string; kind?: string; refId?: string; text: string }

/** Ingesta un documento (lección, caso, ruta…) al RAG de una organización. */
export async function ingestDocument(
  deps: { db: DB; store: VectorStore; emb: Embeddings; newId: () => string },
  orgId: string, input: IngestInput,
): Promise<{ documentId: string; chunks: number }> {
  const documentId = deps.newId();
  await deps.db.insert(ragDocument).values({
    id: documentId, organizationId: orgId, title: input.title,
    kind: input.kind ?? "nota", refId: input.refId ?? null,
  });
  const texts = chunkText(input.text);
  const chunks = await embedChunks(deps.emb, texts);
  await deps.store.add(orgId, documentId, chunks);
  return { documentId, chunks: chunks.length };
}
