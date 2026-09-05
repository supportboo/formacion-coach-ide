import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { pricingTier, subscription } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("falta STRIPE_SECRET_KEY");
  if (!stripeClient) stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export const TIERS = ["texto", "video_corto", "inmersivo"] as const;
export type Tier = (typeof TIERS)[number];

export const listPricingTiers = (deps: SvcDeps) => deps.db.select().from(pricingTier);

/** Fija el precio por asiento de un nivel. Lo pone Boomatik (vía script), no cada empresa. */
export async function setPricingTier(
  deps: SvcDeps, tier: Tier, label: string, pricePerSeatCents: number,
): Promise<void> {
  await deps.db.insert(pricingTier).values({ tier, label, pricePerSeatCents })
    .onConflictDoUpdate({ target: pricingTier.tier, set: { label, pricePerSeatCents, updatedAt: new Date() } });
}

export async function getSubscription(deps: SvcDeps, orgId: string) {
  const [row] = await deps.db.select().from(subscription).where(eq(subscription.organizationId, orgId));
  return row ?? null;
}

/**
 * Crea una sesión de Stripe Checkout para suscribir a la empresa a un nivel, con `seats`
 * asientos. Precio dinámico (`price_data`) desde `pricingTier` — no hace falta crear
 * Products/Prices fijos en Stripe para cambiar el precio.
 */
export async function createCheckoutSession(
  deps: SvcDeps, args: { orgId: string; orgName: string; tier: Tier; seats: number; customerEmail: string },
): Promise<{ url: string }> {
  const [pt] = await deps.db.select().from(pricingTier).where(eq(pricingTier.tier, args.tier));
  if (!pt) throw new Error(`nivel de precio "${args.tier}" no configurado`);
  if (args.seats < 1) throw new Error("seats debe ser >= 1");

  const existing = await getSubscription(deps, args.orgId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: existing?.stripeCustomerId ?? undefined,
    customer_email: existing?.stripeCustomerId ? undefined : args.customerEmail,
    line_items: [{
      quantity: args.seats,
      price_data: {
        currency: pt.currency,
        unit_amount: pt.pricePerSeatCents,
        recurring: { interval: "month" },
        product_data: { name: `SkillUp · ${pt.label} — ${args.orgName}` },
      },
    }],
    metadata: { organizationId: args.orgId, tier: args.tier },
    subscription_data: { metadata: { organizationId: args.orgId, tier: args.tier } },
    success_url: `${env.APP_URL}/app/panel.html?billing=ok`,
    cancel_url: `${env.APP_URL}/app/panel.html?billing=cancel`,
  });
  if (!session.url) throw new Error("Stripe no devolvió url de checkout");

  await deps.db.insert(subscription).values({
    organizationId: args.orgId, tier: args.tier, seats: args.seats, status: "sin_suscripcion",
  }).onConflictDoUpdate({ target: subscription.organizationId, set: { tier: args.tier, seats: args.seats, updatedAt: new Date() } });

  return { url: session.url };
}

const STRIPE_TO_STATUS: Record<string, string> = {
  active: "active", trialing: "trialing", past_due: "past_due",
  canceled: "canceled", unpaid: "past_due", incomplete_expired: "canceled",
};

/** Aplica un evento de Stripe ya verificado (firma comprobada en la ruta) al estado local. */
export async function applyStripeEvent(deps: SvcDeps, event: Stripe.Event): Promise<void> {
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created"
    || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata?.organizationId;
    if (!orgId) return;
    const status = STRIPE_TO_STATUS[sub.status] ?? sub.status;
    const periodEnd = sub.items.data[0]?.current_period_end;
    await deps.db.update(subscription).set({
      status,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    }).where(eq(subscription.organizationId, orgId));
  }
}
