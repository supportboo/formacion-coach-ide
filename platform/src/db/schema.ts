import {
  pgTable, text, timestamp, boolean, integer, real, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * AUTH (better-auth + organization plugin) — multi-tenant.
 * Una organización = una empresa. Escala igual de 1 usuario a multinacional.
 * ============================================================ */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Campos del plugin "admin" de better-auth (impersonar usuarios de prueba). Nullable: nadie los tenia antes.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // Idioma de la plataforma elegido por la persona (es|en|ca|pt|fr). Null = nunca eligió -> español.
  lang: text("lang"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: text("active_organization_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Plugin "admin": de quien es la sesion real cuando un superadmin esta impersonando a este usuario.
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  // better-auth 1.7: identidad de cuenta acotada por issuer (antes solo providerId+accountId).
  // https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer
  issuer: text("issuer").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ issuerAccountUniq: uniqueIndex("account_issuer_accountid_uidx").on(t.issuer, t.accountId) }));

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Roles del organigrama: empleado · coach · team_leader · inspirador · admin · direccion
export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // "role" es del plugin organization de better-auth (owner/admin/member): gobierna invitar/gestionar
  // miembros vía better-auth. NUNCA reutilizarlo para nuestro organigrama, o better-auth pierde
  // permisos (p.ej. "owner" pisado por "admin" bloqueaba el botón de invitar). El rol de la app
  // (empleado/coach/team_leader/inspirador/admin/direccion) vive aparte en "orgRole".
  role: text("role").notNull().default("member"),
  orgRole: text("org_role").notNull().default("empleado"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("member_org_idx").on(t.organizationId) }));

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

/* ============================================================
 * DOMINIO (Fase 0-2): sectores, puestos, competencias, rutas, lecciones.
 * Toda tabla lleva organizationId (regla multi-tenant canónica).
 * ============================================================ */
export const sector = pgTable("sector", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("sector_org_idx").on(t.organizationId) }));

export const puesto = pgTable("puesto", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  sectorId: text("sector_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("puesto_org_idx").on(t.organizationId) }));

export const competency = pgTable("competency", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  puestoId: text("puesto_id"),
  critical: boolean("critical").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("competency_org_idx").on(t.organizationId) }));

export const learningPath = pgTable("learning_path", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  competencyId: text("competency_id"),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("path_org_idx").on(t.organizationId) }));

// Doctrina certeza: cada lección lleva fuente + fecha de revisión, obligatorias para publicar.
export const lesson = pgTable("lesson", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  pathId: text("path_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  fuente: text("fuente"),
  fechaRevision: timestamp("fecha_revision"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("lesson_org_idx").on(t.organizationId) }));

/* ============================================================
 * RAG — asociar contenidos y rutas por significado.
 * Embedding en jsonb (float[]). ponytail: pgvector cuando el volumen lo pida.
 * ============================================================ */
export const ragDocument = pgTable("rag_document", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("nota"), // leccion | caso | ruta | nota | politica
  refId: text("ref_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("ragdoc_org_idx").on(t.organizationId) }));

export const ragChunk = pgTable("rag_chunk", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  documentId: text("document_id").notNull().references(() => ragDocument.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
}, (t) => ({ byOrg: index("ragchunk_org_idx").on(t.organizationId) }));

/* ============================================================
 * AGENTES conversacionales — un hilo por usuario/rol.
 * ============================================================ */
export const agentThread = pgTable("agent_thread", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  title: text("title"),
  // 1.3.0 (supervisión en directo): curso del que sale el hilo del tutor (slug), para que el responsable
  // sepa de qué curso es cada conversación. Null en hilos anteriores o del agente general.
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("thread_org_idx").on(t.organizationId) }));

export const agentMessage = pgTable("agent_message", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  threadId: text("thread_id").notNull().references(() => agentThread.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // user | agent | coach (persona humana: coach, team leader, admin…)
  content: text("content").notNull(),
  // 1.3.0: lo que el alumno ve de su propio mensaje (sin las instrucciones internas que curso.html antepone
  // para la IA). Null = mensaje interno (p. ej. la síntesis de memoria) o anterior a 1.3.0.
  display: text("display"),
  // Autor humano cuando sender = coach.
  authorId: text("author_id"),
  authorName: text("author_name"),
  authorRole: text("author_role"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byThread: index("msg_thread_idx").on(t.threadId) }));

/* Auditoría — quién hizo qué (clave para validaciones y FUNDAE). */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id"),
  action: text("action").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("audit_org_idx").on(t.organizationId) }));

/* ============================================================
 * APRENDIZAJE (Fase 2): onboarding, matrícula, test, nivel por competencia.
 * ============================================================ */
export const onboardingProfile = pgTable("onboarding_profile", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  sector: text("sector"),
  puesto: text("puesto"),
  motivo: text("motivo"), // por qué / para qué se forma
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("onb_org_idx").on(t.organizationId) }));

export const enrollment = pgTable("enrollment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  pathId: text("path_id").notNull(),
  competencyId: text("competency_id"),
  status: text("status").notNull().default("en_curso"), // en_curso | test_ok | en_validacion | completado
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("enr_org_idx").on(t.organizationId) }));

/* 1.18.0 — Curso ↔ competencia: lo que la persona hace en un curso (tests, examen, roleplays) suma a la
 * capacidad de esa competencia. Sin vínculo, cada curso cuenta como una capacidad propia. */
export const courseCompetency = pgTable("course_competency", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  source: text("source").notNull(), // slug del curso (outbound-sales, …)
  competencyId: text("competency_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ uniq: uniqueIndex("course_competency_org_source_uniq").on(t.organizationId, t.source) }));

/* 1.19.0 — Evidencias nativas (arquitectura V2, fase 2): solo lo que no existe en otra tabla. Las demás
 * evidencias (tests, roleplays, casos…) se derivan en services/capability.ts. */
export const evidenceEvent = pgTable("evidence_event", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  skillKey: text("skill_key").notNull(),          // comp:<id> | curso:<slug>
  type: text("type").notNull(),                   // demostracion | teach_back
  dimension: text("dimension").notNull(),         // conocimiento | aplicacion | autonomia | transferencia
  context: text("context"),                       // escenario o tema trabajado
  score: integer("score"),                        // 0-100
  independence: text("independence").notNull(),   // guiado | asistido | independiente | enseno
  aiHelp: text("ai_help").notNull(),              // ninguna | pista | explicacion | reescritura | solucion
  detail: jsonb("detail").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("evidence_event_user_idx").on(t.organizationId, t.userId) }));

/* 1.22.0 — Formaciones reales que imparte la persona (Google Meet o transcripción subida). Solo se guarda el
 * resultado del análisis: la transcripción nunca se almacena. */
export const trainingSession = pgTable("training_session", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),              // quien formó (y el único evaluado)
  title: text("title").notNull(),
  topic: text("topic"),
  skillKey: text("skill_key"),                    // comp:<id> | curso:<slug> que enseñó
  source: text("source").notNull(),               // subida | meet
  heldAt: timestamp("held_at"),
  score: integer("score"),
  metrics: jsonb("metrics").$type<Record<string, unknown>>(),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("training_session_user_idx").on(t.organizationId, t.userId) }));

// Nivel por competencia (no global): 0 ninguno · 1 En formación · 2 Aplica · 3 Referente · 4 Custodio
export const levelByCompetency = pgTable("level_by_competency", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  competencyId: text("competency_id").notNull(),
  level: integer("level").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byOrg: index("lvl_org_idx").on(t.organizationId),
  uniq: uniqueIndex("lvl_uniq").on(t.organizationId, t.userId, t.competencyId),
}));

export const testAttempt = pgTable("test_attempt", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  pathId: text("path_id").notNull(),
  competencyId: text("competency_id"),
  score: integer("score").notNull(),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("att_org_idx").on(t.organizationId) }));

/* ============================================================
 * VALIDACIÓN (Fase 3): caso práctico aplicado + rúbrica visible + validación humana.
 * Subir a Nivel 2 (Aplica) exige que un nivel 3+/responsable valide el caso. No autoservicio.
 * ============================================================ */
export const rubric = pgTable("rubric", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  competencyId: text("competency_id").notNull(),
  criteria: jsonb("criteria").$type<{ label: string; weight?: number }[]>().notNull(),
  // Correlativo por organización+competencia (1, 2, 3...); no se recalifica una validación
  // histórica cuando cambia la rúbrica futura, así que `validation.rubricId` fija cuál se usó.
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("rubric_org_idx").on(t.organizationId) }));

export const appliedCase = pgTable("applied_case", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  competencyId: text("competency_id").notNull(),
  pathId: text("path_id"),
  prompt: text("prompt").notNull(),
  submission: text("submission"),
  status: text("status").notNull().default("borrador"), // borrador | entregado | aprobado | rechazado
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
}, (t) => ({ byOrg: index("case_org_idx").on(t.organizationId) }));

/**
 * Evidencia polimórfica de un caso práctico o validación: documento/vídeo/audio/enlace/KPI.
 * Sin infraestructura de subida de ficheros propia todavía: `url` apunta a donde ya vive
 * (Drive, YouTube, etc.); cuando haya storage propio, se añade sin romper esto.
 */
export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  ownerType: text("owner_type").notNull(), // applied_case | certificate
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(), // documento | video | audio | url | kpi
  url: text("url"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("evidence_org_idx").on(t.organizationId), byOwner: index("evidence_owner_idx").on(t.ownerType, t.ownerId) }));

export const validation = pgTable("validation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  caseId: text("case_id").notNull().references(() => appliedCase.id, { onDelete: "cascade" }),
  validatorId: text("validator_id").notNull(),
  decision: text("decision").notNull(), // aprobado | rechazado
  feedback: text("feedback"),
  // Rúbrica vigente en el momento de validar (null si la competencia aún no tenía rúbrica publicada).
  rubricId: text("rubric_id").references(() => rubric.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("val_org_idx").on(t.organizationId) }));

/* ============================================================
 * PROPAGACIÓN Y CARRERA (Fase 4): coaching, puntos de temporada, ascenso.
 * Se premia lo que se quiere multiplicar: enseñar a otro hasta que aplica.
 * ============================================================ */
export const coaching = pgTable("coaching", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  coachId: text("coach_id").notNull(),
  learnerId: text("learner_id").notNull(),
  competencyId: text("competency_id").notNull(),
  status: text("status").notNull().default("activo"), // activo | logrado | fallido
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("coach_org_idx").on(t.organizationId) }));

// Puntos de contribución por temporada (separados de los niveles; no desbloquean nada).
export const pointsLedger = pgTable("points_ledger", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  season: text("season").notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  refId: text("ref_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("pts_org_idx").on(t.organizationId) }));

/* ============================================================
 * CONFIG DE EMPRESA + MOTOR DE REGLAS (Fase 5).
 * Cada empresa define sus títulos, certificados y qué recompensa dispara qué.
 * Guardarraíl: recompensas NO salariales por defecto (el primer año).
 * ============================================================ */
export const companyConfig = pgTable("company_config", {
  organizationId: text("organization_id").primaryKey(),
  levelLabels: jsonb("level_labels").$type<Record<string, string>>(), // {"2":"Facturador","3":"Referente"}
  salaryLinked: boolean("salary_linked").notNull().default(false),
  // 1.3.0: los responsables pueden seguir la sesión en directo (siempre con aviso visible al alumno).
  liveSupervision: boolean("live_supervision").notNull().default(true),
  // 1.13.0: ficha de la empresa (oferta, públicos, terminología, herramientas, prioridades, límites). Solo cuenta para
  // tutor, «Para ti» y recursos cuando un responsable la ha validado (profileValidatedAt).
  profile: jsonb("profile").$type<Record<string, unknown>>(),
  profileValidatedAt: timestamp("profile_validated_at"),
  profileValidatedBy: text("profile_validated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rewardRule = pgTable("reward_rule", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  event: text("event").notNull(), // n2 | referente | cobertura
  params: jsonb("params").$type<Record<string, unknown>>(),
  reward: text("reward").notNull(), // certificado | titulo | punto | perk | senal_rrhh
  rewardParams: jsonb("reward_params").$type<Record<string, unknown>>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("rule_org_idx").on(t.organizationId) }));

export const certificate = pgTable("certificate", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  competencyId: text("competency_id"),
  title: text("title").notNull(),
  code: text("code").notNull().unique(), // verificable
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // null = no caduca
  recertifiesId: text("recertifies_id"), // certificado anterior que este renueva
}, (t) => ({ byOrg: index("cert_org_idx").on(t.organizationId) }));

/* ============================================================
 * PLAN DE CARRERA (Fase 4/13): rol → competencias requeridas → siguiente rol.
 * No es un ranking global: cada empresa configura su propia escalera por puesto.
 * ============================================================ */
export const careerPath = pgTable("career_path", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  fromPuestoId: text("from_puesto_id"),
  toPuestoId: text("to_puesto_id").notNull(),
  requirements: jsonb("requirements").$type<{ competencyId: string; minLevel: number }[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("career_org_idx").on(t.organizationId) }));

export const rewardGrant = pgTable("reward_grant", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  ruleId: text("rule_id"),
  reward: text("reward").notNull(),
  refId: text("ref_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("grant_org_idx").on(t.organizationId) }));

/* ============================================================
 * FUNDAE (Fase 7): acción formativa bonificable + control de aprendizaje (teleformación).
 * Verificado en BOE/FUNDAE: ≥2h, relacionada con el puesto, no cert. profesionalidad,
 * finaliza con ≥75% de los controles (no por horas de conexión). Boomatik = proveedor docente.
 * ============================================================ */
export const fundaeAction = pgTable("fundae_action", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  title: text("title").notNull(),
  competencyId: text("competency_id"),
  modalidad: text("modalidad").notNull().default("teleformacion"),
  horas: integer("horas").notNull(),
  relatedPuesto: text("related_puesto"),
  tutorId: text("tutor_id").notNull(),
  esCertProfesionalidad: boolean("es_cert_profesionalidad").notNull().default(false),
  // 1.17.0: expediente — fechas que exige FUNDAE (null = aún no hecho).
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  rltInformedAt: timestamp("rlt_informed_at"),      // información a la representación legal (≥15 días antes)
  fundaeNotifiedAt: timestamp("fundae_notified_at"), // comunicación de inicio (≥2 días naturales antes)
  qualitySurveyAt: timestamp("quality_survey_at"),   // cuestionario de calidad pasado a los participantes
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("fundae_org_idx").on(t.organizationId) }));

export const fundaeParticipation = pgTable("fundae_participation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  actionId: text("action_id").notNull().references(() => fundaeAction.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  controlsTotal: integer("controls_total").notNull(),
  controlsDone: integer("controls_done").notNull().default(0),
  finalizado: boolean("finalizado").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("fundaep_org_idx").on(t.organizationId) }));

/* ============================================================
 * FACTURACIÓN (Stripe) — niveles de precio globales (los fija Boomatik, no cada empresa)
 * + suscripción por empresa. Precio dinámico vía Stripe Checkout `price_data` (no Products/
 * Prices fijos en Stripe): así se puede ajustar el precio por asiento sin tocar Stripe.
 * ============================================================ */
export const pricingTier = pgTable("pricing_tier", {
  tier: text("tier").primaryKey(), // texto | video_corto | inmersivo
  label: text("label").notNull(),
  pricePerSeatCents: integer("price_per_seat_cents").notNull(),
  currency: text("currency").notNull().default("eur"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscription = pgTable("subscription", {
  organizationId: text("organization_id").primaryKey(),
  tier: text("tier").notNull().default("texto"),
  seats: integer("seats").notNull().default(0),
  status: text("status").notNull().default("sin_suscripcion"), // sin_suscripcion|trialing|active|past_due|canceled
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Créditos de creación (1.6.0). 1 crédito = 0,10 €. Monedero por empresa = suma del libro.
// Precio en créditos de cada cosa que se crea; lo edita el superadmin (valores por defecto en la migración 0024).
export const creditPrice = pgTable("credit_price", {
  item: text("item").primaryKey(), // voz_narrada | avatar_estandar | avatar_realista | avatar_propio | clonar_voz | curso_ia
  credits: integer("credits").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Libro de créditos: compras (+), gastos (-), devoluciones (+). Saldo = sum(delta). Solo se inserta.
export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // compra | gasto | devolucion
  item: text("item"),
  ref: text("ref"), // compra: id de la sesión de Stripe (idempotencia) · gasto: referencia del contenido
  userId: text("user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byOrg: index("credit_ledger_org_idx").on(t.organizationId, t.createdAt),
  // Una sesión de Stripe se abona una sola vez aunque el webhook llegue repetido.
  purchaseOnce: uniqueIndex("credit_ledger_purchase_uq").on(t.ref).where(sql`reason = 'compra'`),
}));

// Línea base del piloto: foto del punto de partida para medir el antes/después.
export const baselineSnapshot = pgTable("baseline_snapshot", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("baseline_org_idx").on(t.organizationId) }));

// Ledger de coste IA: una fila por llamada al LLM, tokens reales devueltos por el proveedor
// (nunca estimados). organizationId null = uso a nivel plataforma (p.ej. el orquestador,
// que consulta todas las empresas a la vez, no se le puede facturar a una sola).
export const aiUsage = pgTable("ai_usage", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id"),
  userId: text("user_id"),
  kind: text("kind").notNull(), // chat | exam | case | lesson | orchestrator
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byOrg: index("ai_usage_org_idx").on(t.organizationId),
  byCreated: index("ai_usage_created_idx").on(t.createdAt),
}));

// Roleplay conversacional: la IA hace de personaje (cliente dificil, jefe, etc.) para practicar
// sin riesgo real. Transcripcion completa en la propia fila (conversaciones cortas, no hace
// falta una tabla de mensajes aparte). La decision de "lo hizo bien" la sigue tomando un humano
// via validation.ts -- el resumen aqui es apoyo, nunca una aprobacion automatica.
export const roleplaySession = pgTable("roleplay_session", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  competencyId: text("competency_id").notNull(),
  persona: text("persona").notNull(),
  status: text("status").notNull().default("activo"), // activo | cerrado
  transcript: jsonb("transcript").$type<{ role: "user" | "assistant"; content: string }[]>().notNull().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  // 1.2.0 (evaluación): de qué curso sale el roleplay, tema legible, valoración orientativa 0-10,
  // feedback completo y la entrevista previa (preguntas y respuestas reales del alumno).
  source: text("source"),
  topic: text("topic"),
  score: integer("score"),
  feedback: jsonb("feedback").$type<Record<string, unknown>>(),
  interview: jsonb("interview").$type<{ q: string; a: string }[]>(),
}, (t) => ({ byOrg: index("roleplay_org_idx").on(t.organizationId) }));

/* Evaluación por bloques y examen final de un curso (1.2.0). Las preguntas guardan la clave de
 * corrección y NUNCA se envían tal cual al cliente. kind: block | final. block = -1 en el final. */
export const assessmentAttempt = pgTable("assessment_attempt", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(), // slug del curso
  kind: text("kind").notNull(),
  block: integer("block").notNull().default(-1),
  questions: jsonb("questions").$type<Record<string, unknown>[]>().notNull(),
  answers: jsonb("answers").$type<unknown[]>(),
  results: jsonb("results").$type<Record<string, unknown>[]>(),
  score: integer("score"),
  passed: boolean("passed"),
  status: text("status").notNull().default("abierto"), // abierto | corregido | caducado
  assignmentId: text("assignment_id"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  deadlineAt: timestamp("deadline_at"),
  submittedAt: timestamp("submitted_at"),
  gradedAt: timestamp("graded_at"),
}, (t) => ({ byUser: index("assess_org_user_src_idx").on(t.organizationId, t.userId, t.source) }));

// Foto diaria de las metricas del panel (una por empresa y dia). A diferencia de baselineSnapshot
// (el "antes" del piloto, capturado a mano una vez), esta se captura sola -- sin cron ni cola de
// trabajos: se toma de paso la primera vez que alguien pide el panel (propio o superadmin) ese dia.
// Es lo unico que hace falta para poder dibujar una evolucion en vez de un numero suelto.
export const analyticsSnapshot = pgTable("analytics_snapshot", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD, para el uniqueIndex (una fila por empresa y dia)
  memberCount: integer("member_count").notNull(),
  avgCoveragePct: real("avg_coverage_pct").notNull(),
  criticalRisks: integer("critical_risks").notNull(),
  internalTransfer: real("internal_transfer").notNull(),
  timeToAutonomyDays: real("time_to_autonomy_days").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
}, (t) => ({
  byOrg: index("snap_org_idx").on(t.organizationId),
  oncePerDay: uniqueIndex("snap_org_day_uidx").on(t.organizationId, t.day),
}));

export const schema = {
  user, session, account, verification, organization, member, invitation,
  sector, puesto, competency, learningPath, lesson,
  ragDocument, ragChunk, agentThread, agentMessage, auditLog,
  onboardingProfile, enrollment, levelByCompetency, testAttempt,
  rubric, appliedCase, validation, evidence,
  coaching, pointsLedger,
  companyConfig, rewardRule, certificate, rewardGrant, careerPath,
  fundaeAction, fundaeParticipation,
  pricingTier, subscription, creditPrice, creditLedger,
  baselineSnapshot, aiUsage, roleplaySession, analyticsSnapshot, assessmentAttempt,
};

/* Anotaciones del alumno sobre el curso (subrayar, nota, pregunta, repasar). Por org + usuario. */
export const annotation = pgTable("annotation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  card: integer("card").notNull().default(0),
  cardTitle: text("card_title"),
  kind: text("kind").notNull(),
  quote: text("quote"),
  body: text("body"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byUserSrc: index("annotation_user_src").on(t.organizationId, t.userId, t.source) }));

/* Team DNA: foto de fortalezas del usuario (arquetipo + pesos por familia). Una fila por usuario/org. */
export const teamDna = pgTable("team_dna", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  primary: text("primary").notNull(),
  secondary: text("secondary").notNull(),
  archetype: text("archetype").notNull(),
  near: jsonb("near").$type<string[]>().notNull().default([]),
  answers: jsonb("answers").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ byUser: uniqueIndex("team_dna_user_uidx").on(t.organizationId, t.userId) }));

/* Team DNA v2: perfil combinado (eneagrama + Big Five + Hexad + preferencias pedagógicas).
 * answers se guarda sobre la marcha (reanudable); result/brief solo al terminar. Una fila por usuario/org. */
export const teamProfile = pgTable("team_profile", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  answers: jsonb("answers").$type<Record<string, number>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  brief: text("brief"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ byUser: uniqueIndex("team_profile_user_uidx").on(t.organizationId, t.userId) }));

/* Equipos (1.16.0, auditoría 28-09): a quién acompaña cada responsable (coach, team leader). El alcance «mi equipo»
 * se resuelve con estas asignaciones (más las relaciones de coaching); sin asignaciones es vacío, nunca toda la empresa. */
export const teamAssignment = pgTable("team_assignment", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  managerUserId: text("manager_user_id").notNull(),
  learnerUserId: text("learner_user_id").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex("team_assignment_uidx").on(t.organizationId, t.managerUserId, t.learnerUserId) }));

/* Ficha viva del alumno (1.12.0): lo que sabemos de él para adaptar su formación, cada dato con fuente, evidencia y
 * estado. PRIVADA del alumno: no se muestra a responsables ni entra en métricas de empresa (las capacidades acreditadas
 * viven en level_by_competency). El alumno la ve, la confirma, la corrige o retira datos en /app/ficha.html. */
export const learnerFact = pgTable("learner_fact", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  // contexto | objetivo | caso | competencia | preferencia | estrategia | aplicacion | ensenanza
  layer: text("layer").notNull(),
  text: text("text").notNull(),
  // declarado | observado | inferido | confirmado | desactualizado
  status: text("status").notNull().default("declarado"),
  // bienvenida | tutor | practica | para_ti | test | validacion | alumno
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  evidence: text("evidence"),
  scope: text("scope"),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ byUser: index("learner_fact_user_idx").on(t.organizationId, t.userId, t.active) }));

/* Resultados de YouTube cacheados por tema, para no golpear la cuota de la API en cada carga.
 * pinned queda sin usar aun: hueco para cuando haya curacion manual desde la Consola. */
export const videoCache = pgTable("video_cache", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  sortType: text("sort_type").notNull(),
  videos: jsonb("videos").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (t) => ({ byTopicSort: uniqueIndex("video_cache_topic_sort_uidx").on(t.topic, t.sortType) }));

/* Reproducciones internas de video dentro de SkillUp (slider "Brandooers Favs" = popularidad real del equipo). */
export const videoEvent = pgTable("video_event", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  youtubeId: text("youtube_id").notNull(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail").notNull(),
  lang: text("lang"), // idioma de la selección donde se vio (1.5.0); null = anterior a 1.5.0 (todo era español)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byYoutubeId: index("video_event_youtube_idx").on(t.youtubeId) }));

// Estudio de ROI (metodología Phillips) de una empresa: SOLO datos que introduce su admin/dirección
// (costes completos, métricas de negocio antes/después o con grupo de control, aislamiento y
// confianza, intangibles). Sin fila o con campos vacíos = "sin datos", nunca un valor por defecto.
// Una fila por empresa (el periodo del estudio va dentro).
export const roiStudy = pgTable("roi_study", {
  organizationId: text("organization_id").primaryKey(),
  periodStart: text("period_start"), // YYYY-MM-DD o null (todo el histórico)
  periodEnd: text("period_end"),
  costs: jsonb("costs").$type<Record<string, number | null>>().notNull().default({}),
  impacts: jsonb("impacts").$type<Record<string, unknown>[]>().notNull().default([]),
  intangibles: jsonb("intangibles").$type<string[]>().notNull().default([]),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* Actividad en directo (1.3.0): latido ligero y eventos de las páginas de aprendizaje. Sin grabación de
 * pantalla, teclado ni cámara: solo página, curso, sección, % de lectura, tiempo activo y acciones
 * (vídeo, test, roleplay, mensaje). Se conserva 90 días como máximo (services/activity.ts, RETENTION_DAYS).
 * kind: hb (latido) | page | section | video | quiz_start | quiz_end | roleplay_start | roleplay_turn |
 *       roleplay_end | chat_msg | nudge (aviso de un responsable) | notice (el alumno leyó el aviso de supervisión). */
export const activityEvent = pgTable("activity_event", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  page: text("page"),
  source: text("source"),
  section: integer("section"),
  sectionTitle: text("section_title"),
  scrollPct: integer("scroll_pct"),
  activeSec: integer("active_sec").notNull().default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byOrgTime: index("activity_org_time_idx").on(t.organizationId, t.createdAt),
  byUserTime: index("activity_org_user_time_idx").on(t.organizationId, t.userId, t.createdAt),
}));

/* Feedback (1.4.0): valoración de cada respuesta de la IA (pulgar arriba/abajo con motivos) y sugerencias generales
 * de cualquier rol. Acotado por empresa. kind: rating | general. Un voto por persona y respuesta: target_key único
 * por (empresa, persona) — msg:<id de agent_message> o ref:<referencia de la página>. El superadmin lo gestiona
 * (estado, nota de resolución) y la persona ve el aviso cuando se resuelve (user_seen_at). */
export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(), // rating | general
  type: text("type"), // general: sugerencia | error | contenido | otro
  rating: text("rating"), // rating: up | down
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  comment: text("comment"),
  targetKey: text("target_key"),
  messageId: text("message_id"),
  answerText: text("answer_text"),
  promptText: text("prompt_text"),
  page: text("page"),
  course: text("course"),
  block: text("block"),
  agent: text("agent"),
  role: text("role"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("nuevo"), // nuevo | en_revision | resuelto | descartado
  resolverId: text("resolver_id"),
  resolverName: text("resolver_name"),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamp("resolved_at"),
  userSeenAt: timestamp("user_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  oneVote: uniqueIndex("feedback_vote_uq").on(t.organizationId, t.userId, t.targetKey),
  byOrgTime: index("feedback_org_time_idx").on(t.organizationId, t.createdAt),
}));

// Traducción automática de secciones de curso (1.5.0). Una fila por (curso, sección, idioma, hash del HTML de
// origen): cada sección se traduce UNA vez para toda la plataforma y se invalida sola si cambia el original.
export const contentTranslation = pgTable("content_translation", {
  id: text("id").primaryKey(),
  course: text("course").notNull(),
  section: integer("section").notNull(),
  lang: text("lang").notNull(),
  srcHash: text("src_hash").notNull(),
  html: text("html").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ oneRow: uniqueIndex("content_translation_uq").on(t.course, t.section, t.lang, t.srcHash) }));
