-- Idempotente (30-09): al renumerar esta migración cambió su marca de tiempo y el migrador la vuelve a ejecutar
-- en bases donde ya estaba aplicada. Cada paso comprueba antes si ya existe.
ALTER TABLE "rubric" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Backfill: si una organización/competencia ya tenía varias rúbricas publicadas antes de
-- esta migración, todas habrían quedado en version=1 por el DEFAULT de arriba. Se renumeran
-- por orden de creación (1, 2, 3...) para que la versión sea correcta desde ya.
UPDATE "rubric" r SET "version" = ranked.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organization_id", "competency_id" ORDER BY "created_at") AS rn
  FROM "rubric"
) ranked
WHERE r."id" = ranked."id" AND r."version" <> ranked.rn;--> statement-breakpoint
ALTER TABLE "validation" ADD COLUMN IF NOT EXISTS "rubric_id" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'validation_rubric_id_rubric_id_fk') THEN
    ALTER TABLE "validation" ADD CONSTRAINT "validation_rubric_id_rubric_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubric"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- Backfill best-effort: para validaciones históricas, se asocia la rúbrica que estaba vigente
-- (la más reciente con created_at <= la validación) en esa organización/competencia. Puede
-- quedar NULL si no había rúbrica publicada todavía — eso es correcto, no un error.
UPDATE "validation" v SET "rubric_id" = (
  SELECT r."id" FROM "rubric" r
  JOIN "applied_case" c ON c."id" = v."case_id"
  WHERE r."organization_id" = c."organization_id" AND r."competency_id" = c."competency_id"
    AND r."created_at" <= v."created_at"
  ORDER BY r."created_at" DESC LIMIT 1
)
WHERE v."rubric_id" IS NULL;