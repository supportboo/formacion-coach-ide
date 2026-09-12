import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { member, organization, user } from "../db/schema.js";
import type { Role } from "../agents/registry.js";

export interface SvcDeps { db: DB; newId: () => string }

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "org";

/** Crea una empresa (organización). Sirve de 1 usuario a multinacional. */
export async function createCompany(deps: SvcDeps, name: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(organization).values({ id, name, slug: `${slugify(name)}-${id.slice(0, 6)}` });
  return id;
}

/** Crea un usuario (para seed/tests; en producción los crea better-auth). */
export async function createUser(deps: SvcDeps, name: string, email: string): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(user).values({ id, name, email, emailVerified: true });
  return id;
}

/** Asocia un usuario a una empresa con un rol del organigrama (el rol de better-auth se queda en su default "member"). */
export async function addMember(deps: SvcDeps, orgId: string, userId: string, orgRole: Role): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(member).values({ id, organizationId: orgId, userId, orgRole });
  return id;
}

/** Equipo de la organización con nombre/email (join member+user), para paneles de responsable. */
export async function listMembers(deps: SvcDeps, orgId: string) {
  return deps.db.select({
    userId: member.userId, role: member.orgRole, name: user.name, email: user.email,
  }).from(member).innerJoin(user, eq(member.userId, user.id)).where(eq(member.organizationId, orgId));
}

/** ¿Ya hay algún admin de nuestro organigrama en esta empresa? */
export async function hasAdmin(deps: SvcDeps, orgId: string): Promise<boolean> {
  const [row] = await deps.db.select({ id: member.id }).from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.orgRole, "admin")));
  return !!row;
}

/**
 * Fija el rol de nuestro organigrama para un miembro (independiente del rol interno de better-auth,
 * que sigue viviendo en member.role y solo lo toca better-auth). Si pasa a admin/dirección, también le
 * devuelve "owner" en better-auth para que pueda invitar/gestionar el equipo desde ese mismo panel.
 */
export async function setMemberRole(deps: SvcDeps, orgId: string, userId: string, orgRole: Role): Promise<void> {
  const authRole = orgRole === "admin" || orgRole === "direccion" ? "owner" : undefined;
  await deps.db.update(member).set(authRole ? { orgRole, role: authRole } : { orgRole })
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
}
