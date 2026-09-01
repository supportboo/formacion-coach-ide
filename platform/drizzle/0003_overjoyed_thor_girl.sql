CREATE TABLE "coaching" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"learner_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"season" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "coach_org_idx" ON "coaching" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pts_org_idx" ON "points_ledger" USING btree ("organization_id");