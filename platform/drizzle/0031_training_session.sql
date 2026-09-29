CREATE TABLE IF NOT EXISTS "training_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"skill_key" text,
	"source" text NOT NULL,
	"held_at" timestamp,
	"score" integer,
	"metrics" jsonb,
	"analysis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_session_user_idx" ON "training_session" USING btree ("organization_id","user_id");