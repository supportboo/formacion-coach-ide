// Rutas de feedback (1.4.0). Todo bajo /api/agent/feedback/* (prefijo que nginx ya enruta a la plataforma;
// ojo: /api/feedback va al servicio antiguo de afiliados y no se usa).
import type { Context, Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { db, llm, newId } from "../container.js";
import { env } from "../config/env.js";
import { auditLog, organization, user } from "../db/schema.js";
import { getAuthContext, getPlatformAdminSession, isPlatformAdmin } from "./context.js";
import { rateLimited } from "../util/rateLimit.js";
import * as fb from "../services/feedback.js";

const deps = { db, newId };

interface Viewer { orgId: string | null; userId: string; userName: string; role: string; platformAdmin: boolean }

/** Quien consulta la bandeja: miembro de una empresa o superadmin sin empresa activa. */
async function viewer(c: Context): Promise<Viewer | null> {
  const ctx = await getAuthContext(c);
  if (ctx) return { orgId: ctx.orgId, userId: ctx.userId, userName: ctx.userName, role: ctx.role, platformAdmin: isPlatformAdmin(ctx) };
  const s = await getPlatformAdminSession(c);
  if (!s) return null;
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, s.userId));
  return { orgId: null, userId: s.userId, userName: u?.name || "Soporte SkillUp", role: "superadmin", platformAdmin: true };
}

const queryObj = (c: Context) => Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== ""));

export function registerFeedbackRoutes(app: Hono) {
  /* ---------------- cualquier persona */
  app.post("/api/agent/feedback/rate", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`fbrate:${ctx.orgId}:${ctx.userId}`, 60, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
    const parsed = fb.rateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
    try {
      return c.json(await fb.rate(deps, { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }, parsed.data, c.req.header("user-agent")));
    } catch (e) { return c.json({ error: (e as Error).message }, 404); }
  });

  app.post("/api/agent/feedback/general", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`fbgen:${ctx.orgId}:${ctx.userId}`, 10, 60_000)) return c.json({ error: "demasiados envíos seguidos, espera un momento" }, 429);
    const parsed = fb.generalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuéntanos algo (mínimo 3 caracteres)" }, 400);
    return c.json(await fb.submitGeneral(deps, { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }, parsed.data, c.req.header("user-agent")));
  });

  app.get("/api/agent/feedback/mine", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    return c.json({ items: await fb.mine(deps, { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }) });
  });

  app.get("/api/agent/feedback/notices", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`fbnot:${ctx.orgId}:${ctx.userId}`, 20, 60_000)) return c.json({ notices: [] });
    return c.json({ notices: await fb.notices(deps, { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }) });
  });

  /* ---------------- bandeja: superadmin (todo, gestiona) · admin/dirección (su empresa, solo lectura) */
  app.get("/api/agent/feedback/inbox", async (c) => {
    const v = await viewer(c);
    if (!v) return c.json({ error: "no autenticado" }, 401);
    const acc = fb.inboxAccess(v);
    if (acc.scope === "self") return c.json({ error: "sin permiso" }, 403);
    const parsed = fb.filterSchema.safeParse(queryObj(c));
    if (!parsed.success) return c.json({ error: "filtros inválidos" }, 400);
    const orgId = acc.scope === "global" ? parsed.data.orgId || null : v.orgId;
    const res = await fb.list(deps, parsed.data, orgId);
    const orgs = acc.scope === "global" ? await db.select({ id: organization.id, name: organization.name }).from(organization) : [];
    // Nombres de quien envía: solo quien gestiona o la dirección de esa misma empresa (misma org, ya filtrada).
    const ids = [...new Set(res.items.map((r) => r.userId))];
    const names = new Map((ids.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)) : []).map((u) => [u.id, u.name]));
    return c.json({
      access: acc, orgs, capped: res.capped, stats: res.stats,
      items: res.items.map((r) => ({ ...r, userAgent: acc.manage ? r.userAgent : null, userName: names.get(r.userId) || null })),
    });
  });

  app.post("/api/agent/feedback/:id/status", async (c) => {
    const v = await viewer(c);
    if (!v || !fb.inboxAccess(v).manage) return c.json({ error: "solo el superadmin" }, 403);
    const parsed = fb.statusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
    const item = await fb.getItem(deps, c.req.param("id"));
    if (!item) return c.json({ error: "no encontrado" }, 404);
    await fb.setStatus(deps, item.id, parsed.data.status, parsed.data.note, { userId: v.userId, name: v.userName });
    await db.insert(auditLog).values({ id: newId(), organizationId: item.organizationId, userId: v.userId, action: "feedback.status", meta: { id: item.id, status: parsed.data.status } });
    return c.json({ ok: true });
  });

  app.post("/api/agent/feedback/:id/glossary", async (c) => {
    const v = await viewer(c);
    if (!v || !fb.inboxAccess(v).manage) return c.json({ error: "solo el superadmin" }, 403);
    const parsed = fb.glossarySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "escribe la forma incorrecta y la correcta (distintas)" }, 400);
    try {
      const r = await fb.addToGlossary(deps, c.req.param("id"), parsed.data, { userId: v.userId, name: v.userName });
      const item = await fb.getItem(deps, c.req.param("id"));
      await db.insert(auditLog).values({ id: newId(), organizationId: item!.organizationId, userId: v.userId, action: "feedback.glossary", meta: { id: item!.id, ...parsed.data } });
      return c.json(r);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // Resumen con IA de los reportes reales (modelo rápido, caché 1 h, 6/min). Admin/dirección: solo de su empresa.
  app.get("/api/agent/feedback/summary", async (c) => {
    const v = await viewer(c);
    if (!v) return c.json({ error: "no autenticado" }, 401);
    const acc = fb.inboxAccess(v);
    if (acc.scope === "self") return c.json({ error: "sin permiso" }, 403);
    if (rateLimited(`fbsum:${v.userId}`, 6, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
    const parsed = fb.filterSchema.safeParse(queryObj(c));
    if (!parsed.success) return c.json({ error: "filtros inválidos" }, 400);
    const orgId = acc.scope === "global" ? parsed.data.orgId || null : v.orgId;
    try {
      return c.json(await fb.summarize(deps, llm, env.MODEL_FAST, orgId, parsed.data, c.req.query("refresh") === "1"));
    } catch (e) { return c.json({ error: "no se pudo generar el resumen: " + (e as Error).message }, 502); }
  });
}
