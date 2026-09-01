CREATE TABLE "baseline_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "baseline_org_idx" ON "baseline_snapshot" USING btree ("organization_id");