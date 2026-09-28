CREATE TABLE IF NOT EXISTS "learner_fact" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"layer" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'declarado' NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text,
	"evidence" text,
	"scope" text,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_fact_user_idx" ON "learner_fact" USING btree ("organization_id","user_id","active");