import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { creditLedger } from "../src/db/schema.js";
import { createCompany } from "../src/services/org.js";
import { balance, creditFromCheckout, spendCredits } from "../src/services/credits.js";

const deps = { db, newId };

describe("créditos (integración contra Postgres)", () => {
  it("compra idempotente por sesión y gasto atómico sin saldo negativo", async () => {
    const orgId = await createCompany(deps, "ACME Créditos");
    const session = { id: `cs_it_${newId()}`, payment_status: "paid", metadata: { kind: "credits", organizationId: orgId, pack: "p100" } } as never;
    expect(await creditFromCheckout(deps, session)).toBe(true);
    expect(await creditFromCheckout(deps, session)).toBe(false); // webhook repetido
    expect(await balance(deps, orgId)).toBe(100);

    const s = { orgId, userId: newId(), role: "coach", platformAdmin: false };
    // 100 créditos, 6 gastos simultáneos de 20: pasan 5 exactos.
    const res = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => spendCredits(deps, s, "curso_ia", 1, `r${i}`)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await balance(deps, orgId)).toBe(0);
    await db.delete(creditLedger).where((await import("drizzle-orm")).eq(creditLedger.organizationId, orgId));
  });
});
