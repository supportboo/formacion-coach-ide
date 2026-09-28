import { describe, expect, it } from "vitest";
import { FallbackLlm, type Llm } from "../src/agents/llm.js";

const ok = (t: string): Llm => ({ generate: async () => t });
const fail = (m: string): Llm => ({ generate: async () => { throw new Error(m); } });
const call = { system: "s", messages: [{ role: "user" as const, content: "hola" }] };

describe("FallbackLlm — una clave caída no tumba el chat", () => {
  it("usa el primero si responde", async () => {
    expect(await new FallbackLlm([ok("a"), ok("b")]).generate(call)).toBe("a");
  });
  it("si el principal falla, responde el de reserva", async () => {
    expect(await new FallbackLlm([fail("401 invalid key"), ok("b")]).generate(call)).toBe("b");
  });
  it("si todos fallan, propaga el último error", async () => {
    await expect(new FallbackLlm([fail("x"), fail("y")]).generate(call)).rejects.toThrow("y");
  });
});
