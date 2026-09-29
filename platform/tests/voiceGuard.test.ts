import { describe, expect, it } from "vitest";
import { allowedVoice } from "../src/services/voice.js";
import { usdCost } from "../src/services/costs.js";

describe("voz: lista cerrada y coste (1.17.0)", () => {
  it("solo acepta voces de la lista", () => {
    expect(allowedVoice("bkcxugbRtulPFV1CinBX")).toBe(true);
    expect(allowedVoice("voz-de-otro")).toBe(false);
  });
  it("1.000 caracteres de voz cuentan ~0,20 $ en el tope diario", () => {
    expect(usdCost("elevenlabs", 1000, 0)).toBeCloseTo(0.2, 5);
  });
});
