CREATE TABLE "pricing_tier" (
	"tier" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"price_per_seat_cents" integer NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'texto' NOT NULL,
	"seats" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'sin_suscripcion' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
