// Crea la empresa "QA - Perfiles de prueba" + 6 usuarios permanentes (uno por rol), para que el
// superadmin los impersone desde la Consola y testee cada perfil con una sesion real. Idempotente:
// se puede volver a correr sin duplicar nada. Uso: npx tsx scripts/seed-qa-profiles.ts
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { newId } from "../src/util/id.js";
import { organization, user, member } from "../src/db/schema.js";
import * as orgSvc from "../src/services/org.js";
import { ROLES, type Role } from "../src/agents/registry.js";

const ORG_NAME = "QA - Perfiles de prueba";
const PROFILES: { role: Role; name: string; email: string }[] = ROLES.map((role) => ({
  role,
  name: "QA " + role.charAt(0).toUpperCase() + role.slice(1).replace("_", " "),
  email: "qa." + role.replace("_", "") + "@brandooers.internal",
}));

const deps = { db, newId };

const [existingOrg] = await db.select().from(organization).where(eq(organization.name, ORG_NAME));
const orgId = existingOrg?.id ?? (await orgSvc.createCompany(deps, ORG_NAME));
console.log(existingOrg ? "org ya existia: " + orgId : "org creada: " + orgId);

for (const p of PROFILES) {
  const [existingUser] = await db.select().from(user).where(eq(user.email, p.email));
  const userId = existingUser?.id ?? (await orgSvc.createUser(deps, p.name, p.email));
  console.log(existingUser ? "user ya existia: " + p.email : "user creado: " + p.email);

  const [existingMember] = await db.select().from(member).where(eq(member.userId, userId));
  if (!existingMember) {
    await orgSvc.addMember(deps, orgId, userId, p.role);
    console.log("member creado: " + p.role + " (" + userId + ")");
  } else {
    console.log("member ya existia: " + p.role + " (" + userId + ")");
  }
}
console.log("listo");
process.exit(0);
