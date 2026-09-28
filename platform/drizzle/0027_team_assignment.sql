CREATE TABLE IF NOT EXISTS "team_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"manager_user_id" text NOT NULL,
	"learner_user_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_assignment_uidx" ON "team_assignment" USING btree ("organization_id","manager_user_id","learner_user_id");