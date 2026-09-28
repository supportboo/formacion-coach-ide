import { describe, expect, it, vi } from "vitest";

// Stripe simulado: nunca se crean objetos reales.
const created: unknown[] = [];
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: async (a: unknown) => { created.push(a); return { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" }; } } };
  },
}));
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

const { creditLedger, creditPrice, levelByCompetency, pricingTier } = await import("../src/db/schema.js");
const billing = await import("../src/services/billing.js");
const credits = await import("../src/services/credits.js");

/** Base de datos falsa mínima: libro en memoria, precios, niveles y un candado que imita pg_advisory_xact_lock. */
function fakeDb(opts: { ledger?: { delta: number; reason: string; ref?: string }[]; level?: number; tiers?: unknown[] } = {}) {
  const ledger = [...(opts.ledger ?? [])].map((r, i) => ({ id: "e" + i, organizationId: "org1", item: null, userId: null, ref: null, ...r }));
  let lock: Promise<void> = Promise.resolve();
  const selectFrom = (table: unknown) => {
    const rows = async () => {
      if (table === creditLedger) return [{ n: ledger.reduce((a, r) => a + r.delta, 0) }];
      if (table === levelByCompetency) return [{ n: (opts.level ?? 0) >= 4 ? 1 : 0 }];
      if (table === creditPrice) return [];
      if (table === pricingTier) return opts.tiers ?? [];
      return [];
    };
    const q = { where: () => q, then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => rows().then(ok, ko) };
    return q;
  };
  const insert = (table: unknown) => ({
    values: (v: Record<string, unknown>) => {
      const run = (ignoreConflict: boolean) => {
        if (table !== creditLedger) return [];
        const dup = v.reason === "compra" && ledger.some((r) => r.reason === "compra" && r.ref === v.ref);
        if (dup) { if (ignoreConflict) return []; throw new Error("unique violation"); }
        ledger.push(v as never);
        return [{ id: v.id }];
      };
      return {
        onConflictDoNothing: () => ({ returning: async () => run(true) }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(() => run(false)).then(ok, ko),
      };
    },
  });
  const db = {
    select: () => ({ from: selectFrom }),
    insert,
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      let release = () => {};
      const tx = {
        select: db.select, insert,
        execute: async () => { const prev = lock; lock = new Promise<void>((r) => { release = r; }); await prev; },
      };
      try { return await fn(tx); } finally { release(); }
    },
  };
  let n = 0;
  return { deps: { db: db as never, newId: () => "id" + ++n }, ledger };
}

describe("planes", () => {
  it("texto = Esencial 9 €, video_corto = Profesional 13 €; inmersivo fuera de la venta", async () => {
    expect(billing.PLANS.texto).toMatchObject({ name: "Esencial", defaultCents: 900 });
    expect(billing.PLANS.video_corto).toMatchObject({ name: "Profesional", defaultCents: 1300 });
    expect(billing.SALE_TIERS).toEqual(["texto", "video_corto"]);
    expect(billing.TIERS).toContain("inmersivo"); // se conserva para suscripciones existentes
    expect(billing.PLANS.video_corto.includes).toContain("Todo lo de Esencial");
    const { deps } = fakeDb({ tiers: [{ tier: "texto", pricePerSeatCents: 950, currency: "eur" }, { tier: "inmersivo", pricePerSeatCents: 4200, currency: "eur" }] });
    const plans = await billing.salePlans(deps);
    expect(plans.map((p) => [p.tier, p.pricePerSeatCents])).toEqual([["texto", 950], ["video_corto", 1300]]); // tabla manda; si falta, defecto
  });
  it("FUNDAE: 7,50 €/h teleformación como máximo (20 h → 150 €)", () => {
    expect(billing.fundaeMaxPerLearner(20)).toBe(150);
  });
});

describe("packs de créditos", () => {
  it("100 = 10 €, 500 = 45 €, 1.000 = 80 €; 1 crédito = 0,10 €", () => {
    expect(credits.CREDIT_PACKS.map((p) => [p.credits, p.priceCents])).toEqual([[100, 1000], [500, 4500], [1000, 8000]]);
    expect(credits.CREDIT_EUR_CENTS).toBe(10);
    for (const p of credits.CREDIT_PACKS) expect(p.priceCents / p.credits).toBeLessThanOrEqual(credits.CREDIT_EUR_CENTS);
  });
  it("precios por defecto en créditos", () => {
    const d = Object.fromEntries(Object.entries(credits.CREDIT_ITEMS).map(([k, v]) => [k, v.credits]));
    expect(d).toEqual({ voz_narrada: 3, avatar_estandar: 12, avatar_realista: 35, avatar_propio: 100, clonar_voz: 150, curso_ia: 20 });
    expect(Object.entries(credits.CREDIT_ITEMS).filter(([, v]) => v.available).map(([k]) => k)).toEqual(["curso_ia"]);
  });
  it("checkout de pack: pago único con el importe del catálogo (Stripe simulado)", async () => {
    const r = await credits.createPackCheckout({ orgId: "org1", orgName: "ACME", pack: "p500", customerEmail: "a@b.c" });
    expect(r.url).toContain("checkout.stripe.test");
    const a = created.at(-1) as { mode: string; line_items: { price_data: { unit_amount: number } }[]; metadata: Record<string, string> };
    expect(a.mode).toBe("payment");
    expect(a.line_items[0]!.price_data.unit_amount).toBe(4500);
    expect(a.metadata).toMatchObject({ organizationId: "org1", kind: "credits", pack: "p500" });
  });
});

const coach = { orgId: "org1", userId: "u1", role: "coach", platformAdmin: false };
const empleado = { orgId: "org1", userId: "u2", role: "empleado", platformAdmin: false };

describe("puerta de nivel Coach", () => {
  it("empleado sin N4 no puede; con N4 en cualquier competencia sí; roles coach/admin/dirección y superadmin sí", async () => {
    expect(await credits.canSpend(fakeDb({ level: 3 }).deps, empleado)).toBe(false);
    expect(await credits.canSpend(fakeDb({ level: 4 }).deps, empleado)).toBe(true);
    for (const role of ["coach", "admin", "direccion"]) expect(await credits.canSpend(fakeDb().deps, { ...empleado, role })).toBe(true);
    expect(await credits.canSpend(fakeDb().deps, { ...empleado, role: "team_leader", platformAdmin: true })).toBe(true);
    expect(await credits.canSpend(fakeDb().deps, { ...empleado, role: "team_leader" })).toBe(false);
  });
  it("sin permiso: 403 y no se apunta nada aunque haya saldo", async () => {
    const f = fakeDb({ ledger: [{ delta: 100, reason: "compra", ref: "cs1" }] });
    await expect(credits.spendCredits(f.deps, empleado, "curso_ia", 1, "r")).rejects.toMatchObject({ status: 403 });
    expect(f.ledger).toHaveLength(1);
  });
});

describe("gasto de créditos", () => {
  it("saldo insuficiente: 402 con mensaje claro en castellano", async () => {
    const f = fakeDb({ ledger: [{ delta: 19, reason: "compra", ref: "cs1" }] });
    const err = await credits.spendCredits(f.deps, coach, "curso_ia", 1, "r").catch((e) => e);
    expect(err).toBeInstanceOf(credits.CreditError);
    expect(err.status).toBe(402);
    expect(err.message).toMatch(/No hay créditos suficientes: hacen falta 20 y a tu empresa le quedan 19/);
  });
  it("gasta el precio × unidades y devuelve el saldo restante", async () => {
    const f = fakeDb({ ledger: [{ delta: 100, reason: "compra", ref: "cs1" }] });
    const r = await credits.spendCredits(f.deps, coach, "avatar_estandar", 3, "video-1");
    expect(r).toMatchObject({ spent: 36, balance: 64 });
    expect(f.ledger.at(-1)).toMatchObject({ delta: -36, reason: "gasto", item: "avatar_estandar", userId: "u1", ref: "video-1" });
  });
  it("atómico: dos gastos simultáneos con saldo para uno solo → uno pasa y el otro falla", async () => {
    const f = fakeDb({ ledger: [{ delta: 20, reason: "compra", ref: "cs1" }] });
    const res = await Promise.allSettled([
      credits.spendCredits(f.deps, coach, "curso_ia", 1, "a"),
      credits.spendCredits(f.deps, coach, "curso_ia", 1, "b"),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.ledger.reduce((a, r) => a + r.delta, 0)).toBe(0);
  });
  it("devolución si la creación falla (solo de gastos, nunca de compras)", async () => {
    const f = fakeDb({ ledger: [{ delta: -20, reason: "gasto", ref: "a" }] });
    const db = f.deps.db as unknown as Record<string, unknown>;
    db.select = () => ({ from: () => ({ where: async () => [f.ledger[0]] }) }); // el apunte buscado por id
    await credits.refundSpend(f.deps, "org1", "e0");
    expect(f.ledger.at(-1)).toMatchObject({ delta: 20, reason: "devolucion", ref: "e0" });
    const g = fakeDb({ ledger: [{ delta: 100, reason: "compra", ref: "cs1" }] });
    (g.deps.db as unknown as Record<string, unknown>).select = () => ({ from: () => ({ where: async () => [g.ledger[0]] }) });
    await credits.refundSpend(g.deps, "org1", "e0");
    expect(g.ledger).toHaveLength(1);
  });
});

describe("webhook de Stripe: compra de créditos", () => {
  const evt = (over: Record<string, unknown> = {}) => ({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_A", payment_status: "paid", metadata: { kind: "credits", organizationId: "org1", pack: "p100", credits: "999999" }, ...over } },
  }) as never;
  it("abona el pack del catálogo (no el número de la metadata) una sola vez aunque llegue repetido", async () => {
    const f = fakeDb();
    await billing.applyStripeEvent(f.deps, evt());
    await billing.applyStripeEvent(f.deps, evt());
    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0]).toMatchObject({ delta: 100, reason: "compra", ref: "cs_test_A", organizationId: "org1" });
  });
  it("ignora pagos no cobrados, packs desconocidos y sesiones que no son de créditos", async () => {
    const f = fakeDb();
    await billing.applyStripeEvent(f.deps, evt({ payment_status: "unpaid" }));
    await billing.applyStripeEvent(f.deps, evt({ id: "cs_B", metadata: { kind: "credits", organizationId: "org1", pack: "p9" } }));
    await billing.applyStripeEvent(f.deps, evt({ id: "cs_C", metadata: { organizationId: "org1", tier: "texto" } }));
    expect(f.ledger).toHaveLength(0);
  });
});
