import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { createCompany, createUser } from "../src/services/org.js";
import { createAction, exportJustification, recordParticipation } from "../src/services/fundae.js";

const deps = { db, newId };

describe("FUNDAE (integración contra Postgres)", () => {
  it("acción ≥2h con tutor es bonificable; controles al 75% finalizan; cert. profesionalidad no bonifica", async () => {
    const orgId = await createCompany(deps, "ACME Fundae");
    const tutor = await createUser(deps, "Coach", `t-${newId()}@t.local`);
    const alumno = await createUser(deps, "Ana", `a-${newId()}@t.local`);

    // < 2h -> no bonificable (error)
    await expect(createAction(deps, { orgId, title: "Corto", horas: 1, tutorId: tutor }))
      .rejects.toThrow(/mínimo 2 horas/i);

    // acción válida
    const actionId = await createAction(deps, { orgId, title: "Facturación en Odoo", horas: 4, tutorId: tutor });
    const p1 = await recordParticipation(deps, { orgId, actionId, userId: alumno, controlsTotal: 10, controlsDone: 8 });
    expect(p1.finalizado).toBe(true); // 80% >= 75%
    const p2 = await recordParticipation(deps, { orgId, actionId, userId: await createUser(deps, "Otro", `o-${newId()}@t.local`), controlsTotal: 10, controlsDone: 7 });
    expect(p2.finalizado).toBe(false); // 70% < 75%

    const just = await exportJustification(deps, orgId, actionId);
    expect(just.bonificable).toBe(true);
    expect(just.action.tutorId).toBe(tutor);
    expect(just.participants.length).toBe(2);
    expect(just.participants.some((p) => p.finalizado)).toBe(true);

    // certificado de profesionalidad -> no bonificable por esta vía
    const certAction = await createAction(deps, { orgId, title: "Cert Prof", horas: 30, tutorId: tutor, esCertProfesionalidad: true });
    const j2 = await exportJustification(deps, orgId, certAction);
    expect(j2.bonificable).toBe(false);
    expect(j2.motivoNoBonificable).toMatch(/certificado de profesionalidad/i);
  });
});
