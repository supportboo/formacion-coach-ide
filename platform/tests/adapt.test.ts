import { describe, expect, it } from "vitest";
import { contextHash, valid } from "../src/services/adapt.js";

describe("living content block", () => {
  it("regenerates when what we know about the learner changes", () => {
    const before = "Puesto: Partner Manager\n[objetivo] cerrar 3 partners";
    expect(contextHash(before)).toBe(contextHash(before));
    expect(contextHash(before + "\nLo que ha respondido: tengo un distribuidor en Valencia")).not.toBe(contextHash(before));
  });

  it("only accepts a complete «Para ti» block", () => {
    const ok = { paraTi: "x", ejemplo: { titulo: "t", situacion: "s", pasos: ["a"] }, practica: { pasos: ["b"], minutos: 15 }, pregunta: "¿?", primero: "ejemplo" };
    expect(valid(ok)).toBe(true);
    expect(valid({ ...ok, practica: undefined })).toBe(false);
    expect(valid(null)).toBe(false);
  });
});
