// Contenido vivo (Marc, 28-09-2026): cada sección abre con un bloque «Para ti» (ejemplo resuelto y práctica) hecho con
// lo que el alumno ya ha contado. El núcleo del curso no cambia (cuadra con lo declarado a FUNDAE): solo se añade este
// bloque. Se regenera cuando cambia lo que sabemos de él, así el bloque siguiente ya usa lo que respondió en el anterior.
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { annotation } from "../db/schema.js";
import { env } from "../config/env.js";
import type { SvcDeps } from "./org.js";
import { firstJson } from "./aiContent.js";
import { getOnboardingProfile } from "./learning.js";
import * as factsSvc from "./learnerFacts.js";

export interface Adapted {
  paraTi: string;
  ejemplo: { titulo: string; situacion: string; pasos: string[] };
  practica: { pasos: string[]; minutos: number };
  pregunta: string;
  primero: "ejemplo" | "practica";
}

const MARKERS = ["[rol]", "[objetivo]", "[nivel]", "[freno]", "[sintesis]", "[perfil]"];
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Lo que sabemos del alumno, en texto, solo de lo que él ha dicho o respondido (nada inferido de fuera). */
export async function learnerContext(deps: SvcDeps, orgId: string, userId: string, src: string): Promise<string> {
  const [onb, course, prof] = await Promise.all([
    deps.db.select({ body: annotation.body }).from(annotation)
      .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, "onboarding")))
      .orderBy(desc(annotation.createdAt)).limit(60),
    deps.db.select({ body: annotation.body, cardTitle: annotation.cardTitle }).from(annotation)
      .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, src), eq(annotation.kind, "insight")))
      .orderBy(desc(annotation.createdAt)).limit(8),
    getOnboardingProfile(deps, orgId, userId).catch(() => null),
  ]);
  const lines: string[] = [];
  if (prof?.puesto) lines.push(`Puesto: ${cut(prof.puesto, 300)}`);
  if (prof?.sector) lines.push(`Sector: ${prof.sector}`);
  const empresa = onb.find((r) => String(r.body || "").startsWith("[Empresa "));
  if (empresa) lines.push(`Su empresa: ${cut(String(empresa.body).replace(/^\[Empresa [^\]]*\]\s*/, ""), 400)}`);
  // Ficha viva primero (1.12.0); los marcadores sueltos solo si aún no tiene ficha (alumnos anteriores).
  const ficha = factsSvc.summarize(await factsSvc.list(deps, orgId, userId).catch(() => []));
  if (ficha) lines.push("Su ficha viva (cada dato con su estado):\n" + ficha);
  for (const m of ficha ? ["[perfil]"] : MARKERS) {
    const r = onb.find((x) => String(x.body || "").startsWith(m));
    if (r) lines.push(`${m} ${cut(String(r.body).slice(m.length).trim(), m === "[perfil]" ? 900 : 400)}`);
  }
  const answers = course.filter((r) => r.body && !r.body.startsWith("[adopcion:")).reverse();
  if (answers.length) lines.push("Lo que ha respondido en este curso:\n" + answers.map((r) => `- (${r.cardTitle || "sección"}) ${cut(String(r.body), 300)}`).join("\n"));
  return lines.join("\n");
}

export const contextHash = (ctx: string) => createHash("sha1").update(ctx).digest("hex").slice(0, 16);

const SYS = `Eres el formador sénior de SkillUp. Te doy una sección de un curso muy práctico y lo que sabemos de UN alumno.
Prepara el bloque «Para ti» que abre la sección. Objetivo: que vea que le conocemos, se imagine resolviendo la situación y lo aplique cuanto antes.
Reglas:
- Usa SOLO hechos que aparecen en «LO QUE SABEMOS»: sus clientes, casos, empresa, objetivo, freno o respuestas anteriores. Si citas algo que dijo, que se reconozca. Si falta un dato, plantea una situación típica de su puesto y sector sin presentarla como suya.
- Nunca inventes cifras, nombres de clientes ni resultados.
- El núcleo de la sección no se cambia: el ejemplo y la práctica aplican ESA sección.
- Adapta la forma a su perfil de aprendizaje si viene: ejemplo resuelto primero o intentarlo primero, porqué o cómo primero, tipo de práctica, tono. Si su nivel es inicial, pasos más guiados; si es avanzado, reto directo.
- Español de España, frases cortas, tuteo, sin relleno.
Devuelve SOLO JSON:
{"paraTi":"1-2 frases que conectan la sección con su objetivo o situación","ejemplo":{"titulo":"…","situacion":"2-3 frases","pasos":["3-5 pasos de cómo se resuelve"]},"practica":{"pasos":["3-5 pasos para aplicarlo a SU caso esta semana"],"minutos":15},"pregunta":"una pregunta para conocer mejor su realidad en esta materia","primero":"ejemplo|practica"}`;

export function valid(x: unknown): x is Adapted {
  const a = x as Adapted;
  return !!a && typeof a.paraTi === "string" && !!a.ejemplo && Array.isArray(a.ejemplo.pasos) && !!a.practica && Array.isArray(a.practica.pasos) && typeof a.pregunta === "string";
}

/** Bloque «Para ti» de una sección, cacheado por alumno + sección + estado de lo que sabemos de él. */
export async function forSection(deps: SvcDeps, orgId: string, userId: string, src: string, card: number, title: string, text: string): Promise<Adapted | null> {
  const ctx = await learnerContext(deps, orgId, userId, src);
  const hash = contextHash(ctx);
  const source = "adapt:" + src.slice(0, 120);
  const [hit] = await deps.db.select({ body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, source), eq(annotation.card, card), eq(annotation.quote, hash)))
    .limit(1);
  if (hit?.body) { try { return JSON.parse(hit.body) as Adapted; } catch { /* regenerate */ } }

  const { llm } = await import("../container.js");
  const out = await llm.generate({
    system: SYS, model: env.MODEL_SENIOR, maxTokens: 1100, kind: "adapt", orgId, userId,
    messages: [{ role: "user", content: `SECCIÓN: ${title}\n${text.slice(0, 3000)}\n\nLO QUE SABEMOS DEL ALUMNO:\n${ctx || "(todavía nada: solo sabemos que ha empezado el curso)"}` }],
  });
  let parsed: unknown; try { parsed = firstJson(out); } catch { return null; }
  if (!valid(parsed)) return null;
  const a: Adapted = { ...parsed, primero: parsed.primero === "practica" ? "practica" : "ejemplo" };
  // Una sola versión por alumno y sección: la anterior se sustituye.
  await deps.db.delete(annotation).where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, source), eq(annotation.card, card)));
  await deps.db.insert(annotation).values({ id: deps.newId(), organizationId: orgId, userId, source, card, cardTitle: title.slice(0, 300), kind: "adapt", quote: hash, body: JSON.stringify(a) });
  return a;
}
