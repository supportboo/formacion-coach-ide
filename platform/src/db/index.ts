import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import { schema } from "./schema.js";

// Cliente Postgres compartido. max:1 en migraciones lo sobreescribe el runner.
const client = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
export { client };
export type DB = typeof db;
