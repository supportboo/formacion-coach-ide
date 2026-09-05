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

/** Asocia un usuario a una empresa con un rol del organigrama. */
export async function addMember(deps: SvcDeps, orgId: string, userId: string, role: Role): Promise<string> {
  const id = deps.newId();
  await deps.db.insert(member).values({ id, organizationId: orgId, userId, role });
  return id;
}

/** Equipo de la organización con nombre/email (join member+user), para paneles de responsable. */
export async function listMembers(deps: SvcDeps, orgId: string) {
  return deps.db.select({
    userId: member.userId, role: member.role, name: user.name, email: user.email,
  }).from(member).innerJoin(user, eq(member.userId, user.id)).where(eq(member.organizationId, orgId));
}

/** ¿Ya hay algún admin de nuestro organigrama en esta empresa? (better-auth pone "owner" al crear, no nuestro rol). */
export async function hasAdmin(deps: SvcDeps, orgId: string): Promise<boolean> {
  const [row] = await deps.db.select({ id: member.id }).from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "admin")));
  return !!row;
}

/** Fija el rol de nuestro organigrama para un miembro (independiente del rol interno de better-auth). */
export async function setMemberRole(deps: SvcDeps, orgId: string, userId: string, role: Role): Promise<void> {
  await deps.db.update(member).set({ role })
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
}
