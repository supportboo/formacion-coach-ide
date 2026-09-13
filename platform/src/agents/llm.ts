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

export function makeLlm(onUsage?: UsageRecorder): Llm {
  return env.ANTHROPIC_API_KEY ? new AnthropicLlm(env.ANTHROPIC_API_KEY, onUsage) : new MockLlm();
}
