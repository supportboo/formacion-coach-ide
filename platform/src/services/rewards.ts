import { and, eq } from "drizzle-orm";
import { certificate, pointsLedger, rewardGrant, rewardRule } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import { currentSeason } from "./propagation.js";

export type RewardKind = "certificado" | "titulo" | "punto" | "perk" | "senal_rrhh";

export interface RuleInput {
  orgId: string; event: string; params?: Record<string, unknown>;
  reward: RewardKind; rewardParams?: Record<string, unknown>; active?: boolean;
}

export async function defineRule(deps: SvcDeps, input: RuleInput): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(rewardRule).values({
    id, organizationId: input.orgId, event: input.event, params: input.params ?? null,
    reward: input.reward, rewardParams: input.rewardParams ?? null, active: input.active ?? true,
  });
  return id;
}

function certCode(newId: () => string): string {
  return "CERT-" + newId().replace(/-/g, "").slice(0, 12).toUpperCase();
}

/** Emite un certificado verificable con la evidencia detrás. */
export async function issueCertificate(
  deps: SvcDeps, args: { orgId: string; userId: string; competencyId?: string; title: string; evidence?: Record<string, unknown> },
): Promise<{ id: string; code: string }> {
  const id = deps.newId();
  const code = certCode(deps.newId);
  await deps.db.insert(certificate).values({
    id, organizationId: args.orgId, userId: args.userId, competencyId: args.competencyId ?? null,
    title: args.title, code, evidence: args.evidence ?? null,
  });
  return { id, code };
}

/** Verificación pública de un certificado por su código. */
export async function verifyCertificate(deps: SvcDeps, code: string) {
  const [row] = await deps.db.select().from(certificate).where(eq(certificate.code, code));
  return row ?? null;
}

export interface Granted { reward: RewardKind; ruleId: string; refId?: string }

/**
 * Motor de reglas: ante un evento (n2 alcanzado, referente…), dispara las recompensas
 * configuradas por la empresa. Solo recompensas no salariales (certificado/título/punto/perk/señal RR.HH.).
 */
export async function evaluateRules(
  deps: SvcDeps,
  ev: { orgId: string; event: string; userId: string; competencyId?: string; context?: Record<string, unknown> },
): Promise<Granted[]> {
  const rules = await deps.db.select().from(rewardRule)
    .where(and(eq(rewardRule.organizationId, ev.orgId), eq(rewardRule.event, ev.event), eq(rewardRule.active, true)));

  const granted: Granted[] = [];
  for (const r of rules) {
    // filtro por competencia si la regla la acota
    const ruleComp = r.params?.["competencyId"] as string | undefined;
    if (ruleComp && ruleComp !== ev.competencyId) continue;

    const rp = r.rewardParams ?? {};
    if (r.reward === "certificado") {
      const title = (rp["title"] as string) ?? "Certificado de competencia";
      const cert = await issueCertificate(deps, {
        orgId: ev.orgId, userId: ev.userId, competencyId: ev.competencyId, title,
        evidence: { event: ev.event, ...ev.context },
      });
      granted.push({ reward: "certificado", ruleId: r.id, refId: cert.code });
    } else if (r.reward === "punto") {
      const pts = Number(rp["points"] ?? 0);
      await deps.db.insert(pointsLedger).values({
        id: deps.newId(), organizationId: ev.orgId, userId: ev.userId, season: currentSeason(),
        points: pts, reason: `regla:${ev.event}`, refId: r.id,
      });
      granted.push({ reward: "punto", ruleId: r.id });
    } else {
      // titulo | perk | senal_rrhh -> se registra la concesión (no salarial)
      await deps.db.insert(rewardGrant).values({
        id: deps.newId(), organizationId: ev.orgId, userId: ev.userId, ruleId: r.id, reward: r.reward, refId: ev.competencyId ?? null,
      });
      granted.push({ reward: r.reward as RewardKind, ruleId: r.id });
    }
  }
  return granted;
}
