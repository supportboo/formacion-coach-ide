import type { SvcDeps } from "./org.js";
import type { Llm } from "../agents/llm.js";

export interface PanelInput { orgId: string; userId: string; tema: string; publico?: string; competencyId?: string }
export interface PanelReview { dimension: string; nota: number; comentario: string }
export interface PanelResult {
  tema: string;
  borrador: string;
  revision: PanelReview[];
  vetoLegal: boolean;
  consenso: boolean;
  minNota: number;
  siguientePaso: string;
}

const AUTOR_SYS = `Eres un panel de autoria de cursos corporativos, tres expertos trabajando juntos:
- Investigador de materia: no afirmas nada sin base, distingues hecho de opinion, traes casos reales.
- Disenador instruccional: objetivos por nivel de Bloom (recordar hasta crear); disenas primero la evaluacion.
- Pedagogo: practica deliberada y espaciada, recuperacion activa, aprender haciendo, carga cognitiva controlada.
Doctrina: cero datos inventados; si falta evidencia, dilo. Responde en espanol claro y estructurado.`;

const PANEL_SYS = `Eres un panel revisor de calidad de un curso corporativo:
- Docente experto: exactitud y dificultad calibrada a nivel posgrado (debe exigir de verdad).
- Psicologo del aprendizaje: feedback util y dificultad deseable. PROHIBIDO inferir emociones (Reglamento UE de IA); la persona declara si quiere.
- Disenador de evaluacion: validez, fiabilidad, umbral de aprobado 85% o mas, y que ningun criterio regale puntos.
- Revisor legal y de sesgos: RGPD, Reglamento de IA, FUNDAE, sin promesas enganosas ni sesgos. Tienes VETO.
Devuelve SOLO un JSON valido con esta forma:
{"revision":[{"dimension":"docente","nota":0,"comentario":""},{"dimension":"psicologo","nota":0,"comentario":""},{"dimension":"evaluacion","nota":0,"comentario":""},{"dimension":"legal","nota":0,"comentario":""}],"vetoLegal":false,"fixes":["..."]}
Notas de 0 a 10. vetoLegal true si incumple algo legal o etico.`;

/**
 * Super-agente creador de cursos: un panel de expertos que ESCRIBE y luego REVISA con consenso.
 * v1: 2 llamadas (autoria + revision). La puerta de coste y la firma humana viven en la ruta.
 * No publica nada solo: devuelve borrador + notas + si hay consenso (todas >=8 y sin veto legal).
 */
export async function runCoursePanel(deps: SvcDeps, llm: Llm, input: PanelInput): Promise<PanelResult> {
  const ctx = `Tema: ${input.tema}. Publico: ${input.publico || "profesionales de la empresa"}.`;
  const borrador = await llm.generate({
    system: AUTOR_SYS,
    messages: [{ role: "user", content: `${ctx}\nProduce, en este orden: (1) objetivos de aprendizaje por nivel de Bloom; (2) temario secuenciado para aprender haciendo; (3) un caso real de aplicacion con su rubrica visible; (4) un test de 5 preguntas con umbral de aprobado del 85%.` }],
    maxTokens: 1600, orgId: input.orgId, userId: input.userId, kind: "course_panel_author",
  });
  const reviewRaw = await llm.generate({
    system: PANEL_SYS,
    messages: [{ role: "user", content: `Revisa este borrador y puntualo por dimension. Devuelve SOLO el JSON pedido.\n\n---\n${borrador.slice(0, 6000)}` }],
    maxTokens: 700, orgId: input.orgId, userId: input.userId, kind: "course_panel_review",
  });
  let revision: PanelReview[] = [];
  let vetoLegal = false;
  let fixes: string[] = [];
  try {
    const a = reviewRaw.indexOf("{");
    const b = reviewRaw.lastIndexOf("}");
    const j = JSON.parse(reviewRaw.slice(a, b + 1));
    revision = Array.isArray(j.revision) ? j.revision : [];
    vetoLegal = !!j.vetoLegal;
    fixes = Array.isArray(j.fixes) ? j.fixes.map((x: unknown) => String(x)) : [];
  } catch { /* sin JSON valido => no hay consenso */ }
  const notas = revision.map((r) => Number(r.nota) || 0);
  const minNota = notas.length ? Math.min(...notas) : 0;
  const consenso = notas.length >= 3 && minNota >= 8 && !vetoLegal;
  const siguientePaso = consenso
    ? "Consenso alcanzado (todas las dimensiones >=8, sin veto). Falta la firma humana (Inspirador/admin) antes de publicar."
    : (vetoLegal ? "VETO legal: corregir antes de continuar. " : "Sin consenso: iterar con los fixes. ") + fixes.slice(0, 5).join(" | ");
  return { tema: input.tema, borrador, revision, vetoLegal, consenso, minNota, siguientePaso };
}
