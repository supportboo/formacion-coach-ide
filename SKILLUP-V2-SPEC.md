# SkillUp V2 — Especificación funcional de producto

> **Qué es esto.** El documento funcional de SkillUp V2 pantalla por pantalla, listo para diseño y
> desarrollo. Convierte la visión de Marc (arquitectura de aprendizaje adaptativo, no «plataforma que
> personaliza cursos») en especificaciones concretas: estados, agentes, modelo de datos, reglas de
> personalización y prompts internos.
>
> **Cómo leerlo.** Cada bloque marca su estado real: **[HOY]** ya existe en `platform/src` (v1),
> **[V2]** es nuevo, **[V2·evolución]** amplía algo que ya hay. Nada de humo: donde algo no está
> construido se dice, y se apunta el fichero exacto donde tocar. Docs hermanos: `AGENT-PROMPTS.md`
> (prompts canónicos), `DATA-MODEL.md` (datos de la capa estática), `PIPELINE.md`, `STRATEGY.md`.
>
> **Doctrina que manda sobre todo (LEY #0).** Cero cifras inventadas. Cada conclusión sobre una persona
> lleva evidencia y etiqueta de certeza. Una inferencia de IA nunca se convierte en «verdad» sobre el empleado.

---

## 0. Principio rector — multiplicar talento, no homogeneizar

SkillUp no intenta convertir a todos en el mismo profesional. Busca que cada persona **alcance los
mínimos de su función** y, después, **multiplicar aquello en lo que aporta diferencialmente**. La
pregunta del sistema deja de ser solo «¿qué le falta?» y pasa a ser también «¿qué talento tiene esta
persona que todavía no estamos aprovechando?».

Ejes de fortaleza (ya modelados en Team DNA, `services/teamdna.ts`): Creativa → innovación/conceptualización ·
Analítica → datos/diagnóstico/optimización · Social/Personas → partners/liderazgo/influencia ·
Ejecución/Acción → operaciones/delivery/procesos · Estratégica/Visión → priorización/planificación/decisión.

Esto es el filtro de toda decisión de currículo, práctica y carrera del sistema.

---

## 1. Learner State — el cerebro único (fundación de todo)

Todos los agentes trabajan sobre **un único Learner State** por persona/organización. Nunca memorias
independientes que se contradigan. El Learner State es la fuente de verdad viva del ADN, la evidencia y
las señales.

**[HOY]** existe disperso: `onboardingProfile` (sector/puesto/motivo), `levelByCompetency` (nivel 0-3 por
competencia), `teamDna` (fortalezas), `annotation` (notas: estilo, freno, objetivo, ruta, roleplay),
`evidence` (pruebas), `agentThread/agentMessage` (chat), `roleplaySession`, `ragDocument/ragChunk` (cerebro
org). **[V2]** se unifica una vista `learnerState(orgId, userId)` que compone todo eso + el Evidence Graph
+ las señales, y que **cada agente lee y actualiza** (no cada uno por su lado).

### 1.1 SkillUp DNA dinámico **[V2·evolución de teamDna + onboarding]**

El onboarding crea un **DNA inicial**, nunca definitivo. Evoluciona con cada curso, conversación, test,
role play, feedback del Team Leader y comportamiento observable. Dimensiones (todas por competencia cuando
aplica):

| Dimensión | Qué mide | De dónde sale |
|---|---|---|
| **Conocimiento** | beginner → avanzado → experto | tests, contenido visto, `levelByCompetency` |
| **Capacidad aplicada** | sabe ejecutarlo, no solo saberlo | casos validados, role plays, seguimiento real |
| **Estilo cognitivo** | analítico/conceptual/práctico/creativo/estructurado/exploratorio | comportamiento + autoevaluación + Team DNA |
| **Preferencia de aprendizaje** | ejemplos/práctica/explicación/demostración/conversación/visualización/repetición | onboarding `[estilo]` + qué consume/repite |
| **Comunicación** | directo/reflexivo, sintético/detallista, necesidad de contexto | análisis de sus mensajes y entregas |
| **Autonomía** | necesita instrucciones → validación → autónomo → puede enseñar | nivel + patrón de preguntas + feedback TL |
| **Motivadores** | especialización/innovación/liderazgo/reconocimiento/impacto/autonomía | onboarding `[objetivo]` + comportamiento |
| **Aspiraciones** | qué quiere aprender y hacia dónde su carrera | onboarding + `services/career.ts` |
| **Confianza vs. competencia** | «no sé hacerlo» ≠ «sé pero no tengo confianza» | microcomprobación + desempeño real |
| **Estado contextual** | carga, motivación, frustración, confianza, percepción de progreso | señales de sesión (ver §9) |

**Regla dura:** no se usa eneagrama, colores ni tests como diagnóstico psicológico determinista. Pueden
inspirar preguntas; el perfil se construye de **comportamiento observable + autoevaluación + desempeño +
feedback**, y nunca encasilla.

### 1.2 Evidence Graph — cada conclusión con evidencia **[V2·evolución de evidence]**

SkillUp nunca guarda «Carlos = poco liderazgo». Guarda:

```
Competencia: Delegación
Nivel estimado: 43/100   ·   Confidence: 0.68
Evidencia: [role play #14, conversación coaching #7, evaluación práctica #22, feedback TL #3, autoevaluación #5]
```

Cada pieza de evidencia lleva **tipo de certeza**: `FACT` (hecho verificable) · `OBSERVATION`
(comportamiento observado) · `SELF-REPORT` (lo dice la persona) · `MANAGER-FEEDBACK` (lo dice el TL) ·
`AI-INFERENCE` (inferencia del modelo). Una `AI-INFERENCE` **jamás** se muestra como verdad; se muestra como
inferencia y se puede confirmar o desmentir con evidencia de mayor peso.

**[HOY]** `evidence` (schema 280-290) ya existe con `kind` (documento/video/audio/url/kpi) y el seguimiento
de aplicación ya escribe `kind:kpi` con la aplicación real (`services/followup.ts`). **[V2]** se añade a
`evidence` la columna `certainty` (FACT/OBSERVATION/SELF-REPORT/MANAGER-FEEDBACK/AI-INFERENCE) y `competencyId`
+ `confidence`, y el DNA se recalcula **desde el Evidence Graph**, no desde texto suelto.

---

## 2. Arquitectura de agentes (sobre el Learner State común)

Doce agentes especializados y coordinados, todos leyendo/escribiendo el mismo Learner State. Un
**Governance Agent** vela por seguridad, privacidad, sesgos y límites de uso de información sensible.

| Agente | Rol | Estado |
|---|---|---|
| **Learner Coach** | acompaña al usuario, resuelve, guía, descubre su día a día y barreras | **[HOY]** `registry.ts` rol `empleado` + `chat.ts` (ya cablea freno/objetivo/empresa) |
| **DNA Agent** | mantiene el modelo evolutivo del usuario | **[V2]** recalcula DNA desde el Evidence Graph |
| **Curriculum Agent** | qué conocimientos/competencias debe alcanzar | **[HOY parcial]** `catalog.ts` + `career.ts`; **[V2]** objetivo de competencia, no longitud fija |
| **Assessment Agent** | genera tests dinámicamente | **[HOY parcial]** `aiContent.generateExam`; **[V2]** test generado en el momento con estado actual (§4) |
| **Simulation Agent** | role plays y casos | **[HOY]** `roleplay.ts` + `aiContent.generateCasePrompt`; **[V2]** práctica deliberada (§5) |
| **Evaluator Agent** | analiza desempeño con rúbricas | **[HOY]** `validation.ts` (humano) + `aiContent.suggestRubricScore`; **[V2]** actualiza mapa multidimensión |
| **Adaptation Agent** | decide dificultad, profundidad y formato siguiente | **[V2]** núcleo nuevo (§7, §8) |
| **Motivation Agent** | detecta engagement y adapta intervención (sin diagnóstico psicológico) | **[V2]** (§9) |
| **Career Agent** | conecta aprendizaje, fortalezas, aspiraciones y desarrollo | **[HOY parcial]** `career.ts` |
| **Team Leader Coach** | ayuda al manager a desarrollar personas | **[V2]** (§6) |
| **Intervention Agent** | decide cuándo hacer seguimiento (por señales, no calendario) | **[HOY semilla]** `reminders.ts` (seguimiento temporal); **[V2]** Next Best Intervention (§9) |
| **Governance Agent** | seguridad, privacidad, sesgos, consistencia, límites | **[HOY parcial]** `privacy.ts` + doctrina anti-invención; **[V2]** capa transversal explícita |

Prompts canónicos de cada agente: se amplían en `AGENT-PROMPTS.md` (hoy 12 secciones; V2 añade una por
agente nuevo con su contrato de entrada/salida sobre el Learner State).

---

## 3. Pantalla · Onboarding / ADN inicial

**Objetivo:** crear el DNA inicial y la primera foto de evidencia, sin encasillar, y arrancar con ROI en mente.

**Flujo [V2·evolución de `bienvenida.html` + `learning.startOnboarding`]:**
1. Entrevista conversacional (director académico, `AGENT-PROMPTS.md §8`): puesto, a qué se dedica y a quién
   vende, nivel por materia, tiempo, qué busca (resolver ya vs. profesionalizarse), **freno/barrera**, estilo,
   ritmo, cómo quiere el trato. **[HOY]** se capturan; **[HOY, ya arreglado]** freno/objetivo/empresa ya se
   **leen** y entran en el tutor (`registry.ts`/`chat.ts`).
2. Análisis de la web de su empresa (`onboarding.analyzeCompany`) → contexto real de a quién vende. **[HOY]**
   ya se inyecta en casos/tests/roleplay.
3. **[V2]** Test de fortalezas (Team DNA, determinista) + microautoevaluación por competencia (seguro / con
   dudas / poco cómodo) → siembra `Confianza vs. competencia`.
4. **[V2]** Se escribe el **DNA inicial** estructurado (columnas consultables en `onboardingProfile`, no texto
   suelto) + primeras piezas de evidencia `SELF-REPORT`.

**Salida:** Learner State v0 + ruta propuesta (solo módulos reales del catálogo; sin match, lo asigna el
responsable — `catalog.matchProfileToPaths`).

**Prompt interno (extracto):** ver director académico + «Metodología SkillUp» en `AGENT-PROMPTS.md §0`.

---

## 4. Pantalla · Dynamic Test — el test no existe hasta que hace falta

**Principio:** no se generan al inicio todos los tests del curso. Se mantienen **objetivos, competencias y
criterios**, y el test se genera **justo cuando el usuario llega a él**, con su estado actual.

**Flujo [V2·evolución de `aiContent.generateExam`]:**
1. Microcomprobación: «¿Cómo te encuentras con este tema: seguro, con dudas o poco cómodo?».
2. El Assessment Agent compone: `perfil + contenido visto + errores anteriores + prácticas + conversaciones +
   dificultad demostrada + objetivos + feedback TL + estado actual → test`.
3. Mensaje explícito al usuario: «Dame unos segundos, te preparo una práctica basada en lo que acabas de
   aprender y en lo que estamos trabajando».
4. Genera N preguntas **distintas por persona** para el mismo curso:
   - **Beginner:** vocabulario sencillo, reconocimiento de conceptos, escenarios claros, una variable a la vez.
   - **Avanzado:** ambigüedad, trade-offs, casos reales, información incompleta, justificar decisiones.
5. **[V2]** No evalúa solo correcto/incorrecto: cada respuesta actualiza el mapa **Knowledge / Application /
   Judgment / Confidence / Communication / Autonomy**, y el **siguiente ejercicio se genera a partir del
   resultado anterior**.

**[HOY]** `generateExam` ya adapta a sector/puesto/empresa y corrige determinista (`scoreExam`). **[V2]**
falta: microcomprobación, composición con estado actual y el mapa multidimensión que alimenta al Adaptation Agent.

**Dónde tocar:** `services/aiContent.ts` (`generateExam` → aceptar `learnerState` y devolver deltas por
dimensión), nuevo `assessment.ts` para la orquestación, y persistir el mapa como evidencia (`OBSERVATION`).

---

## 5. Pantalla · Role Play vivo (motor central) — práctica deliberada

**Principio:** no «Role Play: cliente difícil», sino `cliente específico + situación específica + dificultad
adecuada + competencia a entrenar + debilidad detectada + contexto profesional del usuario`.

**Comportamiento [V2·evolución de `roleplay.ts`]:**
- Si domina la presentación pero pierde control ante objeciones → el simulador introduce la objeción en el
  minuto adecuado.
- Si mejora → el siguiente cliente es más ambiguo.
- Si se bloquea → **no castiga subiendo dificultad**: para y corrige un trozo: «Vas bien con la explicación,
  pero respondes demasiado rápido a la objeción. Repetimos solo esa parte». Eso es **deliberate practice**, no
  un examen.
- **[HOY, ya arreglado]** el personaje se aterriza en la empresa real del usuario y la práctica se guarda a
  memoria (no es callejón sin salida). **[V2]** falta: dificultad adaptativa por debilidad detectada, pausa
  correctiva y que el cierre alimente el mapa multidimensión + suba capacidad aplicada con evidencia.

**Audiovisual [V2·futuro, con coste aprobado y etiqueta de IA]:** Runway **Act-Two** (trasladar expresión,
habla y gesto a un personaje desde una performance), **Veo 3** (escena con diálogo, ambiente, SFX, cámara),
**Gen-4 Image** (consistencia de personaje/escenario por referencia) para simulaciones inmersivas. Se
especifica cuando toque producirlo; hoy es texto/voz. Toda cara/voz sintética con consentimiento y etiqueta
(Reglamento IA art. 50).

**Dónde tocar:** `services/roleplay.ts` (dificultad, pausa correctiva, brief estructurado), enlazar cierre →
Evaluator → Evidence Graph.

---

## 6. Pantalla · Team Leader Copilot + Leadership Coach

**No** es solo dashboards. El TL tiene su propio copiloto y su **coach de liderazgo**.

**Consultas del TL (lenguaje natural):**
- «¿Cómo está evolucionando María?» → respuesta accionable, **sin diagnóstico psicológico**: *Progresa en*
  (negociación consultiva, preparación previa, argumentación) · *Necesita práctica en* (gestionar silencios,
  preguntar antes de proponer, cerrar próximos pasos) · *Recomendación* (esta semana, una conversación real
  donde tenga que descubrir necesidades antes de presentar solución).
- «Quiero que practique el caso de un partner que lleva dos meses sin generar oportunidades y responde a la
  defensiva» → el TL lo describe en lenguaje natural; SkillUp lo convierte en **simulación personalizada**,
  fija criterios de evaluación y la mete en la **prioridad de entrenamiento** del empleado.

**Leadership Coach (desarrollar a quien desarrolla personas) [V2]:**
- «Tengo una persona muy buena técnicamente pero no decide sin preguntarme» → el coach **no etiqueta al
  empleado**; propone: «Antes de darle más instrucciones, cambia el nivel de delegación: dale el resultado y
  los límites, y deja que proponga el cómo». Y prepara: conversación recomendada · preguntas de coaching · qué
  evitar · nivel de autonomía a probar · señal a observar · cuándo volver a intervenir.

**[HOY]** existe la moderación interdepartamental (`services/moderation.ts`, `/api/moderation`) y el
agregado de equipo (`teamdna.teamAggregate`, `workforce.orgWorkforce`). **[V2]** falta: el copiloto
conversacional del TL, el Leadership Coach y el «describe un caso → simulación con criterios → cola de
entrenamiento».

**Dónde tocar:** nuevo `teamLeaderCoach.ts` + endpoints `/api/tl/ask` y `/api/tl/assign-practice`; alimenta
la prioridad de señales (§9) con `MANAGER-FEEDBACK` (peso alto).

---

## 7. Pantalla · Course Engine — 0 → 100 por capas

**Regla de producto:** `Minimum Theory → Immediate Application → Feedback → Expansion`. Nada de 40 minutos de
teoría. El bucle interno es `Concepto → 3-6 claves → ejemplo → micropráctica → feedback → caso → nueva capa`.

El curso **no tiene longitud fija**: tiene un **objetivo de competencia**. SkillUp decide cuánto mostrar:
- **Beginner:** 20 → 30 → práctica → 40 → práctica → 50.
- **Experto:** 20 → detecta dominio → salta → 60 → caso complejo → 75.

**[HOY, ya arreglado]** la lección se genera «de 0 a 100 práctica» (teoría mínima incrustada, no bloques
teóricos — `aiContent.generateLessonDraft`). **[V2]** falta: capas dinámicas con salto por dominio detectado
y el objetivo-de-competencia como criterio de fin (no longitud).

**Dónde tocar:** `aiContent.generateLessonDraft` → generar por capas bajo demanda; Adaptation Agent decide la
siguiente capa desde el mapa del §4.

---

## 8. Personalización — un contenido maestro, múltiples experiencias

No se mantienen 15 versiones manuales de cada formación. Se crea un **Master Knowledge Object**:
`objetivos + conocimiento obligatorio + técnicas + ejemplos base + errores habituales + criterios de dominio +
recursos`. Una **Personalization Layer** transforma su presentación:

- **Analítica:** Datos → estructura → comparación → decisión.
- **Práctica:** Situación → qué haces → resultado → regla.
- **Creativa:** Problema → posibilidades → experimento → reflexión.

Y además cambia vocabulario, profundidad, ejemplos y dificultad **sin tocar los hechos ni las fuentes**.

**[HOY]** existe el Personalizador (`AGENT-PROMPTS.md §9`) que reescribe el envoltorio por perfil sin cambiar
hechos. **[V2]** falta: formalizar el Master Knowledge Object como entidad y que la Personalization Layer lea
el DNA completo (estilo cognitivo + preferencia + comunicación), no solo sector/puesto.

**Dónde tocar:** modelo de datos (nuevo `knowledgeObject`), `services/aiContent.ts` (capa de presentación).

---

## 9. Follow-ups — Next Best Intervention Engine (por señales, no calendario)

Se elimina «follow-up dentro de 30 días» como regla única. Cada interacción genera **señales**:
`mastery_delta · confidence_delta · error_recurrence · engagement_change · practice_frequency ·
manager_priority · real_world_application · frustration_signal · stagnation · achievement`.

El **Intervention Agent** decide: *no intervenir / preguntar / practicar / recordar / recomendar / felicitar /
hablar con coach / pedir apoyo del TL*. Ejemplos:
- Falla 3 veces una competencia → **no espera 30 días**, dispara práctica ya.
- Completa perfectamente el curso → **no** necesita un follow-up artificial.
- «Lo entiendo, pero en una conversación real no sé si podría hacerlo» → dispara **práctica**, no otra explicación.

**[HOY semilla]** el seguimiento temporal ya existe (`reminders.ts` pregunta la aplicación semanas después de
validar; `/api/followup` captura la aplicación real como evidencia; `/api/followup/summary` agrega el ROI de
aplicación). **[V2]** falta: sustituir el disparo por tiempo por el motor de señales, y persistir cada señal.

**Jerarquía de señales (qué se entrena AHORA):**
`Seguridad/compliance > necesidad crítica del puesto > recomendación explícita del TL > gaps observados >
objetivos del usuario > currículo estándar`. Cuando el TL dice «necesita practicar discovery porque la semana
que viene tiene reuniones con partners», SkillUp **reordena temporalmente** la experiencia (no cambia todo el
currículo, cambia qué conviene entrenar ahora).

**Dónde tocar:** nuevo `signals.ts` + `intervention.ts`; `reminders.ts` pasa a consumir señales.

---

## 10. Feedback Loop completo — hasta enseñar

Ciclo fundamental: `Discover → Learn → Practice → Observe → Adapt → Apply → Validate → Expand → Teach`.

El último nivel, **Teach**, comprueba un dominio superior a responder un test:
- «Ya no necesitas practicar esto como alumno. Quiero comprobar si sabes explicárselo a otra persona.»
- «Te pongo como mentor simulado: enséñame cómo ayudarías a un compañero que comete este error.»

**[HOY]** «Apply» y «Validate» están sólidos (caso práctico + validación humana, `validation.ts`), «Expand»
existe (propagación/cascada, `propagation.ts`) y el «cerebro que crece» destila buenas prácticas al RAG al
validar. **[V2]** falta: «Teach» como prueba de dominio (mentor simulado, el usuario enseña y el sistema
evalúa la explicación).

---

## 11. Dashboards y datos

**Dirección/TL [HOY]:** cobertura, riesgo de dependencia (bus factor), tasa de transferencia interna, tiempo
a autonomía, línea base y snapshots (`analytics.ts`), coste real por tokens (`costs.ts`) y ROI de aplicación
(`followup.applicationRoi`) — todo con «sin datos» honesto, nunca inventado. **[V2]** añade: ROI = aplicación
real medida (beneficio) frente a coste (unir `followup` + `costs`), y vistas de talento (qué fortaleza no se
está aprovechando, §0).

**Modelo de datos [resumen V2]:**
- **Learner State** (vista compuesta) sobre: `onboardingProfile` (ampliado: dna estructurado), `teamDna`,
  `levelByCompetency`, `evidence` (ampliado: `certainty`, `competencyId`, `confidence`), `signals` (nuevo),
  `annotation`, `roleplaySession`, `agentThread`.
- **Evidence Graph:** `evidence` con tipo de certeza + enlaces a competencia y confianza.
- **Señales:** `signals(orgId, userId, kind, value, ts, source)` — materia prima del Intervention Agent.
- **Master Knowledge Object:** `knowledgeObject` (objetivos, conocimiento obligatorio, técnicas, ejemplos,
  errores, criterios de dominio, recursos) + Personalization Layer en tiempo de render.
- **Multi-tenant:** toda tabla filtra `organizationId` (ya es la norma en v1).

---

## 12. Governance (transversal, con veto)

- **Certeza obligatoria** en toda conclusión (FACT/OBSERVATION/SELF-REPORT/MANAGER-FEEDBACK/AI-INFERENCE).
- **Anti-invención (LEY #0):** sin dato medido → «pendiente», nunca un número falso. Ya es la doctrina real
  del código (cero cifras inventadas hoy).
- **Privacidad/RGPD:** export y borrado por persona (`privacy.ts`); el conocimiento aportado se **anonimiza**
  al destilarlo al cerebro, de modo que el derecho al olvido no borre el aprendizaje colectivo.
- **Sin diagnóstico psicológico determinista.** El sistema describe comportamiento y desempeño, no etiqueta a
  la persona.
- **Sesgos y límites de uso de información sensible:** el Governance Agent revisa antes de exponer al TL.

---

## 13. Delta V1 → V2 (para planificar el build)

**Ya real hoy (v1, base sólida):** onboarding con captura rica cableada al tutor · casos/tests/roleplay a la
vida real (empresa, freno) · lección 0→100 práctica · validación humana + gate de progreso · cerebro que crece
al validar (RAG) · seguimiento temporal + captura de aplicación (evidencia kpi) + ROI de aplicación ·
moderación interdepartamental · Team DNA · analytics honesto · multi-tenant sólido.

**Lo que añade V2 (por prioridad de impacto):**
1. **Learner State único + Evidence Graph con certeza** (fundación; desbloquea todo lo demás).
2. **Intervention Agent por señales** (sustituye el follow-up por calendario) + jerarquía de señales.
3. **Dynamic Test con estado actual + mapa multidimensión** y **Adaptation Agent**.
4. **Role play deliberado** (dificultad adaptativa, pausa correctiva) + nivel **Teach**.
5. **Team Leader Copilot + Leadership Coach** (describe caso → simulación → cola de entrenamiento).
6. **Master Knowledge Object + Personalization Layer** completa (estilo cognitivo, comunicación).
7. **Course Engine por capas** con salto por dominio.
8. **Vistas de talento** (multiplicar, no homogeneizar) en dashboards.
9. **Audiovisual inmersivo** en role plays (Act-Two / Veo 3 / Gen-4 Image), con coste aprobado y etiqueta IA.

**Regla de oro del build:** ningún agente nuevo se enciende sin que su salida se consuma/persista (nada de
pipelines LLM sin cablear) y sin pasar por Governance. Cada incremento deja su comprobación (test) y se mide.

---

*SkillUp V2 · especificación funcional · vive junto a `AGENT-PROMPTS.md` y `DATA-MODEL.md`. Se actualiza al
construir cada bloque (marcar [HOY] lo que pase a real). Canónico también para el brain (`projects/brandooers`).*
