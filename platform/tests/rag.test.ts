import { describe, expect, it } from "vitest";
import { DevEmbeddings, cosine } from "../src/rag/embeddings.js";
import { chunkText, retrieve } from "../src/rag/rag.js";
import { InMemoryStore } from "../src/rag/store.js";

describe("cosine", () => {
  it("vale 1 para vectores iguales y 0 para ortogonales", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("chunkText", () => {
  it("trocea texto largo en varios fragmentos", () => {
    const txt = Array.from({ length: 40 }, (_, i) => `Frase número ${i} sobre facturación en Odoo.`).join(" ");
    const chunks = chunkText(txt, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 400)).toBe(true);
  });
});

describe("DevEmbeddings", () => {
  it("es determinista y da alta similitud a textos solapados", async () => {
    const emb = new DevEmbeddings();
    const [a1] = await emb.embed(["facturación de clientes en Odoo"]);
    const [a2] = await emb.embed(["facturación de clientes en Odoo"]);
    const [b] = await emb.embed(["montar una bicicleta de montaña"]);
    expect(cosine(a1!, a2!)).toBeCloseTo(1);
    expect(cosine(a1!, b!)).toBeLessThan(cosine(a1!, a2!));
  });
});

describe("retrieve (RAG end-to-end offline)", () => {
  it("recupera primero el fragmento relevante y aísla por organización", async () => {
    const emb = new DevEmbeddings();
    const store = new InMemoryStore();
    const org = "org-A";
    const embed = async (t: string) => (await emb.embed([t]))[0]!;
    await store.add(org, "doc-fact", [
      { idx: 0, content: "Cómo emitir una factura rectificativa en Odoo paso a paso", embedding: await embed("Cómo emitir una factura rectificativa en Odoo paso a paso") },
    ]);
    await store.add(org, "doc-logistica", [
      { idx: 0, content: "Gestión de incidencias de logística y transporte", embedding: await embed("Gestión de incidencias de logística y transporte") },
    ]);
    // otra empresa: no debe aparecer
    await store.add("org-B", "doc-otra", [
      { idx: 0, content: "factura rectificativa en otra empresa", embedding: await embed("factura rectificativa en otra empresa") },
    ]);

    const hits = await retrieve(store, emb, org, "quiero hacer una factura rectificativa", 3);
    expect(hits[0]?.documentId).toBe("doc-fact");
    expect(hits.every((h) => h.documentId !== "doc-otra")).toBe(true);
  });
});
