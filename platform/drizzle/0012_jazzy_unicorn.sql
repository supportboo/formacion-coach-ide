ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "org_role" text DEFAULT 'empleado' NOT NULL;--> statement-breakpoint
-- Backfill: "role" venia haciendo doble uso (better-auth owner/admin/member Y nuestro organigrama a la
-- vez), pisando "owner" con "admin" y rompiendo invitar/gestionar equipo desde better-auth. Separamos:
-- 1) lo que habia en "role" fuera de owner/member (p.ej. "admin" puesto por bootstrap-admin, o roles
--    del organigrama que nunca deberian haber llegado ahi) pasa a "org_role".
UPDATE "member" SET "org_role" = "role" WHERE "role" NOT IN ('owner', 'member');--> statement-breakpoint
-- 2) a quien quede con org_role admin/direccion se le devuelve "owner" en better-auth para que pueda
--    invitar/gestionar el equipo (asi funcionaba antes de que bootstrap-admin lo pisara).
UPDATE "member" SET "role" = 'owner' WHERE "org_role" IN ('admin', 'direccion');--> statement-breakpoint
-- 3) cualquier "role" que ya no sea un valor valido de better-auth (owner/admin/member) cae a "member".
UPDATE "member" SET "role" = 'member' WHERE "role" NOT IN ('owner', 'admin', 'member');