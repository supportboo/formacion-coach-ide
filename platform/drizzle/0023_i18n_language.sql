CREATE TABLE IF NOT EXISTS "content_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"course" text NOT NULL,
	"section" integer NOT NULL,
	"lang" text NOT NULL,
	"src_hash" text NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "lang" text;--> statement-breakpoint
ALTER TABLE "video_event" ADD COLUMN IF NOT EXISTS "lang" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_translation_uq" ON "content_translation" USING btree ("course","section","lang","src_hash");