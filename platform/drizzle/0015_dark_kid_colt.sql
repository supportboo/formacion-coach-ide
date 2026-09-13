CREATE TABLE "analytics_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"day" text NOT NULL,
	"member_count" integer NOT NULL,
	"avg_coverage_pct" real NOT NULL,
	"critical_risks" integer NOT NULL,
	"internal_transfer" real NOT NULL,
	"time_to_autonomy_days" real NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "snap_org_idx" ON "analytics_snapshot" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snap_org_day_uidx" ON "analytics_snapshot" USING btree ("organization_id","day");