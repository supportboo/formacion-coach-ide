import {
  pgTable, text, timestamp, boolean, integer, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

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
  role: text("role").notNull().default("empleado"),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("thread_org_idx").on(t.organizationId) }));

export const agentMessage = pgTable("agent_message", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  threadId: text("thread_id").notNull().references(() => agentThread.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // user | agent
  content: text("content").notNull(),
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

// Línea base del piloto: foto del punto de partida para medir el antes/después.
export const baselineSnapshot = pgTable("baseline_snapshot", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
}, (t) => ({ byOrg: index("baseline_org_idx").on(t.organizationId) }));

export const schema = {
  user, session, account, verification, organization, member, invitation,
  sector, puesto, competency, learningPath, lesson,
  ragDocument, ragChunk, agentThread, agentMessage, auditLog,
  onboardingProfile, enrollment, levelByCompetency, testAttempt,
  rubric, appliedCase, validation, evidence,
  coaching, pointsLedger,
  companyConfig, rewardRule, certificate, rewardGrant, careerPath,
  fundaeAction, fundaeParticipation,
  pricingTier, subscription,
  baselineSnapshot,
};
