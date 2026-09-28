import { describe, expect, it } from "vitest";
import { allowedLearners, canSee } from "../src/services/teams.js";
import type { SvcDeps } from "../src/services/org.js";

// Fake mínimo: cada select devuelve las filas en orden (asignaciones, luego coaching).
function deps(rows: Array<Array<{ id: string }>>): SvcDeps {
  let i = 0;
  const q = () => ({ from: () => ({ where: async () => rows[i++] ?? [] }) });
  return { db: { select: q }, newId: () => "x" } as unknown as SvcDeps;
}

describe("alcance «mi equipo» (auditoría 28-09)", () => {
  it("admin/dirección (org) y superadmin (global) ven toda la empresa", async () => {
    expect(await allowedLearners(deps([]), "o", "m", "org")).toBeNull();
    expect(await allowedLearners(deps([]), "o", "m", "global")).toBeNull();
  });
  it("team sin asignaciones = nadie (antes se ampliaba a toda la empresa)", async () => {
    const a = await allowedLearners(deps([[], []]), "o", "m", "team");
    expect(canSee(a, "cualquiera")).toBe(false);
  });
  it("team = asignados + personas que acompaña como coach", async () => {
    const a = await allowedLearners(deps([[{ id: "u1" }], [{ id: "u2" }]]), "o", "m", "team");
    expect(canSee(a, "u1")).toBe(true);
    expect(canSee(a, "u2")).toBe(true);
    expect(canSee(a, "u3")).toBe(false);
  });
  it("sin permiso de lectura no ve a nadie", async () => {
    expect(canSee(await allowedLearners(deps([]), "o", "m", null), "u1")).toBe(false);
  });
});
