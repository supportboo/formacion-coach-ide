import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { createCompetency, createPuesto } from "../src/services/catalog.js";
import { setLevelAtLeast } from "../src/services/learning.js";
import { definePath, myProgress } from "../src/services/career.js";

const deps = { db, newId };

describe("plan de carrera (integración contra Postgres)", () => {
  it("solo es elegible cuando cumple TODOS los requisitos de niveles reales", async () => {
    const orgId = await createCompany(deps, "ACME Carrera");
    const learner = await createUser(deps, "Ana", `ana-${newId()}@t.local`);
    await addMember(deps, orgId, learner, "empleado");

    const compA = await createCompetency(deps, orgId, "Ventas");
    const compB = await createCompetency(deps, orgId, "Negociación");
    const puestoSenior = await createPuesto(deps, orgId, "Comercial Senior");
    const pathId = await definePath(deps, {
      orgId, toPuestoId: puestoSenior,
      requirements: [{ competencyId: compA, minLevel: 2 }, { competencyId: compB, minLevel: 2 }],
    });

    let progress = await myProgress(deps, orgId, learner);
    expect(progress.find((p) => p.pathId === pathId)!.eligible).toBe(false);

    await setLevelAtLeast(deps, orgId, learner, compA, 2);
    progress = await myProgress(deps, orgId, learner);
    expect(progress.find((p) => p.pathId === pathId)!.eligible).toBe(false); // falta compB

    await setLevelAtLeast(deps, orgId, learner, compB, 2);
    progress = await myProgress(deps, orgId, learner);
    const p = progress.find((x) => x.pathId === pathId)!;
    expect(p.eligible).toBe(true);
    expect(p.requirements.every((r) => r.met)).toBe(true);
  });

  it("definir un plan sin requisitos falla (no tiene sentido un ascenso sin condiciones)", async () => {
    const orgId = await createCompany(deps, "ACME Carrera 2");
    const puesto = await createPuesto(deps, orgId, "Manager");
    await expect(definePath(deps, { orgId, toPuestoId: puesto, requirements: [] }))
      .rejects.toThrow(/al menos un requisito/);
  });
});
