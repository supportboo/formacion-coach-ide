// Rutas de los cuadros de mando por rol (1.4.0). Bajo prefijos que nginx ya enruta: /api/platform/* (solo el
// dueño de la plataforma, getPlatformAdminSession) y /api/analytics/* (capacidad activity.metrics, su empresa;
// el superadmin puede pedir cualquier empresa con ?orgId=).
import type { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { db, llm, newId } from "../container.js";
import { env } from "../config/env.js";
import { user } from "../db/schema.js";
import { getPlatformAdminSession } from "./context.js";
import { supervisor } from "./live.js";
import { rateLimited } from "../util/rateLimit.js";
import * as act from "../services/activity.js";
import * as dash from "../services/dashboards.js";
import { listPendingCases } from "../services/validation.js";

const deps = { db, newId };
const COMPANY_ROLES = ["admin", "direccion", "inspirador", "superadmin"];

export function registerDashboardRoutes(
  app: Hono, titles: Record<string, string>,
  readRetos: (orgId: string) => Promise<{ userId: string; reto: dash.RetoLite }[]>,
) {
  app.get("/api/platform/cockpit", async (c) => {
    const admin = await getPlatformAdminSession(c);
    if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
    return c.json(await dash.platformCockpit(deps, titles, dash.periodOf(c.req.query("days"))));
  });

  // Resumen del negocio con IA: modelo rápido, solo hechos medidos, caché 15 min, 6 por minuto.
  app.get("/api/platform/cockpit/summary", async (c) => {
    const admin = await getPlatformAdminSession(c);
    if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
    if (rateLimited(`platsum:${admin.userId}`, 6, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
    const cp = await dash.platformCockpit(deps, titles, 30);
    try {
      const r = await act.summarize(llm, { orgId: null, supervisorId: admin.userId, target: "cockpit", kind: "platform", facts: dash.platformFacts(cp), model: env.MODEL_FAST, refresh: c.req.query("refresh") === "1" });
      return c.json({ ...r, basis: { empresas: cp.totals.companies, cursos: cp.courses.length, llamadasIA30d: cp.health.calls30 } });
    } catch (e) { return c.json({ error: "no se pudo generar el resumen: " + (e as Error).message }, 502); }
  });

  // Cuadro de mando de la empresa (admin, dirección, inspirador) o del equipo (team leader, coach).
  app.get("/api/analytics/home", async (c) => {
    const s = await supervisor(c, "activity.metrics");
    if (s instanceof Response) return s;
    const view = COMPANY_ROLES.includes(s.role) ? "empresa" : "equipo";
    const seesAll = s.superadmin || s.role === "admin" || s.role === "direccion";
    const [retos, pending] = await Promise.all([
      readRetos(s.orgId).then((rs) => rs.filter((r) => seesAll || r.reto.byId === s.userId)),
      listPendingCases(deps, s.orgId, s.userId, s.superadmin ? "admin" : s.role),
    ]);
    const uids = [...new Set(pending.map((p) => p.userId))];
    const names = uids.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uids))).map((u) => [u.id, u.name])) : new Map<string, string>();
    const home = await dash.orgHome(deps, {
      orgId: s.orgId, titles, view, retos,
      pendingValidations: pending.map((p) => ({ userId: p.userId, learnerName: names.get(p.userId) ?? null })),
      days: dash.periodOf(c.req.query("days")),
    });
    return c.json({
      orgId: s.orgId, orgName: s.orgName, role: s.role, superadmin: s.superadmin, access: s.access,
      teamAsOrg: act.teamResolvedAsOrg(s.access.metrics), canFollow: !!s.access.read, canIntervene: !!s.access.intervene && !(s.superadmin && !!c.req.query("orgId")), readOnly: s.superadmin && !!c.req.query("orgId"),
      canAssign: s.superadmin || ["team_leader", "admin", "direccion", "inspirador"].includes(s.role), assignedScope: seesAll ? "empresa" : "mías",
      ...home,
    });
  });
}
