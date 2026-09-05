// Fija/actualiza un nivel de precio global. Uso: npx tsx scripts/set-pricing.ts <tier> "<label>" <precioAsientoEnCentimos>
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { setPricingTier, TIERS } from "../src/services/billing.js";

const [, , tier, label, cents] = process.argv;
if (!tier || !label || !cents || !(TIERS as readonly string[]).includes(tier)) {
  console.error(`uso: npx tsx scripts/set-pricing.ts <${TIERS.join("|")}> "<label>" <precio_en_centimos>`);
  process.exit(1);
}
await setPricingTier({ db, newId }, tier as (typeof TIERS)[number], label, Number(cents));
console.log(`nivel "${tier}" fijado a ${(Number(cents) / 100).toFixed(2)} €/asiento/mes`);
process.exit(0);
