import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export interface LlmMessage { role: "user" | "assistant"; content: string }
export interface LlmCall { system: string; messages: LlmMessage[]; model?: string; maxTokens?: number }

export interface Llm {
  generate(call: LlmCall): Promise<string>;
}

export class AnthropicLlm implements Llm {
  private client: Anthropic;
  // timeout+maxRetries del propio SDK (soporte nativo) en vez de reimplementar retry a mano.
  constructor(apiKey: string) { this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 }); }
  async generate(call: LlmCall): Promise<string> {
    const res = await this.client.messages.create({
      model: call.model ?? env.MODEL_SENIOR,
      max_tokens: call.maxTokens ?? 1024,
      system: call.system,
      messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
    });
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

export function makeLlm(): Llm {
  return env.ANTHROPIC_API_KEY ? new AnthropicLlm(env.ANTHROPIC_API_KEY) : new MockLlm();
}
