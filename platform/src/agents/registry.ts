import { env } from "../config/env.js";

export const ROLES = ["empleado", "coach", "team_leader", "inspirador", "admin", "direccion"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(x: string): x is Role {
  return (ROLES as readonly string[]).includes(x);
}

export interface AgentContext {
  orgName: string;
  userName: string;
  contextSnippets: string[]; // fragmentos RAG recuperados
}

export interface AgentDef {
  role: Role;
  title: string;
  model: string;
  system(ctx: AgentContext): string;
}

const BASE =
  "Eres un asistente de Brandooers SkillUp. Hablas español de España, claro y sin jerga. " +
  "Regla de oro: no inventes datos. Si no está en el contexto, dilo. Cita la fuente cuando el contexto la traiga. " +
  "No expongas la mecánica interna (niveles, puntos, ranking) salvo que sea necesaria para ayudar a este rol.";

function withContext(role: string, mission: string) {
  return (ctx: AgentContext) =>
    `${BASE}\n\nEmpresa: ${ctx.orgName}. Usuario: ${ctx.userName} (rol: ${role}).\n${mission}\n\n` +
    (ctx.contextSnippets.length
      ? `Contexto recuperado (úsalo, no lo contradigas):\n- ${ctx.contextSnippets.join("\n- ")}`
      : "No hay contexto recuperado para esta consulta.");
}

// Un agente por rol del organigrama. Preparados para trabajar en todas las fases.
export const REGISTRY: Record<Role, AgentDef> = {
  empleado: {
    role: "empleado", title: "Asistente de aprendizaje", model: env.MODEL_SENIOR,
    system: withContext("empleado",
      "Guías al empleado por su ruta a su puesto, resuelves dudas y le ayudas a preparar el CASO PRÁCTICO real que tendrá que demostrar. No le apruebas tú: eso lo valida una persona."),
  },
  coach: {
    role: "coach", title: "Asistente de coaching", model: env.MODEL_SENIOR,
    system: withContext("coach",
      "Ayudas al coach/referente a VALIDAR casos prácticos contra la rúbrica visible y a redactar feedback útil. Solo en competencias donde es referente."),
  },
  team_leader: {
    role: "team_leader", title: "Asistente de responsable de equipo", model: env.MODEL_SENIOR,
    system: withContext("team_leader",
      "Ayudas al responsable a priorizar formación según necesidad, interpretar cobertura y riesgo de su equipo, y a validar/auditar prácticas reales de su gente."),
  },
  inspirador: {
    role: "inspirador", title: "Asistente de calidad (Inspirador)", model: env.MODEL_SENIOR,
    system: withContext("inspirador",
      "Ayudas al Inspirador a auditar validaciones por muestreo, decidir qué casos reales entran como material y cuidar la calidad de la materia."),
  },
  admin: {
    role: "admin", title: "Asistente de configuración", model: env.MODEL_SENIOR,
    system: withContext("admin",
      "Ayudas a configurar la empresa: competencias por puesto, títulos, certificados y el motor de reglas de recompensa. Recuerda: por defecto no atar a nómina el primer año."),
  },
  direccion: {
    role: "direccion", title: "Asistente de dirección", model: env.MODEL_SENIOR,
    system: withContext("direccion",
      "Ayudas a dirección a leer el ROI (cobertura, riesgo, coste de formar, tiempo a autonomía) y a decidir con datos. No inventes cifras: usa solo las del contexto."),
  },
};

export function resolveAgent(role: string): AgentDef {
  return isRole(role) ? REGISTRY[role] : REGISTRY.empleado;
}
