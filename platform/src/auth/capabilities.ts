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
  | "agents.use" | "agents.configure";

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
  },
  team_leader: {
    "courses.read": "team", "courses.assign": "team", "evaluations.read": "team", "evaluations.take": "self",
    "users.read": "team", "analytics.self": "self", "analytics.team": "team", "agents.use": "self",
  },
  inspirador: {
    "courses.read": "org", "validation.decide": "org", "evaluations.read": "org",
    "evaluations.take": "self", "analytics.team": "team", "agents.use": "self",
  },
  admin: {
    "courses.read": "org", "courses.create": "org", "courses.assign": "org", "courses.publish": "org", "courses.archive": "org",
    "learning.enroll": "org", "evaluations.create": "org", "evaluations.read": "org", "evaluations.take": "self",
    "validation.decide": "org", "users.read": "org", "users.invite": "org", "users.manage": "org",
    "org.configure": "org", "org.billing": "org",
    "analytics.self": "self", "analytics.team": "team", "analytics.org": "org",
    "agents.use": "self", "agents.configure": "org",
  },
  direccion: {
    "courses.read": "org", "courses.create": "org", "courses.assign": "org", "courses.publish": "org",
    "learning.enroll": "org", "evaluations.create": "org", "evaluations.read": "org", "evaluations.take": "self",
    "users.read": "org", "analytics.self": "self", "analytics.team": "team", "analytics.org": "org",
    "agents.use": "self", "agents.configure": "org",
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

/** Capacidades del usuario, para que el frontend pinte navegacion y oculte acciones. */
export function capabilitiesFor(ctx: CapCtx): Partial<Record<Capability, Scope>> {
  return ctx.platformAdmin ? superadminCaps() : (ROLE_CAPS[ctx.role as OrgRole] ?? {});
}
