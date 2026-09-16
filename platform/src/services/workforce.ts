// Matriz de equipo para admin: "todos los colores" de la organización, con datos REALES de uso
// (nunca un test de personalidad tipo MBTI/DISC — eso es pseudociencia; aquí se mide comportamiento
// real en la plataforma: quién estudia/subraya, quién aporta casos al tutor, quién aplica de verdad).
// Multi-tenant: siempre acotado a organizationId, nunca cruza empresas.
import { and, eq } from "drizzle-orm";
import { annotation, member, user } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

export interface WorkforceMember {
  userId: string; name: string; email: string; orgRole: string;
  xp: number; ann: number; contrib: number; applied: number;
  archetype: "aprende" | "aporta" | "aplica"; archetypeLabel: string;
}

const ARCHETYPES: Record<WorkforceMember["archetype"], string> = {
  aprende: "El Analítico", aporta: "El Conector", aplica: "El Ejecutor",
};

/** Agrega la actividad real de cada miembro de la organización en 3 ejes medibles hoy. */
export async function orgWorkforce(deps: SvcDeps, orgId: string): Promise<WorkforceMember[]> {
  const members = await deps.db.select({ userId: member.userId, orgRole: member.orgRole, name: user.name, email: user.email })
    .from(member).innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId));
  const rows = await deps.db.select().from(annotation)
    .where(and(eq(annotation.organizationId, orgId)));

  const byUser = new Map<string, { ann: number; contrib: number; applied: number }>();
  const seedByUser = new Map<string, WorkforceMember["archetype"]>(); // de lo que el usuario respondió en su onboarding real
  for (const m of members) byUser.set(m.userId, { ann: 0, contrib: 0, applied: 0 });
  for (const r of rows) {
    if (r.source === "onboarding") {
      // Semilla honesta: mientras no hay comportamiento real, partimos de lo que la persona
      // dijo de sí misma en el onboarding (nunca un test nuevo de personalidad, solo su propia
      // respuesta real a "¿cómo aprendes mejor?"). En cuanto haya actividad real, esta semilla
      // deja de usarse.
      const body = String(r.body || "");
      const m2 = body.match(/^\[estilo\]\s*(.+)$/i);
      if (m2) {
        const v = m2[1]!.toLowerCase();
        if (v.indexOf("práctic") >= 0 || v.indexOf("practic") >= 0) seedByUser.set(r.userId, "aplica");
        else if (v.indexOf("ejemplo") >= 0) seedByUser.set(r.userId, "aporta");
        else seedByUser.set(r.userId, "aprende"); // "viendo vídeos" / "teoría primero"
      }
      continue;
    }
    const agg = byUser.get(r.userId);
    if (!agg) continue; // fila de un usuario que ya no es miembro
    const body = String(r.body || "");
    if (r.kind === "insight") {
      if (body.indexOf("[sintesis]") === 0) continue; // memoria interna del tutor, no actividad del usuario
      if (body.indexOf("[adopcion:aplicar]") === 0) agg.applied += 1;
      else if (body.indexOf("[adopcion:repasar]") === 0) agg.applied += 0.3; // intención, no aplicación confirmada
      else agg.contrib += 1;
    } else {
      agg.ann += 1;
    }
  }

  return members.map((m) => {
    const a = byUser.get(m.userId) || { ann: 0, contrib: 0, applied: 0 };
    const xp = Math.round(a.ann * 1 + a.contrib * 2 + a.applied * 5);
    const ranked: [WorkforceMember["archetype"], number][] =
      [["aprende", a.ann], ["aporta", a.contrib], ["aplica", a.applied]];
    ranked.sort((x, y) => y[1] - x[1]);
    const top = ranked[0]!; // el array siempre tiene 3 elementos fijos
    const archetype = top[1] > 0 ? top[0] : (seedByUser.get(m.userId) ?? "aprende");
    return {
      userId: m.userId, name: m.name, email: m.email, orgRole: m.orgRole,
      xp, ann: a.ann, contrib: a.contrib, applied: a.applied,
      archetype, archetypeLabel: ARCHETYPES[archetype],
    };
  });
}
