import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { createCompetency, createPath } from "../src/services/catalog.js";
import { recordKnowledgeTest } from "../src/services/learning.js";
import { createCase, hasPendingCase, setRubric, submitCase, validateCase } from "../src/services/validation.js";

const deps = { db, newId };

describe("validación de caso práctico (integración contra Postgres)", () => {
  it("subir a Nivel 2 exige validación humana de un autorizado; no autoservicio", async () => {
    const orgId = await createCompany(deps, "ACME Val");
    const learner = await createUser(deps, "Ana", `ana-${newId()}@t.local`);
    await addMember(deps, orgId, learner, "empleado");
    const other = await createUser(deps, "Otro", `otro-${newId()}@t.local`);
    await addMember(deps, orgId, other, "empleado");
    const boss = await createUser(deps, "Jefe", `jefe-${newId()}@t.local`);
    await addMember(deps, orgId, boss, "admin");

    const compId = await createCompetency(deps, orgId, "Facturación", { critical: true });
    const pathId = await createPath(deps, orgId, "Ruta facturación", compId);
    await setRubric(deps, orgId, compId, [{ label: "Aplica el descuento correcto" }, { label: "Justifica la rectificativa" }]);

    // N1 por test
    await recordKnowledgeTest(deps, { orgId, userId: learner, pathId, competencyId: compId, score: 90 });

    const caseId = await createCase(deps, { orgId, userId: learner, competencyId: compId, pathId, prompt: "Rectifica la factura F-2024-001" });
    await submitCase(deps, orgId, caseId, "He creado la nota de crédito y ajustado las líneas.");

    expect(await hasPendingCase(deps, orgId, learner, compId)).toBe(true);

    // nadie valida su propio caso
    await expect(validateCase(deps, { orgId, caseId, validatorId: learner, validatorRole: "empleado", decision: "aprobado" }))
      .rejects.toThrow(/su propio caso/i);
    // un empleado no autorizado (no es nivel 3) no puede validar
    await expect(validateCase(deps, { orgId, caseId, validatorId: other, validatorRole: "empleado", decision: "aprobado" }))
      .rejects.toThrow(/no es referente/i);

    // el responsable valida -> sube a Nivel 2
    const res = await validateCase(deps, { orgId, caseId, validatorId: boss, validatorRole: "admin", decision: "aprobado", feedback: "Bien" });
    expect(res.status).toBe("aprobado");
    expect(res.level).toBe(2);

    // ya no hay caso pendiente
    expect(await hasPendingCase(deps, orgId, learner, compId)).toBe(false);
  });
});
