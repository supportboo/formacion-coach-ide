import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { member, organization } from "../db/schema.js";
import { auth } from "../auth/auth.js";

export interface AuthCtx {
  orgId: string; orgName: string; userId: string; userName: string; role: string;
}

/**
 * Contexto de autenticación de la petición.
 * DEV_AUTH=true → cabeceras X-Org-Id/X-User-Id/X-Role (solo desarrollo local).
 * Producción → sesión better-auth + organización activa + rol del member.
 */
export async function getAuthContext(c: Context): Promise<AuthCtx | null> {
  if (env.DEV_AUTH) {
    const orgId = c.req.header("x-org-id");
    const userId = c.req.header("x-user-id");
    if (!orgId || !userId) return null;
    return {
      orgId, userId,
      role: c.req.header("x-role") ?? "empleado",
      orgName: c.req.header("x-org-name") ?? "Empresa",
      userName: c.req.header("x-user-name") ?? "Usuario",
    };
  }

  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s?.session || !s.user) return null;
  const orgId = (s.session as { activeOrganizationId?: string }).activeOrganizationId;
  if (!orgId) return null;

  const [m] = await db.select().from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, s.user.id)));
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  return {
    orgId, userId: s.user.id,
    role: m?.role ?? "empleado",
    orgName: org?.name ?? "Empresa",
    userName: s.user.name ?? "Usuario",
  };
}
