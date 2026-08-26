/* Alta/actualización de usuario de Brandooers.
   Uso: AFF_DATA=/var/lib/brandooers-aff node create-user.mjs <usuario> <contraseña> [member|admin]
   Escribe en <AFF_DATA>/users.json (scrypt). */
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA = process.env.AFF_DATA || process.cwd();
const [, , user, pass, role = 'member'] = process.argv;
if (!user || !pass) { console.error('uso: node create-user.mjs <usuario> <contraseña> [member|admin]'); process.exit(1); }
if (!/^[a-zA-Z0-9._-]{2,}$/.test(user)) { console.error('usuario no válido (letras, números, . _ -)'); process.exit(1); }
mkdirSync(DATA, { recursive: true });
const f = join(DATA, 'users.json');
let db = {}; try { db = JSON.parse(readFileSync(f, 'utf8')); } catch {}
const salt = crypto.randomBytes(16).toString('hex');
db[user] = { salt, hash: crypto.scryptSync(pass, salt, 32).toString('hex'), role: role === 'admin' ? 'admin' : 'member', created: db[user]?.created || new Date().toISOString() };
writeFileSync(f, JSON.stringify(db, null, 0));
console.log(`OK usuario '${user}' (${db[user].role}) guardado en ${f}`);
