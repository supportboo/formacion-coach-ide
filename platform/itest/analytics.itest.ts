import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { coaching } from "../src/db/schema.js";
import { addMember, createCompany, createUser } from "../src/services/org.js";
import { createCompetency } from "../src/services/catalog.js";
import { setLevelAtLeast } from "../src/services/learning.js";
import { coverage, dependencyRisks, internalTransferRate } from "../src/services/analytics.js";

const deps = { db, newId };

describe("panel ROI / analytics (integración contra Postgres)", () => {
  it("cobertura, riesgo de dependencia y transferencia interna", async () => {
    const orgId = await createCompany(deps, "ACME Panel");
    const e1 = await createUser(deps, "E1", `e1-${newId()}@t.local`);
    const e2 = await createUser(deps, "E2", `e2-${newId()}@t.local`);
    const e3 = await createUser(deps, "E3", `e3-${newId()}@t.local`);
    for (const e of [e1, e2, e3]) await addMember(deps, orgId, e, "empleado");

    const compId = await createCompetency(deps, orgId, "Facturación", { critical: true });
    await setLevelAtLeast(deps, orgId, e1, compId, 2);
    await setLevelAtLeast(deps, orgId, e2, compId, 2);
    // e3 sin nivel

    // un logro de coaching interno (e1 formó a e2)
    await db.insert(coaching).values({
      id: newId(), organizationId: orgId, coachId: e1, learnerId: e2, competencyId: compId, status: "logrado",
    });

    const cov = await coverage(deps, orgId);
    const row = cov.find((c) => c.competencyId === compId)!;
    expect(row.total).toBe(3);
    expect(row.atApply).toBe(2);
    expect(row.pct).toBe(67); // round(2/3*100)

    const risks = await dependencyRisks(deps, orgId);
    const risk = risks.find((r) => r.competencyId === compId)!;
    expect(risk.referentes).toBe(0); // crítica sin referentes = riesgo

    expect(await internalTransferRate(deps, orgId)).toBe(0.5); // 1 de 2 con coach interno
  });
});
