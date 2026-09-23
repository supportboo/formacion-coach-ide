import { and, count, desc, eq, inArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { auth, lastResetLink } from "./auth/auth.js";
import { capabilitiesFor } from "./auth/capabilities.js";
import { env } from "./config/env.js";
import { ACCOUNT_SOURCE, getAccountState, getAuthContext, getPlatformAdminSession, isPlatformAdmin, type AuthCtx } from "./http/context.js";
import { chat } from "./agents/chat.js";
import { ROLES, REGISTRY } from "./agents/registry.js";
import { ingestDocument } from "./rag/rag.js";
import { sendMail } from "./services/mailer.js";
import { appliedCase, competency, ragDocument, user, member, organization, annotation, agentThread, agentMessage, roleplaySession, onboardingProfile, teamDna, auditLog } from "./db/schema.js";
import { chatDeps, db, llm, newId } from "./container.js";
import * as aiContent from "./services/aiContent.js";
import { rateLimited } from "./util/rateLimit.js";
import * as catalogSvc from "./services/catalog.js";
import * as learningSvc from "./services/learning.js";
import * as validationSvc from "./services/validation.js";
import * as propagationSvc from "./services/propagation.js";
import * as orgSvc from "./services/org.js";
import * as configSvc from "./services/config.js";
import * as rewardsSvc from "./services/rewards.js";
import * as fundaeSvc from "./services/fundae.js";
import * as analyticsSvc from "./services/analytics.js";
import * as costsSvc from "./services/costs.js";
import * as roleplaySvc from "./services/roleplay.js";
import * as privacySvc from "./services/privacy.js";
import * as billingSvc from "./services/billing.js";
import * as careerSvc from "./services/career.js";
import * as remindersSvc from "./services/reminders.js";
import * as voiceSvc from "./services/voice.js";
import * as notesSvc from "./services/notes.js";
import * as onboardingSvc from "./services/onboarding.js";
import * as teamdnaSvc from "./services/teamdna.js";
import * as workforceSvc from "./services/workforce.js";
import * as videosSvc from "./services/videos.js";
import * as gcal from "./services/gcal.js";

const svcDeps = { db, newId };
const hasRole = (ctx: AuthCtx, ...roles: string[]) => roles.includes(ctx.role);

// Estado de cuenta: ver getAccountState en http/context.ts (fuente reservada ACCOUNT_SOURCE).
async function setAccountState(orgId: string, userId: string, state: string): Promise<void> {
  const rows = await db.select().from(annotation)
    .where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId), eq(annotation.source, ACCOUNT_SOURCE)))
    .orderBy(desc(annotation.createdAt));
  if (rows[0]) await db.update(annotation).set({ body: "[cuenta] " + state }).where(eq(annotation.id, rows[0].id));
  else await notesSvc.create(svcDeps, orgId, userId, { source: ACCOUNT_SOURCE, kind: "insight", body: "[cuenta] " + state });
}
async function isApproved(orgId: string, userId: string): Promise<boolean> {
  const s = await getAccountState(orgId, userId);
  return s === null || s === "aprobado";
}

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "skillup-platform" }));

// better-auth (registro, login, organización, invitaciones…)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Frontend de SkillUp (estático, sin build) servido por el mismo proceso.
app.get("/app", (c) => c.redirect("/app/inicio.html"));
app.get("/app/", (c) => c.redirect("/app/inicio.html"));
app.use("/app/*", serveStatic({ root: "./public" }));
app.get("/verificar", serveStatic({ path: "./public/verificar.html" }));

// Contenido de curso: los HTML viven en el webroot del hub (../), protegidos por nginx con el
// login antiguo (8090). El alumno de la app autentica con better-auth (8080) y no tiene esa
// cookie, por eso "no cargaba ningun curso". Aqui los servimos tras validar la sesion de la app.
// Montado bajo /api/learning/ para que nginx lo proxee al backend de la plataforma sin tocar su config.
const COURSE_SLUGS = new Set([
  "index", "outbound-sales", "reclutamiento-partners", "marketing-partners",
  "negociacion-partner-manager", "objeciones-partner-manager", "prospeccion-social-selling",
  "guia-coach-odoo",
]);
const COURSE_ROOT = resolve(process.cwd(), "..");
app.get("/api/learning/course-src", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  // Guardarraíl de seguridad: cuenta pendiente de aprobación no puede abrir cursos todavía.
  if (!isPlatformAdmin(ctx) && !(await isApproved(ctx.orgId, ctx.userId))) {
    return c.json({ error: "cuenta pendiente de aprobación", pending: true }, 403);
  }
  const slug = String(c.req.query("slug") || "").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug) || !COURSE_SLUGS.has(slug)) return c.json({ error: "curso no encontrado" }, 404);
  try {
    const html = await readFile(resolve(COURSE_ROOT, slug + ".html"), "utf8");
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return c.json({ error: "curso no encontrado" }, 404);
  }
});

// --- Onboarding-2: "Crea tu ruta de aprendizaje". El alumno pide temas/objetivo/compromiso y los
// agentes (LLM) montan una ruta a medida SOLO con los cursos disponibles (+ modulos nuevos a
// preparar). Se guarda como notas source='ruta' y gobierna que el inicio muestre solo lo pedido.
const AVAILABLE_COURSES = [
  { src: "/index.html", name: "Guia del Coach", desc: "Acompañar a quien llega en sus primeros meses." },
  { src: "/prospeccion-social-selling.html", name: "Prospeccion con IA", desc: "Encontrar y abrir con criterio." },
  { src: "/outbound-sales.html", name: "Outbound Sales", desc: "Vender en frio sin sonar a vendedor." },
  { src: "/reclutamiento-partners.html", name: "Reclutamiento de Partners", desc: "Captar partners de 0 a 100." },
  { src: "/marketing-partners.html", name: "Marketing para Partners", desc: "Generar demanda B2B." },
  { src: "/negociacion-partner-manager.html", name: "Negociacion", desc: "Cerrar sin perder margen." },
  { src: "/objeciones-partner-manager.html", name: "Objeciones", desc: "Manejar el no y darle la vuelta." },
];
const COURSE_SRCS = new Set(AVAILABLE_COURSES.map((x) => x.src));
const routeBody = z.object({
  // temas admite pegar listas largas (p. ej. un volcado de temas): límite generoso para no dar 400.
  temas: z.string().min(2).max(8000),
  objetivo: z.string().max(2000).optional(),
  compromiso: z.string().max(500).optional(),
  plazo: z.string().max(200).optional(),
});
interface RutaModulo { titulo: string; resumen: string; courseSrc: string | null }
interface RutaPlan { titulo: string; resumen: string; modulos: RutaModulo[] }

async function readRutaPlan(orgId: string, userId: string): Promise<RutaPlan | null> {
  const items = await notesSvc.list(svcDeps, orgId, userId, "ruta").catch(() => [] as { body: string | null }[]);
  for (let i = items.length - 1; i >= 0; i--) {
    const b = String(items[i]?.body || "");
    if (b.indexOf("[ruta-plan]") === 0) { try { return JSON.parse(b.slice("[ruta-plan]".length).trim()) as RutaPlan; } catch { return null; } }
  }
  return null;
}

app.get("/api/learning/route", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json({ plan: await readRutaPlan(ctx.orgId, ctx.userId) });
});
// Micro-subtemas de un módulo (para las burbujas tipo cerebro/Graphify). Cacheado por tema (proceso).
const subtopicCache = new Map<string, string[]>();
app.get("/api/learning/subtopics", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const topic = String(c.req.query("topic") || "").slice(0, 160).trim();
  if (!topic) return c.json({ subtopics: [] });
  const key = topic.toLowerCase();
  const cached = subtopicCache.get(key);
  if (cached) return c.json({ subtopics: cached });
  if (rateLimited(`sub:${ctx.orgId}:${ctx.userId}`, 20, 60_000)) return c.json({ error: "demasiadas peticiones" }, 429);
  try {
    const out = await llm.generate({
      system: "Devuelve SOLO un array JSON de 4 a 6 subtemas concretos y accionables (cadenas cortas de 2-5 palabras) del tema dado, en español de España, sin inventar. Sin markdown. Formato: [\"...\",\"...\"]",
      messages: [{ role: "user", content: "Tema del módulo: " + topic }], maxTokens: 300, orgId: ctx.orgId, userId: ctx.userId, kind: "chat",
    });
    let arr = aiContent.firstJson<string[]>(out);
    if (!Array.isArray(arr)) arr = [];
    arr = arr.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 6);
    if (arr.length) subtopicCache.set(key, arr);
    return c.json({ subtopics: arr });
  } catch { return c.json({ subtopics: [] }); }
});

app.post("/api/learning/route/build", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited("route:" + ctx.orgId + ":" + ctx.userId, 6, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = routeBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const { temas, objetivo, compromiso, plazo } = parsed.data;
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId).catch(() => null);
  // P16: el nivel que el alumno declaró en el onboarding ([nivel]) adapta la profundidad de la ruta.
  const nivel = await (async () => {
    const rows = await db.select({ body: annotation.body }).from(annotation)
      .where(and(eq(annotation.organizationId, ctx.orgId), eq(annotation.userId, ctx.userId), eq(annotation.source, "onboarding")))
      .orderBy(desc(annotation.createdAt));
    const r = rows.find((x) => String(x.body || "").startsWith("[nivel]"));
    return r ? String(r.body).slice("[nivel]".length).trim() : null;
  })().catch(() => null);
  const catalogo = AVAILABLE_COURSES.map((x) => `- src:"${x.src}" | ${x.name}: ${x.desc}`).join("\n");
  const perfil = [profile?.sector && `sector ${profile.sector}`, profile?.puesto && `puesto ${profile.puesto}`, nivel && `se ve a sí mismo: ${nivel}`].filter(Boolean).join(", ");
  const system =
    "Eres el orquestador de aprendizaje de Brandooers SkillUp. El alumno quiere dominar unos temas y tu montas SU ruta. " +
    "Selecciona y ORDENA solo los cursos del catalogo que de verdad sirvan a lo que pide (courseSrc debe ser EXACTAMENTE uno de los \"src\" del catalogo). " +
    "Si pide algo que NINGUN curso cubre, añade como mucho 2 modulos nuevos con courseSrc:null (se prepararan aparte). No metas cursos que no ha pedido para rellenar. " +
    "Entre 2 y 6 modulos. " + (perfil ? "Perfil del alumno: " + perfil + ". " : "") +
    (nivel ? `Ajusta la PROFUNDIDAD a su nivel declarado (${nivel}): si tiene soltura o experiencia, salta lo básico y empieza más arriba; si empieza, incluye los fundamentos. ` : "") +
    "Español de España, claro, sin inventar. Responde SOLO JSON valido, sin markdown.\n" +
    "Catalogo disponible:\n" + catalogo + "\n\n" +
    "Formato: {\"titulo\":\"...\",\"resumen\":\"1-2 frases\",\"modulos\":[{\"titulo\":\"...\",\"resumen\":\"1 frase\",\"courseSrc\":\"/xxx.html\"|null}]}";
  let plan: RutaPlan;
  try {
    const out = await llm.generate({
      system,
      messages: [{ role: "user", content: `Temas que quiero dominar: ${temas}.` + (objetivo ? ` Mi objetivo: ${objetivo}.` : "") + (compromiso ? ` Me comprometo a: ${compromiso}.` : "") + (plazo ? ` Plazo: ${plazo}.` : "") }],
      maxTokens: 1200, orgId: ctx.orgId, userId: ctx.userId, kind: "chat",
    });
    plan = aiContent.firstJson<RutaPlan>(out);
  } catch {
    return c.json({ error: "no pude montar la ruta ahora, intentalo de nuevo" }, 502);
  }
  plan.titulo = String(plan.titulo || "Tu ruta de aprendizaje").slice(0, 120);
  plan.resumen = String(plan.resumen || "").slice(0, 300);
  plan.modulos = (Array.isArray(plan.modulos) ? plan.modulos : []).slice(0, 6).map((m) => ({
    titulo: String(m.titulo || "").slice(0, 120),
    resumen: String(m.resumen || "").slice(0, 240),
    courseSrc: m.courseSrc && COURSE_SRCS.has(m.courseSrc) ? m.courseSrc : null,
  })).filter((m) => m.titulo);
  if (!plan.modulos.length) return c.json({ error: "no pude montar la ruta, reformula los temas" }, 422);
  try {
    await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "ruta", kind: "insight", body: "[tema] " + temas });
    if (objetivo) await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "ruta", kind: "insight", body: "[objetivo] " + objetivo });
    if (compromiso) await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "ruta", kind: "insight", body: "[compromiso] " + compromiso });
    if (plazo) await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "ruta", kind: "insight", body: "[plazo] " + plazo });
    await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "ruta", kind: "insight", body: "[ruta-plan] " + JSON.stringify(plan) });
  } catch { /* la ruta se devuelve igual aunque falle el guardado */ }
  return c.json({ plan });
});

// --- Videos externos reales (YouTube), tipo Netflix: novedades / para ti / brandooers favs / mas vistos / mas valorados.
// Nunca inventamos video ni valoracion: todo sale de la API real de YouTube o de reproducciones reales dentro de SkillUp. ---
app.get("/api/learning/videos", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  // Each unseen topic spends shared YouTube quota (all tenants): cap per user.
  if (rateLimited(`videos:${ctx.orgId}:${ctx.userId}`, 15, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const topic = String(c.req.query("topic") || "").trim().slice(0, 120);
  if (!topic) return c.json({ error: "falta topic" }, 400);
  return c.json(await videosSvc.forTopic(svcDeps, topic));
});

app.get("/api/learning/videos/home", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const catalogTopics = AVAILABLE_COURSES.map((x) => x.name);
  const plan = await readRutaPlan(ctx.orgId, ctx.userId).catch(() => null);
  const paraTiTopics = (plan?.modulos || []).map((m) => m.titulo).filter(Boolean);
  const [global, paraTi, favs, fb] = await Promise.all([
    videosSvc.aggregate(svcDeps, catalogTopics),
    paraTiTopics.length ? videosSvc.aggregate(svcDeps, paraTiTopics) : null,
    videosSvc.brandooersFavs(svcDeps),
    notesSvc.list(svcDeps, ctx.orgId, ctx.userId, "video_feedback").catch(() => [] as { body: string | null }[]),
  ]);
  // "No mostrar más": ocultamos los vídeos que el usuario marcó como hide (su valoración más reciente por vídeo).
  const seen = new Set<string>(), hidden = new Set<string>();
  for (const n of fb) { let o: { y?: string; k?: string }; try { o = JSON.parse(String(n.body || "")); } catch { continue; } if (!o.y || seen.has(o.y)) continue; seen.add(o.y); if (o.k === "hide") hidden.add(o.y); }
  const flt = (list: { youtubeId: string }[]) => (list || []).filter((v) => !hidden.has(v.youtubeId));
  return c.json({
    novedades: flt(global.novedades),
    masVistos: flt(global.masVistos),
    masValorados: flt(global.masValorados),
    paraTi: paraTi ? flt(paraTi.masVistos) : [],
    brandooersFavs: flt(favs),
  });
});
// Like / dislike / "no mostrar más" de un vídeo (se guarda la valoración más reciente por vídeo).
app.post("/api/learning/videos/feedback", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ youtubeId: z.string().min(3).max(32), kind: z.enum(["like", "dislike", "hide"]), title: z.string().max(300).optional(), thumbnail: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "video_feedback", kind: "insight", body: JSON.stringify({ y: parsed.data.youtubeId, k: parsed.data.kind, t: parsed.data.title || "", th: parsed.data.thumbnail || "" }) });
  return c.json({ ok: true });
});
// Semáforo para el superadmin: qué contenido gusta y cuál no (valoración más reciente por usuario y vídeo).
app.get("/api/analytics/video-feedback", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !WORKFORCE_ROLES.includes(ctx.role)) return c.json({ error: "sin permiso" }, 403);
  const rows = await db.select({ userId: annotation.userId, body: annotation.body }).from(annotation)
    .where(and(eq(annotation.organizationId, ctx.orgId), eq(annotation.source, "video_feedback"))).orderBy(desc(annotation.createdAt));
  const seen = new Set<string>(); const per = new Map<string, { youtubeId: string; title: string; thumbnail: string; like: number; dislike: number; hide: number }>();
  for (const r of rows) { let o: { y?: string; k?: string; t?: string; th?: string }; try { o = JSON.parse(String(r.body || "")); } catch { continue; } if (!o.y) continue; const key = r.userId + "|" + o.y; if (seen.has(key)) continue; seen.add(key);
    let p = per.get(o.y); if (!p) { p = { youtubeId: o.y, title: o.t || "", thumbnail: o.th || "", like: 0, dislike: 0, hide: 0 }; per.set(o.y, p); }
    if (o.k === "like") p.like++; else if (o.k === "dislike") p.dislike++; else if (o.k === "hide") p.hide++; }
  return c.json({ videos: [...per.values()].sort((a, b) => (b.like + b.dislike + b.hide) - (a.like + a.dislike + a.hide)) });
});

const watchBody = z.object({ youtubeId: z.string().min(3).max(32), title: z.string().max(300), thumbnail: z.string().max(500) });
app.post("/api/learning/videos/watch", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = watchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await videosSvc.logWatch(svcDeps, ctx.orgId, ctx.userId, parsed.data);
  return c.json({ ok: true });
});

// --- Google Calendar (OAuth por usuario; token guardado en annotation source=gcal_token) ---
async function gcalRefresh(orgId: string, userId: string): Promise<string | null> {
  const rows = await notesSvc.list(svcDeps, orgId, userId, "gcal_token").catch(() => [] as { body: string | null }[]);
  for (const n of rows) { try { const o = JSON.parse(String(n.body || "")); if (o && o.r) return o.r as string; } catch { /* siguiente */ } }
  return null;
}
app.get("/api/gcal/status", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json({ configured: gcal.isConfigured(), connected: !!(await gcalRefresh(ctx.orgId, ctx.userId)) });
});
app.get("/api/gcal/connect", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.redirect("/app/login.html");
  if (!gcal.isConfigured()) return c.json({ error: "Google Calendar no está configurado en el servidor" }, 400);
  return c.redirect(gcal.authUrl(ctx.userId));
});
app.get("/api/gcal/callback", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.redirect("/app/login.html");
  const code = c.req.query("code");
  if (!code) return c.redirect("/app/ruta.html?gcal=err");
  const tok = await gcal.exchangeCode(code);
  if (!tok || !tok.refresh_token) return c.redirect("/app/ruta.html?gcal=err");
  await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "gcal_token", kind: "insight", body: JSON.stringify({ r: tok.refresh_token, at: Date.now() }) });
  return c.redirect("/app/ruta.html?gcal=ok");
});
app.post("/api/gcal/sync", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const refresh = await gcalRefresh(ctx.orgId, ctx.userId);
  if (!refresh) return c.json({ error: "no conectado" }, 400);
  const access = await gcal.accessFromRefresh(refresh);
  if (!access) return c.json({ error: "no pude renovar el acceso; vuelve a conectar" }, 400);
  const parsed = z.object({ events: z.array(z.object({ summary: z.string().min(1).max(200), description: z.string().max(1000).optional(), startISO: z.string().min(10), endISO: z.string().min(10) })).max(60) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  let created = 0; let firstError = "";
  for (const ev of parsed.data.events) {
    const res = await gcal.insertEvent(access, ev);
    if (res.ok) created++; else if (!firstError) firstError = res.error || "error desconocido";
  }
  let hint: string | undefined;
  if (created === 0 && firstError) {
    const e = firstError.toLowerCase();
    if (e.includes("has not been used") || e.includes("accessnotconfigured") || e.includes("is disabled") || e.includes("service_disabled"))
      hint = "La API de Google Calendar no está activada en tu proyecto de Google Cloud. Actívala en https://console.cloud.google.com/apis/library/calendar-json.googleapis.com y vuelve a sincronizar.";
    else if (e.includes("insufficient") || e.includes("insufficientpermissions") || e.startsWith("403"))
      hint = "Google no concedió permiso sobre tu calendario. Desconecta y vuelve a conectar aceptando el permiso de calendario.";
    else if (e.startsWith("401") || e.includes("invalid_grant"))
      hint = "La conexión con Google caducó. Vuelve a conectar Google Calendar.";
  }
  return c.json({ created, attempted: parsed.data.events.length, error: firstError || undefined, hint });
});

const chatBody = z.object({
  message: z.string().min(1).max(20000),
  threadId: z.string().optional(),
});

// Cada usuario habla con su agente de rol. Todo acotado a su organización.
app.post("/api/agent/chat", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  // LLM de pago: 30 turnos/min por usuario, evita DoS de coste.
  if (rateLimited(`chat:${ctx.orgId}:${ctx.userId}`, 30, 60_000)) {
    return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  }
  const parsed = chatBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const res = await chat(chatDeps, {
    orgId: ctx.orgId, orgName: ctx.orgName, userId: ctx.userId, userName: ctx.userName,
    role: ctx.role, threadId: parsed.data.threadId, message: parsed.data.message,
  });
  return c.json(res);
});

// Coach de voz proactivo (BOO): saluda con seguimiento REAL — reconoce, motiva, hace seguimiento y
// suelta una broma amable. Solo con hechos reales del alumno (nada de fechas ni plazos inventados).
app.get("/api/agent/coach", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`coach:${ctx.orgId}:${ctx.userId}`, 8, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const hour = Math.max(0, Math.min(23, Number(c.req.query("h")) || new Date().getHours()));
  const place = String(c.req.query("place") || "").replace(/[^a-zñáéíóú ]/gi, "").slice(0, 12); // solo si el usuario lo declaró; jamás detectado
  const dayMs = 86_400_000, now = Date.now();
  const all = await notesSvc.listAll(svcDeps, ctx.orgId, ctx.userId).catch(() => [] as { body: string | null; createdAt: Date; source: string | null }[]);
  const ts = (x: { createdAt: Date }) => new Date(x.createdAt).getTime();
  const newest = all[0];
  const daysSince = newest ? Math.max(0, Math.floor((now - ts(newest)) / dayMs)) : null; // "días sin venir" nunca negativo
  const activeDays = new Set(all.filter((a) => now - ts(a) < 30 * dayMs).map((a) => new Date(a.createdAt).toISOString().slice(0, 10))).size;
  const retos = all.filter((a) => a.source === "reto").map((r) => { try { return JSON.parse(String(r.body || "").slice(6).trim()) as { titulo?: string; estado?: string; createdAt?: string }; } catch { return null; } }).filter((x): x is { titulo?: string; estado?: string; createdAt?: string } => !!x);
  const pend = retos.filter((r) => r.estado !== "hecho");
  const oldestPendingDays = pend.length ? Math.max(...pend.map((r) => r.createdAt ? Math.floor((now - new Date(r.createdAt).getTime()) / dayMs) : 0)) : null;
  const plan = await readRutaPlan(ctx.orgId, ctx.userId).catch(() => null);
  const mods = plan?.modulos?.length || 0;
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId).catch(() => null);
  const objetivo = (() => { for (const n of all) { if (n.source === "ruta" && String(n.body || "").startsWith("[objetivo]")) return String(n.body).slice("[objetivo]".length).trim().slice(0, 160); } return null; })();
  const name = (ctx.userName || "").split(" ")[0] || "";
  const franja = hour < 6 ? "de madrugada" : hour < 13 ? "por la mañana" : hour < 21 ? "por la tarde" : "de noche";
  const hechos = [
    name && `Se llama ${name}.`,
    daysSince === null ? "Es de sus primeras veces por aquí." : daysSince === 0 ? "Ha estado activo hoy." : daysSince === 1 ? "Su última actividad fue ayer." : `Lleva ${daysSince} días sin pasarse.`,
    activeDays > 1 ? `Ha estado activo ${activeDays} días distintos este último mes.` : "",
    pend.length ? `Tiene ${pend.length} reto${pend.length > 1 ? "s" : ""} pendiente${pend.length > 1 ? "s" : ""} de su responsable${pend[0]?.titulo ? ` (el primero: "${pend[0].titulo}")` : ""}${oldestPendingDays != null && oldestPendingDays >= 2 ? `, el más antiguo esperando ${oldestPendingDays} días` : ""}.` : "No tiene retos pendientes.",
    mods ? `Su ruta de aprendizaje tiene ${mods} módulo${mods > 1 ? "s" : ""}.` : "Aún no ha montado su ruta de aprendizaje.",
    objetivo ? `Su objetivo: ${objetivo}.` : "",
    profile?.puesto ? `Su puesto: ${profile.puesto}.` : "",
    place ? `Dice estar ahora en ${place}.` : "",
    `Ahora es ${franja}.`,
  ].filter(Boolean).join(" ");
  const system =
    "Eres BOO, el coach de voz de Brandooers: cercano, motivador y con chispa, como un entrenador que se alegra de verte. " +
    "Saluda en voz alta a esta persona en 2 o 3 frases cortas. Español de España, natural, de tú, sin markdown, sin emojis, sin listas. " +
    "Usa SOLO los hechos que te doy: no inventes fechas, plazos ni datos. Reconócele por su nombre y por lo que trae entre manos. " +
    "Hazle seguimiento con cariño (si lleva días sin venir, recupéralo con humor amable; si va bien, celébralo) y remátalo con UN empujón concreto a su próximo paso real (un reto pendiente, o montar/seguir su ruta). " +
    "Mete UNA broma ligera y amable ligada a su situación, nunca sobre su físico ni ofensiva. Máximo 45 palabras. Devuelve SOLO la frase hablada, sin comillas.";
  let text: string;
  try {
    const out = await llm.generate({ system, messages: [{ role: "user", content: "Hechos reales de la persona: " + hechos + "\n\nSalúdale ahora." }], maxTokens: 160, orgId: ctx.orgId, userId: ctx.userId, kind: "chat" });
    text = String(out || "").trim().replace(/^["'«]+|["'»]+$/g, "").slice(0, 400);
  } catch { text = ""; }
  if (!text) text = `¡Hola${name ? " " + name : ""}! Me alegra verte. ` + (pend.length ? `Tienes ${pend.length} reto${pend.length > 1 ? "s" : ""} esperándote, ¿le entramos?` : mods ? "Tu ruta te espera, sigamos por donde lo dejaste." : "¿Montamos tu ruta de aprendizaje y arrancamos?");
  return c.json({ text, signals: { daysSince, pendientes: pend.length, modulos: mods, activeDays } });
});

// --- Voz del asistente (ElevenLabs). Lista de voces: Marc primero + peninsulares humanas. ---
// --- Anotaciones del alumno sobre el curso (subrayar, nota, pregunta, repasar) ---
app.get("/api/notes/list", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const source = c.req.query("source");
  const items = source ? await notesSvc.list(svcDeps, ctx.orgId, ctx.userId, source) : await notesSvc.listAll(svcDeps, ctx.orgId, ctx.userId);
  return c.json({ items });
});
const noteBody = z.object({ source: z.string().min(1).max(300), card: z.number().int().min(0).optional(), cardTitle: z.string().max(300).optional(), kind: z.enum(["highlight", "note", "question", "review", "insight"]), quote: z.string().max(2000).optional(), body: z.string().max(4000).optional() });
app.post("/api/notes/add", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = noteBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  if (parsed.data.source === ACCOUNT_SOURCE) return c.json({ error: "source reservado" }, 400);
  const id = await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, parsed.data);
  return c.json({ id });
});
app.delete("/api/notes/:id", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!(await notesSvc.remove(svcDeps, ctx.orgId, ctx.userId, c.req.param("id")))) return c.json({ error: "nota no encontrada" }, 404);
  return c.json({ ok: true });
});
// --- Onboarding: analizar la web de la empresa para preparar a los tutores ---
const companyBody = z.object({ url: z.string().min(3).max(200) });
app.post("/api/onboarding/company", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited("onb:" + ctx.orgId + ":" + ctx.userId, 8, 60000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = companyBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const res = await onboardingSvc.analyzeCompany(parsed.data.url);
  if (!res) return c.json({ error: "no pude leer esa web" }, 502);
  try { await notesSvc.create(svcDeps, ctx.orgId, ctx.userId, { source: "onboarding", kind: "insight", body: "[Empresa " + res.source + "] " + res.summary }); } catch (e) {}
  return c.json(res);
});
/* ---------- Team DNA (arquetipos de fortaleza, determinista) ---------- */
// Catálogo (preguntas + arquetipos + familias) para pintar el test y el certificado.
app.get("/api/teamdna/catalog", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json({
    questions: teamdnaSvc.QUESTIONS, archetypes: teamdnaSvc.ARCHETYPES,
    families: teamdnaSvc.FAMILIES, familyLabel: teamdnaSvc.FAMILY_LABEL, familySub: teamdnaSvc.FAMILY_SUB,
  });
});
app.get("/api/teamdna/me", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const row = await teamdnaSvc.getDna(svcDeps, ctx.orgId, ctx.userId);
  if (!row) return c.json({ dna: null });
  return c.json({ dna: row, archetype: teamdnaSvc.archetypeByKey(row.archetype) ?? null });
});
app.post("/api/teamdna/answers", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ answers: z.array(z.enum(["vision", "accion", "analisis", "personas"])).min(4).max(40) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const result = teamdnaSvc.scoreDna(parsed.data.answers);
  await teamdnaSvc.saveDna(svcDeps, ctx.orgId, ctx.userId, result, parsed.data.answers);
  return c.json({ dna: result, archetype: teamdnaSvc.archetypeByKey(result.archetypeKey) ?? null });
});
// Mezcla del equipo (para gestores): cobertura de familias y arquetipos, peso medio.
const DNA_MANAGERS = ["admin", "direccion", "team_leader", "inspirador"];
app.get("/api/teamdna/team", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !DNA_MANAGERS.includes(ctx.role)) return c.json({ error: "sin permiso" }, 403);
  return c.json(await teamdnaSvc.teamAggregate(svcDeps, ctx.orgId));
});

app.get("/api/voice/voices", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await voiceSvc.listVoices());
});

const ttsBody = z.object({ text: z.string().min(1).max(1200), voiceId: z.string().min(1) });
app.post("/api/voice/tts", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited("tts:" + ctx.orgId + ":" + ctx.userId, 40, 60000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = ttsBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const audio = await voiceSvc.synthesize(parsed.data.text, parsed.data.voiceId);
  if (!audio) return c.json({ error: "voz no disponible" }, 503);
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
});
// Voz con marcas de tiempo por carácter, para resaltar la palabra que se está diciendo (karaoke), pedido por Marc.
app.post("/api/voice/tts-timed", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited("ttst:" + ctx.orgId + ":" + ctx.userId, 40, 60000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = ttsBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const timed = await voiceSvc.synthesizeWithTimestamps(parsed.data.text, parsed.data.voiceId);
  if (!timed) return c.json({ error: "voz no disponible" }, 503);
  return c.json(timed);
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

/* ============================================================
 * CATÁLOGO — sector/puesto/competencia/ruta/lección.
 * Escritura: admin/direccion/inspirador. Lectura: cualquier miembro de la org.
 * ============================================================ */
const CATALOG_WRITERS = ["admin", "direccion", "inspirador"];

app.post("/api/catalog/sectors", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = z.object({ name: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await catalogSvc.createSector(svcDeps, ctx.orgId, parsed.data.name);
  return c.json({ id });
});
app.get("/api/catalog/sectors", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await catalogSvc.listSectors(svcDeps, ctx.orgId));
});

app.post("/api/catalog/puestos", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = z.object({ name: z.string().min(1), sectorId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await catalogSvc.createPuesto(svcDeps, ctx.orgId, parsed.data.name, parsed.data.sectorId);
  return c.json({ id });
});
app.get("/api/catalog/puestos", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await catalogSvc.listPuestos(svcDeps, ctx.orgId));
});

app.post("/api/catalog/competencies", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = z.object({ name: z.string().min(1), puestoId: z.string().optional(), critical: z.boolean().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await catalogSvc.createCompetency(svcDeps, ctx.orgId, parsed.data.name, parsed.data);
  return c.json({ id });
});
app.get("/api/catalog/competencies", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await catalogSvc.listCompetencies(svcDeps, ctx.orgId));
});

app.post("/api/catalog/paths", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = z.object({ title: z.string().min(1), competencyId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await catalogSvc.createPath(svcDeps, ctx.orgId, parsed.data.title, parsed.data.competencyId);
  return c.json({ id });
});
app.get("/api/catalog/paths", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await catalogSvc.listPaths(svcDeps, ctx.orgId));
});

const lessonBody = z.object({
  pathId: z.string().min(1), title: z.string().min(1), body: z.string().min(1),
  fuente: z.string().optional(), fechaRevision: z.coerce.date().optional(), published: z.boolean().optional(),
});
// IA redacta un borrador de lección (SIEMPRE sin publicar — falta fuente+fecha real de un humano).
app.post("/api/catalog/lessons/generate", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  if (rateLimited(`gen:${ctx.orgId}`, 20, 60_000)) return c.json({ error: "demasiadas generaciones, espera un momento" }, 429);
  const parsed = z.object({ pathId: z.string().min(1), competencyId: z.string().min(1), topic: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId);
  if (!comp) return c.json({ error: "competencia no encontrada" }, 404);
  try {
    const draft = await aiContent.generateLessonDraft(llm, { competencyName: comp.name, topic: parsed.data.topic, orgId: ctx.orgId, userId: ctx.userId });
    const id = await catalogSvc.addLesson(svcDeps, ctx.orgId, { pathId: parsed.data.pathId, ...draft, published: false });
    return c.json({ id, ...draft });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

app.post("/api/catalog/lessons", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = lessonBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await catalogSvc.addLesson(svcDeps, ctx.orgId, parsed.data);
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/catalog/paths/:pathId/lessons", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await catalogSvc.listLessons(svcDeps, ctx.orgId, c.req.param("pathId")));
});

/* ============================================================
 * APRENDIZAJE — onboarding, matrícula, test de conocimiento.
 * ============================================================ */
app.post("/api/learning/onboarding", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ sector: z.string().optional(), puesto: z.string().optional(), motivo: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const result = await learningSvc.startOnboarding(svcDeps, { orgId: ctx.orgId, userId: ctx.userId, ...parsed.data });
  return c.json(result);
});

// El dashboard consulta esto al entrar para saber si mandar al usuario a onboarding primero.
app.get("/api/learning/onboarding", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId);
  return c.json({ done: !!profile });
});

app.post("/api/learning/enroll", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ pathId: z.string().min(1), competencyId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await learningSvc.enroll(svcDeps, ctx.orgId, ctx.userId, parsed.data.pathId, parsed.data.competencyId);
    return c.json({ id });
  } catch (e) { return c.json({ error: (e as Error).message }, 404); }
});
app.get("/api/learning/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const rows = await learningSvc.listMyEnrollments(svcDeps, ctx.orgId, ctx.userId);
  // P16: enriquecemos con nombre de competencia y nivel actual para que "demuéstralo y salta"
  // solo aparezca en competencias reales del catálogo donde el alumno aún está a nivel 0.
  const cids = [...new Set(rows.map((r) => r.competencyId).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  const levels = new Map<string, number>();
  await Promise.all(cids.map(async (cid) => {
    const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, cid).catch(() => null);
    if (comp) names.set(cid, comp.name);
    levels.set(cid, await learningSvc.getLevel(svcDeps, ctx.orgId, ctx.userId, cid).catch(() => 0));
  }));
  return c.json(rows.map((r) => ({
    ...r,
    competencyName: r.competencyId ? names.get(r.competencyId) ?? null : null,
    level: r.competencyId ? levels.get(r.competencyId) ?? 0 : null,
  })));
});

app.post("/api/learning/test", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ pathId: z.string().min(1), competencyId: z.string().min(1), score: z.number().min(0).max(100) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const r = await learningSvc.recordKnowledgeTest(svcDeps, { orgId: ctx.orgId, userId: ctx.userId, ...parsed.data });
  return c.json(r);
});

// IA genera el test adaptado al sector/puesto del propio empleado (doctrina: nunca genérico).
app.post("/api/learning/test/generate", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`gen:${ctx.orgId}:${ctx.userId}`, 10, 60_000)) return c.json({ error: "demasiadas generaciones, espera un momento" }, 429);
  const parsed = z.object({ competencyId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId);
  if (!comp) return c.json({ error: "competencia no encontrada" }, 404);
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId);
  try {
    const exam = await aiContent.generateExam(llm, {
      competencyName: comp.name, sector: profile?.sector ?? undefined, puesto: profile?.puesto ?? undefined,
      orgId: ctx.orgId, userId: ctx.userId,
    });
    const { questions, correctAnswers } = aiContent.shuffleExam(exam);
    const examId = newId();
    aiContent.storeExamSession(examId, correctAnswers);
    return c.json({ examId, questions });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

// Corrige el test generado (de un solo uso) y registra el intento -> puede desbloquear Nivel 1.
app.post("/api/learning/test/submit", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({
    examId: z.string().min(1), pathId: z.string().min(1), competencyId: z.string().min(1), answers: z.array(z.string()),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const correctAnswers = aiContent.takeExamSession(parsed.data.examId);
  if (!correctAnswers) return c.json({ error: "examen no encontrado o caducado, genera uno nuevo" }, 410);
  const score = aiContent.scoreExam(correctAnswers, parsed.data.answers);
  const r = await learningSvc.recordKnowledgeTest(svcDeps, {
    orgId: ctx.orgId, userId: ctx.userId, pathId: parsed.data.pathId, competencyId: parsed.data.competencyId, score,
  });
  return c.json({ score, ...r });
});

app.get("/api/learning/level/:competencyId", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const level = await learningSvc.getLevel(svcDeps, ctx.orgId, ctx.userId, c.req.param("competencyId"));
  return c.json({ level });
});
app.get("/api/learning/levels/:competencyId", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "coach", "team_leader", "admin", "inspirador", "direccion")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await learningSvc.listLevelsForCompetency(svcDeps, ctx.orgId, c.req.param("competencyId")));
});

/* ============================================================
 * VALIDACIÓN — caso práctico + rúbrica + validación humana.
 * Al aprobar y alcanzar N2, dispara propagación (pago a coach + ascenso a Referente)
 * y el motor de reglas de recompensa (evento "n2"). Este es el núcleo del producto.
 * ============================================================ */
app.post("/api/validation/rubrics", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "inspirador", "team_leader")) return c.json({ error: "sin permiso" }, 403);
  const parsed = z.object({
    competencyId: z.string().min(1),
    criteria: z.array(z.object({ label: z.string().min(1), weight: z.number().optional() })).min(1),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await validationSvc.setRubric(svcDeps, ctx.orgId, parsed.data.competencyId, parsed.data.criteria);
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

// IA redacta el enunciado del caso con el contexto real del empleado (onboarding: sector/puesto/motivo).
app.post("/api/validation/cases/generate", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`gen:${ctx.orgId}:${ctx.userId}`, 10, 60_000)) return c.json({ error: "demasiadas generaciones, espera un momento" }, 429);
  const parsed = z.object({ competencyId: z.string().min(1), pathId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId);
  if (!comp) return c.json({ error: "competencia no encontrada" }, 404);
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId);
  try {
    const prompt = await aiContent.generateCasePrompt(llm, {
      competencyName: comp.name, sector: profile?.sector ?? undefined,
      puesto: profile?.puesto ?? undefined, motivo: profile?.motivo ?? undefined,
      orgId: ctx.orgId, userId: ctx.userId,
    });
    const id = await validationSvc.createCase(svcDeps, {
      orgId: ctx.orgId, userId: ctx.userId, competencyId: parsed.data.competencyId, pathId: parsed.data.pathId, prompt,
    });
    return c.json({ id, prompt });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

app.post("/api/validation/cases", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({
    competencyId: z.string().min(1), pathId: z.string().optional(), prompt: z.string().min(1),
    userId: z.string().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  // The competency must belong to the caller's org (no referencing another tenant's ids).
  const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId);
  if (!comp) return c.json({ error: "competencia no encontrada en esta organización" }, 404);
  const canAssignOthers = hasRole(ctx, "admin", "inspirador", "team_leader");
  let userId = ctx.userId;
  if (canAssignOthers && parsed.data.userId && parsed.data.userId !== ctx.userId) {
    const [m] = await db.select({ id: member.id }).from(member)
      .where(and(eq(member.organizationId, ctx.orgId), eq(member.userId, parsed.data.userId)));
    if (!m) return c.json({ error: "ese usuario no pertenece a tu organización" }, 404);
    userId = parsed.data.userId;
  }
  const id = await validationSvc.createCase(svcDeps, { orgId: ctx.orgId, userId, competencyId: parsed.data.competencyId, pathId: parsed.data.pathId, prompt: parsed.data.prompt });
  return c.json({ id });
});

app.post("/api/validation/cases/:id/submit", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ submission: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    await validationSvc.submitCase(svcDeps, ctx.orgId, ctx.userId, c.req.param("id"), parsed.data.submission);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

app.post("/api/validation/cases/:id/evidence", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({
    kind: z.enum(["documento", "video", "audio", "url", "kpi"]), url: z.string().url().optional(), note: z.string().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await validationSvc.addEvidence(svcDeps, { orgId: ctx.orgId, caseId: c.req.param("id"), userId: ctx.userId, ...parsed.data });
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/validation/cases/:id/evidence", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await validationSvc.listEvidence(svcDeps, ctx.orgId, c.req.param("id")));
});

app.get("/api/validation/cases/:id/suggest", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`rubric-suggest:${ctx.orgId}:${ctx.userId}`, 15, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const caseId = c.req.param("id");
  const [caseRow] = await db.select().from(appliedCase).where(and(eq(appliedCase.id, caseId), eq(appliedCase.organizationId, ctx.orgId)));
  if (!caseRow) return c.json({ error: "caso no encontrado en esta organización" }, 404);
  if (!caseRow.submission) return c.json({ error: "el caso todavía no tiene entrega" }, 400);
  if (caseRow.userId === ctx.userId) return c.json({ error: "nadie valida su propio caso" }, 403);
  if (!(await validationSvc.canValidate(svcDeps, ctx.orgId, ctx.userId, ctx.role, caseRow.competencyId))) {
    return c.json({ error: "no eres referente (nivel 3+) ni responsable de esta competencia" }, 403);
  }
  const rubricRow = await validationSvc.latestRubric(svcDeps, ctx.orgId, caseRow.competencyId);
  if (!rubricRow) return c.json({ error: "esta competencia todavía no tiene rúbrica publicada" }, 404);
  try {
    const suggestion = await aiContent.suggestRubricScore(llm, {
      prompt: caseRow.prompt, submission: caseRow.submission, criteria: rubricRow.criteria,
      orgId: ctx.orgId, userId: ctx.userId,
    });
    return c.json(suggestion);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/validation/pending", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const rows = await validationSvc.listPendingCases(svcDeps, ctx.orgId, ctx.userId, ctx.role);
  // Validators decide on people and skills, not ids: add learner and competency names.
  const uids = [...new Set(rows.map((r) => r.userId))], cids = [...new Set(rows.map((r) => r.competencyId))];
  const people = uids.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uids)) : [];
  const comps = cids.length ? await db.select({ id: competency.id, name: competency.name }).from(competency)
    .where(and(eq(competency.organizationId, ctx.orgId), inArray(competency.id, cids))) : [];
  const pn = new Map(people.map((p) => [p.id, p.name])), cn = new Map(comps.map((x) => [x.id, x.name]));
  return c.json(rows.map((r) => ({ ...r, learnerName: pn.get(r.userId) ?? null, competencyName: cn.get(r.competencyId) ?? null })));
});

app.post("/api/validation/cases/:id/decide", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ decision: z.enum(["aprobado", "rechazado"]), feedback: z.string().max(4000).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const caseId = c.req.param("id");
    const result = await validationSvc.validateCase(svcDeps, {
      orgId: ctx.orgId, caseId, validatorId: ctx.userId, validatorRole: ctx.role, ...parsed.data,
    });
    let cascade: { coachesPaid: number } | null = null;
    let rewards: rewardsSvc.Granted[] = [];
    if (parsed.data.decision === "aprobado" && result.level === 2) {
      const [caseRow] = await db.select().from(appliedCase).where(eq(appliedCase.id, caseId));
      if (caseRow) {
        cascade = await propagationSvc.onLearnerReachedN2(svcDeps, {
          orgId: ctx.orgId, learnerId: caseRow.userId, competencyId: caseRow.competencyId,
        });
        rewards = await rewardsSvc.evaluateRules(svcDeps, {
          orgId: ctx.orgId, event: "n2", userId: caseRow.userId, competencyId: caseRow.competencyId,
        });
      }
    }
    return c.json({ ...result, cascade, rewards });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

/* ============================================================
 * ROLEPLAY — practica conversacional con un personaje IA. La decision de si aplica
 * la competencia la sigue tomando un humano via /api/validation/cases/:id/decide;
 * esto es practica y una sugerencia de fortalezas/areas de mejora, nunca una aprobacion.
 * ============================================================ */
app.post("/api/roleplay/start", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`roleplay:${ctx.orgId}:${ctx.userId}`, 10, 60_000)) return c.json({ error: "demasiadas sesiones, espera un momento" }, 429);
  const parsed = z.object({ competencyId: z.string().optional(), topic: z.string().max(160).optional(), brief: z.string().max(1500).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  let competencyName = "";
  const competencyId = parsed.data.competencyId || "libre";
  if (parsed.data.competencyId) {
    const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId);
    if (!comp) return c.json({ error: "competencia no encontrada" }, 404);
    competencyName = comp.name;
  } else if (parsed.data.topic && parsed.data.topic.trim()) {
    competencyName = parsed.data.topic.trim();
  } else {
    return c.json({ error: "indica una competencia o un tema para practicar" }, 400);
  }
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId);
  try {
    const turn = await roleplaySvc.startRoleplay(svcDeps, llm, {
      competencyId, competencyName, brief: parsed.data.brief,
      sector: profile?.sector, puesto: profile?.puesto, orgId: ctx.orgId, userId: ctx.userId,
    });
    return c.json(turn);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.post("/api/roleplay/:id/reply", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (rateLimited(`roleplay:${ctx.orgId}:${ctx.userId}`, 20, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = z.object({ message: z.string().min(1), competencyId: z.string().optional(), topic: z.string().max(160).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const comp = (parsed.data.competencyId && parsed.data.competencyId !== "libre") ? await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId) : null;
  const competencyName = comp?.name || (parsed.data.topic && parsed.data.topic.trim()) || "la práctica";
  const profile = await learningSvc.getOnboardingProfile(svcDeps, ctx.orgId, ctx.userId);
  try {
    const turn = await roleplaySvc.replyRoleplay(svcDeps, llm, {
      orgId: ctx.orgId, userId: ctx.userId, sessionId: c.req.param("id"), message: parsed.data.message,
      competencyName, sector: profile?.sector, puesto: profile?.puesto,
    });
    return c.json(turn);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.post("/api/roleplay/:id/close", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ competencyId: z.string().optional(), topic: z.string().max(160).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const comp = (parsed.data.competencyId && parsed.data.competencyId !== "libre") ? await catalogSvc.getCompetency(svcDeps, ctx.orgId, parsed.data.competencyId) : null;
  const competencyName = comp?.name || (parsed.data.topic && parsed.data.topic.trim()) || "la práctica";
  try {
    const summary = await roleplaySvc.closeRoleplay(svcDeps, llm, {
      orgId: ctx.orgId, userId: ctx.userId, sessionId: c.req.param("id"), competencyName,
    });
    return c.json(summary);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/roleplay/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await roleplaySvc.myRoleplays(svcDeps, ctx.orgId, ctx.userId));
});

/* ============================================================
 * PROPAGACIÓN — coaching y puntos de temporada.
 * ============================================================ */
app.post("/api/propagation/coaching", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ learnerId: z.string().min(1), competencyId: z.string().min(1), cap: z.number().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await propagationSvc.assignCoach(svcDeps, {
      orgId: ctx.orgId, coachId: ctx.userId, coachRole: ctx.role, ...parsed.data,
    });
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/propagation/points", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const season = c.req.query("season") ?? propagationSvc.currentSeason();
  const points = await propagationSvc.seasonPoints(svcDeps, ctx.orgId, ctx.userId, season);
  return c.json({ season, points, avatar: propagationSvc.avatarTier(points) });
});
app.get("/api/propagation/ranking", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const season = c.req.query("season") ?? propagationSvc.currentSeason();
  const ranking = await propagationSvc.seasonRanking(svcDeps, ctx.orgId, season);
  return c.json({
    season,
    ranking: ranking.map((r) => ({ ...r, avatar: propagationSvc.avatarTier(r.points) })),
  });
});

/* ============================================================
 * EQUIPO — roster de la organización (para responsables).
 * ============================================================ */
// Bootstrap: quien crea la empresa se convierte en admin de NUESTRO organigrama (independiente
// del rol "owner" que gestiona internamente el plugin organization de better-auth en `member`).
// Solo funciona mientras la empresa no tenga ya un admin — evita que cualquiera se autoascienda luego.
app.post("/api/org/bootstrap-admin", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (await orgSvc.hasAdmin(svcDeps, ctx.orgId)) return c.json({ error: "esta empresa ya tiene admin" }, 403);
  await orgSvc.setMemberRole(svcDeps, ctx.orgId, ctx.userId, "admin");
  // Registro externo: queda PENDIENTE de aprobación por el superadmin y se le avisa por correo.
  try {
    await setAccountState(ctx.orgId, ctx.userId, "pendiente");
    const base = env.APP_URL || env.BETTER_AUTH_URL;
    const link = `${base}/app/superadmin.html#usuarios`;
    // Name and company are typed by an unapproved stranger: escape before putting them in HTML mail.
    const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const who = esc(ctx.userName), mail = esc(ctx.userEmail), org = esc(ctx.orgName);
    for (const adminEmail of env.PLATFORM_ADMIN_EMAILS) {
      await sendMail({
        to: adminEmail,
        subject: "Nuevo registro pendiente de aprobación · SkillUp",
        text: `Se ha registrado ${ctx.userName} (${ctx.userEmail}) en la empresa "${ctx.orgName}". Revisa y aprueba (o no) desde la consola:\n${link}`,
        html: `<p>Nuevo registro <b>pendiente de aprobación</b>:</p><p><b>${who}</b> (${mail}) — empresa "${org}".</p><p><a href="${link}" style="display:inline-block;background:#1a9aa0;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif">Revisar y aprobar</a></p><p style="color:#888;font-size:13px">Hasta que lo apruebes, esa persona puede hacer el onboarding pero no abrir cursos.</p>`,
      });
    }
  } catch (e) { /* no bloquear el alta si falla el aviso */ }
  return c.json({ ok: true });
});

app.get("/api/org/team", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await orgSvc.listMembers(svcDeps, ctx.orgId));
});

// El menu de la app (hub.html / dashboard.html) consulta esto para saber que opciones mostrar segun el rol.
app.get("/api/org/me", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const pa = isPlatformAdmin(ctx);
  const approved = pa || await isApproved(ctx.orgId, ctx.userId);
  return c.json({ role: ctx.role, platformAdmin: pa, approved, capabilities: capabilitiesFor({ role: ctx.role, platformAdmin: pa }) });
});
// Matriz de equipo (admin): comportamiento REAL agregado por miembro, nunca un test de personalidad.
const WORKFORCE_ROLES = ["admin", "direccion", "team_leader", "inspirador"];
app.get("/api/org/workforce", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !WORKFORCE_ROLES.includes(ctx.role)) return c.json({ error: "sin permiso" }, 403);
  const members = await workforceSvc.orgWorkforce(svcDeps, ctx.orgId);
  return c.json({ members });
});
// Conocimiento acumulado por cada tutor (crece con el uso; de solo lectura, no editable). Para el panel.
app.get("/api/analytics/knowledge", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !WORKFORCE_ROLES.includes(ctx.role)) return c.json({ error: "sin permiso" }, 403);
  return c.json({ agents: await workforceSvc.agentsKnowledge(svcDeps, ctx.orgId) });
});

// El plugin organization de better-auth solo conoce sus propios roles (owner/admin/member) y
// rechaza los nuestros al invitar (ROLE_NOT_FOUND, verificado en vivo). Se invita con role=member
// desde el propio better-auth, y una vez aceptada la invitación, admin/dirección fija aquí el
// rol real de nuestro organigrama (empleado/coach/team_leader/inspirador/admin/direccion).
app.put("/api/org/members/:userId/role", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx)) return c.json({ error: "solo el superadmin puede cambiar roles o permisos" }, 403);
  const parsed = z.object({ role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  await orgSvc.setMemberRole(svcDeps, ctx.orgId, c.req.param("userId"), parsed.data.role);
  return c.json({ ok: true });
});

/* ============================================================
 * CONFIG DE EMPRESA + MOTOR DE RECOMPENSAS + CERTIFICADOS.
 * ============================================================ */
app.get("/api/config/company", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  // Business config (salary-linked flag, level labels): managers only, not every employee.
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, "admin", "direccion", "team_leader", "inspirador")) {
    return c.json({ error: "sin permiso" }, 403);
  }
  return c.json(await configSvc.getCompanyConfig(svcDeps, ctx.orgId));
});
app.put("/api/config/company", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  const parsed = z.object({ levelLabels: z.record(z.string()).optional(), salaryLinked: z.boolean().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  await configSvc.setCompanyConfig(svcDeps, ctx.orgId, parsed.data);
  return c.json({ ok: true });
});

app.post("/api/config/reward-rules", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  const parsed = z.object({
    event: z.string().min(1), params: z.record(z.unknown()).optional(),
    reward: z.enum(["certificado", "titulo", "punto", "perk", "senal_rrhh", "insignia", "tarjeta_regalo", "bonus", "reconocimiento"]),
    rewardParams: z.record(z.unknown()).optional(), active: z.boolean().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await rewardsSvc.defineRule(svcDeps, { orgId: ctx.orgId, ...parsed.data });
  return c.json({ id });
});
app.get("/api/config/reward-rules", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, "admin", "direccion", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json({ rules: await rewardsSvc.listRules(svcDeps, ctx.orgId) });
});
app.delete("/api/config/reward-rules/:id", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  await rewardsSvc.deleteRule(svcDeps, ctx.orgId, c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/rewards/evaluate", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "team_leader", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  const parsed = z.object({
    event: z.string().min(1), userId: z.string().min(1), competencyId: z.string().optional(),
    context: z.record(z.unknown()).optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const granted = await rewardsSvc.evaluateRules(svcDeps, { orgId: ctx.orgId, ...parsed.data });
  return c.json({ granted });
});

// Verificación PÚBLICA de un certificado por código — sin auth, es el punto de venta del producto.
app.get("/api/certificates/:code/verify", async (c) => {
  const cert = await rewardsSvc.verifyCertificate(svcDeps, c.req.param("code"));
  if (!cert) return c.json({ valid: false }, 404);
  return c.json({
    valid: !cert.expired, expired: cert.expired,
    title: cert.title, issuedAt: cert.issuedAt, expiresAt: cert.expiresAt,
  });
});

/* ============================================================
 * FUNDAE — acción formativa bonificable (España).
 * ============================================================ */
app.post("/api/fundae/actions", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  const parsed = z.object({
    title: z.string().min(1), horas: z.number(), tutorId: z.string().min(1),
    competencyId: z.string().optional(), relatedPuesto: z.string().optional(), esCertProfesionalidad: z.boolean().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await fundaeSvc.createAction(svcDeps, { orgId: ctx.orgId, ...parsed.data });
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

app.post("/api/fundae/participations", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "coach", "team_leader")) return c.json({ error: "sin permiso" }, 403);
  const parsed = z.object({
    actionId: z.string().min(1), userId: z.string().min(1), controlsTotal: z.number(), controlsDone: z.number(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const r = await fundaeSvc.recordParticipation(svcDeps, { orgId: ctx.orgId, ...parsed.data });
    return c.json(r);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

app.get("/api/fundae/actions/:id/justification", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  try {
    return c.json(await fundaeSvc.exportJustification(svcDeps, ctx.orgId, c.req.param("id")));
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

/* ============================================================
 * ANALYTICS — panel de ROI (cobertura, riesgo, transferencia, tiempo a autonomía).
 * ============================================================ */
app.get("/api/platform/summary", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "no autenticado o sin acceso de superadmin" }, 401);
  return c.json(await analyticsSvc.platformSummary(svcDeps));
});
app.get("/api/platform/history", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "no autenticado o sin acceso de superadmin" }, 401);
  const days = Number(c.req.query("days") ?? 90);
  return c.json(await analyticsSvc.platformSnapshotHistory(svcDeps, days));
});
app.get("/api/platform/cost", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "no autenticado o sin acceso de superadmin" }, 401);
  const days = Number(c.req.query("days") ?? 30);
  const [total, platformOnly] = await Promise.all([
    costsSvc.platformCost(svcDeps, days),
    costsSvc.platformOnlyCost(svcDeps, days),
  ]);
  return c.json({ days, total, orchestrator: platformOnly });
});

/* ============================================================
 * SUPERADMIN — gestión avanzada transversal a todas las empresas (consola de control).
 * Todo bajo getPlatformAdminSession: solo el dueño de la plataforma.
 * ============================================================ */
app.get("/api/platform/orgs", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const rows = await db.select({ id: organization.id, name: organization.name, slug: organization.slug, metadata: organization.metadata }).from(organization).orderBy(desc(organization.createdAt));
  const orgs: Array<Record<string, unknown>> = [];
  for (const o of rows) {
    let status = "activa"; try { const m = o.metadata ? JSON.parse(o.metadata) : {}; if (m && m.status) status = String(m.status); } catch { /* metadata no-JSON */ }
    const sub = await billingSvc.getSubscription(svcDeps, o.id).catch(() => null);
    const mem = await db.select({ id: member.id }).from(member).where(eq(member.organizationId, o.id));
    orgs.push({
      id: o.id, name: o.name, slug: o.slug, status, members: mem.length,
      subscription: sub ? { tier: sub.tier, seats: sub.seats, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null,
    });
  }
  return c.json({ orgs });
});

// Lista los 6 perfiles de prueba para el selector rapido del banner de impersonacion. A diferencia
// de /api/platform/users, tambien la puede llamar una sesion YA impersonada (perdio el email de
// superadmin), siempre que sea fruto de una impersonacion real (session.impersonatedBy) - nunca un
// usuario normal cualquiera.
app.get("/api/platform/test-profiles", async (c) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s?.session || !s.user) return c.json({ error: "no autenticado" }, 401);
  const allowed = isPlatformAdmin({ userEmail: s.user.email }) || !!(s.session as { impersonatedBy?: string }).impersonatedBy;
  if (!allowed) return c.json({ error: "sin acceso" }, 403);
  const rows = await db.select({
    userId: user.id, name: user.name, organizationId: member.organizationId, orgRole: member.orgRole,
  }).from(member).innerJoin(user, eq(member.userId, user.id)).innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(organization.name, "QA - Perfiles de prueba"));
  return c.json({ profiles: rows });
});

// Reinicia un perfil de prueba a "recien registrado": borra sus notas (onboarding, ruta, progreso de
// cursos) para que al volver a entrar arranque el onboarding real desde cero. Guardarraiz: solo deja
// tocar usuarios de la organizacion "QA - Perfiles de prueba", nunca un usuario real.
app.post("/api/platform/test-profiles/reset", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const [target] = await db.select({ orgName: organization.name }).from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, parsed.data.userId));
  if (!target || target.orgName !== "QA - Perfiles de prueba") return c.json({ error: "solo se pueden reiniciar perfiles de prueba" }, 403);
  await db.delete(annotation).where(eq(annotation.userId, parsed.data.userId));
  return c.json({ ok: true });
});

app.get("/api/platform/users", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const rows = await db.select({
    userId: user.id, name: user.name, email: user.email, createdAt: user.createdAt,
    organizationId: member.organizationId, orgName: organization.name, orgRole: member.orgRole,
  }).from(user)
    .leftJoin(member, eq(member.userId, user.id))
    .leftJoin(organization, eq(organization.id, member.organizationId))
    .orderBy(desc(user.createdAt));
  const admins = env.PLATFORM_ADMIN_EMAILS;
  return c.json({ users: rows.map((r) => ({ ...r, platformAdmin: admins.includes((r.email || "").toLowerCase()) })) });
});

app.post("/api/platform/users/set-role", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1), organizationId: z.string().min(1), role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await orgSvc.setMemberRole(svcDeps, parsed.data.organizationId, parsed.data.userId, parsed.data.role);
  return c.json({ ok: true });
});

// Superadmin sends a password-reset link (same better-auth flow as "He olvidado mi contraseña").
// If the mail was not delivered, the link comes back ONLY to the superadmin to hand over by hand.
app.post("/api/platform/users/reset-password", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, parsed.data.userId));
  if (!u) return c.json({ error: "usuario no encontrado" }, 404);
  const key = u.email.toLowerCase();
  lastResetLink.delete(key);
  await auth.api.requestPasswordReset({ body: { email: u.email } });
  const r = lastResetLink.get(key);
  if (!r) return c.json({ error: "no se pudo generar el enlace" }, 500);
  return c.json({ email: u.email, sent: r.delivered, link: r.delivered ? undefined : r.link });
});

// Insights de plataforma: de qué aprende el sistema (conversaciones, notas, prácticas, documentos).
app.get("/api/platform/insights", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const one = async (tbl: any, where?: any): Promise<number> => {
    const q = db.select({ c: count() }).from(tbl);
    const rows = where ? await q.where(where) : await q;
    return rows[0] ? Number(rows[0].c) : 0;
  };
  const [usuarios, empresas, conversaciones, mensajes, notasTotal, roleplays, casos, documentos, retos, notasCurso] = await Promise.all([
    one(user), one(organization), one(agentThread), one(agentMessage), one(annotation),
    one(roleplaySession), one(appliedCase), one(ragDocument),
    one(annotation, eq(annotation.source, "reto")), one(annotation, eq(annotation.kind, "insight")),
  ]);
  return c.json({ usuarios, empresas, conversaciones, mensajes, notasTotal, notasCurso, roleplays, casos, documentos, retos });
});

// Revisión de los tutores: qué instrucciones lleva cada agente por rol.
app.get("/api/platform/agents", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const agents = Object.values(REGISTRY).map((a) => ({
    role: a.role, title: a.title, model: a.model,
    system: a.system({ orgName: "(empresa)", userName: "(usuario)", contextSnippets: [], sector: null, puesto: null }),
  }));
  return c.json({ agents });
});

// Conocimiento de los tutores (base RAG): revisar y añadir conocimiento específico a una empresa.
app.get("/api/platform/knowledge", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const rows = await db.select({
    id: ragDocument.id, title: ragDocument.title, kind: ragDocument.kind,
    organizationId: ragDocument.organizationId, orgName: organization.name, createdAt: ragDocument.createdAt,
  }).from(ragDocument)
    .leftJoin(organization, eq(organization.id, ragDocument.organizationId))
    .orderBy(desc(ragDocument.createdAt));
  return c.json({ docs: rows });
});

app.post("/api/platform/knowledge", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ organizationId: z.string().min(1), title: z.string().min(1).max(200), text: z.string().min(1).max(20000), kind: z.string().max(40).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  try {
    const r = await ingestDocument(chatDeps, parsed.data.organizationId, { title: parsed.data.title, text: parsed.data.text, kind: parsed.data.kind });
    return c.json(r);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

// Registros pendientes de aprobación (anti-infiltrados). Lista + aprobar.
app.get("/api/platform/pending", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const rows = await db.select({ organizationId: annotation.organizationId, userId: annotation.userId, body: annotation.body, createdAt: annotation.createdAt })
    .from(annotation).where(eq(annotation.source, "cuenta")).orderBy(desc(annotation.createdAt));
  const seen: Record<string, string> = {};
  for (const r of rows) {
    const key = r.organizationId + "|" + r.userId;
    if (seen[key]) continue; // primera (más reciente) gana
    const m = String(r.body || "").match(/^\[(?:cuenta|aprobacion)\]\s*(\w+)/i);
    seen[key] = m ? (m[1] ?? "").toLowerCase() : "";
  }
  const out: Array<Record<string, unknown>> = [];
  for (const key of Object.keys(seen)) {
    if (seen[key] !== "pendiente") continue;
    const [orgId = "", userId = ""] = key.split("|");
    const [u] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
    const [o] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId));
    out.push({ userId, organizationId: orgId, name: u?.name || "", email: u?.email || "", orgName: o?.name || "" });
  }
  return c.json({ pending: out });
});

app.post("/api/platform/users/approve", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1), organizationId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await setAccountState(parsed.data.organizationId, parsed.data.userId, "aprobado");
  return c.json({ ok: true });
});

// Activar / desactivar / re-marcar pendiente una cuenta.
app.post("/api/platform/users/set-state", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1), organizationId: z.string().min(1), state: z.enum(["aprobado", "desactivado", "pendiente", "archivado"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await setAccountState(parsed.data.organizationId, parsed.data.userId, parsed.data.state);
  await db.insert(auditLog).values({ id: newId(), organizationId: parsed.data.organizationId, userId: null,
    action: "platform.set-state", meta: { by: admin.userId, target: parsed.data.userId, state: parsed.data.state } });
  return c.json({ ok: true });
});

// A3: ajustar puntos a mano (corrige el ranking) con motivo y auditoría. Puede ser negativo.
app.post("/api/platform/users/adjust-points", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1), organizationId: z.string().min(1),
    delta: z.number().int().min(-100000).max(100000), reason: z.string().min(1).max(200) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const [m] = await db.select({ id: member.id }).from(member)
    .where(and(eq(member.organizationId, parsed.data.organizationId), eq(member.userId, parsed.data.userId)));
  if (!m) return c.json({ error: "ese usuario no pertenece a esa organización" }, 404);
  await propagationSvc.awardPoints(svcDeps, parsed.data.organizationId, parsed.data.userId,
    propagationSvc.currentSeason(), parsed.data.delta, "ajuste manual: " + parsed.data.reason);
  await db.insert(auditLog).values({ id: newId(), organizationId: parsed.data.organizationId, userId: null,
    action: "platform.adjust-points", meta: { by: admin.userId, target: parsed.data.userId, delta: parsed.data.delta, reason: parsed.data.reason } });
  return c.json({ ok: true });
});

// Reactivar y hacer que rehaga el onboarding: borra su perfil, ADN y ruta; vuelve a "aprobado" (A2).
app.post("/api/platform/users/reset-onboarding", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1), organizationId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const { organizationId: oid, userId: uid } = parsed.data;
  await db.delete(onboardingProfile).where(and(eq(onboardingProfile.organizationId, oid), eq(onboardingProfile.userId, uid)));
  await db.delete(teamDna).where(and(eq(teamDna.organizationId, oid), eq(teamDna.userId, uid)));
  await db.delete(annotation).where(and(eq(annotation.organizationId, oid), eq(annotation.userId, uid), eq(annotation.source, "ruta")));
  await db.delete(annotation).where(and(eq(annotation.organizationId, oid), eq(annotation.userId, uid), eq(annotation.source, "onboarding")));
  await setAccountState(oid, uid, "aprobado");
  await db.insert(auditLog).values({ id: newId(), organizationId: oid, userId: null,
    action: "platform.reset-onboarding", meta: { by: admin.userId, target: uid } });
  return c.json({ ok: true });
});

// Estado de cuenta de cada persona (para pintar activo/pendiente/desactivado en la tabla).
app.get("/api/platform/users/states", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const rows = await db.select({ organizationId: annotation.organizationId, userId: annotation.userId, body: annotation.body })
    .from(annotation).where(eq(annotation.source, "cuenta")).orderBy(desc(annotation.createdAt));
  const states: Record<string, string> = {};
  for (const r of rows) {
    const key = r.organizationId + "|" + r.userId; if (states[key]) continue;
    const m = String(r.body || "").match(/^\[(?:cuenta|aprobacion)\]\s*(\w+)/i);
    if (m) states[key] = (m[1] ?? "").toLowerCase();
  }
  return c.json({ states });
});

// Borrar una persona (cascada a account/session/member). Irreversible; el cliente confirma.
app.post("/api/platform/users/delete", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  if (parsed.data.userId === admin.userId) return c.json({ error: "no puedes borrar tu propia cuenta desde aquí" }, 400);
  await db.insert(auditLog).values({ id: newId(), organizationId: "", userId: null,
    action: "platform.delete-user", meta: { by: admin.userId, target: parsed.data.userId } });
  await db.delete(user).where(eq(user.id, parsed.data.userId));
  return c.json({ ok: true });
});

// Borrar un documento de conocimiento (RAG) — sus chunks caen por cascada.
app.post("/api/platform/knowledge/delete", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await db.delete(ragDocument).where(eq(ragDocument.id, parsed.data.id));
  return c.json({ ok: true });
});

// Estado de una empresa (activa/archivada/inactiva) — guardado en organization.metadata (JSON).
app.post("/api/platform/orgs/status", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ organizationId: z.string().min(1), status: z.enum(["activa", "archivada", "inactiva"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const [o] = await db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, parsed.data.organizationId));
  let meta: Record<string, unknown> = {}; try { meta = o?.metadata ? JSON.parse(o.metadata) : {}; } catch { meta = {}; }
  meta.status = parsed.data.status;
  await db.update(organization).set({ metadata: JSON.stringify(meta) }).where(eq(organization.id, parsed.data.organizationId));
  return c.json({ ok: true });
});

// Borrar una empresa entera (cascada a miembros, datos…). Irreversible; el cliente confirma.
app.post("/api/platform/orgs/delete", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ organizationId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await db.delete(organization).where(eq(organization.id, parsed.data.organizationId));
  return c.json({ ok: true });
});

// Editar el precio (o etiqueta) de un plan.
app.post("/api/platform/tiers/set", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({ tier: z.string().min(1), label: z.string().min(1).optional(), pricePerSeatCents: z.number().int().min(0), currency: z.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  await billingSvc.setPricingTier(svcDeps, parsed.data.tier as never, parsed.data.label || parsed.data.tier, parsed.data.pricePerSeatCents);
  return c.json({ ok: true });
});

/* ============================================================
 * RETOS (challenges) — un responsable/Team Leader (o el superadmin) reta a un miembro con un caso
 * concreto o un roleplay, escribiendo o dictando las INSTRUCCIONES para el agente tutor. Los agentes
 * preparan un borrador (draft) y el humano influye. La validación de si aplica sigue siendo humana.
 * ============================================================ */
const CHALLENGE_MANAGERS = ["team_leader", "admin", "direccion", "inspirador"];

app.post("/api/learning/challenges/draft", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, ...CHALLENGE_MANAGERS)) return c.json({ error: "requiere responsable/admin" }, 403);
  if (rateLimited(`challdraft:${ctx.orgId}:${ctx.userId}`, 12, 60_000)) return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  const parsed = z.object({ tipo: z.enum(["roleplay", "caso"]), tema: z.string().min(2).max(200), dificultad: z.string().max(40).optional(), notas: z.string().max(600).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const { tipo, tema, dificultad, notas } = parsed.data;
  const system = tipo === "roleplay"
    ? "Preparas el BRIEF para un agente tutor que hará de personaje en un roleplay de práctica. Español de España, claro. El brief se lo lee el agente, en 2ª persona (\"Eres... Te comportas...\"): personaje, situación, objeciones o dureza. Responde SOLO JSON: {\"titulo\":\"...\",\"brief\":\"...\"}."
    : "Preparas el ENUNCIADO de un caso práctico real que alguien tendrá que resolver y demostrar en su trabajo. Español de España, claro y aplicable. Responde SOLO JSON: {\"titulo\":\"...\",\"brief\":\"enunciado del caso\"}.";
  try {
    const out = await llm.generate({
      system, messages: [{ role: "user", content: `Tema: ${tema}.` + (dificultad ? ` Dificultad: ${dificultad}.` : "") + (notas ? ` Notas del responsable: ${notas}.` : "") }],
      maxTokens: 700, orgId: ctx.orgId, userId: ctx.userId, kind: "challenge_draft",
    });
    const draft = aiContent.firstJson<{ titulo: string; brief: string }>(out);
    return c.json({ titulo: String(draft.titulo || tema).slice(0, 160), brief: String(draft.brief || "").slice(0, 1500) });
  } catch { return c.json({ error: "no pude preparar el borrador, intentalo de nuevo" }, 502); }
});

app.post("/api/learning/challenges", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!isPlatformAdmin(ctx) && !hasRole(ctx, ...CHALLENGE_MANAGERS)) return c.json({ error: "requiere responsable/admin" }, 403);
  const parsed = z.object({
    assignedToUserId: z.string().min(1), tipo: z.enum(["roleplay", "caso"]),
    titulo: z.string().min(1).max(200), brief: z.string().min(1).max(1500),
    tema: z.string().max(200).optional(), competencyId: z.string().optional(), dificultad: z.string().max(40).optional(),
    organizationId: z.string().optional(), // solo el superadmin puede retar en otra empresa
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const orgId = (isPlatformAdmin(ctx) && parsed.data.organizationId) ? parsed.data.organizationId : ctx.orgId;
  const [tgt] = await db.select().from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, parsed.data.assignedToUserId)));
  if (!tgt) return c.json({ error: "esa persona no está en esa organización" }, 400);
  const reto = {
    id: newId(), tipo: parsed.data.tipo, titulo: parsed.data.titulo, brief: parsed.data.brief,
    tema: parsed.data.tema || "", competencyId: parsed.data.competencyId || "", dificultad: parsed.data.dificultad || "",
    by: ctx.userName, byId: ctx.userId, createdAt: new Date().toISOString(), estado: "pendiente",
  };
  await notesSvc.create(svcDeps, orgId, parsed.data.assignedToUserId, { source: "reto", kind: "insight", body: "[reto] " + JSON.stringify(reto) });
  return c.json({ id: reto.id });
});

app.get("/api/learning/challenges/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const items = await notesSvc.list(svcDeps, ctx.orgId, ctx.userId, "reto").catch(() => [] as { body: string | null }[]);
  const retos = items.map((it) => { const b = String(it.body || ""); if (b.indexOf("[reto]") !== 0) return null; try { return JSON.parse(b.slice(6).trim()); } catch { return null; } }).filter(Boolean);
  return c.json({ retos });
});

// El alumno marca su reto como hecho (al cerrar el roleplay o entregar el caso). Guarda el resultado
// para que su responsable lo revise. La validación de si aplica la competencia sigue siendo humana.
app.post("/api/learning/challenges/:id/complete", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ resultado: z.string().max(6000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const rows = await db.select().from(annotation).where(and(eq(annotation.organizationId, ctx.orgId), eq(annotation.userId, ctx.userId), eq(annotation.source, "reto")));
  const target = rows.find((r) => { try { return JSON.parse(String(r.body || "").slice(6).trim()).id === c.req.param("id"); } catch { return false; } });
  if (!target) return c.json({ error: "reto no encontrado" }, 404);
  let obj: Record<string, unknown> = {};
  try { obj = JSON.parse(String(target.body).slice(6).trim()); } catch { obj = {}; }
  obj.estado = "hecho"; obj.completedAt = new Date().toISOString();
  if (parsed.data.resultado) obj.resultado = parsed.data.resultado.slice(0, 6000);
  // P6: un reto de tipo "caso" con competencia entra en la cola de validación humana (no solo "hecho").
  let caseId: string | null = null;
  if (obj.tipo === "caso" && typeof obj.competencyId === "string" && obj.competencyId) {
    const comp = await catalogSvc.getCompetency(svcDeps, ctx.orgId, obj.competencyId);
    if (comp) {
      try {
        caseId = await validationSvc.createCase(svcDeps, {
          orgId: ctx.orgId, userId: ctx.userId, competencyId: obj.competencyId,
          prompt: String(obj.titulo || "Reto") + ": " + String(obj.brief || ""),
        });
        await validationSvc.submitCase(svcDeps, ctx.orgId, ctx.userId, caseId, parsed.data.resultado || "(entregado desde el reto)");
        obj.caseId = caseId; obj.estado = "en_validacion";
      } catch { caseId = null; }
    }
  }
  await db.update(annotation).set({ body: "[reto] " + JSON.stringify(obj) }).where(eq(annotation.id, target.id));
  return c.json({ ok: true, caseId, enValidacion: !!caseId });
});

const assistantBody = z.object({ message: z.string().min(1) });
// Orquestador v1: informa con datos reales de TODA la plataforma. NO ejecuta acciones todavia
// (a proposito -- se lo dice el propio prompt, para que nunca finja haber hecho algo que no hizo).
app.post("/api/platform/assistant", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "no autenticado o sin acceso de superadmin" }, 401);
  if (rateLimited(`assistant:${admin.userId}`, 20, 60_000)) {
    return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
  }
  const parsed = assistantBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo invalido" }, 400);
  const summary = await analyticsSvc.platformSummary(svcDeps);
  // Personas (compactas) para que pueda proponer una acción sobre alguien real.
  const people = (await db.select({ email: user.email, name: user.name, org: organization.name, role: member.orgRole })
    .from(user).leftJoin(member, eq(member.userId, user.id)).leftJoin(organization, eq(organization.id, member.organizationId))
    .orderBy(desc(user.createdAt)).limit(150))
    .filter((p) => p.org).map((p) => `${p.name} <${p.email}> · ${p.org} · ${p.role || "empleado"}`);
  const system = "Eres el orquestador (JARVIS) de Brandooers SkillUp, hablando con el superadmin. "
    + "Espanol de Espana, directo, sin inventar. Datos reales por empresa: " + JSON.stringify(summary) + ". "
    + "Personas (nombre <email> · empresa · rol): " + JSON.stringify(people) + ". "
    + "Por defecto INFORMAS con texto. PERO si el superadmin te pide claramente EJECUTAR una de estas acciones, "
    + "responde SOLO con este JSON (sin texto alrededor): {\"accion\":\"aprobar|estado|rol|puntos|password\",\"email\":\"<email exacto de la lista>\",\"empresa\":\"<nombre empresa>\",\"estado\":\"aprobado|desactivado|archivado\",\"rol\":\"empleado|coach|team_leader|inspirador|admin|direccion\",\"delta\":<entero>,\"motivo\":\"...\",\"confirmar\":\"frase clara de lo que vas a hacer para que el superadmin confirme\"}. "
    + "Incluye solo los campos que la accion necesita (aprobar/estado/rol/puntos requieren email+empresa; puntos requiere delta+motivo; estado requiere estado; rol requiere rol; password solo email). "
    + "Si no estas seguro de a quien se refiere o falta un dato, NO propongas accion: pregunta en texto. Nunca borres nada.";
  const raw = await llm.generate({
    system, messages: [{ role: "user", content: parsed.data.message }], maxTokens: 500,
    orgId: null, userId: admin.userId, kind: "orchestrator",
  });
  // ¿Ha propuesto una acción? (JSON con accion válida). Si no, es texto normal.
  if (raw.indexOf("{") >= 0 && /"accion"/.test(raw)) {
    try {
      const prop = aiContent.firstJson<Record<string, unknown>>(raw);
      if (prop && typeof prop.accion === "string" && ["aprobar", "estado", "rol", "puntos", "password"].includes(prop.accion)) {
        return c.json({ proposal: prop });
      }
    } catch { /* no era JSON válido → cae a texto */ }
  }
  return c.json({ reply: raw });
});

// A7 fase 2: ejecutar una acción PROPUESTA por el orquestador, tras confirmación del superadmin.
// Whitelist cerrada; la IA nunca ejecuta, solo propone; aquí se valida y se audita.
const EXEC_STATES = ["aprobado", "desactivado", "archivado"];
app.post("/api/platform/execute", async (c) => {
  const admin = await getPlatformAdminSession(c);
  if (!admin) return c.json({ error: "sin acceso de superadmin" }, 401);
  const parsed = z.object({
    accion: z.enum(["aprobar", "estado", "rol", "puntos", "password"]),
    email: z.string().email(), empresa: z.string().optional(),
    estado: z.string().optional(), rol: z.string().optional(),
    delta: z.number().int().min(-100000).max(100000).optional(), motivo: z.string().max(200).optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const d = parsed.data;
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, d.email.toLowerCase()));
  if (!u) return c.json({ error: "no encuentro a nadie con ese email" }, 404);
  // password es global por email; el resto necesita la organización.
  if (d.accion === "password") {
    lastResetLink.delete(d.email.toLowerCase());
    await auth.api.requestPasswordReset({ body: { email: d.email } });
    const r = lastResetLink.get(d.email.toLowerCase());
    await db.insert(auditLog).values({ id: newId(), organizationId: "", userId: null, action: "jarvis.password", meta: { by: admin.userId, target: d.email } });
    return c.json({ ok: true, sent: r?.delivered ?? false, link: r && !r.delivered ? r.link : undefined, hecho: "Enlace de contraseña generado para " + d.email });
  }
  // resolver organización por nombre (o la única del usuario)
  const mems = await db.select({ orgId: member.organizationId, orgName: organization.name, orgRole: member.orgRole })
    .from(member).leftJoin(organization, eq(organization.id, member.organizationId)).where(eq(member.userId, u.id));
  let m = mems.find((x) => d.empresa && x.orgName && x.orgName.toLowerCase() === d.empresa.toLowerCase());
  if (!m && mems.length === 1) m = mems[0];
  if (!m) return c.json({ error: "dime en qué empresa (esa persona está en varias o ninguna)" }, 400);
  const oid = m.orgId!;
  if (d.accion === "aprobar") { await setAccountState(oid, u.id, "aprobado"); }
  else if (d.accion === "estado") { if (!d.estado || !EXEC_STATES.includes(d.estado)) return c.json({ error: "estado no válido" }, 400); await setAccountState(oid, u.id, d.estado); }
  else if (d.accion === "rol") { if (!d.rol || !ROLES.includes(d.rol as (typeof ROLES)[number])) return c.json({ error: "rol no válido" }, 400); await orgSvc.setMemberRole(svcDeps, oid, u.id, d.rol as (typeof ROLES)[number]); }
  else if (d.accion === "puntos") { if (!d.delta || !d.motivo) return c.json({ error: "faltan puntos o motivo" }, 400); await propagationSvc.awardPoints(svcDeps, oid, u.id, propagationSvc.currentSeason(), d.delta, "JARVIS: " + d.motivo); }
  await db.insert(auditLog).values({ id: newId(), organizationId: oid, userId: null, action: "jarvis." + d.accion, meta: { by: admin.userId, target: u.id, ...d } });
  return c.json({ ok: true, hecho: "Hecho: " + d.accion + " · " + d.email + " · " + (m.orgName || oid) });
});
app.get("/api/analytics/panel", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  await analyticsSvc.captureSnapshotIfNeeded(svcDeps, ctx.orgId);
  return c.json(await analyticsSvc.panelSummary(svcDeps, ctx.orgId));
});
app.get("/api/analytics/history", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  const days = Number(c.req.query("days") ?? 90);
  return c.json(await analyticsSvc.snapshotHistory(svcDeps, ctx.orgId, days));
});
app.get("/api/analytics/completion", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await analyticsSvc.completionByPath(svcDeps, ctx.orgId));
});
app.get("/api/analytics/questions", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await analyticsSvc.recentQuestions(svcDeps, ctx.orgId));
});
app.get("/api/analytics/cost", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "direccion")) return c.json({ error: "solo admin/dirección" }, 403);
  const days = Number(c.req.query("days") ?? 30);
  return c.json(await costsSvc.orgCost(svcDeps, ctx.orgId, days));
});
app.post("/api/analytics/baseline", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  const id = await analyticsSvc.captureBaseline(svcDeps, ctx.orgId);
  return c.json({ id });
});
app.get("/api/analytics/baseline/latest", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await analyticsSvc.latestBaseline(svcDeps, ctx.orgId));
});

/* ============================================================
 * PRIVACIDAD (RGPD) — acceso/portabilidad (art. 15/20) y derecho al olvido (art. 17).
 * Export: autoservicio (cualquiera exporta lo suyo). Borrado: lo gestiona la empresa (admin/
 * dirección), como corresponde a un procesamiento encargado a Boomatik como encargado del
 * tratamiento (RGPD art. 28) sobre datos cuyo responsable es la empresa cliente.
 * ============================================================ */
app.get("/api/privacy/export", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await privacySvc.exportUserData(svcDeps, ctx.orgId, ctx.userId));
});
app.post("/api/privacy/users/:userId/erase", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "direccion")) return c.json({ error: "solo admin/dirección" }, 403);
  try {
    await privacySvc.eraseUserData(svcDeps, ctx.orgId, c.req.param("userId"));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
  return c.json({ ok: true });
});

/* ============================================================
 * PLAN DE CARRERA — rol → competencias requeridas → siguiente rol (por empresa).
 * ============================================================ */
app.post("/api/career/paths", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, ...CATALOG_WRITERS)) return c.json({ error: "requiere admin/direccion/inspirador" }, 403);
  const parsed = z.object({
    fromPuestoId: z.string().optional(), toPuestoId: z.string().min(1),
    requirements: z.array(z.object({ competencyId: z.string().min(1), minLevel: z.number().min(1).max(4) })).min(1),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    const id = await careerSvc.definePath(svcDeps, { orgId: ctx.orgId, ...parsed.data });
    return c.json({ id });
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});
app.get("/api/career/paths", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await careerSvc.listPaths(svcDeps, ctx.orgId));
});
app.get("/api/career/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await careerSvc.myProgress(svcDeps, ctx.orgId, ctx.userId));
});

app.get("/api/reminders/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await remindersSvc.myReminders(svcDeps, ctx.orgId, ctx.userId, ctx.role));
});

/* ============================================================
 * FACTURACIÓN (Stripe) — niveles de precio, suscripción, checkout, webhook.
 * ============================================================ */
app.get("/api/billing/tiers", async (c) => {
  return c.json(await billingSvc.listPricingTiers(svcDeps));
});

app.get("/api/billing/subscription", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await billingSvc.getSubscription(svcDeps, ctx.orgId));
});

app.post("/api/billing/checkout", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "direccion")) return c.json({ error: "solo admin/dirección" }, 403);
  const parsed = z.object({ tier: z.enum(billingSvc.TIERS), seats: z.number().min(1).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const seats = parsed.data.seats ?? ((await orgSvc.listMembers(svcDeps, ctx.orgId)).length || 1);
  try {
    const r = await billingSvc.createCheckoutSession(svcDeps, {
      orgId: ctx.orgId, orgName: ctx.orgName, tier: parsed.data.tier, seats, customerEmail: ctx.userEmail,
    });
    return c.json(r);
  } catch (e) { return c.json({ error: String((e as Error).message) }, 400); }
});

// Stripe llama aquí directamente (sin sesión nuestra) — la autenticación es la firma del webhook.
app.post("/api/billing/webhook", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig || !env.STRIPE_WEBHOOK_SECRET) return c.json({ error: "webhook no configurado" }, 400);
  const rawBody = await c.req.text();
  let event;
  try {
    event = billingSvc.stripe().webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return c.json({ error: `firma inválida: ${(e as Error).message}` }, 400);
  }
  await billingSvc.applyStripeEvent(svcDeps, event);
  return c.json({ received: true });
});
