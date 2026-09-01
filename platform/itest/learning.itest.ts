import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { addLesson, createCompetency, createPath, createPuesto, createSector } from "../src/services/catalog.js";
import { enroll, getLevel, recordKnowledgeTest, startOnboarding } from "../src/services/learning.js";

const deps = { db, newId };

describe("flujo de aprendizaje (integración contra Postgres)", () => {
  it("onboarding -> matrícula -> test: aprobar desbloquea Nivel 1, suspender no", async () => {
    const orgId = await createCompany(deps, "ACME Test");
    const userId = await createUser(deps, "Ana", `ana-${newId()}@test.local`);
    await addMember(deps, orgId, userId, "empleado");

    const sectorId = await createSector(deps, orgId, "Distribución industrial");
    const puestoId = await createPuesto(deps, orgId, "Comercial", sectorId);
    const compId = await createCompetency(deps, orgId, "Facturación", { puestoId, critical: true });
    const pathId = await createPath(deps, orgId, "Facturación de la A a la Z", compId);

    await startOnboarding(deps, { orgId, userId, sector: "Distribución industrial", puesto: "Comercial", motivo: "vender mejor" });
    await enroll(deps, orgId, userId, pathId, compId);

    // suspende -> nivel 0
    const fail = await recordKnowledgeTest(deps, { orgId, userId, pathId, competencyId: compId, score: 50 });
    expect(fail.passed).toBe(false);
    expect(fail.level).toBe(0);

    // aprueba -> nivel 1 (En formación)
    const pass = await recordKnowledgeTest(deps, { orgId, userId, pathId, competencyId: compId, score: 85 });
    expect(pass.passed).toBe(true);
    expect(pass.level).toBe(1);

    expect(await getLevel(deps, orgId, userId, compId)).toBe(1);
  });

  it("doctrina de certeza: no se publica una lección sin fuente + fecha", async () => {
    const orgId = await createCompany(deps, "ACME Cert");
    const pathId = await createPath(deps, orgId, "Ruta");
    // publicar sin fuente/fecha -> error
    await expect(addLesson(deps, orgId, { pathId, title: "L1", body: "x", published: true }))
      .rejects.toThrow(/fuente y fecha/i);
    // con fuente + fecha -> ok
    const id = await addLesson(deps, orgId, {
      pathId, title: "L1", body: "x", published: true,
      fuente: "https://www.odoo.com/documentation", fechaRevision: new Date(),
    });
    expect(id).toBeTruthy();
  });
});
