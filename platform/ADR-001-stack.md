# ADR-001 — Stack de la app SkillUp (Fase 0)

Fecha: 2026-09-01 · Estado: aceptado y vigente

> **Actualización 2026-09-30:** la decisión de este ADR (Postgres+Drizzle, better-auth+organization,
> RAG propio, Hono, frontend HTML sin reescribir) sigue en pie tal cual. Lo que ha cambiado es el
> alcance: Fase 0 quedó cerrada hace tiempo — hoy en producción hay validación humana con rúbricas
> versionadas, niveles por competencia, FUNDAE (acción+participación+export), auditoría, créditos,
> Team DNA, ficha viva del alumno y el arranque del modelo de capacidad V2 (course↔competency,
> next best step). Ver el CHANGELOG del README para el detalle por versión; este documento describe
> la decisión de arquitectura de fondo, no el estado funcional (que cambia cada semana).

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
