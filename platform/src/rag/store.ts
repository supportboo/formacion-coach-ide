import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { ragChunk } from "../db/schema.js";
import { cosine } from "./embeddings.js";

export interface Chunk { idx: number; content: string; embedding: number[] }
export interface Hit { documentId: string; content: string; score: number }

export interface VectorStore {
  add(orgId: string, documentId: string, chunks: Chunk[]): Promise<void>;
  search(orgId: string, queryVec: number[], k: number): Promise<Hit[]>;
}

/** Store en memoria — para tests, sin DB. */
export class InMemoryStore implements VectorStore {
  private rows: { orgId: string; documentId: string; content: string; embedding: number[] }[] = [];
  async add(orgId: string, documentId: string, chunks: Chunk[]): Promise<void> {
    for (const c of chunks) this.rows.push({ orgId, documentId, content: c.content, embedding: c.embedding });
  }
  async search(orgId: string, queryVec: number[], k: number): Promise<Hit[]> {
    return this.rows
      .filter((r) => r.orgId === orgId)
      .map((r) => ({ documentId: r.documentId, content: r.content, score: cosine(queryVec, r.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/**
 * Store en Postgres. Filtra por organizationId y calcula coseno en app.
 * ponytail: O(n) sobre los chunks de la org; migrar a pgvector + índice ivfflat
 * cuando una org supere ~decenas de miles de chunks.
 */
export class PgVectorStore implements VectorStore {
  constructor(private db: DB, private newId: () => string) {}
  async add(orgId: string, documentId: string, chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.db.insert(ragChunk).values(
      chunks.map((c) => ({
        id: this.newId(), organizationId: orgId, documentId, idx: c.idx,
        content: c.content, embedding: c.embedding,
      })),
    );
  }
  async search(orgId: string, queryVec: number[], k: number): Promise<Hit[]> {
    const rows = await this.db
      .select({ documentId: ragChunk.documentId, content: ragChunk.content, embedding: ragChunk.embedding })
      .from(ragChunk)
      .where(eq(ragChunk.organizationId, orgId));
    return rows
      .map((r) => ({ documentId: r.documentId, content: r.content, score: cosine(queryVec, r.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
