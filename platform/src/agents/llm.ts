import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export interface LlmMessage { role: "user" | "assistant"; content: string }
export interface LlmCall {
  system: string; messages: LlmMessage[]; model?: string; maxTokens?: number;
  // Contexto opcional SOLO para el ledger de coste -- no cambia la llamada al modelo.
  orgId?: string | null; userId?: string; kind?: string;
}
export interface LlmUsage { orgId: string | null; userId?: string; kind: string; model: string; inputTokens: number; outputTokens: number }
export type UsageRecorder = (u: LlmUsage) => Promise<void>;

export interface Llm {
  generate(call: LlmCall): Promise<string>;
}

export class AnthropicLlm implements Llm {
  private client: Anthropic;
  // timeout+maxRetries del propio SDK (soporte nativo) en vez de reimplementar retry a mano.
  constructor(apiKey: string, private onUsage?: UsageRecorder) { this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 }); }
  async generate(call: LlmCall): Promise<string> {
    const model = call.model ?? env.MODEL_SENIOR;
    const res = await this.client.messages.create({
      model,
      max_tokens: call.maxTokens ?? 1024,
      system: call.system,
      messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (this.onUsage) {
      // Coste real devuelto por Anthropic, nunca estimado. Si falla el registro, no rompe la respuesta al usuario.
      this.onUsage({
        orgId: call.orgId ?? null, userId: call.userId, kind: call.kind ?? "otro", model,
        inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens,
      }).catch(() => {});
    }
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

/** LLM mock determinista — sin clave, para dev y tests. No inventa datos: responde acotado. */
export class MockLlm implements Llm {
  async generate(call: LlmCall): Promise<string> {
    const last = call.messages.at(-1)?.content ?? "";
    return `【mock】He recibido tu mensaje ("${last.slice(0, 80)}"). Sin ANTHROPIC_API_KEY respondo en modo simulado; con clave real, este agente contestaría con el contexto recuperado.`;
  }
}

/**
 * Gemini vía Google AI Studio (REST generateContent). Los agentes piden modelos Claude por nombre;
 * aquí se traducen al modelo Gemini configurado (GEMINI_MODEL). Coste real por tokens del proveedor.
 */
export class GeminiLlm implements Llm {
  constructor(private apiKey: string, private model: string, private onUsage?: UsageRecorder) {}
  async generate(call: LlmCall): Promise<string> {
    const model = call.model && call.model.startsWith("gemini") ? call.model : this.model;
    const body = {
      systemInstruction: { parts: [{ text: call.system }] },
      contents: call.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        maxOutputTokens: call.maxTokens ?? 1024,
        // Sin "pensamiento" en Flash: respuesta más rápida para chat/voz y todos los tokens para el texto.
        ...(model.includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", signal: ctrl.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const msg = (await res.text()).slice(0, 300);
          if (res.status >= 500 || res.status === 429) { lastErr = new Error(`gemini ${res.status}: ${msg}`); continue; }
          throw new Error(`gemini ${res.status}: ${msg}`);
        }
        const d = await res.json() as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        if (this.onUsage) {
          this.onUsage({
            orgId: call.orgId ?? null, userId: call.userId, kind: call.kind ?? "otro", model,
            inputTokens: d.usageMetadata?.promptTokenCount ?? 0, outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0,
          }).catch(() => {});
        }
        const text = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (!text) throw new Error("gemini: respuesta vacía");
        return text;
      } catch (e) { lastErr = e; if ((e as Error).name !== "AbortError") break; }
      finally { clearTimeout(timer); }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

/** Prueba proveedores en orden: si el principal falla (clave caída, caída del servicio), responde el siguiente. */
export class FallbackLlm implements Llm {
  constructor(private chain: Llm[]) {}
  async generate(call: LlmCall): Promise<string> {
    let lastErr: unknown;
    for (const llm of this.chain) {
      try { return await llm.generate(call); }
      catch (e) { lastErr = e; console.error("[llm] proveedor falló, probando el siguiente:", String((e as Error).message ?? e).slice(0, 200)); }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

export function makeLlm(onUsage?: UsageRecorder): Llm {
  const anthropic: Llm | null = env.ANTHROPIC_API_KEY ? new AnthropicLlm(env.ANTHROPIC_API_KEY, onUsage) : null;
  const gemini: Llm | null = env.GEMINI_API_KEY ? new GeminiLlm(env.GEMINI_API_KEY, env.GEMINI_MODEL, onUsage) : null;
  const ordered: (Llm | null)[] = env.LLM_PROVIDER === "gemini" ? [gemini, anthropic] : [anthropic, gemini];
  const chain = ordered.filter((x): x is Llm => x !== null);
  if (chain.length === 0) return new MockLlm();
  return chain.length === 1 ? chain[0]! : new FallbackLlm(chain);
}
