import postgres from "postgres";
import { env } from "../config/env.js";

// Borra una fila de "user" por email (uso: npm run delete-user -- alguien@ejemplo.com).
// account/session se limpian solos via ON DELETE CASCADE. Mantenimiento manual, uso puntual.
const email = process.argv[2];
if (!email) {
  console.error("Uso: npm run delete-user -- email@ejemplo.com");
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });
const rows = await sql`DELETE FROM "user" WHERE email = ${email} RETURNING id, email`;
await sql.end();

const [deleted] = rows;
if (!deleted) console.log(`Sin cambios: no habia ningun usuario con email ${email}`);
else console.log(`Borrado: ${deleted.email} (id ${deleted.id})`);
