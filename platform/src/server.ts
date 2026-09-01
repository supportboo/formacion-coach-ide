import { Hono } from "hono";
import { z } from "zod";
import { auth } from "./auth/auth.js";
import { getAuthContext } from "./http/context.js";
import { chat } from "./agents/chat.js";
import { ingestDocument } from "./rag/rag.js";
import { chatDeps } from "./container.js";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "skillup-platform" }));

// better-auth (registro, login, organización, invitaciones…)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const chatBody = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
  role: z.string().optional(),
});

// Cada usuario habla con su agente de rol. Todo acotado a su organización.
app.post("/api/agent/chat", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = chatBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const role = parsed.data.role ?? ctx.role;
  const res = await chat(chatDeps, {
    orgId: ctx.orgId, orgName: ctx.orgName, userId: ctx.userId, userName: ctx.userName,
    role, threadId: parsed.data.threadId, message: parsed.data.message,
  });
  return c.json(res);
});

const ingestBody = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  kind: z.string().optional(),
  refId: z.string().optional(),
});

// Ingesta de contenido al RAG (solo admin/inspirador).
app.post("/api/rag/ingest", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (ctx.role !== "admin" && ctx.role !== "inspirador") return c.json({ error: "requiere admin/inspirador" }, 403);
  const parsed = ingestBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const r = await ingestDocument(chatDeps, ctx.orgId, parsed.data);
  return c.json(r);
});
