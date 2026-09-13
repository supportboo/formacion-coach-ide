import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { addLesson, createCompetency, createPath, createPuesto, createSector } from "../src/services/catalog.js";
import { enroll, getLevel, listMyEnrollments, recordKnowledgeTest, startOnboarding } from "../src/services/learning.js";

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

  it("onboarding matricula solo automática cuando el texto encaja de verdad con el catálogo", async () => {
    const orgId = await createCompany(deps, "ACME Match");
    const userId = await createUser(deps, "Bea", `bea-${newId()}@test.local`);
    await addMember(deps, orgId, userId, "empleado");

    const sectorId = await createSector(deps, orgId, "Retail");
    const puestoId = await createPuesto(deps, orgId, "Responsable de almacén", sectorId);
    const compId = await createCompetency(deps, orgId, "Gestión de stock", { puestoId });
    const pathId = await createPath(deps, orgId, "Stock de la A a la Z", compId);

    // Puesto que SÍ encaja (contención de texto, sin acentos/mayúsculas) -> matricula sola.
    const hit = await startOnboarding(deps, {
      orgId, userId, sector: "retail", puesto: "responsable de almacen", motivo: "aprender",
    });
    expect(hit.matchedPaths.map((p) => p.pathId)).toContain(pathId);
    const mine = await listMyEnrollments(deps, orgId, userId);
    expect(mine.some((e) => e.pathId === pathId)).toBe(true);

    // Puesto que NO existe en el catálogo -> nunca se inventa una ruta.
    const userId2 = await createUser(deps, "Caro", `caro-${newId()}@test.local`);
    await addMember(deps, orgId, userId2, "empleado");
    const miss = await startOnboarding(deps, { orgId, userId: userId2, sector: "aeroespacial", puesto: "ingeniera de vuelo" });
    expect(miss.matchedPaths).toEqual([]);
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
