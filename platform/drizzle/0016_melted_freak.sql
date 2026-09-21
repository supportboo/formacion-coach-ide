-- Idempotent on purpose: these tables/columns were first created by hand in production (2026-09-14/16).
CREATE TABLE IF NOT EXISTS "annotation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"card" integer DEFAULT 0 NOT NULL,
	"card_title" text,
	"kind" text NOT NULL,
	"quote" text,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"sort_type" text NOT NULL,
	"videos" jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotation_user_src" ON "annotation" USING btree ("organization_id","user_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_cache_topic_sort_uidx" ON "video_cache" USING btree ("topic","sort_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_event_youtube_idx" ON "video_event" USING btree ("youtube_id");