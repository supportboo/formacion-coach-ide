// Rutas de la supervisión en directo (1.3.0). Todo bajo prefijos que nginx ya enruta: /api/analytics/* y
// /api/agent/*. Permisos por capacidad (auth/capabilities.ts): activity.metrics | activity.read | activity.intervene.
import type { Context, Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, newId } from "../container.js";
import { auditLog, organization, user } from "../db/schema.js";
import { getAuthContext, getPlatformAdminSession, isPlatformAdmin } from "./context.js";
import { rateLimited } from "../util/rateLimit.js";
import * as act from "../services/activity.js";
import type { Capability } from "../auth/capabilities.js";

const deps = { db, newId };

interface Sup { orgId: string; orgName: string; userId: string; userName: string; role: string; superadmin: boolean; access: act.Access }

/**
 * Responsable que consulta: su propia empresa, o cualquiera si es superadmin (?orgId=). El superadmin puede no
 * tener organización activa, por eso se resuelve también desde su sesión de plataforma.
 */
async function supervisor(c: Context, cap: Capability): Promise<Sup | Response> {
  const ctx = await getAuthContext(c);
  const pa = ctx ? isPlatformAdmin(ctx) : false;
  let base: Omit<Sup, "access" | "orgId" | "orgName"> & { orgId?: string; orgName?: string } | null = null;
  if (ctx) base = { orgId: ctx.orgId, orgName: ctx.orgName, userId: ctx.userId, userName: ctx.userName, role: pa ? "superadmin" : ctx.role, superadmin: pa };
  else {
    const s = await getPlatformAdminSession(c);
    if (s) {
      const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, s.userId));
      base = { userId: s.userId, userName: u?.name || "Soporte SkillUp", role: "superadmin", superadmin: true };
    }
  }
  if (!base) return c.json({ error: "no autenticado" }, 401);
  const q = c.req.query("orgId");
  if (base.superadmin && q) {
    const [o] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, q));
    if (!o) return c.json({ error: "empresa no encontrada" }, 404);
    base.orgId = q; base.orgName = o.name;
  }
  if (!base.orgId) return c.json({ error: "elige una empresa" }, 400);
  const access = act.accessFor({ role: ctx?.role ?? "empleado", platformAdmin: base.superadmin });
  const need = cap === "activity.metrics" ? access.metrics : cap === "activity.read" ? access.read : access.intervene;
  if (!need) return c.json({ error: "sin permiso" }, 403);
  return { ...(base as Sup), access };
}

export function registerLiveRoutes(app: Hono, titles: Record<string, string>) {
  /* ---------------- alumno: latido + eventos (y respuesta: quién le sigue, avisos, aviso informativo) */
  app.post("/api/analytics/activity", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`act:${ctx.orgId}:${ctx.userId}`, 20, 60_000)) return c.json({ error: "demasiadas peticiones" }, 429);
    const parsed = act.beaconSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
    await act.recordEvents(deps, ctx.orgId, ctx.userId, parsed.data.events);
    act.cleanupOld(deps).catch(() => {});
    return c.json(await act.inbox(deps, ctx.orgId, ctx.userId));
  });
  app.post("/api/analytics/activity/notice", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`actn:${ctx.orgId}:${ctx.userId}`, 5, 60_000)) return c.json({ error: "demasiadas peticiones" }, 429);
    await act.ackNotice(deps, ctx.orgId, ctx.userId);
    return c.json({ ok: true });
  });
  // Chat del tutor abierto: mensajes humanos nuevos en SU hilo (sondeo cada pocos segundos, solo lectura).
  app.get("/api/agent/thread/:id/human", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (rateLimited(`human:${ctx.orgId}:${ctx.userId}`, 30, 60_000)) return c.json({ error: "demasiadas peticiones" }, 429);
    const after = new Date(String(c.req.query("after") || ""));
    const since = isNaN(after.getTime()) ? new Date(Date.now() - 86_400_000) : after;
    return c.json({ messages: await act.humanMessagesSince(deps, ctx.orgId, ctx.userId, c.req.param("id"), since) });
  });

  /* ---------------- responsables */
  app.get("/api/analytics/live", async (c) => {
    const s = await supervisor(c, "activity.read");
    if (s instanceof Response) return s;
    act.cleanupOld(deps).catch(() => {});
    const live = await act.liveEnabled(deps, s.orgId);
    const b = await act.board(deps, s.orgId);
    return c.json({
      orgId: s.orgId, orgName: s.orgName, live, access: s.access, teamAsOrg: act.teamResolvedAsOrg(s.access.read),
      canConfigure: s.superadmin || ["admin"].includes(s.role),
      // Con el seguimiento en directo desactivado solo se ve la última conexión y las señales, no qué hace ahora.
      ...b, people: live ? b.people : b.people.map((p) => ({ ...p, state: p.state ? { ...p.state, page: null, source: null, section: null, sectionTitle: null, scrollPct: null, sectionSinceSec: null, lastActions: [] } : null })),
    });
  });

  app.get("/api/analytics/live/person/:userId", async (c) => {
    const s = await supervisor(c, "activity.read");
    if (s instanceof Response) return s;
    const learnerId = c.req.param("userId");
    const live = await act.liveEnabled(deps, s.orgId);
    const d = await act.personDetail(deps, s.orgId, learnerId, titles, { live });
    if (!d) return c.json({ error: "esa persona no está en esta empresa" }, 404);
    // Quien mira queda visible para la persona («Tu coach Marta está siguiendo tu sesión»). Nunca a sí mismo.
    if (live && learnerId !== s.userId) act.watch(s.orgId, learnerId, { userId: s.userId, name: s.userName, role: act.ROLE_LABEL[s.role] || s.role });
    // Se audita cada apertura de la ficha (el refresco automático de la ficha abierta no cuenta como otra).
    if (c.req.query("poll") !== "1") {
      await db.insert(auditLog).values({ id: newId(), organizationId: s.orgId, userId: s.userId, action: "supervision.view", meta: { learnerId, role: s.role } });
    }
    return c.json({ ...d, liveEnabled: live, canIntervene: !!s.access.intervene, watchers: act.watchersOf(s.orgId, learnerId) });
  });

  app.post("/api/analytics/live/person/:userId/message", async (c) => {
    const s = await supervisor(c, "activity.intervene");
    if (s instanceof Response) return s;
    if (rateLimited(`intervene:${s.orgId}:${s.userId}`, 20, 60_000)) return c.json({ error: "demasiados mensajes seguidos, espera un momento" }, 429);
    const parsed = act.interveneSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "escribe un mensaje (máximo 1.500 caracteres)" }, 400);
    const learnerId = c.req.param("userId");
    if (!(await act.isMember(deps, s.orgId, learnerId))) return c.json({ error: "esa persona no está en esta empresa" }, 404);
    if (learnerId === s.userId) return c.json({ error: "no puedes escribirte a ti mismo" }, 400);
    try {
      return c.json({ ok: true, ...(await act.intervene(deps, { orgId: s.orgId, learnerId, author: { userId: s.userId, name: s.userName, role: s.role }, text: parsed.data.text, threadId: parsed.data.threadId })) });
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  app.get("/api/analytics/live/metrics", async (c) => {
    const s = await supervisor(c, "activity.metrics");
    if (s instanceof Response) return s;
    const days = Math.max(7, Math.min(90, Number(c.req.query("days")) || 30));
    return c.json({ orgId: s.orgId, orgName: s.orgName, teamAsOrg: act.teamResolvedAsOrg(s.access.metrics), ...(await act.orgMetrics(deps, s.orgId, titles, days)) });
  });

  // Ajuste de empresa: seguimiento en directo sí/no (admin de la empresa o superadmin).
  app.get("/api/analytics/live/settings", async (c) => {
    const s = await supervisor(c, "activity.metrics");
    if (s instanceof Response) return s;
    return c.json({ live: await act.liveEnabled(deps, s.orgId), retentionDays: act.RETENTION_DAYS });
  });
  app.post("/api/analytics/live/settings", async (c) => {
    const s = await supervisor(c, "activity.read");
    if (s instanceof Response) return s;
    if (!s.superadmin && s.role !== "admin") return c.json({ error: "solo el administrador de la empresa" }, 403);
    const parsed = z.object({ live: z.boolean() }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
    await act.setLiveEnabled(deps, s.orgId, parsed.data.live);
    await db.insert(auditLog).values({ id: newId(), organizationId: s.orgId, userId: s.userId, action: "supervision.settings", meta: { live: parsed.data.live } });
    return c.json({ ok: true, live: parsed.data.live });
  });
}
