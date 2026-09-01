import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "../db/index.js";
import { schema } from "../db/schema.js";
import { env } from "../config/env.js";

// Auth multi-tenant: better-auth + plugin organization (empresa = organización).
// El mismo modelo sirve de 1 usuario a multinacional.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
