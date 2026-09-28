-- Idempotent: team_dna nuevo (Team DNA / arquetipos de fortaleza).
CREATE TABLE IF NOT EXISTS "team_dna" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"weights" jsonb NOT NULL,
	"primary" text NOT NULL,
	"secondary" text NOT NULL,
	"archetype" text NOT NULL,
	"near" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_dna_user_uidx" ON "team_dna" USING btree ("organization_id","user_id");