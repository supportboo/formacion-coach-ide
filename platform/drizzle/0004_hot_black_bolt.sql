CREATE TABLE "certificate" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"competency_id" text,
	"title" text NOT NULL,
	"code" text NOT NULL,
	"evidence" jsonb,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "company_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"level_labels" jsonb,
	"salary_linked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rule_id" text,
	"reward" text NOT NULL,
	"ref_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event" text NOT NULL,
	"params" jsonb,
	"reward" text NOT NULL,
	"reward_params" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cert_org_idx" ON "certificate" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "grant_org_idx" ON "reward_grant" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rule_org_idx" ON "reward_rule" USING btree ("organization_id");