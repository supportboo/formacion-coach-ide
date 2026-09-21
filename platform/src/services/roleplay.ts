import { and, eq } from "drizzle-orm";
import { roleplaySession } from "../db/schema.js";
import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";
import { firstJson } from "./aiContent.js";

const BASE = "Español de España, natural, sin acotaciones de guion ni asteriscos -- solo lo que diría en voz alta.";

export interface RoleplayArgs {
  competencyName: string; sector?: string | null; puesto?: string | null; orgId: string; userId: string;
  // Instrucciones del responsable/Team Leader al agente tutor: a quién interpreta y cómo comportarse
  // (dictadas o escritas). Si vienen, mandan sobre el personaje automático. Guardrail: es práctica,
  // la validación sigue siendo humana.
  brief?: string | null;
}

/** Elige un personaje de practica razonable para la competencia (determinista, sin IA: no hace falta gastar en esto). */
function pickPersona(competencyName: string): string {
  const name = competencyName.toLowerCase();
  if (/venta|negocia|cierre/.test(name)) return "un cliente potencial escéptico que pone pegas de precio";
  if (/reclama|atenci[oó]n|soporte/.test(name)) return "un cliente molesto que quiere una solución ya";
  if (/lidera|equipo|feedback/.test(name)) return "un miembro del equipo a la defensiva tras una crítica";
  return "un interlocutor exigente pero razonable, escéptico al principio";
}

function personaSystem(persona: string, competencyName: string, ctx: string): string {
  return `Haces de ${persona}, en una conversación de práctica para la competencia "${competencyName}"${ctx ? ` (${ctx})` : ""}. ` +
    `${BASE} No rompas el personaje ni des feedback dentro de la conversación -- eso viene después, aparte. ` +
    "Responde solo con la línea que diría el personaje, corta y natural (1-3 frases).";
}

export interface RoleplayTurn { sessionId: string; reply: string; status: "activo" | "cerrado" }

/** Abre una sesión de roleplay: el personaje da la primera línea. */
export async function startRoleplay(
  deps: SvcDeps, llm: Llm, args: RoleplayArgs & { competencyId: string },
): Promise<RoleplayTurn> {
  // Si el responsable ha dado un brief (instrucciones al agente), manda sobre el personaje automático.
  const persona = (args.brief && args.brief.trim()) ? args.brief.trim().slice(0, 1500) : pickPersona(args.competencyName);
  const ctx = [args.sector, args.puesto].filter(Boolean).join(", ");
  const system = personaSystem(persona, args.competencyName, ctx);
  const opening = await llm.generate({
    system, messages: [{ role: "user", content: "Empieza tú la conversación, como lo haría el personaje." }],
    maxTokens: 200, orgId: args.orgId, userId: args.userId, kind: "roleplay",
  });
  const id = deps.newId();
  await deps.db.insert(roleplaySession).values({
    id, organizationId: args.orgId, userId: args.userId, competencyId: args.competencyId,
    persona, transcript: [{ role: "assistant", content: opening }],
  });
  return { sessionId: id, reply: opening, status: "activo" };
}

async function loadSession(deps: SvcDeps, orgId: string, userId: string, id: string) {
  const [row] = await deps.db.select().from(roleplaySession)
    .where(and(eq(roleplaySession.id, id), eq(roleplaySession.organizationId, orgId), eq(roleplaySession.userId, userId)));
  if (!row) throw new Error("sesión de roleplay no encontrada");
  if (row.status === "cerrado") throw new Error("esta sesión ya está cerrada");
  return row;
}

/** Un turno: el alumno responde, el personaje contesta. */
export async function replyRoleplay(
  deps: SvcDeps, llm: Llm, args: { orgId: string; userId: string; sessionId: string; message: string; competencyName: string; sector?: string | null; puesto?: string | null },
): Promise<RoleplayTurn> {
  const row = await loadSession(deps, args.orgId, args.userId, args.sessionId);
  const ctx = [args.sector, args.puesto].filter(Boolean).join(", ");
  const system = personaSystem(row.persona, args.competencyName, ctx);
  const transcript = [...row.transcript, { role: "user" as const, content: args.message }];
  const reply = await llm.generate({
    system, messages: transcript, maxTokens: 200,
    orgId: args.orgId, userId: args.userId, kind: "roleplay",
  });
  transcript.push({ role: "assistant", content: reply });
  await deps.db.update(roleplaySession).set({ transcript }).where(eq(roleplaySession.id, args.sessionId));
  return { sessionId: args.sessionId, reply, status: "activo" };
}

export interface RoleplaySummary { fortalezas: string[]; areasDeMejora: string[]; resumen: string }

/**
 * Cierra la sesion y pide a la IA un resumen de fortalezas/areas de mejora -- SUGERENCIA para
 * quien valida, nunca una aprobacion. La decision de si aplica la competencia la sigue tomando
 * un humano via validation.ts, exactamente igual que con el caso practico.
 */
export async function closeRoleplay(
  deps: SvcDeps, llm: Llm, args: { orgId: string; userId: string; sessionId: string; competencyName: string },
): Promise<RoleplaySummary> {
  const row = await loadSession(deps, args.orgId, args.userId, args.sessionId);
  const dialogue = row.transcript.map((m) => `${m.role === "assistant" ? "Personaje" : "Alumno"}: ${m.content}`).join("\n");
  const system = `Analiza esta práctica de roleplay para la competencia "${args.competencyName}". ${BASE} ` +
    "No inventes nada que no esté en la conversación. Responde SOLO JSON: " +
    '{"fortalezas":["..."],"areasDeMejora":["..."],"resumen":"1-2 frases"}';
  const out = await llm.generate({
    system, messages: [{ role: "user", content: dialogue }], maxTokens: 500,
    orgId: args.orgId, userId: args.userId, kind: "roleplay_summary",
  });
  const summary = firstJson<RoleplaySummary>(out);
  await deps.db.update(roleplaySession)
    .set({ status: "cerrado", summary: summary.resumen, closedAt: new Date() })
    .where(eq(roleplaySession.id, args.sessionId));
  return summary;
}

export async function myRoleplays(deps: SvcDeps, orgId: string, userId: string) {
  return deps.db.select().from(roleplaySession)
    .where(and(eq(roleplaySession.organizationId, orgId), eq(roleplaySession.userId, userId)));
}
