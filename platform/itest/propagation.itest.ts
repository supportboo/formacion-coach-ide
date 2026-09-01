import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { createCompetency, createPath } from "../src/services/catalog.js";
import { getLevel, recordKnowledgeTest, setLevelAtLeast } from "../src/services/learning.js";
import { createCase, submitCase, validateCase } from "../src/services/validation.js";
import { assignCoach, onLearnerReachedN2, seasonPoints } from "../src/services/propagation.js";

const deps = { db, newId };
const SEASON = "2026-Q3";

async function newLearner(orgId: string) {
  const id = await createUser(deps, "Alumno", `al-${newId()}@t.local`);
  await addMember(deps, orgId, id, "empleado");
  return id;
}

/** Lleva a un alumno de 0 a N2 (test N1 + caso validado por admin) y dispara la propagación. */
async function toN2(orgId: string, learner: string, pathId: string, compId: string, admin: string) {
  await recordKnowledgeTest(deps, { orgId, userId: learner, pathId, competencyId: compId, score: 90 });
  const caseId = await createCase(deps, { orgId, userId: learner, competencyId: compId, pathId, prompt: "resuelve" });
  await submitCase(deps, orgId, caseId, "resuelto");
  await validateCase(deps, { orgId, caseId, validatorId: admin, validatorRole: "admin", decision: "aprobado" });
  await onLearnerReachedN2(deps, { orgId, learnerId: learner, competencyId: compId, season: SEASON });
}

describe("propagación y carrera (integración contra Postgres)", () => {
  it("formar a 2 alumnos hasta N2 asciende al coach a Referente y le paga (crítica x1,5)", async () => {
    const orgId = await createCompany(deps, "ACME Prop");
    const admin = await createUser(deps, "Jefe", `jefe-${newId()}@t.local`);
    await addMember(deps, orgId, admin, "admin");
    const coach = await createUser(deps, "Coach", `coach-${newId()}@t.local`);
    await addMember(deps, orgId, coach, "empleado");

    const compId = await createCompetency(deps, orgId, "Facturación", { critical: true });
    const pathId = await createPath(deps, orgId, "Ruta", compId);
    await setLevelAtLeast(deps, orgId, coach, compId, 2); // el coach aplica la competencia

    const l1 = await newLearner(orgId);
    const l2 = await newLearner(orgId);
    await assignCoach(deps, { orgId, coachId: coach, coachRole: "empleado", learnerId: l1, competencyId: compId });
    await assignCoach(deps, { orgId, coachId: coach, coachRole: "empleado", learnerId: l2, competencyId: compId });

    await toN2(orgId, l1, pathId, compId, admin);
    expect(await getLevel(deps, orgId, coach, compId)).toBe(2); // aún no (solo 1 mentee)
    await toN2(orgId, l2, pathId, compId, admin);

    expect(await getLevel(deps, orgId, coach, compId)).toBe(3);        // Referente
    expect(await seasonPoints(deps, orgId, coach, SEASON)).toBe(150);  // 2 x round(50*1,5)
    expect(await getLevel(deps, orgId, l1, compId)).toBe(2);
  });

  it("antifraude: tope de alumnos simultáneos por coach", async () => {
    const orgId = await createCompany(deps, "ACME Cap");
    const coach = await createUser(deps, "Coach", `c-${newId()}@t.local`);
    await addMember(deps, orgId, coach, "empleado");
    const compId = await createCompetency(deps, orgId, "Logística");
    await setLevelAtLeast(deps, orgId, coach, compId, 2);

    const a = await newLearner(orgId);
    const b = await newLearner(orgId);
    await assignCoach(deps, { orgId, coachId: coach, coachRole: "empleado", learnerId: a, competencyId: compId, cap: 1 });
    await expect(assignCoach(deps, { orgId, coachId: coach, coachRole: "empleado", learnerId: b, competencyId: compId, cap: 1 }))
      .rejects.toThrow(/tope/i);
  });
});
