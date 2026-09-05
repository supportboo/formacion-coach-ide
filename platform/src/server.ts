import { eq } from "drizzle-orm";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "./auth/auth.js";
import { env } from "./config/env.js";
import { getAuthContext, type AuthCtx } from "./http/context.js";
import { chat } from "./agents/chat.js";
import { ROLES } from "./agents/registry.js";
import { ingestDocument } from "./rag/rag.js";
import { appliedCase } from "./db/schema.js";
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
import * as privacySvc from "./services/privacy.js";
import * as billingSvc from "./services/billing.js";
import * as careerSvc from "./services/career.js";
import * as remindersSvc from "./services/reminders.js";

const svcDeps = { db, newId };
const hasRole = (ctx: AuthCtx, ...roles: string[]) => roles.includes(ctx.role);

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "skillup-platform" }));

// better-auth (registro, login, organización, invitaciones…)
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Frontend de SkillUp (estático, sin build) servido por el mismo proceso.
app.get("/app", (c) => c.redirect("/app/login.html"));
app.use("/app/*", serveStatic({ root: "./public" }));
app.get("/verificar", serveStatic({ path: "./public/verificar.html" }));

const chatBody = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
  role: z.string().optional(),
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
    const draft = await aiContent.generateLessonDraft(llm, { competencyName: comp.name, topic: parsed.data.topic });
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
  const id = await learningSvc.startOnboarding(svcDeps, { orgId: ctx.orgId, userId: ctx.userId, ...parsed.data });
  return c.json({ id });
});

app.post("/api/learning/enroll", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ pathId: z.string().min(1), competencyId: z.string().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await learningSvc.enroll(svcDeps, ctx.orgId, ctx.userId, parsed.data.pathId, parsed.data.competencyId);
  return c.json({ id });
});
app.get("/api/learning/mine", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await learningSvc.listMyEnrollments(svcDeps, ctx.orgId, ctx.userId));
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
  const canAssignOthers = hasRole(ctx, "admin", "inspirador", "team_leader");
  const userId = (canAssignOthers && parsed.data.userId) ? parsed.data.userId : ctx.userId;
  const id = await validationSvc.createCase(svcDeps, { orgId: ctx.orgId, userId, ...parsed.data });
  return c.json({ id });
});

app.post("/api/validation/cases/:id/submit", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ submission: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  try {
    await validationSvc.submitCase(svcDeps, ctx.orgId, c.req.param("id"), parsed.data.submission);
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

app.get("/api/validation/pending", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  return c.json(await validationSvc.listPendingCases(svcDeps, ctx.orgId, ctx.userId, ctx.role));
});

app.post("/api/validation/cases/:id/decide", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  const parsed = z.object({ decision: z.enum(["aprobado", "rechazado"]), feedback: z.string().optional() })
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
  return c.json({ season, points });
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
  return c.json({ ok: true });
});

app.get("/api/org/team", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await orgSvc.listMembers(svcDeps, ctx.orgId));
});

// El plugin organization de better-auth solo conoce sus propios roles (owner/admin/member) y
// rechaza los nuestros al invitar (ROLE_NOT_FOUND, verificado en vivo). Se invita con role=member
// desde el propio better-auth, y una vez aceptada la invitación, admin/dirección fija aquí el
// rol real de nuestro organigrama (empleado/coach/team_leader/inspirador/admin/direccion).
app.put("/api/org/members/:userId/role", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "admin", "direccion")) return c.json({ error: "solo admin/dirección" }, 403);
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
  if (!hasRole(ctx, "admin")) return c.json({ error: "solo admin" }, 403);
  const parsed = z.object({
    event: z.string().min(1), params: z.record(z.unknown()).optional(),
    reward: z.enum(["certificado", "titulo", "punto", "perk", "senal_rrhh"]),
    rewardParams: z.record(z.unknown()).optional(), active: z.boolean().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "cuerpo inválido" }, 400);
  const id = await rewardsSvc.defineRule(svcDeps, { orgId: ctx.orgId, ...parsed.data });
  return c.json({ id });
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
  return c.json({ valid: true, title: cert.title, issuedAt: cert.issuedAt });
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
app.get("/api/analytics/panel", async (c) => {
  const ctx = await getAuthContext(c);
  if (!ctx) return c.json({ error: "no autenticado" }, 401);
  if (!hasRole(ctx, "team_leader", "direccion", "admin", "inspirador")) return c.json({ error: "sin permiso" }, 403);
  return c.json(await analyticsSvc.panelSummary(svcDeps, ctx.orgId));
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
  await privacySvc.eraseUserData(svcDeps, ctx.orgId, c.req.param("userId"));
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
