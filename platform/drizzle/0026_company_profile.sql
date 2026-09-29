ALTER TABLE "company_config" ADD COLUMN IF NOT EXISTS "profile" jsonb;--> statement-breakpoint
ALTER TABLE "company_config" ADD COLUMN IF NOT EXISTS "profile_validated_at" timestamp;--> statement-breakpoint
ALTER TABLE "company_config" ADD COLUMN IF NOT EXISTS "profile_validated_by" text;