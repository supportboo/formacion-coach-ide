# SkillUp V2 — sistema operativo de capacidad interna

Plan técnico del 29-09-2026, construido sobre el repo real (`platform/`, versión 1.18.0) a partir del análisis de ASTRA. Cambia la lógica del producto de

`usuario → perfil → curso → la IA adapta cosas`

a

`persona → estado de capacidad → experiencia siguiente → evidencia → estado actualizado`.

El curso deja de ser la unidad principal: la unidad es la **capacidad de la persona**, y cada avance sabe por qué existe.

## 1. Principios (no negociables)

1. **Evidencia antes que opinión.** Todo número que ve alguien sale de evidencias concretas y enseña su «¿por qué?». Reglas fijas y explicables, nunca un modelo opaco que decida niveles.
2. **La IA ayuda, las personas deciden.** Nivel oficial N0-N4 solo por reglas fijas y validación humana (ver `REGLAMENTO-IA.md`).
3. **Una sola fuente de verdad.** Lo que ya está registrado (tests, roleplays, casos, seguimientos, acompañamientos) no se copia a otra tabla: se deriva. Solo se guardan como evidencias nuevas las que no existen en ningún otro sitio.
4. **La persona controla su memoria.** Ve, corrige y retira lo que se sabe de ella; decide qué es privado y qué se comparte.
5. **Migración aditiva.** Solo tablas y columnas nuevas, SQL idempotente, nada se reescribe ni se borra; cada fase se puede desplegar sola con `deploy.sh`.

## 2. Qué hay hoy y qué cambia

| Punto de ASTRA | Estado | Dónde |
|---|---|---|
| P0 de seguridad (tests/N1, equipos, superadmin) | **Hecho** 1.16.0 | `aiContent.ts`, `teams.ts`, `http/context.ts` |
| Ficha viva visible, corregible, con fuente y cita | **Hecho** 1.12.0 | `learnerFacts.ts`, `ficha.html` |
| Estado de capacidad por competencia (conocimiento, aplicación, autonomía, transferencia, confianza, vigencia, siguiente paso) | **Hecho** 1.18.0 (fase 1) | `capability.ts`, `ficha.html`, `inicio.html` |
| Cursos conectados a competencias | **Hecho** 1.18.0: antes lo hecho en un curso no subía nunca la capacidad | `course_competency`, Panel |
| Conversaciones privadas, discrepancias con el coach | **Hecho** 1.17.0 | `activity.ts`, `container.ts` |
| Expediente FUNDAE, pagos, voz, borrado completo | **Hecho** 1.17.0 | `fundae.ts`, `billing.ts`, `privacy.ts` |
| Afiliación siempre la última | **Hecho**: `AFFILIATE_BOOST = 0`, la comisión nunca cambia el orden | `config/affiliates.ts` |
| Checkpoints por módulo, entregable y «¿qué tal fue?» | **Parcial** 1.15.0: falta la variedad de microinteracciones y el presupuesto cognitivo | fase 6 |
| Onboarding progresivo que devuelve valor enseguida | **Parcial** 1.14.0: empieza por la situación real y una micropráctica; falta repartir el Team DNA a lo largo de los módulos | fase 6 |
| Pantalla de preparación honesta | **Hecho** 1.15.0: dice con qué datos reales se prepara, sin teatro | `curso.html` |
| Skill Graph, grafo de evidencias de primera clase, memoria en tres capas, `profile_version`, modo demostración, teach-back, mapa de resiliencia, roleplay con estado, repaso por errores, experimento controlado, calidad y trazabilidad del contenido | **Por hacer** | fases 2-10 |

## 3. Modelo de objetos

### 3.1 Skill (competencia ampliada)
Hoy `competency` (id, name, puestoId, critical). Se amplía con columnas y una tabla de relaciones:

- `competency.concepts jsonb` — conceptos (problema, impacto, urgencia…).
- `competency.behaviors jsonb` — comportamientos observables (hace preguntas abiertas, cuantifica impacto…). Son lo que miden rúbricas, roleplays y casos.
- `competency.evidence_types jsonb` — qué evidencias acepta (test, roleplay, reunión real, revisión humana).
- `skill_relation (org, from_id, to_id, kind: prerrequisito | transferible)`.
- `course_competency` (hecho) + `block_concept (source, block, concept)`: qué conceptos trabaja cada bloque, para que los errores de un test se conviertan en «le cuesta X».

### 3.2 Evidence (grafo de evidencias)
Vista unificada con dos orígenes:

- **Derivadas** (hecho, `capability.ts#collect`): test de bloque, examen final, micropráctica, roleplay, caso validado, aplicación real, acompañamiento.
- **Nativas**, tabla nueva `evidence_event` solo para lo que no existe en otra tabla (teach-back, modo demostración, microcheckpoints, repasos, ayuda entre compañeros):

```
evidence_event: id, org, user_id, skill_key, type, dimension, context (caso usado), difficulty,
                score, independence (guiado | asistido | independiente | enseñó), ai_help (ninguna | pista |
                explicación | reescritura | solución), validator_id, artifact_ref, created_at
```

`independence` y `ai_help` hacen que dos casos aprobados dejen de valer lo mismo y permiten mostrar **«con apoyo: N2 · sin apoyo: N1»**.

### 3.3 UserSkillState
No se guarda: se calcula al vuelo (`statesOf`) y es barato (una persona, decenas de filas). Solo si un panel de empresa lo necesita para cientos de personas se añade `user_skill_state` como caché con `computed_at`, recalculada por cola BullMQ. Separa siempre:

- **Nivel oficial** N0-N4 (`level_by_competency`, nunca baja, reglas actuales).
- **Dimensiones** 0-100 con su porqué.
- **Confianza** (cuántas evidencias, de cuántos tipos, revisadas por una persona, repartidas en el tiempo, recientes).
- **Vigencia**: alta ≤30 días, media ≤120, baja después. La capacidad no desaparece; baja la confianza en que siga viva → reto de refresco.

### 3.4 ProfileFact (ficha viva) y memoria en tres capas
`learner_fact` ya es el `profile_fact` de ASTRA (capa, texto, estado, fuente, cita, alcance, caducidad). Se añaden:

- `visibility`: `privado` (solo persona y tutor) · `formacion` (personalización y evaluación) · `empresa` (conocimiento aprobado para reutilizar). Pasar de una capa a otra es siempre una acción explícita de la persona («Compartir como buena práctica»), anonimizada y revisada.
- `sensitivity`: `trabajo` · `personal`.
- `allowed_uses text[]`: ejemplos, roleplay, evaluación, resumen para responsable.
- `profile_revision (user, version, changed_fact_id, impact: bajo | medio | alto, at)`: da el `profile_version`. Cada contenido generado guarda la versión para la que se hizo; **solo un cambio de impacto alto** invalida lo generado (cambiar «prefiero escuchar» no rehace un caso comercial; «ahora trabajo con distribuidores industriales» sí). Hoy `adapt.ts` rehace con cualquier cambio del texto (hash): la fase 5 lo sustituye.
- Excepciones por competencia en preferencias: «en general practicar primero, en negociación ver antes el ejemplo».
- Casos reales (`layer = caso`) con «Seguir usando / No volver a usar».
- En el chat: **«Solo para mi tutor»** por mensaje. No va al responsable, ni a analítica, ni al RAG de la empresa, ni a informes.

### 3.5 Memory Policy Engine (cortafuegos de memoria)
Un único módulo `policy.ts` decide qué dato puede ir a qué uso. Todo lo que construye un prompt o una pantalla pasa por `retrieveContext(user, task)`, que devuelve solo lo relevante para esa tarea (puesto, competencia, nivel en ella, caso relacionado, últimos errores, preferencia pertinente), nunca toda la memoria: menos tokens, menos exposición, más precisión.

| Dato | Tutor | Test | Responsable | RAG empresa |
|---|---|---|---|---|
| Puesto | sí | sí | sí | no |
| Objetivo | sí | sí | si la persona lo comparte | no |
| Caso de cliente | sí | sí | no | solo anonimizado y aprobado |
| Freno personal | sí | no | no | no |
| Team DNA | sí | no | solo el arquetipo | no |
| Resultados y evidencias | sí | sí | sí | solo agregados |
| Mensaje «solo para mi tutor» | sí | no | no | no |

### 3.6 Practice y Transfer
- `practice (id, skill_key, kind, cost, template)`: los 7 tipos de microinteracción (elegir, completar, ordenar, detectar fallo, aplicarlo a tu caso, predecir, explicar) con su **coste cognitivo** (elegir 1 · ordenar 1 · frase 2 · reflexión 3 · roleplay 5 · caso real 8). Cada sesión tiene presupuesto (corta 5 · normal 10 · intensa 18) según la disponibilidad semanal declarada.
- `knowledge_transfer (from_user, to_user, skill_key, kind: acompañamiento | consulta | teach_back, outcome, at)`: amplía `coaching` para medir al coach como multiplicador (acompañados, cuántos llegan a autonomía, tiempo medio, retención a 60 días) y para el «marketplace» interno de expertise («pedir 15 minutos a Ana»).

## 4. Permisos

- **La persona**: todo lo suyo (capacidad, evidencias, ficha, capas de memoria), y es la única que mueve datos de `privado` a otra capa.
- **Coach / team leader** (solo su equipo asignado, 1.16.0): nivel oficial, dimensiones, checklist, vigencia, discrepancias; nunca la ficha viva, lo marcado como privado ni el chat privado.
- **Admin / dirección**: lo anterior de toda la empresa, más los agregados (mapa de resiliencia, retos, retorno). Sin datos individuales privados.
- **Superadmin Brandooers**: métricas de plataforma y soporte; sin acceso a contenido privado de nadie.

## 5. Rutas de la API

| Ruta | Fase | Quién |
|---|---|---|
| `GET /api/learning/capability` | hecha | la persona |
| `GET/PUT /api/org/course-skills[/:source]` | hecha | admin, dirección |
| `GET /api/learning/capability/:skillKey/evidence` | 2 | la persona |
| `POST /api/learning/evidence` (teach-back, demostración, microcheckpoint) | 2 | la persona (lo escribe el servidor tras corregir) |
| `GET/PUT /api/org/skills/:id/graph` (conceptos, comportamientos, prerrequisitos) | 3 | admin, inspirador |
| `PATCH /api/learning/facts/:id/visibility`, `POST /api/agent/chat` con `private: true` | 4 | la persona |
| `GET /api/learning/review` (repaso de 3 minutos por errores reales) | 6 | la persona |
| `GET /api/analytics/team/capability` (dimensiones del equipo asignado) | 8 | coach, team leader |
| `GET /api/analytics/resilience` (bus factor por competencia, quién sostiene qué, cadenas de transferencia) | 8 | admin, dirección |
| `POST /api/org/challenges`, `GET /api/org/challenges/:id/impact` | 9 | admin, dirección |

## 6. Fases (orden de ejecución)

| Fase | Qué | Resultado visible |
|---|---|---|
| **1 · hecha (1.18.0)** | Estado de capacidad derivado, curso↔competencia, siguiente mejor paso, arreglo de la cascada N2 duplicada | «Tu capacidad» en la ficha y «Tu siguiente mejor paso» en Inicio |
| **2 · hecha (1.19.0)** | `evidence_event` + modo demostración (la IA aclara, no resuelve) + `ai_help`/`independence` en roleplays y casos | «Con apoyo / sin apoyo»; certificados que dicen «demostró esto en estas condiciones» |
| 3 | Skill Graph: conceptos y comportamientos por competencia, conceptos por bloque; los errores de test se etiquetan por concepto | «Le cuesta / parece dominar» con «¿Por qué creemos esto?» |
| 4 | Memoria en tres capas + «Solo para mi tutor» + `retrieveContext(task)` + `policy.ts` | Menos tokens por llamada; el alumno decide qué comparte |
| 5 | `profile_version` con impacto; la caché de «Para ti» solo se rehace con cambios de impacto alto | Menos coste de IA, contenido estable |
| 6 · repaso hecho (1.20.0) | Microinteracciones de 7 tipos, presupuesto cognitivo, repaso espaciado por errores reales, Team DNA repartido en los módulos | Sesiones que se adaptan a la carga y al tiempo disponible |
| 7 | Teach-back por voz (3 min, evidencia de transferencia, nunca da N3 sola), roleplay con estado (interés, confianza, urgencia, claridad), dificultad y roleplays de interrupción (90 s, WhatsApp, email, LinkedIn) | Práctica parecida al día a día; se ve dónde cambió la conversación |
| 8 | Panel de capacidad del equipo, **mapa de resiliencia** (bus factor por competencia), coach como multiplicador, marketplace interno | El manager ve riesgos de conocimiento, no «vigila» |
| 9 | Retos de empresa («Discovery Sprint») con antes/después; retorno en 4 capas: aprendizaje demostrado · aplicación observada · resultado operativo · valor económico («no atribuible todavía» cuando lo sea) | Argumento B2B sin cifras infladas |
| 10 | Calidad y trazabilidad: `learning_quality` por curso (fuentes, evaluación, densidad de práctica, transferibilidad, frescura, accesibilidad, dependencia de la IA), `content_claim` (afirmación, fuente, verificada, revisar el…) con aviso de caducidad; experimento controlado con evaluación a ciegas y diseño cruzado para equipos pequeños | Prueba de que funciona y contenido que no caduca en silencio |

Recursos: guardar `organic_rank` y `commercial_rank`, mostrar «¿Por qué aparece?» (competencia, nivel, idioma, duración, afiliado sí/no) y la opción «ordenar sin afiliación». Hoy ambos rangos coinciden porque la afiliación no mueve el orden.

Team DNA: pasa a llamarse «Tu configuración actual de aprendizaje» y separa evidencia fuerte, preferencias declaradas, patrones observados y elementos lúdicos. Nada de personalización ornamental (colores o textos por eneatipo): la personalización cambia qué practica, con qué dificultad, qué ejemplo, qué feedback y qué repasa.

## 7. Reglas del estado de capacidad (fase 1, `capability.ts`)

- **Conocimiento** = media de la mejor nota de cada bloque × bloques hechos / bloques totales. Con examen final: 0,6 × examen + 0,4 × media de bloques.
- **Aplicación** = 0,5 × mejor práctica simulada (roleplay o micropráctica) + 20 por caso validado + 15 por aplicación real + 8 por aplicación parcial (máximo 100).
- **Autonomía** = 30 por caso validado por una persona + 20 si aprobó el examen final.
- **Transferencia** = 35 por persona acompañada hasta N2 + 10 por acompañamiento en curso.
- **Confianza** = 10 por evidencia (máximo 40) + 10 por tipo distinto (máximo 30) + 20 si la revisó una persona + 10 si están repartidas en ≥14 días − 15 si la última tiene >4 meses (−30 si >1 año). Baja <40, media <70, alta después.
- **Siguiente paso** (en este orden): refrescar si la última evidencia tiene >120 días · repetir el bloque más flojo (<85) · seguir con el siguiente bloque · practicar en roleplay si aplicación <50 · examen final · caso real si autonomía <60 · acompañar a alguien si ya es N2 y transferencia <35.

Estas constantes son la primera versión: se ajustan con el experimento de la fase 10, nunca a ojo.

## 8. Migración sin romper producción

1. Cada fase añade tablas o columnas con `IF NOT EXISTS`; ninguna reescribe `level_by_competency`, `applied_case` ni `validation`.
2. Lo derivado se calcula al leer, así que no hay que rellenar datos antiguos: la fase 1 ya ve todo el histórico.
3. Las evidencias nativas (fase 2 en adelante) empiezan vacías y se acumulan; las pantallas las unen con las derivadas.
4. Cambios de comportamiento visibles con interruptor por empresa en `company_config` cuando alteran algo que el cliente ya usa (fases 5 y 6).
5. `deploy.sh` ya hace compilación, pruebas, copia de seguridad y migraciones, y vuelve atrás si algo falla.

## 9. Por qué esto es difícil de copiar

Generar cursos, voz, roleplays o personalización será cada vez más barato. Lo que no se copia es el **historial de capacidad**: qué sabía cada persona, qué practicó, dónde falló, qué aplicó, quién lo verificó, a quién enseñó y qué conocimiento sobrevivió. Bien protegido, ese historial hace que SkillUp mejore con el uso. No por tener «más IA», sino por tener más evidencia estructurada de cómo se desarrolla la capacidad dentro de una empresa.
