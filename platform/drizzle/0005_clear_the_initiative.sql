CREATE TABLE "fundae_action" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"competency_id" text,
	"modalidad" text DEFAULT 'teleformacion' NOT NULL,
	"horas" integer NOT NULL,
	"related_puesto" text,
	"tutor_id" text NOT NULL,
	"es_cert_profesionalidad" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundae_participation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"action_id" text NOT NULL,
	"user_id" text NOT NULL,
	"controls_total" integer NOT NULL,
	"controls_done" integer DEFAULT 0 NOT NULL,
	"finalizado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fundae_participation" ADD CONSTRAINT "fundae_participation_action_id_fundae_action_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."fundae_action"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fundae_org_idx" ON "fundae_action" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fundaep_org_idx" ON "fundae_participation" USING btree ("organization_id");