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
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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

export const schema = {
  user, session, account, verification, organization, member, invitation,
  sector, puesto, competency, learningPath, lesson,
  ragDocument, ragChunk, agentThread, agentMessage, auditLog,
};
