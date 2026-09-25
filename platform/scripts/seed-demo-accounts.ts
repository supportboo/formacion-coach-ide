// Cuentas de DEMO con login real (email + contraseña) y rol correcto, en una empresa de demo.
// Para enseñar SkillUp a un profesor validador: entrar directo como responsable y como alumno,
// además del superadmin (que ya existe por PLATFORM_ADMIN_EMAILS e impersona cualquier rol).
// Idempotente: se puede repetir. Uso (en el servidor): npx tsx scripts/seed-demo-accounts.ts
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { organization, user, member } from "../src/db/schema.js";
import { auth } from "../src/auth/auth.js";
import * as orgSvc from "../src/services/org.js";
import type { Role } from "../src/agents/registry.js";

const ORG_NAME = "Demo SkillUp";
const ACCOUNTS: { name: string; email: string; password: string; orgRole: Role; authRole: "owner" | "member" }[] = [
  { name: "Responsable Demo", email: "responsable.demo@brandooers.com", password: "Demo-Responsable-2026", orgRole: "team_leader", authRole: "owner" },
  { name: "Empleado Demo", email: "empleado.demo@brandooers.com", password: "Demo-Empleado-2026", orgRole: "empleado", authRole: "member" },
  { name: "Admin Demo", email: "admin.demo@brandooers.com", password: "Demo-Admin-2026", orgRole: "admin", authRole: "member" },
  { name: "Alumno Demo", email: "alumno.demo@brandooers.com", password: "Demo-Alumno-2026", orgRole: "empleado", authRole: "member" },
];

const deps = { db, newId };

const [existingOrg] = await db.select().from(organization).where(eq(organization.name, ORG_NAME));
const orgId = existingOrg?.id ?? (await orgSvc.createCompany(deps, ORG_NAME));
console.log(existingOrg ? "org ya existía: " + orgId : "org creada: " + orgId);

for (const a of ACCOUNTS) {
  let [u] = await db.select().from(user).where(eq(user.email, a.email));
  if (!u) {
    // better-auth crea el usuario + la credencial (hash) correctamente.
    await auth.api.signUpEmail({ body: { name: a.name, email: a.email, password: a.password } });
    [u] = await db.select().from(user).where(eq(user.email, a.email));
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, u!.id));
    console.log("cuenta creada: " + a.email);
  } else {
    console.log("cuenta ya existía (no cambio contraseña): " + a.email);
  }
  const userId = u!.id;
  const [mem] = await db.select().from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  if (!mem) {
    await db.insert(member).values({ id: newId(), organizationId: orgId, userId, orgRole: a.orgRole, role: a.authRole });
    console.log("  miembro añadido: " + a.orgRole + " / " + a.authRole);
  } else {
    await db.update(member).set({ orgRole: a.orgRole, role: a.authRole }).where(eq(member.id, mem.id));
    console.log("  rol actualizado: " + a.orgRole + " / " + a.authRole);
  }
}

console.log("\n=== CREDENCIALES DE DEMO ===");
console.log("Superadmin (consola):  support@boomatik.com  (tu contraseña; si no la recuerdas, pide reset en el login)");
for (const a of ACCOUNTS) console.log(`${a.orgRole === "team_leader" ? "Responsable" : "Alumno    "}:  ${a.email}  /  ${a.password}`);
console.log("Empresa de demo:", ORG_NAME, "(" + orgId + ")");
process.exit(0);
