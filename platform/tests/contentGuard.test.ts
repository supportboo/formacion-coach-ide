import { describe, expect, it } from "vitest";
import { BASE_BANNED, findBanned, normalize } from "../src/services/contentGuard.js";

describe("contentGuard", () => {
  it("normaliza tildes, mayúsculas, repeticiones y números por letras", () => {
    expect(normalize("IMBÉCIIIL")).toBe("imbecil");
    expect(normalize("1mb3c1l")).toBe("imbecil");
  });
  it("detecta palabras y expresiones prohibidas con trucos", () => {
    expect(findBanned("eres un Gilipoooollas", BASE_BANNED)).toBe("gilipollas");
    expect(findBanned("hijo  de   PUTA", BASE_BANNED)).toBe("hijo de puta");
    expect(findBanned("1mb3c1l", BASE_BANNED)).toBe("imbecil");
  });
  it("no bloquea palabras normales que contienen una prohibida dentro", () => {
    expect(findBanned("Computadora, disputa y reputación del partner", BASE_BANNED)).toBeNull();
    expect(findBanned("Recibí la llamada del partner manager", BASE_BANNED)).toBeNull();
    expect(findBanned("", BASE_BANNED)).toBeNull();
  });
  it("aplica la lista propia de la empresa", () => {
    expect(findBanned("eso es de la competencia X", ["competencia x"])).toBe("competencia x");
  });
});
