import { env } from "../config/env.js";

export interface Embeddings {
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!, y = b[i]!;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const norm = (v: number[]): number[] => {
  let s = 0;
  for (const x of v) s += x * x;
  const m = Math.sqrt(s) || 1;
  return v.map((x) => x / m);
};

/**
 * Embedding determinista offline (bag-of-words con hashing). Sin coste ni clave.
 * ponytail: no es semántico como un modelo real, pero da similitud coherente por
 * solape de tokens — suficiente para dev y para tests reproducibles del pipeline.
 * En producción usar el proveedor `openai`.
 */
export class DevEmbeddings implements Embeddings {
  readonly dim = 256;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dim).fill(0);
      for (const tok of t.toLowerCase().split(/[^a-záéíóúñ0-9]+/i)) {
        if (!tok) continue;
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
        v[Math.abs(h) % this.dim]! += 1;
      }
      return norm(v);
    });
  }
}

export class OpenAIEmbeddings implements Embeddings {
  readonly dim = 1536;
  constructor(private apiKey: string, private model = "text-embedding-3-small") {}
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}

export function makeEmbeddings(): Embeddings {
  if (env.EMBEDDINGS_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("EMBEDDINGS_PROVIDER=openai pero falta OPENAI_API_KEY");
    return new OpenAIEmbeddings(env.OPENAI_API_KEY);
  }
  return new DevEmbeddings();
}
