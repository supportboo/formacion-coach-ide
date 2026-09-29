CREATE TABLE IF NOT EXISTS "evidence_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"skill_key" text NOT NULL,
	"type" text NOT NULL,
	"dimension" text NOT NULL,
	"context" text,
	"score" integer,
	"independence" text NOT NULL,
	"ai_help" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_event_user_idx" ON "evidence_event" USING btree ("organization_id","user_id");