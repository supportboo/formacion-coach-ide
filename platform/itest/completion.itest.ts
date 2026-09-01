import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { createCompetency, createPath } from "../src/services/catalog.js";
import { enroll, recordKnowledgeTest } from "../src/services/learning.js";
import { assertCanProgress, createCase, submitCase, validateCase } from "../src/services/validation.js";
import { captureBaseline, latestBaseline, timeToAutonomyDays } from "../src/services/analytics.js";

const deps = { db, newId };

describe("gate de progreso + línea base + tiempo a autonomía (integración)", () => {
  it("un caso sin validar bloquea el progreso; validar lo libera; el panel mide tiempo y línea base", async () => {
    const orgId = await createCompany(deps, "ACME Fin");
    const admin = await createUser(deps, "Jefe", `j-${newId()}@t.local`);
    await addMember(deps, orgId, admin, "admin");
    const learner = await createUser(deps, "Ana", `a-${newId()}@t.local`);
    await addMember(deps, orgId, learner, "empleado");

    const compId = await createCompetency(deps, orgId, "Facturación", { critical: true });
    const pathId = await createPath(deps, orgId, "Ruta", compId);
    await enroll(deps, orgId, learner, pathId, compId);
    await recordKnowledgeTest(deps, { orgId, userId: learner, pathId, competencyId: compId, score: 90 });

    const caseId = await createCase(deps, { orgId, userId: learner, competencyId: compId, pathId, prompt: "resuelve" });
    await submitCase(deps, orgId, caseId, "resuelto");

    // gate: pendiente -> no progresa
    await expect(assertCanProgress(deps, orgId, learner, compId)).rejects.toThrow(/pendiente de validar/i);

    // validar -> libera el gate y sube a N2
    await validateCase(deps, { orgId, caseId, validatorId: admin, validatorRole: "admin", decision: "aprobado" });
    await expect(assertCanProgress(deps, orgId, learner, compId)).resolves.toBeUndefined();

    // panel: tiempo a autonomía es un número >= 0
    const t = await timeToAutonomyDays(deps, orgId);
    expect(typeof t).toBe("number");
    expect(t).toBeGreaterThanOrEqual(0);

    // línea base: se captura y se recupera con datos medidos
    await captureBaseline(deps, orgId);
    const base = await latestBaseline(deps, orgId);
    expect(base).toBeTruthy();
    expect(Array.isArray((base!.data as any).coverage)).toBe(true);
    expect(typeof (base!.data as any).timeToAutonomyDays).toBe("number");
  });
});
