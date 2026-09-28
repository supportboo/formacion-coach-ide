// Ficha de la empresa (1.13.0, revisión externa del 28-09): el contexto que no hay que preguntar a cada alumno —oferta,
// públicos, terminología, herramientas autorizadas y excluidas, competencias prioritarias y límites—. La prepara y la
// VALIDA un responsable; solo la versión validada llega a tutor, «Para ti» y recursos. La web ayuda a hacer un borrador,
// pero nunca cuenta como validada.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { companyConfig } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";
import { firstJson } from "./aiContent.js";
import { analyzeCompany } from "./onboarding.js";

const list = z.array(z.string().trim().min(1).max(80)).max(40).default([]);
export const profileSchema = z.object({
  oferta: z.string().trim().max(1500).default(""),
  publicos: z.string().trim().max(1000).default(""),
  terminologia: z.string().trim().max(1500).default(""),
  herramientasAutorizadas: list,
  herramientasExcluidas: list,
  competenciasPrioritarias: list,
  limites: z.string().trim().max(1500).default(""),
});
export type CompanyProfile = z.infer<typeof profileSchema>;

export async function get(deps: SvcDeps, orgId: string) {
  const [row] = await deps.db.select().from(companyConfig).where(eq(companyConfig.organizationId, orgId));
  const parsed = profileSchema.safeParse(row?.profile ?? {});
  return { profile: parsed.success ? parsed.data : profileSchema.parse({}), validatedAt: row?.profileValidatedAt ?? null, validatedBy: row?.profileValidatedBy ?? null };
}

/** Guardar = validar: quien la guarda desde el panel es un responsable y firma la versión. */
export async function save(deps: SvcDeps, orgId: string, userId: string, profile: CompanyProfile): Promise<void> {
  const now = new Date();
  await deps.db.insert(companyConfig).values({ organizationId: orgId, profile, profileValidatedAt: now, profileValidatedBy: userId })
    .onConflictDoUpdate({ target: companyConfig.organizationId, set: { profile, profileValidatedAt: now, profileValidatedBy: userId, updatedAt: now } });
}

/** Bloque para los prompts. null si no hay ficha validada: mejor sin contexto que con uno sin revisar. */
export function promptBlock(p: CompanyProfile, validatedAt: Date | null): string | null {
  if (!validatedAt) return null;
  const parts = [
    p.oferta && `Qué ofrece: ${p.oferta}`,
    p.publicos && `A quién se dirige: ${p.publicos}`,
    p.terminologia && `Sus términos propios: ${p.terminologia}`,
    p.herramientasAutorizadas.length && `Herramientas que usa la empresa (propón hacerlo con ellas): ${p.herramientasAutorizadas.join(", ")}`,
    p.herramientasExcluidas.length && `Herramientas que NO se recomiendan en esta empresa: ${p.herramientasExcluidas.join(", ")}`,
    p.competenciasPrioritarias.length && `Competencias prioritarias: ${p.competenciasPrioritarias.join(", ")}`,
    p.limites && `Límites (qué no se puede decir ni prometer): ${p.limites}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export async function promptFor(deps: SvcDeps, orgId: string): Promise<string | null> {
  const { profile, validatedAt } = await get(deps, orgId);
  return promptBlock(profile, validatedAt);
}

/** ¿Esta herramienta está excluida en la empresa? Coincide por nombre o por dominio (texto libre del responsable). */
export function isExcluded(p: CompanyProfile, tool: { title: string; by: string; url: string }): boolean {
  const hay = `${tool.title} ${tool.by} ${tool.url}`.toLowerCase();
  return p.herramientasExcluidas.some((x) => { const k = x.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").trim(); return k.length >= 3 && hay.includes(k); });
}

const DRAFT_SYS = `Con el resumen de la web de una empresa, prepara un BORRADOR de su ficha para formar a su equipo. Solo lo que diga el resumen; lo que no aparezca, déjalo vacío (un responsable lo completará y validará). Español de España.
Devuelve SOLO JSON: {"oferta":"…","publicos":"…","terminologia":"términos propios separados por comas","herramientasAutorizadas":[],"herramientasExcluidas":[],"competenciasPrioritarias":[],"limites":""}`;

export async function draftFromWeb(url: string): Promise<CompanyProfile | null> {
  const web = await analyzeCompany(url);
  if (!web) return null;
  const { llm } = await import("../container.js");
  const out = await llm.generate({ system: DRAFT_SYS, model: env.MODEL_FAST, maxTokens: 700, kind: "company_profile", lang: "es",
    messages: [{ role: "user", content: `WEB: ${web.source}\nRESUMEN:\n${web.summary}` }] });
  let raw: unknown; try { raw = firstJson(out); } catch { return null; }
  const parsed = profileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
