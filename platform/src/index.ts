import { serve } from "@hono/node-server";
import { app } from "./server.js";
import { env } from "./config/env.js";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`skillup-platform escuchando en http://localhost:${info.port}`);
});
