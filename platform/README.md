# SkillUp platform — Fase 0

Infraestructura de la app Brandooers · SkillUp: multi-tenant + RAG + agentes conversacionales por rol.

## Stack
- **Postgres + Drizzle ORM** (datos, multi-tenant por `organizationId`).
- **better-auth** con plugin `organization` (una empresa = una organización; escala de 1 usuario a multinacional).
- **RAG** propio: embeddings pluggables (`dev` offline / `openai`) + store en Postgres (coseno en app; pgvector como mejora).
- **Agentes** por rol del organigrama (empleado, coach, team_leader, inspirador, admin, direccion), conversacionales, con contexto RAG. LLM: Anthropic (Sonnet 4.6 / Haiku 4.5), con mock sin clave.
- **Hono** (API HTTP).

## Puesta en marcha
```bash
cd platform
npm install
cp .env.example .env.local     # rellena DATABASE_URL (Postgres local en :5432)
npm run db:generate            # genera el SQL de migración desde el esquema
npm run db:migrate             # aplica migraciones (requiere DATABASE_URL válido)
npm run dev                    # arranca en :8080
```

## Verificación
```bash
npm run typecheck              # el código compila
npm test                      # tests unitarios (RAG + agentes, offline)
curl localhost:8080/health     # {"ok":true}
```

## Endpoints (Fase 0)
- `GET  /health`
- `ALL  /api/auth/*` — better-auth (registro/login/organización/invitaciones).
- `POST /api/agent/chat` — turno con el agente del rol. Body: `{ message, threadId?, role? }`.
- `POST /api/rag/ingest` — ingesta contenido al RAG (admin/inspirador). Body: `{ title, text, kind?, refId? }`.

## Autenticación en dev
Con `DEV_AUTH=true`, pasa cabeceras `X-Org-Id`, `X-User-Id`, `X-Role` (y opcional `X-Org-Name`, `X-User-Name`). En producción se usa la sesión de better-auth + organización activa. Nunca dejar `DEV_AUTH=true` en producción.

## Qué es esto y qué NO
Es la **Fase 0** del `GOAL-BRANDOOERS.md`: los cimientos (datos, auth, RAG, agentes) sobre los que las fases 1-9 montan validación, niveles, panel ROI, FUNDAE, etc. No incluye aún esas funcionalidades.
