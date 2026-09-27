CREATE TABLE IF NOT EXISTS "activity_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"page" text,
	"source" text,
	"section" integer,
	"section_title" text,
	"scroll_pct" integer,
	"active_sec" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_org_time_idx" ON "activity_event" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_org_user_time_idx" ON "activity_event" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_thread" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "display" text;--> statement-breakpoint
ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "author_id" text;--> statement-breakpoint
ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "author_name" text;--> statement-breakpoint
ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "author_role" text;--> statement-breakpoint
ALTER TABLE "company_config" ADD COLUMN IF NOT EXISTS "live_supervision" boolean DEFAULT true NOT NULL;
