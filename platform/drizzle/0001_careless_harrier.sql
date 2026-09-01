CREATE TABLE "enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"path_id" text NOT NULL,
	"competency_id" text,
	"status" text DEFAULT 'en_curso' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_by_competency" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sector" text,
	"puesto" text,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"path_id" text NOT NULL,
	"competency_id" text,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "enr_org_idx" ON "enrollment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lvl_org_idx" ON "level_by_competency" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lvl_uniq" ON "level_by_competency" USING btree ("organization_id","user_id","competency_id");--> statement-breakpoint
CREATE INDEX "onb_org_idx" ON "onboarding_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "att_org_idx" ON "test_attempt" USING btree ("organization_id");