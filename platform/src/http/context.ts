import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { member, organization } from "../db/schema.js";
import { auth } from "../auth/auth.js";

export interface AuthCtx {
  orgId: string; orgName: string; userId: string; userName: string; userEmail: string; role: string;
}

/** Superadmin de la plataforma (todas las organizaciones), por email en PLATFORM_ADMIN_EMAILS. No es un rol de member. */
export function isPlatformAdmin(ctx: Pick<AuthCtx, "userEmail">): boolean {
  return env.PLATFORM_ADMIN_EMAILS.includes(ctx.userEmail.toLowerCase());
}

/**
 * Sesión de superadmin, independiente de tener organización activa: las rutas /api/platform/*
 * agregan datos de TODAS las empresas, así que exigir una org propia (como getAuthContext) no aplica.
 */
export async function getPlatformAdminSession(c: Context): Promise<{ userId: string; userEmail: string } | null> {
  if (env.DEV_AUTH) {
    const email = c.req.header("x-user-email");
    const userId = c.req.header("x-user-id");
    if (!email || !userId || !env.PLATFORM_ADMIN_EMAILS.includes(email.toLowerCase())) return null;
    return { userId, userEmail: email };
  }
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s?.session || !s.user) return null;
  if (!env.PLATFORM_ADMIN_EMAILS.includes(s.user.email.toLowerCase())) return null;
  return { userId: s.user.id, userEmail: s.user.email };
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
      userEmail: c.req.header("x-user-email") ?? "dev@example.com",
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
    role: m?.orgRole ?? "empleado",
    orgName: org?.name ?? "Empresa",
    userName: s.user.name ?? "Usuario",
    userEmail: s.user.email,
  };
}
