CREATE TABLE IF NOT EXISTS "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"type" text,
	"rating" text,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"target_key" text,
	"message_id" text,
	"answer_text" text,
	"prompt_text" text,
	"page" text,
	"course" text,
	"block" text,
	"agent" text,
	"role" text,
	"user_agent" text,
	"status" text DEFAULT 'nuevo' NOT NULL,
	"resolver_id" text,
	"resolver_name" text,
	"resolution_note" text,
	"resolved_at" timestamp,
	"user_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_vote_uq" ON "feedback" USING btree ("organization_id","user_id","target_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_org_time_idx" ON "feedback" USING btree ("organization_id","created_at");