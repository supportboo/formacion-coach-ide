CREATE TABLE IF NOT EXISTS "assessment_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"block" integer DEFAULT -1 NOT NULL,
	"questions" jsonb NOT NULL,
	"answers" jsonb,
	"results" jsonb,
	"score" integer,
	"passed" boolean,
	"status" text DEFAULT 'abierto' NOT NULL,
	"assignment_id" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"deadline_at" timestamp,
	"submitted_at" timestamp,
	"graded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "roleplay_session" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "roleplay_session" ADD COLUMN IF NOT EXISTS "topic" text;--> statement-breakpoint
ALTER TABLE "roleplay_session" ADD COLUMN IF NOT EXISTS "score" integer;--> statement-breakpoint
ALTER TABLE "roleplay_session" ADD COLUMN IF NOT EXISTS "feedback" jsonb;--> statement-breakpoint
ALTER TABLE "roleplay_session" ADD COLUMN IF NOT EXISTS "interview" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assess_org_user_src_idx" ON "assessment_attempt" USING btree ("organization_id","user_id","source");