ALTER TABLE "fundae_action" ADD COLUMN IF NOT EXISTS "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "fundae_action" ADD COLUMN IF NOT EXISTS "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "fundae_action" ADD COLUMN IF NOT EXISTS "rlt_informed_at" timestamp;--> statement-breakpoint
ALTER TABLE "fundae_action" ADD COLUMN IF NOT EXISTS "fundae_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "fundae_action" ADD COLUMN IF NOT EXISTS "quality_survey_at" timestamp;