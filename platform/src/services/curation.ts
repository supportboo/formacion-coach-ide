import { eq } from "drizzle-orm";
import { member, user } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { firstJson } from "./aiContent.js";

/**
 * Curador de datos (Governance): que NADA privado de un usuario llegue a otro por el cerebro
 * compartido. Dos capas:
 *  1) `curateForBrain`: la IA transforma la experiencia real en una lección práctica/emocional
 *     ANÓNIMA (sin clientes, nombres ni datos sensibles); si no queda nada reutilizable, la omite.
 *  2) `scrubPII` (determinista, testeable): red de seguridad que quita emails, teléfonos y los
 *     NOMBRES de los miembros de la organización, por si la IA se dejó alguno.
 * Doctrina: se deja pasar la ENSEÑANZA transformada; se bloquea lo identificable o comprometido.
 */

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE = /\b\+?\d(?:[\d ]{7,}\d)\b/g;

/** Escrub determinista de PII. `names` = nombres de personas a redactar (miembros de la org). */
export function scrubPII(text: string, names: string[]): { text: string; redacted: boolean } {
  let out = String(text || ""), red = false;
  const before1 = out; out = out.replace(EMAIL, "[email]"); if (out !== before1) red = true;
  const before2 = out; out = out.replace(PHONE, "[teléfono]"); if (out !== before2) red = true;
  // Redacta el nombre completo y cada parte de ≥3 letras (nombre o apellido sueltos).
  const tokens = new Set<string>();
  for (const n of names) {
    const clean = String(n || "").trim();
    if (clean.length >= 3) tokens.add(clean);
    for (const p of clean.split(/\s+/)) if (p.length >= 3) tokens.add(p);
  }
  // De más largo a más corto para no dejar restos.
  for (const tok of [...tokens].sort((a, b) => b.length - a.length)) {
    const re = new RegExp("\\b" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    const before = out; out = out.replace(re, "[persona]"); if (out !== before) red = true;
  }
  return { text: out, redacted: red };
}

/** Nombres de los miembros de una organización (para el escrub). */
export async function orgMemberNames(deps: SvcDeps, orgId: string): Promise<string[]> {
  const rows = await deps.db.select({ name: user.name }).from(member)
    .innerJoin(user, eq(member.userId, user.id)).where(eq(member.organizationId, orgId));
  return rows.map((r) => r.name).filter((n): n is string => !!n && n.trim().length >= 3);
}

export interface Curated { text: string; ok: boolean; redacted: boolean }

/** Cura una experiencia cruda para el cerebro compartido (IA anonimiza + escrub determinista). */
export async function curateForBrain(
  deps: SvcDeps, llm: Llm, args: { orgId: string; text: string; topic?: string; userId?: string },
): Promise<Curated> {
  const system =
    "Eres el curador de datos de SkillUp. Recibes una experiencia real de una persona y la conviertes en conocimiento REUTILIZABLE y ANÓNIMO para el equipo. "
    + "REGLA INNEGOCIABLE: elimina cualquier dato que identifique o comprometa — nombres de personas o clientes, empresas concretas, cifras confidenciales, o detalles del caso que revelen de quién se trata. "
    + "Conserva y transforma la ENSEÑANZA: qué funcionó, el criterio, cómo se afrontó y cómo se sintió, en términos generales que otro pueda aplicar. Si sin los datos privados no queda nada reutilizable, omítela. "
    + 'Español de España, claro. Responde SOLO JSON: {"leccion":"..."} o {"omit":true}.';
  try {
    const out = await llm.generate({
      system, messages: [{ role: "user", content: (args.topic ? `Tema: ${args.topic}\n\n` : "") + args.text }],
      maxTokens: 400, orgId: args.orgId, userId: args.userId, kind: "curation",
    });
    const j = firstJson<{ leccion?: string; omit?: boolean }>(out);
    if (j.omit || !j.leccion) return { text: "", ok: false, redacted: true };
    const s = scrubPII(j.leccion, await orgMemberNames(deps, args.orgId));
    return { text: s.text, ok: true, redacted: s.redacted };
  } catch { return { text: "", ok: false, redacted: false }; }
}
