CREATE TABLE "applied_case" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"path_id" text,
	"prompt" text NOT NULL,
	"submission" text,
	"status" text DEFAULT 'borrador' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rubric" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"validator_id" text NOT NULL,
	"decision" text NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validation" ADD CONSTRAINT "validation_case_id_applied_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."applied_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_org_idx" ON "applied_case" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rubric_org_idx" ON "rubric" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "val_org_idx" ON "validation" USING btree ("organization_id");