import { describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { createCompany, createUser } from "../src/services/org.js";
import { createCompetency } from "../src/services/catalog.js";
import { currentSeason, seasonPoints } from "../src/services/propagation.js";
import { getCompanyConfig, levelLabel, setCompanyConfig } from "../src/services/config.js";
import { defineRule, evaluateRules, verifyCertificate } from "../src/services/rewards.js";

const deps = { db, newId };

describe("config de empresa + motor de reglas (integración contra Postgres)", () => {
  it("títulos configurables, reglas por evento, certificado verificable; sin salario", async () => {
    const orgId = await createCompany(deps, "ACME Reglas");
    const u1 = await createUser(deps, "Ana", `ana-${newId()}@t.local`);
    const compId = await createCompetency(deps, orgId, "Facturación", { critical: true });

    // config: títulos propios
    await setCompanyConfig(deps, orgId, { levelLabels: { "3": "Referente de facturación" } });
    expect(await levelLabel(deps, orgId, 3)).toBe("Referente de facturación");
    expect(await levelLabel(deps, orgId, 1)).toBe("En formación"); // por defecto
    expect((await getCompanyConfig(deps, orgId))?.salaryLinked).toBe(false); // guardarraíl

    // reglas
    await defineRule(deps, { orgId, event: "n2", reward: "punto", rewardParams: { points: 10 } });
    await defineRule(deps, { orgId, event: "n2", reward: "perk" });
    await defineRule(deps, { orgId, event: "n2", reward: "punto", rewardParams: { points: 999 }, active: false });
    await defineRule(deps, { orgId, event: "n2", reward: "certificado", params: { competencyId: "otra-comp" } });
    await defineRule(deps, { orgId, event: "referente", reward: "certificado", params: { competencyId: compId }, rewardParams: { title: "Referente de facturación" } });

    // evento n2 -> punto(10) + perk; NO el inactivo (999) NI el cert de otra competencia
    const g1 = await evaluateRules(deps, { orgId, event: "n2", userId: u1, competencyId: compId });
    expect(g1.map((g) => g.reward).sort()).toEqual(["perk", "punto"]);
    expect(await seasonPoints(deps, orgId, u1, currentSeason())).toBe(10);

    // evento referente -> certificado verificable con el título de la empresa
    const g2 = await evaluateRules(deps, { orgId, event: "referente", userId: u1, competencyId: compId });
    const cert = g2.find((g) => g.reward === "certificado")!;
    expect(cert).toBeTruthy();
    const verified = await verifyCertificate(deps, cert.refId!);
    expect(verified?.title).toBe("Referente de facturación");
    expect(verified?.userId).toBe(u1);
  });
});
