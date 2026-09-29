import { describe, expect, it } from "vitest";
import { aggregate, filterSchema, generalSchema, glossarySchema, inboxAccess, rateSchema, ratingKey, summaryFacts, type Row } from "../src/services/feedback.js";

describe("feedback · validación", () => {
  it("una valoración necesita id de mensaje o referencia, y motivos conocidos", () => {
    expect(rateSchema.safeParse({ rating: "up" }).success).toBe(false);
    expect(rateSchema.safeParse({ rating: "up", messageId: "m1" }).success).toBe(true);
    expect(rateSchema.safeParse({ rating: null, ref: "reto:1:2" }).success).toBe(true);
    expect(rateSchema.safeParse({ rating: "down", ref: "x", reasons: ["inventado"] }).success).toBe(false);
    expect(rateSchema.safeParse({ rating: "meh", ref: "x" }).success).toBe(false);
    const ok = rateSchema.parse({ rating: "down", ref: "x", reasons: ["palabra_mal_escrita"], comment: "  Nexdo  " });
    expect(ok.comment).toBe("Nexdo");
  });
  it("sugerencia: tipo cerrado y texto con contenido", () => {
    expect(generalSchema.safeParse({ type: "sugerencia", text: "ok" }).success).toBe(false);
    expect(generalSchema.safeParse({ type: "queja", text: "Algo que decir" }).success).toBe(false);
    expect(generalSchema.safeParse({ type: "contenido", text: "Un curso de Excel" }).success).toBe(true);
  });
  it("glosario y filtros", () => {
    expect(glossarySchema.safeParse({ wrong: "Nexdo", right: "Nexdo" }).success).toBe(false);
    expect(glossarySchema.safeParse({ wrong: "Nexdo", right: "Nextdoo" }).success).toBe(true);
    expect(filterSchema.safeParse({ from: "28-09-2026" }).success).toBe(false);
    expect(filterSchema.parse({ status: "nuevo", refresh: "1" })).toEqual({ status: "nuevo" });
  });
});

describe("feedback · un voto por respuesta y permisos", () => {
  it("la clave del voto es estable: el id del mensaje manda sobre la referencia", () => {
    expect(ratingKey({ messageId: "abc", ref: "otra" })).toBe("msg:abc");
    expect(ratingKey({ ref: "roleplay:s1:3" })).toBe("ref:roleplay:s1:3");
    expect(ratingKey({ messageId: "abc" })).toBe(ratingKey({ messageId: "abc" }));
  });
  it("empleado solo lo suyo · admin y dirección su empresa en solo lectura · superadmin todo y gestiona", () => {
    for (const role of ["empleado", "coach", "team_leader", "inspirador"]) expect(inboxAccess({ role, platformAdmin: false })).toEqual({ scope: "self", manage: false });
    expect(inboxAccess({ role: "admin", platformAdmin: false })).toEqual({ scope: "org", manage: false });
    expect(inboxAccess({ role: "direccion", platformAdmin: false })).toEqual({ scope: "org", manage: false });
    expect(inboxAccess({ role: "empleado", platformAdmin: true })).toEqual({ scope: "global", manage: true });
  });
});

const row = (p: Partial<Row>): Row => ({
  id: "x", organizationId: "o1", orgName: "ACME", userId: "u", kind: "rating", type: null, rating: "up", reasons: [], comment: null,
  targetKey: null, messageId: null, answerText: null, promptText: null, page: null, course: null, block: null, agent: null, role: null,
  userAgent: null, status: "nuevo", resolverId: null, resolverName: null, resolutionNote: null, resolvedAt: null, userSeenAt: null,
  createdAt: new Date("2026-09-23T10:00:00Z"), updatedAt: new Date(), ...p,
});

describe("feedback · agregados", () => {
  it("satisfacción por agente, curso, empresa y semana; motivos y bloques con más quejas", () => {
    const rows = [
      row({ agent: "Diego", course: "outbound-sales", block: "Apertura" }),
      row({ agent: "Diego", course: "outbound-sales", block: "Apertura", rating: "down", reasons: ["dato_incorrecto", "voz"] }),
      row({ agent: "Diego", course: "outbound-sales", block: "Cierre", rating: "down", reasons: ["dato_incorrecto"], createdAt: new Date("2026-09-28T10:00:00Z") }),
      row({ agent: "Marta", organizationId: "o2", orgName: "Beta" }),
      row({ kind: "general", type: "sugerencia", rating: null }),
    ];
    const s = aggregate(rows);
    expect(s.ratings).toEqual({ total: 4, up: 2, down: 2, pct: 50 });
    expect(s.byAgent.find((b) => b.key === "Diego")).toMatchObject({ up: 1, down: 2, pct: 33 });
    expect(s.byOrg.find((b) => b.key === "Beta")).toMatchObject({ up: 1, down: 0, pct: 100 });
    expect(s.overTime.map((b) => b.key)).toEqual(["2026-09-21", "2026-09-28"]); // semanas desde el lunes
    expect(s.topReasons[0]).toEqual({ reason: "dato_incorrecto", n: 2 });
    expect(s.worstBlocks[0]).toMatchObject({ course: "outbound-sales", down: 1 });
    expect(s.general).toMatchObject({ total: 1, byType: { sugerencia: 1 } });
  });
  it("sin votos no hay porcentaje (nunca un 0 % o 100 % inventado)", () => {
    expect(aggregate([]).ratings.pct).toBeNull();
    expect(aggregate([row({ kind: "general", rating: null })]).ratings.total).toBe(0);
  });
  it("el resumen solo recibe reportes reales con sus motivos", () => {
    const f = summaryFacts([row({ rating: "down", reasons: ["fuera_de_tema"], course: "c1", answerText: "bla" })]);
    expect(f).toContain("Fuera de tema");
    expect(f).toContain("c1");
  });
});
