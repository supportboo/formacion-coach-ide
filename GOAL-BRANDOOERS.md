# GOAL ejecutable — Brandooers · SkillUp: de lo que hay a una app en funcionamiento

> Plan de desarrollo por fases. Cada fase: objetivo · entregables · conexiones · criterios de aceptación (validación) · tests. Modelo de producto/negocio en `MODELO-BRANDOOERS.md`. Estado visual en `estrategia-brandooers.excalidraw` (verde/amarillo/rojo) y `organigrama-brandooers.excalidraw`.
> **Puerta de salida (validación final):** regenerar `gen_estrategia.py` con TODOS los bloques en verde solo cuando cada uno esté construido, con test pasando y criterio de aceptación cumplido. No se pinta verde nada que no esté probado.
> **Honesto:** esto es el plan, no está ejecutado. La estimación es orientativa.

## Estado actual (punto de partida real)
- Público: `brandooers.html` (estático, en prod vía VPS nginx). ✅
- App SkillUp: HTML estáticos (`hub`, `skillup`, `crear-curso`, `dashboard`, `onboarding`, `panel`, `insights`, `usuarios`, `equipo`, `revisiones`) + `account.js`, `feedback.js`, `personalization.js`, `profile.js`.
- Backend: Node `server/` + `affiliate/server.mjs` (http nativo). Endpoints: `/api/onboard`, `/api/personalize`, `/api/exam`, `/api/coach/me`, `/api/coach/team`, `/api/progress`, `/api/apply`, `/api/mis-cursos`, `/api/view`, `/api/feedback`, `/api/track`, `/auth/*`, `/api/admin/*`, `/api/push/*`, `/auth/lead`.
- **Persistencia: ficheros JSON (`leads.jsonl`, appendFileSync).** No hay base de datos relacional.
- IA: Anthropic (Haiku onboard, Sonnet personalize).

## FASE 0 — Decisión de arquitectura (bloqueante)
El modelo exige multi-tenant (empresas), roles, competencias, validaciones, niveles por competencia, puntos con antifraude, certificados, auditoría, presupuesto y export FUNDAE. **Ficheros JSON no aguantan integridad, concurrencia ni auditoría.**
- **Recomendación:** adoptar la capa de datos canónica BOO para la APP → **PostgreSQL + Drizzle ORM + better-auth (plugin organization, multi-tenant) + Redis/BullMQ** para lo asíncrono (generación IA, notificaciones, export). El sitio público sigue estático. La app (`skillup.brandooers.com`) pasa a app real.
- **Alternativa (no recomendada):** seguir con Node bespoke + JSON → deuda técnica que revienta en la Fase 3.
- **Decisión de Marc requerida** antes de la Fase 1. Recomendado: stack canónico.
- Aceptación: ADR corto firmado (`architecture/ADR-001-stack.md`).

## FASE 1 — Infraestructura y fundaciones
Objetivo: base multi-tenant sobre la que construir todo.
- Postgres + Redis en el VPS (o gestionado) · backups diarios · `.env.local` (secrets fuera de git).
- **better-auth** con `organization`: `Company` (org, tenant), `User`, `Membership(role)`. Roles: `empleado · coach · team_leader · inspirador · admin · direccion`.
- **Esquema Drizzle (núcleo):** Company, User, Membership, Sector, Puesto, Competency, LearningPath, Lesson(`fuente`,`fecha_revision`), KnowledgeTest, AppliedCase, Rubric, Validation, LevelByCompetency, PointsLedger(season), RewardRule, Plan/Budget, Certificate, AuditLog, FundaeAction(participation, controls).
- Deploy: git pull en VPS (ya existe) + migraciones Drizzle + `pm2`/systemd para el server + nginx (ya sirve).
- **Multi-tenant:** toda query filtra `organizationId` (regla canónica).
- Conexiones: Anthropic API (existe), email transaccional, push (existe).
- Aceptación: crear una empresa + usuarios con roles distintos y aislar datos entre dos empresas.
- Tests: aislamiento multi-tenant (empresa A no ve datos de B) · auth por rol · migraciones idempotentes.

## FASE 2 — Núcleo de aprendizaje (endurecer lo que ya existe)
Objetivo: onboarding → ruta → test → badge N1, sobre la DB.
- Onboarding entrevista (por qué/para qué/sector/puesto) — reusar `/api/onboard`, persistir perfil.
- Generación de ruta + lecciones + test (reusar `/api/personalize`), cada lección con `fuente`+`fecha_revision` (doctrina certeza).
- Test de conocimiento autocorregido → desbloquea **Nivel 1 (En formación)**.
- Conexiones: Anthropic (Haiku/Sonnet) vía cola BullMQ (generación >2s), con rate-limit y coste por empresa.
- Aceptación: un empleado completa onboarding y obtiene ruta a su puesto + test que desbloquea N1.
- Tests: el test corrige bien · la generación respeta tope de coste · toda lección tiene fuente+fecha.

## FASE 3 — Validación (el núcleo diferencial) 🔴
Objetivo: certificar capacidad aplicada, no asistencia.
- **Caso práctico aplicado** con **rúbrica visible** desde el inicio, generado con el contexto real del alumno.
- **Workflow de validación humana:** el coach/team leader (nivel acreditado) revisa contra la rúbrica → aprueba/deniega con feedback. Extiende `/api/coach`.
- **Doble revisión** para el salto a Referente (nivel 3).
- **Gate progreso + coste:** si no valida el caso actual, no avanza NI genera contenido nuevo (tope de gasto IA ligado a validación; ampliar el "daily cost cap" existente).
- Reintentos con espera configurable; intentos fallidos no visibles a terceros.
- Aceptación: un caso se valida por un nivel 3+, el alumno sube a N2; sin validar, queda bloqueado y no consume IA.
- Tests: no se sube de nivel sin validación · el gate corta la generación · la rúbrica se publica antes del ejercicio.

## FASE 4 — Propagación y carrera 🔴
Objetivo: que el conocimiento se quede y se multiplique (organigrama).
- **Niveles por competencia:** En formación · Aplica · Referente.
- **Cascada de roles:** Coach · Coach de coaches · Inspirador (equipos de empuje). Solo se coachea donde se es referente.
- **Puntos de temporada** (contribución, separados de niveles) + **antifraude:** topes de alumnos por coach, multiplicadores por dificultad (novato en competencia crítica / otro departamento), auditoría por muestreo, el estatus (no los puntos) cae si se valida a la ligera.
- Aceptación: un referente forma a alguien que llega a N2 y libera puntos solo cuando el alumno aprueba; el antifraude limita volumen.
- Tests: puntos por enseñar se liberan solo al aprobar el alumno · niveles ≠ puntos (no se compran) · tope por coach.

## FASE 5 — Configuración de empresa + motor de reglas 🔴
Objetivo: adaptable a cualquier casuística.
- **Config de empresa:** títulos y niveles con su nombre, competencias por puesto, roles (incl. Inspirador).
- **Motor de reglas de recompensa:** disparador (competencia validada / cobertura X / coachear a N) → resultado (certificado · título · punto · perk · señal a RR. HH.). Cubre "sube a todos / por logros / a demanda".
- **Certificados** verificables (con evidencia detrás), portables. Default de recompensa **no salarial** el primer año.
- Aceptación: dos empresas configuran políticas opuestas y el motor las ejecuta correctamente.
- Tests: una regla dispara el resultado correcto · certificado verificable · no hay recompensa salarial automática por defecto.

## FASE 6 — Panel ROI 🔴
Objetivo: convertir capacidad en ROI medible (el salpicadero).
- Métricas: **cobertura por competencia · riesgo de dependencia (alerta 1 sola persona) · coste de formar al siguiente · tiempo hasta autonomía · transferencia interna.**
- **Línea base** capturada al inicio del piloto (para el "antes/después").
- Vistas por Dirección y por Team Leader (copiloto de dos caras).
- Aceptación: al cerrar un piloto, el panel muestra el delta vs línea base sin cifras inventadas.
- Tests: cálculo de cobertura correcto · alerta de riesgo cuando competencia crítica = 1 referente · el panel nunca muestra "cursos completados" como KPI.

## FASE 7 — FUNDAE 🔴 (España)
Objetivo: que la empresa cliente pueda bonificar (verificado, ver `MODELO` §8).
- Modelo de **acción formativa** (≥2 h, relacionada con puesto, no cert. de profesionalidad).
- **Seguimiento justificable de teleformación:** controles de aprendizaje (finalización con ≥75 % de controles), registro de participación, tutor-formador = coach interno, ratio 1/80.
- **Export** de la documentación para que la empresa comunique como "empresa bonificada"; conservación 4 años.
- Boomatik = **proveedor docente** (no entidad organizadora, salvo que se inscriba en el Registro Estatal).
- Aceptación: generar el paquete justificativo de una acción de teleformación conforme a los mínimos.
- Tests: acción <2 h rechazada · export incluye controles+tutor+participación · marca las que conducen a cert. de profesionalidad (excluidas).
- Gate legal: revisar el paquete con FUNDAE/entidad organizadora antes de venderlo.

## FASE 8 — Negocio y cobro 🔴 (diferible hasta producto vendible)
- Plan/precio por empresa · gobernado por validación (tope de gasto) · seguimiento de la garantía del piloto.
- Cobro real (Stripe u otro) **diferido**: los primeros pilotos van por relación directa, sin precio público.
- Aceptación: alta de un plan con topes y seguimiento del piloto de 90 días.

## FASE 9 — Calidad, seguridad y validación final
- **Tests unitarios** en los caminos críticos: dinero/plan, auth, **aislamiento multi-tenant**, validación, gate de coste, antifraude de puntos, export FUNDAE.
- **E2E** del flujo de valor: onboarding → aprende → demuestra → valida → panel.
- **Seguridad:** aislamiento por tenant, rate-limit en endpoints LLM, RGPD/LOPD (datos de empleados), secretos fuera de git, headers.
- **Validación final = regenerar el diagrama de estrategia todo en verde**, con el registro de qué test/criterio respalda cada bloque.

## Conexiones externas (mapa)
Anthropic (generación) · Postgres/Redis (datos/cola) · email transaccional · push (existe) · FUNDAE (export justificativo) · Stripe (diferido) · Odoo/Boomatik CRM (opcional, leads) · brandooers.com ↔ skillup.brandooers.com (formulario de lead cross-domain: hoy `mailto`, pendiente endpoint real).

## Mejoras que detecto de mi propio trabajo (autocrítica)
1. **`mailto:` → formulario real** a `/auth/lead`. Problema a resolver: el endpoint vive en el vhost de skillup, no en brandooers.com (redirige). Hay que exponer un endpoint de lead en el vhost de brandooers o resolver CORS.
2. **JSON files → Postgres** (leads.jsonl no es durable ni concurrente).
3. **Baseline del piloto:** sin medir el "antes" no hay ROI honesto; capturarlo es requisito, no opción.
4. **Gate de coste por alumno:** hoy solo hay tope diario global; falta ligarlo a la validación individual.
5. **Doctrina certeza en el dato:** `fuente`+`fecha_revision` como campos obligatorios de cada lección; sin ellos no se publica.
6. **Regla de voz:** ningún término de mecánica (niveles/coaches/puntos) puede filtrarse al sitio público.
7. **Guardarraíl salarial:** el motor de reglas por defecto NO ata a nómina el primer año.
8. **Coherencia home:** unificado el mensaje en torno al "piloto de 90 días + garantía" (hecho).
