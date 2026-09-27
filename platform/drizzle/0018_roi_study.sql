CREATE TABLE "roi_study" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"period_start" text,
	"period_end" text,
	"costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intangibles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
