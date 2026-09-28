CREATE TABLE IF NOT EXISTS "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"item" text,
	"ref" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_price" (
	"item" text PRIMARY KEY NOT NULL,
	"credits" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_org_idx" ON "credit_ledger" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_purchase_uq" ON "credit_ledger" USING btree ("ref") WHERE reason = 'compra';--> statement-breakpoint
-- Planes 1.6.0: texto -> Esencial 9 €, video_corto -> Profesional 13 €. inmersivo se retira de la venta (la fila se conserva para suscripciones existentes).
INSERT INTO "pricing_tier" ("tier","label","price_per_seat_cents","currency") VALUES ('texto','Esencial',900,'eur'),('video_corto','Profesional',1300,'eur') ON CONFLICT ("tier") DO UPDATE SET "label"=EXCLUDED."label","price_per_seat_cents"=EXCLUDED."price_per_seat_cents","updated_at"=now();--> statement-breakpoint
INSERT INTO "credit_price" ("item","credits") VALUES ('voz_narrada',3),('avatar_estandar',12),('avatar_realista',35),('avatar_propio',100),('clonar_voz',150),('curso_ia',20) ON CONFLICT ("item") DO NOTHING;
