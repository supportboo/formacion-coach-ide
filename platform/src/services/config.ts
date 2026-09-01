import { eq } from "drizzle-orm";
import { companyConfig } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

const DEFAULT_LABELS: Record<string, string> = {
  "1": "En formación", "2": "Aplica", "3": "Referente", "4": "Custodio",
};

/** Configura la empresa: nombres de niveles y si el reconocimiento se liga a salario (default no). */
export async function setCompanyConfig(
  deps: SvcDeps, orgId: string, cfg: { levelLabels?: Record<string, string>; salaryLinked?: boolean },
): Promise<void> {
  await deps.db.insert(companyConfig)
    .values({ organizationId: orgId, levelLabels: cfg.levelLabels ?? null, salaryLinked: cfg.salaryLinked ?? false })
    .onConflictDoUpdate({
      target: companyConfig.organizationId,
      set: {
        ...(cfg.levelLabels !== undefined ? { levelLabels: cfg.levelLabels } : {}),
        ...(cfg.salaryLinked !== undefined ? { salaryLinked: cfg.salaryLinked } : {}),
        updatedAt: new Date(),
      },
    });
}

export async function getCompanyConfig(deps: SvcDeps, orgId: string) {
  const [row] = await deps.db.select().from(companyConfig).where(eq(companyConfig.organizationId, orgId));
  return row ?? null;
}

/** Nombre del nivel según la empresa (o el por defecto). */
export async function levelLabel(deps: SvcDeps, orgId: string, level: number): Promise<string> {
  const cfg = await getCompanyConfig(deps, orgId);
  return cfg?.levelLabels?.[String(level)] ?? DEFAULT_LABELS[String(level)] ?? `Nivel ${level}`;
}
