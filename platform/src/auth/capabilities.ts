// M0.1 · Modelo unico de permisos: capacidades x alcance y el mapa rol -> capacidades.
// Lo consumen UI (via /api/org/me), rutas y API. El superadmin (platformAdmin) tiene control total.

export type Scope = "self" | "team" | "org" | "global";

export type Capability =
  | "courses.read" | "courses.create" | "courses.assign" | "courses.publish" | "courses.archive"
  | "learning.enroll"
  | "evaluations.create" | "evaluations.read" | "evaluations.take"
  | "validation.decide"
  | "users.read" | "users.invite" | "users.manage"
  | "roles.manage"
  | "org.configure" | "org.billing"
  | "analytics.self" | "analytics.team" | "analytics.org"
  | "agents.use" | "agents.configure"
  // 1.3.0 supervisión en directo: métricas agregadas de uso · seguir a personas (tablero, ficha, conversación)
  // · intervenir (escribir en su chat, enviar un aviso). Ver la ficha de alguien siempre le muestra un aviso.
  | "activity.metrics" | "activity.read" | "activity.intervene";

export type OrgRole = "empleado" | "coach" | "team_leader" | "inspirador" | "admin" | "direccion";

const SCOPE_RANK: Record<Scope, number> = { self: 0, team: 1, org: 2, global: 3 };

// Capacidad -> alcance maximo por rol. roles.manage NO lo tiene ningun rol de organizacion:
// cambiar roles/permisos es exclusivo del superadmin (regla 2026-09-13).
const ROLE_CAPS: Record<OrgRole, Partial<Record<Capability, Scope>>> = {
  empleado: {
    "courses.read": "self", "evaluations.take": "self", "analytics.self": "self", "agents.use": "self",
  },
  coach: {
    "courses.read": "self", "evaluations.take": "self", "validation.decide": "team",
    "analytics.self": "self", "agents.use": "self",
    "activity.metrics": "team", "activity.read": "team", "activity.intervene": "team",
  },
  team_leader: {
    "courses.read": "team", "courses.assign": "team", "evaluations.read": "team", "evaluations.take": "self",
    "users.read": "team", "analytics.self": "self", "analytics.team": "team", "agents.use": "self",
    "activity.metrics": "team", "activity.read": "team", "activity.intervene": "team",
  },
  inspirador: {
    "courses.read": "org", "validation.decide": "org", "evaluations.read": "org",
    "evaluations.take": "self", "analytics.team": "team", "agents.use": "self",
    "activity.metrics": "org", // auditoría de calidad: métricas agregadas, sin seguir a personas
  },
  admin: {
    "courses.read": "org", "courses.create": "org", "courses.assign": "org", "courses.publish": "org", "courses.archive": "org",
    "learning.enroll": "org", "evaluations.create": "org", "evaluations.read": "org", "evaluations.take": "self",
    "validation.decide": "org", "users.read": "org", "users.invite": "org", "users.manage": "org",
    "org.configure": "org", "org.billing": "org",
    "analytics.self": "self", "analytics.team": "team", "analytics.org": "org",
    "agents.use": "self", "agents.configure": "org",
    "activity.metrics": "org", "activity.read": "org", "activity.intervene": "org",
  },
  direccion: {
    "courses.read": "org", "courses.create": "org", "courses.assign": "org", "courses.publish": "org",
    "learning.enroll": "org", "evaluations.create": "org", "evaluations.read": "org", "evaluations.take": "self",
    "users.read": "org", "analytics.self": "self", "analytics.team": "team", "analytics.org": "org",
    "agents.use": "self", "agents.configure": "org",
    "activity.metrics": "org", "activity.read": "org", "activity.intervene": "org",
  },
};

export interface CapCtx { role: string; platformAdmin: boolean }

function superadminCaps(): Partial<Record<Capability, Scope>> {
  const all: Partial<Record<Capability, Scope>> = { "roles.manage": "global" };
  (Object.keys(ROLE_CAPS.admin) as Capability[]).forEach((c) => { all[c] = "global"; });
  return all;
}

/** El backend decide si una operacion esta permitida. Nunca confiar solo en la UI. */
export function can(ctx: CapCtx, cap: Capability, scope: Scope = "self"): boolean {
  if (ctx.platformAdmin) return true;
  if (cap === "roles.manage") return false; // solo superadmin
  const granted = ROLE_CAPS[ctx.role as OrgRole]?.[cap];
  return granted ? SCOPE_RANK[granted] >= SCOPE_RANK[scope] : false;
}

/** Alcance máximo de una capacidad para este usuario (null = no la tiene). */
export function scopeOf(ctx: CapCtx, cap: Capability): Scope | null {
  if (ctx.platformAdmin) return "global";
  if (cap === "roles.manage") return null;
  return ROLE_CAPS[ctx.role as OrgRole]?.[cap] ?? null;
}

/** Capacidades del usuario, para que el frontend pinte navegacion y oculte acciones. */
export function capabilitiesFor(ctx: CapCtx): Partial<Record<Capability, Scope>> {
  return ctx.platformAdmin ? superadminCaps() : (ROLE_CAPS[ctx.role as OrgRole] ?? {});
}
