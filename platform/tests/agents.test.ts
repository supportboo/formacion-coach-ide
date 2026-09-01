import { describe, expect, it } from "vitest";
import { ROLES, isRole, resolveAgent } from "../src/agents/registry.js";
import { MockLlm } from "../src/agents/llm.js";

describe("registry de agentes", () => {
  it("hay un agente por cada rol del organigrama", () => {
    for (const role of ROLES) {
      const a = resolveAgent(role);
      expect(a.role).toBe(role);
      expect(a.title.length).toBeGreaterThan(0);
    }
  });

  it("rol desconocido cae en empleado", () => {
    expect(resolveAgent("desconocido").role).toBe("empleado");
    expect(isRole("empleado")).toBe(true);
    expect(isRole("nope")).toBe(false);
  });

  it("el system prompt incluye el contexto recuperado y prohíbe inventar", () => {
    const a = resolveAgent("direccion");
    const sys = a.system({ orgName: "ACME", userName: "Marc", contextSnippets: ["cobertura 62%"] });
    expect(sys).toContain("ACME");
    expect(sys).toContain("cobertura 62%");
    expect(sys.toLowerCase()).toContain("no inventes");
  });
});

describe("MockLlm", () => {
  it("responde sin clave y no revienta", async () => {
    const llm = new MockLlm();
    const out = await llm.generate({ system: "s", messages: [{ role: "user", content: "hola" }] });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
