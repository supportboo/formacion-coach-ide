import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { aiUsage } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { LlmUsage } from "../agents/llm.js";

// USD por millon de tokens (input/output), precio de lista Anthropic. Ajustar aqui si cambia
// el precio o el modelo -- el ledger guarda tokens crudos, nunca el coste ya calculado.
const RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};
const DEFAULT_RATE = { input: 3, output: 15 };

export function usdCost(model: string, inputTokens: number, outputTokens: number): number {
  const r = RATES[model] ?? DEFAULT_RATE;
  return (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output;
}

export function makeUsageRecorder(deps: SvcDeps) {
  return async (u: LlmUsage): Promise<void> => {
    await deps.db.insert(aiUsage).values({
      id: deps.newId(), organizationId: u.orgId, userId: u.userId ?? null,
      kind: u.kind, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens,
    });
  };
}

export interface CostSummary {
  calls: number; inputTokens: number; outputTokens: number; usd: number;
  byKind: { kind: string; calls: number; usd: number }[];
}

async function summarize(deps: SvcDeps, where: ReturnType<typeof and>): Promise<CostSummary> {
  const rows = await deps.db.select({
    kind: aiUsage.kind, model: aiUsage.model,
    calls: sql<number>`count(*)::int`,
    inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
    outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
  }).from(aiUsage).where(where).groupBy(aiUsage.kind, aiUsage.model);

  let calls = 0, inputTokens = 0, outputTokens = 0, usd = 0;
  const byKindMap = new Map<string, { calls: number; usd: number }>();
  for (const r of rows) {
    const cost = usdCost(r.model, r.inputTokens, r.outputTokens);
    calls += r.calls; inputTokens += r.inputTokens; outputTokens += r.outputTokens; usd += cost;
    const acc = byKindMap.get(r.kind) ?? { calls: 0, usd: 0 };
    acc.calls += r.calls; acc.usd += cost;
    byKindMap.set(r.kind, acc);
  }
  const byKind = Array.from(byKindMap, ([kind, v]) => ({ kind, calls: v.calls, usd: Math.round(v.usd * 10000) / 10000 }));
  return { calls, inputTokens, outputTokens, usd: Math.round(usd * 10000) / 10000, byKind };
}

/** Coste de una empresa en los ultimos N dias (30 por defecto). */
export async function orgCost(deps: SvcDeps, orgId: string, sinceDays = 30): Promise<CostSummary> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  return summarize(deps, and(eq(aiUsage.organizationId, orgId), gte(aiUsage.createdAt, since)));
}

/** Consumo de UN usuario (sus propias llamadas) en los ultimos N dias, para su panel personal. */
export async function userUsage(deps: SvcDeps, orgId: string, userId: string, sinceDays = 30): Promise<CostSummary & { generated: number }> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const s = await summarize(deps, and(eq(aiUsage.organizationId, orgId), eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)));
  const genKinds = new Set(["lesson", "case", "exam"]);
  const generated = s.byKind.filter((k) => genKinds.has(k.kind)).reduce((a, k) => a + k.calls, 0);
  return { ...s, generated };
}

/** Coste de toda la plataforma (todas las empresas + orquestador) en los ultimos N dias. */
export async function platformCost(deps: SvcDeps, sinceDays = 30): Promise<CostSummary> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  return summarize(deps, gte(aiUsage.createdAt, since));
}

/** Solo el uso a nivel plataforma (orquestador cross-empresa, organizationId null). */
export async function platformOnlyCost(deps: SvcDeps, sinceDays = 30): Promise<CostSummary> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  return summarize(deps, and(isNull(aiUsage.organizationId), gte(aiUsage.createdAt, since)));
}
