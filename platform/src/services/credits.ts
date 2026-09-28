import { and, desc, eq, gte, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "../config/env.js";
import { creditLedger, creditPrice, levelByCompetency, organization, user } from "../db/schema.js";
import { stripe } from "./billing.js";
import type { SvcDeps } from "./org.js";

/* Créditos de creación (1.6.0). 1 crédito = 0,10 €. Monedero por empresa; saldo = suma del libro. */

export const CREDIT_EUR_CENTS = 10;

/** Packs a la venta (pago único por Stripe Checkout). Fijos en código: cambiarlos es una decisión de negocio. */
export const CREDIT_PACKS = [
  { id: "p100", credits: 100, priceCents: 1000 },
  { id: "p500", credits: 500, priceCents: 4500 },
  { id: "p1000", credits: 1000, priceCents: 8000 },
] as const;
export type PackId = (typeof CREDIT_PACKS)[number]["id"];
export const PACK_IDS = CREDIT_PACKS.map((p) => p.id) as [PackId, ...PackId[]];
export const findPack = (id: string) => CREDIT_PACKS.find((p) => p.id === id) ?? null;

/**
 * Catálogo de lo que se puede crear con créditos. `credits` es el valor por defecto (la tabla
 * credit_price manda). `available` = la función existe hoy en la plataforma; el resto está listo
 * para cobrarse con spendCredits cuando se construya, pero no se ofrece como si existiera.
 * `providerCost`: coste estimado del proveedor, con fuente; nunca es una cifra medida.
 */
export const CREDIT_ITEMS = {
  voz_narrada: {
    label: "Voz narrada", unit: "min", credits: 3, available: false,
    providerCost: "≈ 0,17–0,20 $ por minuto (≈ 1.000 caracteres)",
    source: "ElevenLabs, página oficial de precios (API), leída el 20-sep-2026",
  },
  avatar_estandar: {
    label: "Vídeo con avatar estándar (HeyGen Avatar IV)", unit: "min", credits: 12, available: false,
    providerCost: "≈ 0,78 $ por minuto (~16 créditos HeyGen/min con el plan Pro de 49 $ por 1.000 créditos)",
    source: "HeyGen, página oficial de precios, leída el 28-sep-2026",
  },
  avatar_realista: {
    label: "Vídeo con avatar realista (HeyGen Avatar V)", unit: "min", credits: 35, available: false,
    providerCost: "≈ 2,35 $ por minuto (~48 créditos HeyGen/min con el plan Pro de 49 $ por 1.000 créditos)",
    source: "HeyGen, página oficial de precios, leída el 28-sep-2026",
  },
  avatar_propio: {
    label: "Crear tu avatar propio", unit: "ud", credits: 100, available: false,
    providerCost: "Por medir", source: "Sin medición propia todavía",
  },
  clonar_voz: {
    label: "Clonar tu voz", unit: "ud", credits: 150, available: false,
    providerCost: "Por medir", source: "Sin medición propia todavía",
  },
  curso_ia: {
    label: "Crear un curso con IA (panel de expertos)", unit: "ud", credits: 20, available: true,
    providerCost: "2 llamadas a Claude; el coste real queda en el registro de coste IA",
    source: "Registro de coste IA de la plataforma (ai_usage)",
  },
} as const;
export type CreditItem = keyof typeof CREDIT_ITEMS;
export const CREDIT_ITEM_IDS = Object.keys(CREDIT_ITEMS) as [CreditItem, ...CreditItem[]];

/** Precios vigentes (tabla, con los valores por defecto de código si falta alguna fila). */
export async function getPrices(deps: SvcDeps): Promise<Record<CreditItem, number>> {
  const rows = await deps.db.select().from(creditPrice);
  const out = Object.fromEntries(CREDIT_ITEM_IDS.map((k) => [k, CREDIT_ITEMS[k].credits])) as Record<CreditItem, number>;
  for (const r of rows) if (r.item in out) out[r.item as CreditItem] = r.credits;
  return out;
}

export async function setPrice(deps: SvcDeps, item: CreditItem, credits: number): Promise<void> {
  await deps.db.insert(creditPrice).values({ item, credits })
    .onConflictDoUpdate({ target: creditPrice.item, set: { credits, updatedAt: new Date() } });
}

export async function balance(deps: SvcDeps, orgId: string): Promise<number> {
  const [r] = await deps.db.select({ n: sql<number>`coalesce(sum(${creditLedger.delta}),0)::int` })
    .from(creditLedger).where(eq(creditLedger.organizationId, orgId));
  return r?.n ?? 0;
}

export interface Spender { orgId: string; userId: string; role: string; platformAdmin: boolean }

/** Roles que pueden gastar sin haber llegado a N4 (además del superadmin). */
export const SPEND_ROLES = ["coach", "admin", "direccion"];
/** Quién puede comprar packs y ver el libro de la empresa. */
export const BUY_ROLES = ["admin", "direccion"];

/** Puerta de nivel Coach: N4 en cualquier competencia, o rol coach/admin/dirección, o superadmin. */
export async function canSpend(deps: SvcDeps, s: Spender): Promise<boolean> {
  if (s.platformAdmin || SPEND_ROLES.includes(s.role)) return true;
  const [r] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(levelByCompetency).where(and(
    eq(levelByCompetency.organizationId, s.orgId), eq(levelByCompetency.userId, s.userId), gte(levelByCompetency.level, 4),
  ));
  return (r?.n ?? 0) > 0;
}

export class CreditError extends Error {
  constructor(message: string, readonly status: 402 | 403) { super(message); }
}

/** Decisión pura de un gasto (se testea sin base de datos). */
export function decideSpend(a: { allowed: boolean; balance: number; cost: number }): { ok: true } | { ok: false; error: CreditError } {
  if (!a.allowed) return { ok: false, error: new CreditError("Crear con créditos está reservado a quien llega a nivel Coach (N4) en alguna competencia, o a los roles coach, admin y dirección.", 403) };
  if (a.balance < a.cost) return { ok: false, error: new CreditError(`No hay créditos suficientes: hacen falta ${a.cost} y a tu empresa le quedan ${a.balance}. Una persona de administración o dirección puede comprar un pack en Panel de empresa → Facturación.`, 402) };
  return { ok: true };
}

/**
 * Gasta créditos de forma atómica: bloquea el monedero de la empresa (advisory lock por org dentro
 * de la transacción), comprueba permiso y saldo, y apunta el gasto. Dos gastos simultáneos no
 * pueden dejar el saldo en negativo. Devuelve el id del apunte (para devolverlo si la creación falla).
 */
export async function spendCredits(
  deps: SvcDeps, s: Spender, item: CreditItem, units: number, ref: string,
): Promise<{ entryId: string; spent: number; balance: number }> {
  if (!Number.isInteger(units) || units < 1) throw new Error("unidades no válidas");
  const allowed = await canSpend(deps, s);
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + s.orgId}))`);
    const txDeps = { ...deps, db: tx as unknown as SvcDeps["db"] };
    const cost = (await getPrices(txDeps))[item] * units;
    const bal = await balance(txDeps, s.orgId);
    const d = decideSpend({ allowed, balance: bal, cost });
    if (!d.ok) throw d.error;
    const entryId = deps.newId();
    await tx.insert(creditLedger).values({ id: entryId, organizationId: s.orgId, delta: -cost, reason: "gasto", item, ref, userId: s.userId });
    return { entryId, spent: cost, balance: bal - cost };
  });
}

/** Devuelve un gasto cuando la creación falla (el cliente no paga por un error nuestro). */
export async function refundSpend(deps: SvcDeps, orgId: string, entryId: string): Promise<void> {
  const [e] = await deps.db.select().from(creditLedger).where(and(eq(creditLedger.id, entryId), eq(creditLedger.organizationId, orgId)));
  if (!e || e.delta >= 0) return;
  await deps.db.insert(creditLedger).values({
    id: deps.newId(), organizationId: orgId, delta: -e.delta, reason: "devolucion", item: e.item, ref: entryId, userId: e.userId,
  });
}

/** Libro de la empresa, con el nombre de quien gastó. */
export async function ledger(deps: SvcDeps, orgId: string, limit = 100) {
  return deps.db.select({
    id: creditLedger.id, delta: creditLedger.delta, reason: creditLedger.reason, item: creditLedger.item,
    ref: creditLedger.ref, userName: user.name, createdAt: creditLedger.createdAt,
  }).from(creditLedger).leftJoin(user, eq(creditLedger.userId, user.id))
    .where(eq(creditLedger.organizationId, orgId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
}

/** Todos los monederos (superadmin). */
export async function allWallets(deps: SvcDeps) {
  return deps.db.select({
    orgId: creditLedger.organizationId, orgName: organization.name,
    balance: sql<number>`coalesce(sum(${creditLedger.delta}),0)::int`,
    bought: sql<number>`coalesce(sum(${creditLedger.delta}) filter (where ${creditLedger.reason} = 'compra'),0)::int`,
    spent: sql<number>`coalesce(-sum(${creditLedger.delta}) filter (where ${creditLedger.reason} <> 'compra'),0)::int`,
  }).from(creditLedger).leftJoin(organization, eq(creditLedger.organizationId, organization.id))
    .groupBy(creditLedger.organizationId, organization.name);
}

/** Checkout de Stripe en modo pago único para un pack. Los créditos se abonan en el webhook. */
export async function createPackCheckout(
  args: { orgId: string; orgName: string; pack: PackId; customerEmail: string },
): Promise<{ url: string }> {
  const p = findPack(args.pack);
  if (!p) throw new Error("pack no válido");
  const metadata = { organizationId: args.orgId, kind: "credits", pack: p.id, credits: String(p.credits) };
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: args.customerEmail,
    line_items: [{
      quantity: 1,
      price_data: { currency: "eur", unit_amount: p.priceCents, product_data: { name: `SkillUp · ${p.credits} créditos de creación — ${args.orgName}` } },
    }],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${env.APP_URL}/app/panel.html?credits=ok`,
    cancel_url: `${env.APP_URL}/app/panel.html?credits=cancel`,
  });
  if (!session.url) throw new Error("Stripe no devolvió url de checkout");
  return { url: session.url };
}

/**
 * Abona un pack pagado (checkout.session.completed / async_payment_succeeded). Idempotente: el índice
 * único parcial (ref = id de sesión, reason = compra) hace que un webhook repetido no abone dos veces.
 * Los créditos salen del pack del catálogo, no de un importe libre.
 */
export async function creditFromCheckout(deps: SvcDeps, session: Stripe.Checkout.Session): Promise<boolean> {
  const md = session.metadata ?? {};
  if (md.kind !== "credits" || !md.organizationId) return false;
  if (session.payment_status !== "paid") return false;
  const p = findPack(md.pack ?? "");
  if (!p) return false;
  const res = await deps.db.insert(creditLedger).values({
    id: deps.newId(), organizationId: md.organizationId, delta: p.credits, reason: "compra", item: p.id, ref: session.id, userId: null,
  }).onConflictDoNothing().returning({ id: creditLedger.id });
  return res.length > 0;
}
