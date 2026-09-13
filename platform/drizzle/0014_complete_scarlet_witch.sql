CREATE TABLE "roleplay_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"persona" text NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "roleplay_org_idx" ON "roleplay_session" USING btree ("organization_id");