// Planes y créditos de creación (1.6.0). Bajo /api/billing/* y /api/platform/* (prefijos que nginx ya enruta).
import type { Hono } from "hono";
import { z } from "zod";
import { db, newId } from "../container.js";
import { getAuthContext, getPlatformAdminSession, isPlatformAdmin } from "./context.js";
import { rateLimited } from "../util/rateLimit.js";
import * as billing from "../services/billing.js";
import * as credits from "../services/credits.js";

const deps = { db, newId };

async function itemsWithPrices() {
  const prices = await credits.getPrices(deps);
  return credits.CREDIT_ITEM_IDS.map((id) => ({ id, ...credits.CREDIT_ITEMS[id], credits: prices[id], estimated: true }));
}

export function registerCreditRoutes(app: Hono) {
  // Información pública de precios: planes, packs y nota FUNDAE.
  app.get("/api/billing/plans", async (c) => c.json({
    plans: await billing.salePlans(deps),
    packs: credits.CREDIT_PACKS,
    creditEurCents: credits.CREDIT_EUR_CENTS,
    fundae: { eurPerHour: billing.FUNDAE_EUR_PER_HOUR, exampleHours: 20, exampleMax: billing.fundaeMaxPerLearner(20) },
  }));

  // Monedero visto por cualquier persona de la empresa: saldo, si puede crear y qué desbloquea.
  app.get("/api/billing/credits", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    const s = { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role, platformAdmin: isPlatformAdmin(ctx) };
    return c.json({
      balance: await credits.balance(deps, ctx.orgId),
      canSpend: await credits.canSpend(deps, s),
      canBuy: s.platformAdmin || credits.BUY_ROLES.includes(ctx.role),
      items: await itemsWithPrices(),
      packs: credits.CREDIT_PACKS,
    });
  });

  // Libro de la empresa (quién gastó qué): admin/dirección.
  app.get("/api/billing/credits/ledger", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (!isPlatformAdmin(ctx) && !credits.BUY_ROLES.includes(ctx.role)) return c.json({ error: "solo admin/dirección" }, 403);
    return c.json({ ledger: await credits.ledger(deps, ctx.orgId) });
  });

  app.post("/api/billing/credits/checkout", async (c) => {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ error: "no autenticado" }, 401);
    if (!isPlatformAdmin(ctx) && !credits.BUY_ROLES.includes(ctx.role)) return c.json({ error: "solo admin/dirección" }, 403);
    const parsed = z.object({ pack: z.enum(credits.PACK_IDS) }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "pack no válido" }, 400);
    if (rateLimited(`credits-checkout:${ctx.orgId}`, 5, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
    try {
      return c.json(await credits.createPackCheckout({ orgId: ctx.orgId, orgName: ctx.orgName, pack: parsed.data.pack, customerEmail: ctx.userEmail }));
    } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
  });

  // Superadmin: todos los monederos y la tabla de precios en créditos.
  app.get("/api/platform/credits", async (c) => {
    if (!(await getPlatformAdminSession(c))) return c.json({ error: "sin acceso de superadmin" }, 401);
    return c.json({ wallets: await credits.allWallets(deps), items: await itemsWithPrices() });
  });

  app.post("/api/platform/credits/prices/set", async (c) => {
    if (!(await getPlatformAdminSession(c))) return c.json({ error: "sin acceso de superadmin" }, 401);
    const parsed = z.object({ item: z.enum(credits.CREDIT_ITEM_IDS), credits: z.number().int().min(0).max(100_000) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
    await credits.setPrice(deps, parsed.data.item, parsed.data.credits);
    return c.json({ ok: true });
  });
}
