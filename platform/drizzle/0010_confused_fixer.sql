CREATE TABLE "career_path" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_puesto_id" text,
	"to_puesto_id" text NOT NULL,
	"requirements" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "recertifies_id" text;--> statement-breakpoint
CREATE INDEX "career_org_idx" ON "career_path" USING btree ("organization_id");