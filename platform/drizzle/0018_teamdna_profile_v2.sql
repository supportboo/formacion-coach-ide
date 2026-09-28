-- Idempotent: team_profile (Team DNA v2, perfil combinado).
CREATE TABLE IF NOT EXISTS "team_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"brief" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_profile_user_uidx" ON "team_profile" USING btree ("organization_id","user_id");