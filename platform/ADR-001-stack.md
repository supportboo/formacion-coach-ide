# ADR-001 — Stack de la app SkillUp (Fase 0)

Fecha: 2026-09-01 · Estado: aceptado (pendiente de OK final de Marc)

## Contexto
El modelo (`MODELO-BRANDOOERS.md`) exige multi-tenant (empresas), roles, competencias, validaciones, niveles, puntos con antifraude, certificados, auditoría, presupuesto y export FUNDAE. La app actual guarda datos en ficheros JSON (`leads.jsonl`), que no aguantan integridad, concurrencia ni auditoría.

## Decisión
- **Datos:** PostgreSQL + Drizzle ORM. Multi-tenant por `organizationId` en cada tabla.
- **Auth/organización:** better-auth + plugin `organization`. El mismo modelo sirve de 1 usuario a multinacional.
- **RAG:** propio, embeddings pluggables (dev/openai) + store en Postgres (coseno en app). Mejora futura: pgvector.
- **Agentes:** framework por rol (registry), conversacional, con contexto RAG y LLM Anthropic (mock sin clave).
- **API:** Hono (ligero). El **frontend público y la app siguen siendo HTML estático** que consumen esta API — NO se reescribe a Next.js en Fase 0 (lo que ya funciona no se rehace).

## Alternativas descartadas
- Seguir con Node bespoke + JSON: deuda técnica que revienta al llegar a validaciones/puntos/auditoría.
- Migrar todo el frontend a Next.js ahora: coste enorme, sin valor en Fase 0; el HTML actual funciona y está desplegado.

## Consecuencias
- Requiere un Postgres (hay uno local en :5432; en el VPS habrá que aprovisionarlo).
- La deuda de "ficheros JSON → Postgres" se paga aquí (ver `GOAL-BRANDOOERS.md`, autocrítica).
- Desvío consciente del "Next.js 16" del stack canónico BOO, justificado: el frontend ya existe en HTML y Fase 0 es backend/datos/agentes.
