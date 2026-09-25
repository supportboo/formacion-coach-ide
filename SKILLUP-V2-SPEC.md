# SkillUp V2 — Especificación de producto (v2.1, tras tres rondas de crítica)

> **Qué es esto.** La especificación funcional de SkillUp V2 lista para diseño, desarrollo y venta. Esta
> versión sustituye a la v2.0 tras tres rondas explícitas de «cuestiona el plan → optimízalo» (registro
> completo en el **Anexo A**). Cambia el centro de gravedad: de «plataforma de aprendizaje adaptativo con
> doce agentes» a **un sistema que prepara a una persona para un momento concreto de su trabajo y demuestra,
> con línea base, si ya se sostiene sola**.
>
> **Marcas de estado (honestidad total).** **[HOY]** existe en `platform/src` y funciona · **[HOY·corregir]**
> existe pero tiene un defecto que esta spec señala · **[V2]** nuevo · **[V2·evolución]** amplía algo que ya
> hay · **[FUERA]** descartado en las rondas, con el motivo.
>
> **Docs hermanos.** `AGENT-PROMPTS.md` (prompts canónicos) · `MODELO-BRANDOOERS.md` (validación, cascada,
> FUNDAE) · `MONETIZATION.md` · `STRATEGY.md` · `GOAL-BRANDOOERS.md` · estudio de ICP en el brain
> (`projects/brandooers/ICP_BUYER_PERSONA_2026-09-24.md`, hoy en el worktree `mobile-first` del brain).
>
> **LEY #0 (manda sobre todo el documento).** Cero cifras inventadas. Toda conclusión sobre una persona lleva
> evidencia y etiqueta de certeza. Una inferencia de IA nunca se presenta como verdad sobre un empleado. Donde
> no hay dato, la interfaz dice **«pendiente de medir»**, nunca un número de relleno. Esta spec no contiene
> ni un porcentaje de mejora prometido: los únicos números que aparecen son umbrales legales con su norma,
> parámetros que ya están en el código o **objetivos de diseño** marcados como tales (hipótesis a validar,
> no mediciones).

---

## 1. El hook y la tesis

### 1.1 El hook, en una frase

> **«Tu gente asume responsabilidades antes de estar lista. SkillUp la entrena para ese momento con sus
> clientes reales y, a los 90 días, te enseña con datos si ya se sostiene sola. Si no puedes ver esa
> medición, no pagas.»**

Versión corta para anuncio o asunto de correo: **«Si en 90 días no ves quién ya se sostiene solo, no pagas.»**

### 1.2 La tesis

La formación corporativa vende **acceso a contenido** y mide **asistencia** (cursos completados). El propio
sector reconoce que casi nadie mide conducta ni resultado (ATD/ROI Institute, citado en `MODELO-BRANDOOERS.md
§7`: solo el 16 % mide ROI; el 96 % de los CEO quiere impacto de negocio y el 8 % lo recibe). SkillUp cambia
tres cosas a la vez:

| | Formación convencional (LMS, catálogos, generadores con IA) | SkillUp V2 |
|---|---|---|
| **Unidad de venta** | Asiento con acceso a un catálogo | **Un Momento**: una persona, una responsabilidad nueva, una fecha |
| **Qué se practica** | Casos genéricos del sector | **Las situaciones críticas de su Momento**, con su empresa y sus clientes reales |
| **Qué se mide** | Finalización, nota del test (Kirkpatrick 1-2) | **Conducta observada con línea base** (Kirkpatrick 3): ¿lo resuelve solo o hay que rescatarle? |
| **Quién certifica** | La plataforma | **Una persona de dentro** (validación humana, `validation.ts`) |
| **Cómo se paga** | Presupuesto de formación | **Crédito FUNDAE que la pyme ya tiene y en gran parte no usa** + garantía sobre la medición |

**Por qué el Momento.** El estudio de ICP (§0.4 del estudio) es claro: el disparador de compra **es un evento
súbito** —un ascenso, el primer equipo, el primer cliente grande—, no una necesidad difusa de «desarrollo». Y
el comprador mide el éxito así: *«¿la persona asume la reunión con el cliente sin que intervenga él?»*
(gerente, §4.2) y *«dejar de rescatar reuniones»* (responsable técnico, §4.4). SkillUp convierte esa frase del
comprador en la métrica central del producto: **los rescates**.

**Regla de voz (heredada del ICP).** Se nombra la **situación** («te acaban de ascender», «tu primer equipo»,
«tu primer cliente grande»), nunca un diagnóstico («síndrome del impostor»). El sistema describe conducta,
no etiqueta personas.

### 1.3 El mecanismo que hace verdad el hook

El hook solo es honesto si cinco piezas funcionan juntas. Si falta una, el hook no se puede vender.

1. **El Momento con fecha** **[V2]**. El responsable (o la propia persona) da de alta el Momento: quién, qué
   responsabilidad nueva, desde cuándo, y **3-5 situaciones críticas** descritas con sus palabras («defender el
   calendario ante el cliente cuando pide adelantar», «dar feedback a alguien que antes era su compañero»).
2. **La línea base del día 0, firmada por el responsable** **[V2]**. Para cada situación: nivel de autonomía
   actual (escala ordinal de §2.2) y rescates por semana. Sin línea base no hay piloto (regla dura, ya
   anticipada en `GOAL-BRANDOOERS.md`, autocrítica 3).
3. **Práctica sobre lo suyo + validación humana** **[HOY + V2·evolución]**. Simulación con su cliente real
   (`roleplay.ts`, ya aterrizado en la empresa del alumno), caso práctico real con rúbrica visible y
   validación de una persona de dentro (`validation.ts`).
4. **Evidencia de conducta semanal, barata de capturar** **[HOY semilla + V2]**. El **Pulso del responsable**
   (tres toques por persona y semana, sin IA) y el **check-in de aplicación** de la persona (`followup.ts`,
   ya escribe evidencia real).
5. **El Informe de Retorno a 30/60/90 días** **[V2]**. Calculado de forma determinista desde la evidencia; la
   IA solo redacta la lectura y nunca toca una cifra. Donde falta un dato: «pendiente de medir».

**Qué garantiza exactamente la garantía (y qué no).** Se garantiza **la medición**, no un resultado (coherente
con `MODELO-BRANDOOERS.md §8` y con la prohibición de prometer resultados en publicidad): si el Informe del
día 90 no entrega, para el porcentaje de participantes pactado en contrato, la autonomía por situación crítica
(base y actual), los rescates (base y actual) y la aplicación real, **no se cobra**. La garantía es
**bilateral**: decae si el cliente no cumple sus obligaciones mínimas (responder el Pulso, validar en plazo).
El texto contractual lo cierra `legal-contratos-clientes` antes de venderlo.

---

## 2. Fundación: Learner State, Momento y Evidence Graph

### 2.1 Learner State — una sola verdad por persona **[V2·evolución]**

Todos los agentes leen y escriben **un único Learner State** por `(organizationId, userId)`. Hoy está disperso
**[HOY]**: `onboardingProfile` (sector, puesto, motivo), `annotation` (marcadores `[freno]`, `[objetivo]`,
`[estilo]`, `[Empresa …]`, `[ruta-plan]`), `levelByCompetency`, `teamDna`, `evidence`, `agentThread`,
`roleplaySession`, `ragDocument/ragChunk`. `chat.ts` ya compone parte de esto en cada turno (ruta, avance,
estilo, freno, objetivo, empresa).

**[V2]** se crea `services/learnerState.ts` con una función pura de composición `learnerState(orgId, userId)`
que devuelve:

```
{
  perfil:     { sector, puesto, empresaResumen, objetivo, freno }          // de onboarding (SELF-REPORT)
  momentos:   [{ id, tipo, desde, situaciones: [...] }]                     // §2.3
  demostrado: { [competencyId]: nivel 0-3 }                                 // levelByCompetency (FACT: validación humana)
  observado:  { [situacionId]: { base, actual, tendencia, nPulsos } }       // Pulso (MANAGER-FEEDBACK)
  aplicado:   { [competencyId]: { ultimoCheckin, aplica, sensacion } }      // followup (SELF-REPORT)
  fortalezas: { pesos 4 familias, arquetipo }                               // teamDna (SELF-REPORT situacional)
  practica:   { roleplays, ultimaDebilidad, pausasCorrectivas }             // roleplaySession + Evaluador (AI-INFERENCE)
  senales:    [...]                                                         // §7.5, fase 2
}
```

Los agentes no guardan memorias propias: leen esta vista y escriben evidencia. Nada más.

**Corrección respecto a v2.0.** La v2.0 hablaba de **cinco** ejes de fortaleza (con «Creativa»). El código real
(`services/teamdna.ts`) tiene **cuatro familias** (Visión, Acción, Análisis, Personas) y doce arquetipos. La spec
se alinea con el código: cuatro familias. No se añade una quinta sin motivo medido.

### 2.2 Dos lentes, una escala ordinal (sin falsa precisión)

La v2.0 mostraba «Nivel estimado 43/100 · Confidence 0,68». **[FUERA]**: es precisión inventada; no hay método
que sostenga un 43 frente a un 44. V2.1 usa **dos lentes con escalas ordinales**:

- **Demostrado** (lo que una persona de dentro ha validado): los niveles que ya existen **[HOY]** —
  1 En formación (test) · 2 Aplica (caso validado) · 3 Referente (forma a otros que llegan a 2).
- **Observado** (lo que el responsable ve en el trabajo real, por situación crítica) **[V2]**:

| Autonomía | Descripción que ve el responsable |
|---|---|
| **0** | «Lo acabo haciendo yo (o otra persona).» |
| **1** | «Lo hace, pero conmigo al lado.» |
| **2** | «Lo hace solo y me lo enseña después.» |
| **3** | «Lo hace solo y podría enseñárselo a otro.» |

Cada valor se acompaña de **nº de evidencias** y **mezcla de certezas**, no de un «confidence» decimal. La
**discrepancia** entre lentes es la señal más valiosa del sistema: «demostrado 2, observado 0» = sabe hacerlo
en el caso, no lo hace con el cliente → se dispara práctica de esa situación, no más teoría.

### 2.3 El Momento **[V2]** — la entidad nueva que ordena todo

```
moment(id, organizationId, userId, ownerId /*responsable*/, kind, label, startsAt, status, createdAt)
  kind: ascenso | primer_equipo | primer_cliente_clave | sustituir_a_alguien | incorporacion | otro
  status: activo | cerrado

critical_situation(id, organizationId, momentId, competencyId?, description,
                   baselineAutonomy 0-3, baselineRescuesPerWeek?, minutesPerRescue?,
                   baselineSource: 'pulsos' | 'declaracion_responsable', createdAt)

pulse(id, organizationId, momentId, situationId, weekStart, outcome, createdBy, createdAt)
  outcome: no_surgio | solo | con_apoyo | lo_hice_yo      // 'lo_hice_yo' = rescate
  unique (situationId, weekStart)                          // un pulso por situación y semana
```

- Toda tabla filtra `organizationId` (norma del repo).
- `competencyId` es opcional: el responsable describe la situación con sus palabras; el **Arquitecto del
  Momento** (§5) propone a qué competencia del catálogo se ata, y el responsable lo confirma.
- La línea base es **declarada** (certeza `MANAGER-FEEDBACK`, subtipo «declaración retrospectiva») cuando no hay
  pulsos previos, y se muestra así en el informe: «Base declarada por el responsable el 3 de octubre». Si el
  cliente puede, se recomiendan **dos semanas de Pulso antes de empezar** para una base observada.

Reutilización: el contenido que ya existe encaja como biblioteca de Momentos (`guia-primer-equipo.html` —«Tus
primeros 90 días al frente de un equipo»— y `guia-coach-odoo.html` para el Momento «consultor junior ante su
primer cliente»).

### 2.4 Evidence Graph — cada conclusión con su evidencia **[V2·evolución de `evidence`]**

**[HOY]** `evidence(ownerType, ownerId, kind, url, note, createdBy)`; `followup.recordCheckin` ya escribe
`ownerType:'seguimiento', kind:'kpi'` con `{aplica, impacto, sensacion}`.

**[HOY·corregir]** en el check-in, la persona evaluada solo se deduce de `createdBy` y la competencia va en
`ownerId`. Funciona mientras quien escribe sea la propia persona, pero se rompe en cuanto el responsable
aporte evidencia sobre otro. **[V2]** columnas nuevas:

```
evidence + subjectUserId  (sobre quién es la evidencia; obligatorio desde V2)
         + competencyId   (nullable)
         + situationId    (nullable, §2.3)
         + certainty      FACT | OBSERVATION | SELF-REPORT | MANAGER-FEEDBACK | AI-INFERENCE
         + sourceRef      (id del caso, sesión, pulso o hilo que la originó)
```

**Jerarquía de peso** (para resolver contradicciones, nunca para sumar puntuaciones):
`FACT (validación humana con rúbrica) > MANAGER-FEEDBACK (Pulso) > OBSERVATION (conducta registrada en la
plataforma) > SELF-REPORT (check-in, onboarding) > AI-INFERENCE`.

**Regla dura:** una `AI-INFERENCE` nunca cambia un nivel, nunca aparece en el Informe de Retorno como dato y
nunca llega al responsable sin la etiqueta «sugerencia de la IA». Solo puede **proponer** práctica.

---

## 3. Motor de ROI medible

### 3.1 Principios

1. **Cálculo determinista, redacción con IA.** Todas las cifras salen de funciones puras testeadas (como ya hace
   `followup.summarizeCheckins`). La IA redacta la lectura con las cifras inyectadas y un comprobador rechaza
   cualquier número del texto que no esté en el conjunto calculado.
2. **`null` no es `0`.** «Sin datos» y «cero» son cosas distintas y la interfaz las distingue siempre.
3. **Cada métrica declara su certeza y su fuente navegable** (enlace al caso, al pulso, al check-in).
4. **Correlación, no causalidad.** El informe dice «desde el inicio del Momento, los rescates en esta situación
   han pasado de X a Y»; nunca «SkillUp ha reducido los rescates». La causalidad limpia no se finge
   (`MODELO-BRANDOOERS.md §6`).
5. **Euros solo con datos del cliente.** SkillUp no estima el coste hora de nadie ni el valor de una cuenta.
   Si el cliente no los aporta, el informe muestra horas y conteos, no euros.

### 3.2 Correcciones previas obligatorias **[HOY·corregir]** (sin esto el motor miente)

| Fichero | Defecto | Arreglo |
|---|---|---|
| `analytics.timeToAutonomyDays` | Devuelve `0` cuando no hay aprobados: «0 días» parece un éxito | Devolver `null`; la interfaz muestra «pendiente de medir» |
| `analytics.internalTransferRate` | Devuelve `0` sin datos; además el numerador (`coaching` logrado) no se cruza con quienes están en N2+ ni por competencia, así que la proporción puede salir mal | `null` sin datos; numerador = personas N2+ **en esa competencia** con coaching logrado **en esa competencia** |
| `analytics.coverage` | `pct: 0` con plantilla vacía | `pct: null` si `total = 0` |
| `analytics.captureSnapshotIfNeeded` | Solo hace la foto si alguien abre el panel ese día; la serie de 90 días queda con huecos | Foto semanal programada por organización con Momento activo (job ligero; ver §8, sin añadir dependencias mientras baste un temporizador del proceso) |
| `analytics.captureBaseline` | Captura solo métricas internas; al inicio de un piloto casi todas valen 0/null y la «línea base» no dice nada | Línea base del piloto = la de §2.3 (autonomía y rescates por situación, declarada o por pulsos) + la foto interna actual |
| `costs.RATES` | Tarifas escritas a mano; pueden quedar desfasadas respecto a la tarifa oficial vigente del proveedor | Verificar contra la página oficial de precios de Anthropic antes de mostrar costes a un cliente; guardar la fecha de la tarifa junto a la tabla |
| `followup.recordCheckin` | Sin `subjectUserId` ni `situationId` | Ver §2.4 |

### 3.3 Las métricas (fórmula, fuente, certeza, estado)

| # | Métrica | Fórmula | Fuente | Certeza | Estado |
|---|---|---|---|---|---|
| **M1** | **Autonomía por situación crítica** | Base = `baselineAutonomy`; actual = moda de los 3 últimos pulsos con `outcome ≠ no_surgio` mapeados (`lo_hice_yo`→0, `con_apoyo`→1, `solo`→2; 3 solo si además es N3 en la competencia) | `pulse`, `critical_situation`, `levelByCompetency` | MANAGER-FEEDBACK | [V2] |
| **M2** | **Rescates por semana** | Base = `baselineRescuesPerWeek` o media de pulsos pre-inicio; actual = rescates / semanas respondidas en las últimas 4 semanas. Requiere ≥ 3 semanas respondidas; si no, `null` | `pulse` | MANAGER-FEEDBACK | [V2] |
| **M3** | **Aplicación real** | `tasaAplicacion` y `sensacionMedia` ya calculadas **[HOY]** + % de check-ins «sí» corroborados por un pulso `solo` en la misma situación y ventana | `followup.applicationRoi` + `pulse` | SELF-REPORT (+ MANAGER-FEEDBACK si corroborado) | [HOY + V2] |
| **M4** | **Tiempo a autonomía** | Días desde `moment.startsAt` hasta el primer pulso `solo` sostenido 2 semanas seguidas en cada situación; y, en paralelo, días de matrícula a primera validación **[HOY]** | `pulse`, `analytics.timeToAutonomyDays` | MANAGER-FEEDBACK / FACT | [HOY·corregir + V2] |
| **M5** | **Riesgo de dependencia** | Competencias críticas con ≤ 1 referente (N3) | `analytics.dependencyRisks` | FACT | [HOY] |
| **M6** | **Transferencia interna** | Ver corrección §3.2 | `analytics.internalTransferRate` | FACT | [HOY·corregir] |
| **M7** | **Horas del responsable liberadas** | `(M2_base − M2_actual) × minutesPerRescue × 52 / 12 / 60` → horas/mes. Si falta `minutesPerRescue`, solo se muestra el conteo de rescates | `pulse`, `critical_situation` | MANAGER-FEEDBACK (duración declarada) | [V2] |
| **M8** | **Coste de IA real por persona activa** | Σ `usdCost(model, in, out)` de `aiUsage` por `userId` y periodo; se muestra en USD con la fecha de la tarifa (no se convierte a euros sin tipo de cambio fechado) | `costs.userUsage` | FACT (tokens devueltos por el proveedor) | [HOY] — uso interno (margen), no va al cliente |
| **M9** | **Coste neto para el cliente** | Precio pagado − bonificación FUNDAE **aplicada** (la confirma el cliente tras comunicar la acción). Antes de eso: «estimación con los datos que nos has dado», nunca «coste cero» | `subscription`, datos que aporta el cliente, `fundae.exportJustification` | FACT tras confirmar / SELF-REPORT antes | [V2] |
| **M10** | **KPI de negocio del cliente** (opcional) | El cliente declara un indicador suyo (retención de una cuenta, incidencias, facturación por persona) con su fuente; SkillUp lo muestra junto a M1-M3, sin atribuir causa | Lo aporta el cliente | La que tenga su fuente | [V2·fase 2] |

**ROI en euros (solo si se puede):**

```
Valor medido (€) = M7 (horas/mes) × meses × coste hora del responsable (dato del cliente)
                 + Σ M10 monetizados por el propio cliente
ROI = (Valor medido − M9) / M9
```

Se muestra **solo** si todos los sumandos tienen certeza ≥ MANAGER-FEEDBACK y el cliente ha aportado su coste
hora. Si falta cualquier pieza, el informe enseña los componentes medidos y la frase: «El ROI en euros está
pendiente: nos falta tu coste hora del responsable».

### 3.4 El Informe de Retorno a 30, 60 y 90 días **[V2]**

Cada informe es una **foto inmutable** (`roi_report(id, organizationId, momentCohortId, day, data jsonb,
generatedAt)`), para que nadie pueda reescribir el pasado.

| Día | Pregunta que responde | Contenido | Semáforo de la garantía |
|---|---|---|---|
| **30** | ¿Estamos midiendo bien? | Línea base firmada en el 100 % de las situaciones · % de situaciones con al menos una práctica · primeras validaciones · **tasa de respuesta del Pulso** · incidencias | Verde si la base está completa y el Pulso se responde; ámbar/rojo con la acción concreta para el cliente («faltan 4 pulsos de Laura esta semana») |
| **60** | ¿Está cambiando la conducta? | Tendencia de M2 por situación · M3 · discrepancias demostrado/observado y qué se ha hecho con ellas · tiempo a primera validación | Aviso si alguna métrica de la garantía va camino de quedarse sin dato |
| **90** | ¿Se sostiene sola? ¿Seguimos? | M1-M7 base contra actual · M5-M6 · M9 · ROI si es calculable · citas de aplicación real (texto del check-in, con permiso) · certificados emitidos · recomendación: continuar, ampliar a otra persona o parar | Veredicto de la garantía: medición entregada / no entregada (y por qué) |

**Lo que NO se puede prometer a 90 días (y el informe lo dice):** efectos en la cuenta de resultados, retención
de plantilla o rotación. Son procesos más lentos; se dejan como M10 a seguir si el cliente quiere.

### 3.5 FUNDAE dentro del motor **[HOY + V2]**

- **[HOY]** `fundae.ts`: rechaza acciones de menos de 2 h (RD 694/2017), exige tutor-formador, finaliza con
  ≥ 75 % de controles (Orden TMS/368/2019) y exporta el paquete justificativo.
- **[V2]** cada Momento se empaqueta como **acción formativa** cuando cumple los mínimos: los controles son las
  prácticas y casos del propio Momento, y el tutor-formador es el responsable o el coach que valida (encaje ya
  descrito en `MODELO-BRANDOOERS.md §8`).
- **[V2]** calculadora de crédito (P11): el cliente introduce sus datos; los porcentajes por tramo se leen de una
  tabla con **norma y ejercicio** y se muestran con el aviso «verifica tu crédito real en tu cuenta de FUNDAE».
  Nada de «100 % gratis». El estudio de ICP (§11) fija los guardarraíles: comunicación con **2 días** de
  antelación, régimen sancionador LISOS, verificación anual de porcentajes.

---

## 4. Personalización: qué se adapta y qué no

**[FUERA] la «capa de personalización por estilo cognitivo» de la v2.0** (analítico → datos; práctico →
situación; creativo → experimento) como motor central. La adaptación de la enseñanza a «estilos de
aprendizaje» no tiene respaldo experimental sólido (Pashler, McDaniel, Rohrer y Bjork, *Learning Styles:
Concepts and Evidence*, Psychological Science in the Public Interest, 2008 — releer antes de citarlo fuera).
La preferencia declarada (`[estilo]`) se mantiene **solo para el formato** (vídeo, lectura, práctica), tal y
como ya hace `registry.ts`, nunca para el rigor ni para decidir qué se enseña.

**Lo que sí se adapta, porque tiene respaldo o es obvio para el comprador:**

1. **Contexto real** **[HOY]**: su empresa (`onboarding.analyzeCompany`), su puesto, su cliente. Es lo que el
   comprador valora y lo que un catálogo no puede copiar.
2. **Nivel de pericia** **[V2]**: menos andamiaje a quien ya domina (el llamado efecto de inversión de la
   pericia, Kalyuga y otros, 2003 — releer antes de citarlo fuera). Se implementa en el Simulador (§5) y en las
   capas de lección (§6, P5), no como un sistema aparte.
3. **La situación crítica siguiente** **[V2]**: qué se entrena ahora lo decide la jerarquía de §7.5, no el orden
   del temario.

**Master Knowledge Object [V2·fase 3]**: se mantiene la idea (un contenido maestro, muchas presentaciones sin
tocar hechos ni fuentes), pero se construye **después** de que el Momento demuestre valor. El Personalizador de
`AGENT-PROMPTS.md §9` ya cubre el envoltorio por sector y puesto.

---

## 5. Agentes: contratos

### 5.1 De doce a ocho (y por qué)

La v2.0 listaba doce agentes. En la Ronda 1 se detectó que varios eran **decisiones deterministas vestidas de
agente** (caras, lentas y difíciles de auditar), y en la Ronda 3 que uno era un riesgo legal. Resultado:

| v2.0 | V2.1 | Motivo |
|---|---|---|
| Learner Coach | **A1 Coach de la persona** | Se mantiene [HOY] |
| Curriculum + Adaptation | **A2 Arquitecto del Momento** + reglas | El orden de práctica es una regla (§7.5), no necesita un modelo |
| Simulation | **A3 Simulador** | Se mantiene y evoluciona |
| Evaluator + Assessment | **A4 Evaluador** (+ examinador dinámico en fase 3) | Mismo contrato: proponer, nunca aprobar |
| Intervention + Motivation | **A5 Seguimiento** | La «detección de frustración» sale del producto (§9.2) |
| Team Leader Coach | **A6 Copiloto del responsable** | Se mantiene y gana acciones |
| — | **A7 Redactor del Informe de Retorno** | Nuevo: la Ronda 2 exige un informe que el CFO pueda leer |
| Governance | **A8 Guardián** | Pasa a ser **código con veto** + muestreo con modelo rápido |
| DNA Agent | job determinista | Recalcular fortalezas es aritmética (`teamdna.scoreDna`), no IA |
| Career Agent | se queda en `career.ts` | Fase 3; sin prompt nuevo hasta que haya datos de Momentos cerrados |
| Moderador interdepartamental | se mantiene [HOY] fuera del núcleo | Útil, pero no es el hook |

Reglas comunes a los ocho (heredan `AGENT-PROMPTS.md §0`): español de España; anti-invención; salida JSON
validada con Zod cuando alimenta datos; todo coste queda en `aiUsage` con su `kind`; **ningún agente se
enciende sin que su salida se consuma o se persista** (nada de bucles de IA sin cablear).

Sobre coste y latencia: los **presupuestos de tokens** que aparecen abajo son los `maxTokens` que ya están en el
código o los que se proponen; el **coste real por llamada no se estima aquí**: se mide en `aiUsage` por `kind`
durante el piloto 0 (§8) y se publica en esta spec cuando exista. Las latencias son **objetivos de diseño**. El
cliente del modelo ya tiene [HOY] `timeout: 30 s` y `maxRetries: 1` (`agents/llm.ts`).

### 5.2 Contratos

**A1 · Coach de la persona** — **[HOY]** `agents/chat.ts` + `registry.ts` (rol `empleado`)
- **Entradas (Learner State):** perfil (sector, puesto, empresa, objetivo, freno, estilo), ruta, avance,
  fragmentos del cerebro de la empresa (RAG). **[V2]** Momento activo y la situación crítica en foco.
- **Salidas:** respuesta breve en texto plano; **[V2]** opcionalmente `{proponePractica: situationId}`.
- **Evidencia que escribe:** ninguna sobre niveles. **[V2]** si la persona cuenta una situación real reciente,
  se guarda como `SELF-REPORT` ligada a la situación (con aviso: «Lo guardo para que tu práctica sea de lo
  tuyo»).
- **Dispara:** propuesta de práctica al Simulador; nunca aprueba nada.
- **Modelo:** `MODEL_SENIOR`. **Tokens:** `maxTokens` por defecto (1024) [HOY].
- **Coste [HOY·corregir]:** `chat.ts` reenvía **todo el historial del hilo** en cada turno; el coste de entrada
  crece con cada mensaje. **[V2]** ventana de los últimos N turnos + resumen persistido del resto, y caché de
  prompt para el bloque de sistema (función del proveedor; verificar condiciones en su documentación oficial).
- **Latencia objetivo:** primera respuesta percibida < 3 s con streaming (objetivo de diseño).
- **Guardarraíles:** anuncia que es una IA al abrir el chat (Reglamento de IA, art. 50); no expone mecánica
  interna; no emite juicios sobre la persona.

**A2 · Arquitecto del Momento** — **[V2]** nuevo `services/moment.ts`
- **Entradas:** descripción del Momento y de sus situaciones en lenguaje natural (del responsable o de la
  persona), catálogo real de competencias (`catalog.listCompetencies`), resumen de empresa.
- **Salidas (JSON):** `{situaciones:[{descripcion, competencyIdPropuesta|null, porQue, primeraPractica}],
  rutaMinima:[pathId], faltaEnCatalogo:[...]}`. Solo competencias y rutas **que existen**; lo que no existe va a
  `faltaEnCatalogo` y alimenta al Estratega de temas (`AGENT-PROMPTS.md §1`) como **señal de demanda real**.
- **Evidencia:** ninguna; es una propuesta que el responsable confirma (queda en `auditLog`).
- **Dispara:** creación de `critical_situation` tras confirmación; primer caso con `generateCasePrompt` [HOY].
- **Modelo:** `MODEL_SENIOR`. **Tokens:** ≤ 900 de salida (propuesta). **Latencia objetivo:** < 10 s con mensaje
  de espera.
- **Guardarraíles:** no inventa competencias; no infiere rasgos de la persona; reescribe descripciones que
  etiqueten («es inseguro») a conducta («le cuesta sostener el precio cuando el cliente presiona»).

**A3 · Simulador** — **[HOY]** `services/roleplay.ts` → **[V2·evolución]**
- **Entradas:** situación crítica en foco, brief del responsable si lo hay (**[HOY]** ya manda sobre el
  personaje automático), empresa real, última debilidad detectada por A4, nivel demostrado.
- **Salidas:** turnos del personaje (1-3 frases); **[V2]** `pausaCorrectiva` cuando A4 o una regla lo pide.
- **Comportamiento V2 (práctica deliberada):**
  - Dificultad por **regla**, no por modelo: nivel demostrado 1 → un solo obstáculo; nivel 2 → obstáculo +
    información incompleta; nivel 3 → ambigüedad y presión de tiempo.
  - **Pausa correctiva**: si en la sesión anterior A4 marcó la misma debilidad dos veces, el Simulador para en
    ese punto: «Vas bien explicando. Donde se te escapa es al responder a la objeción: repetimos solo esa parte».
    No se castiga subiendo la dificultad.
- **Evidencia:** la transcripción queda en `roleplaySession` [HOY]; el resumen, como `AI-INFERENCE` (A4).
- **Modelo:** `MODEL_SENIOR`. **Tokens:** 200 por turno [HOY]. **Coste [HOY·corregir]:** cada turno reenvía la
  transcripción completa; en sesiones largas el coste de entrada crece con cada turno. **[V2]** tope de turnos
  por sesión y caché del bloque de sistema; prueba A/B medida de `MODEL_FAST` para el personaje (la calidad la
  juzga el responsable en una muestra, no se supone).
- **Latencia objetivo:** < 2,5 s por turno (objetivo de diseño; con voz, ver `services/voice.ts`).
- **Guardarraíles:** el personaje se presenta como simulación con IA; ninguna cara o voz sintética de una persona
  real sin consentimiento y etiqueta (art. 50); **[FUERA de MVP]** vídeo inmersivo (Act-Two, Veo, Gen-4) hasta
  que haya presupuesto aprobado y medición de que mejora la conducta observada.

**A4 · Evaluador** — **[HOY]** `aiContent.suggestRubricScore` + `roleplay.closeRoleplay` → **[V2·evolución]**
- **Entradas:** entrega del caso o transcripción, rúbrica visible (`validation.latestRubric`), situación crítica.
- **Salidas (JSON):** `{criterios:[{label, nota, cita}], fortalezas[], areasDeMejora[], debilidadPrincipal}`;
  **[V2]** cada afirmación con **cita literal** de la entrega o de la transcripción; sin cita, se descarta.
- **Evidencia:** `AI-INFERENCE`, siempre. Es una **sugerencia para quien valida**; la decisión la toma una persona
  (`validation.validateCase`, [HOY], con compare-and-swap y prohibición de autovalidarse).
- **Dispara:** `debilidadPrincipal` → pausa correctiva en A3; nada más.
- **Modelo:** `MODEL_SENIOR`. **Tokens:** 500 (resumen de roleplay) [HOY].
- **Guardarraíles:** no puntúa acento, ortografía ni forma de hablar salvo que la rúbrica lo pida
  explícitamente; auditoría de sesgo en §9.3.

**A5 · Seguimiento** — **[HOY]** `reminders.ts` + `followup.ts` → **[V2·evolución]**
- **Entradas:** niveles, check-ins, pulsos, Momento, casos en borrador.
- **Salidas:** recordatorios y el check-in conversacional (`AGENT-PROMPTS.md §11`: `{aplica, impacto,
  sensacion, siguientePaso}`).
- **Evidencia:** check-in = `SELF-REPORT` con `subjectUserId` y `situationId` [V2].
- **Dispara (fase 1):** reglas temporales actuales **[HOY]** (14 días tras validar, no repetir antes de 30).
  **(fase 2)** la jerarquía de señales de §7.5.
- **Modelo:** reglas sin IA para decidir; `MODEL_FAST` solo para conversar el check-in.
- **Guardarraíles:** **no infiere emociones**. La «sensación 1-5» la declara la persona; no se deduce de su forma
  de escribir (§9.2). Máximo un aviso de seguimiento por semana y persona (objetivo de diseño contra la fatiga).

**A6 · Copiloto del responsable** — **[HOY]** `registry.ts` (rol `team_leader`) → **[V2·evolución]**
- **Entradas:** Momentos de su equipo, M1-M4 por persona, discrepancias, validaciones pendientes, Team DNA
  agregado (`teamdna.teamAggregate`).
- **Salidas:** (a) respuesta a «¿cómo va María?» en formato fijo: *progresa en · necesita práctica en ·
  recomendación para esta semana*, cada punto con su evidencia enlazada; (b) **«describe el caso»** → brief de
  simulación con criterios de evaluación, que entra en la cola de práctica de la persona; (c) preparación de
  conversación del Leadership Coach: qué decir, qué preguntar, qué evitar, qué nivel de delegación probar, qué
  señal observar y cuándo volver.
- **Evidencia:** lo que el responsable afirma queda como `MANAGER-FEEDBACK`; lo que sugiere el copiloto, como
  sugerencia (no evidencia).
- **Dispara:** asignación de práctica (`/api/tl/assign-practice`), reordenación temporal de prioridades (§7.5).
- **Modelo:** `MODEL_SENIOR`. **Tokens:** ≤ 900 de salida.
- **Guardarraíles:** nunca etiqueta («es inseguro», «no vale»); no compara personas en ranking; no responde sobre
  salud, vida privada ni categorías especiales de datos; no recomienda despidos, sanciones ni sueldos.

**A7 · Redactor del Informe de Retorno** — **[V2]** nuevo `services/roi.ts`
- **Entradas:** el `data` calculado de forma determinista (§3.3) y el tipo de lector (dirección, RR. HH.,
  responsable).
- **Salidas:** lectura en lenguaje de negocio, 150-300 palabras, con las cifras **inyectadas** entre marcadores.
- **Evidencia:** ninguna; es presentación.
- **Guardarraíl clave:** comprobador posterior que extrae todos los números del texto y **rechaza** la salida si
  aparece alguno que no esté en `data` (reintento una vez; si vuelve a fallar, se publica el informe sin lectura
  redactada). Prohibidas las frases de causalidad («gracias a SkillUp…»).
- **Modelo:** `MODEL_SENIOR`, temperatura baja. **Frecuencia:** tres veces por Momento (30/60/90).

**A8 · Guardián** — **[V2]** nuevo `services/governance.ts` (código primero)
- **Reglas con veto (deterministas):** ninguna `AI-INFERENCE` en el informe · ninguna cifra sin fuente · nada
  enviado al responsable sin pasar por el filtro de etiquetas («inseguro», «ansioso», «impostor», «vago»… lista
  mantenida) · ninguna llamada de IA sin `orgId` · tope de gasto por persona y periodo alcanzado → corta la
  generación con mensaje claro · datos de una organización nunca en el contexto de otra.
- **Muestreo con modelo:** `MODEL_FAST` revisa una muestra de respuestas de A1 y A6 buscando juicios sobre
  personas; los hallazgos van al panel de gobernanza, no bloquean en tiempo real.
- **Evidencia:** `auditLog` con `action: 'governance.block' | 'governance.flag'`.

---

## 6. Pantallas

Convenciones: móvil primero (360 px), estados siempre diseñados (vacío, cargando, éxito, error, sin datos),
microcopy en español de España, botones con verbo. Las métricas de éxito son **definiciones**; los valores
objetivo se fijan tras el piloto 0 con la línea base propia, no antes.

### P1 · Alta del Momento **[V2]** — responsable (o la propia persona)
- **Objetivo:** convertir «le acabamos de ascender» en un Momento con situaciones críticas y línea base, en
  menos de 10 minutos (objetivo de diseño).
- **Flujo:** ¿quién? → ¿qué ha cambiado? (tipo de Momento, fecha) → «Cuéntame 3-5 situaciones en las que ahora le
  toca a él/ella y antes no» (texto o voz) → A2 propone la lista y la competencia de cada una → el responsable
  confirma → **línea base**: por situación, la escala de autonomía 0-3 y «¿cuántas veces por semana acabas
  interviniendo?» y «¿cuánto te lleva cada vez?» (opcional).
- **Microcopy clave:**
  - Título: «¿Qué acaba de cambiar en su trabajo?»
  - Ayuda: «Describe lo que tendrá que resolver sin ti. Con tus palabras, sin jerga de RR. HH.»
  - Base: «Hoy, cuando surge esto, ¿qué pasa?» — «Lo acabo haciendo yo» · «Lo hace, pero conmigo al lado» · «Lo
    hace solo y me lo cuenta» · «Lo hace solo y podría enseñarlo».
  - Aviso: «Esta es la foto de partida. A los 90 días la compararemos con lo que veas entonces.»
- **Casos límite:** situación sin competencia en el catálogo → se crea igualmente, marcada «sin ruta aún» y
  enviada como demanda; el responsable no sabe estimar rescates → «No lo sé» es una respuesta válida (base
  `null`) y se proponen dos semanas de Pulso antes de empezar; la persona da de alta su propio Momento → el
  responsable recibe invitación para confirmar la base (sin base confirmada no entra en la garantía).
- **Métrica de éxito:** % de Momentos con base completa en todas sus situaciones; tiempo mediano de alta.

### P2 · Bienvenida y primer contacto **[HOY·evolución de `bienvenida.html` y `onboarding.html`]** — persona
- **Objetivo:** que la persona entienda para qué está aquí (su Momento), dé contexto mínimo y haga su primera
  práctica el mismo día.
- **Flujo:** mensaje de bienvenida que **nombra la situación** → entrevista corta (director académico,
  `AGENT-PROMPTS.md §8`, máx. 5 preguntas) → web de su empresa (`analyzeCompany` [HOY]) → Team DNA opcional
  [HOY] → **primera práctica de 5 minutos** sobre su situación más cercana.
- **Microcopy:** «Te han dado tu primer equipo. Aquí vas a entrenar lo que te toca a partir de ahora, con tus
  casos de verdad.» · Transparencia: «Tu responsable verá cómo avanzas en estas situaciones. No verá tus
  conversaciones con el coach. Puedes consultar todo lo que se sabe de ti en "Mi expediente".»
- **Casos límite:** la persona no quiere hacer el Team DNA → se omite sin penalizar; web de la empresa no
  accesible → se sigue con puesto y sector; la persona rechaza el Momento («no me siento así») → el texto nunca
  asume emociones, solo hechos (qué ha cambiado).
- **Métrica:** % de personas con primera práctica el día del alta; abandono por paso.

### P3 · Mi Momento (inicio de la persona) **[V2]**
- **Objetivo:** una sola pantalla con «qué entreno ahora y por qué».
- **Contenido:** situaciones críticas con su estado (sin números de nivel a la vista: «En práctica» · «Validado»
  · «Ya lo resuelves solo»), la práctica recomendada de hoy (según §7.5) y el siguiente paso real («Esta semana
  tienes la reunión con el cliente: prepárala aquí»).
- **Estados:** sin Momento → ruta clásica [HOY]; Momento cerrado → resumen y certificado.
- **Microcopy:** «Hoy toca: sostener el precio cuando el cliente aprieta. 6 minutos.»
- **Métrica:** prácticas por persona y semana; % de semanas con al menos una práctica.

### P4 · Práctica en vivo (Simulador) **[HOY·evolución de `reto.html` + roleplay]**
- **Objetivo:** ensayar la situación crítica antes de vivirla.
- **Flujo:** brief visible («Vas a hablar con el responsable de compras de un cliente que pide adelantar la
  entrega dos semanas») → conversación (texto o voz) → pausa correctiva si toca → cierre con sugerencia de A4
  claramente etiquetada.
- **Microcopy:** «Esto es una simulación con IA. Aquí equivocarse es gratis.» · Pausa: «Paramos aquí un momento.
  Vas bien explicando; donde se te escapa es al responder a la objeción. Repetimos solo esa parte.» · Cierre:
  «Sugerencias de la IA (no es una nota). Quien valida es una persona.»
- **Casos límite:** la persona sale a mitad → la sesión queda abierta 24 h y luego se cierra sin resumen; tope de
  gasto alcanzado → «Hoy ya has practicado mucho. Mañana seguimos» (sin mencionar costes); contenido inadecuado
  del usuario → el personaje sale del rol y la sesión se cierra.
- **Métrica:** sesiones completadas; repetición de la misma debilidad en sesiones consecutivas (debe bajar).

### P5 · Lección por capas **[HOY·evolución de `leccion.html` + `generateLessonDraft`]**
- **Regla:** teoría mínima → aplicación inmediata → feedback → ampliación. La lección tiene un **objetivo de
  competencia**, no una longitud: si la persona acierta la microcomprobación inicial, salta a la capa de caso.
- **Microcopy:** «¿Cómo te ves con esto: seguro, con dudas o poco cómodo?» (la respuesta es `SELF-REPORT` y solo
  cambia el punto de partida).
- **Fase:** 2. En el MVP se usa la lección práctica ya existente.

### P6 · Caso real y validación **[HOY]** `validar.html` + `validation.ts`
- **Se mantiene** el núcleo diferencial: rúbrica visible antes del ejercicio, entrega con evidencia, validación
  por una persona N3 (o admin/inspirador al arrancar), puerta de progreso y de gasto (`assertCanProgress`).
- **[V2]** el caso se ata a una situación crítica; la sugerencia de A4 aparece al validador con citas; **SLA de
  validación** visible («Pendiente desde hace 3 días»).
- **Caso límite importante:** al inicio del piloto **no hay N3** en casi ninguna competencia, así que todo recae en
  admin/inspirador → cuello de botella. Mitigación: el responsable del Momento valida en arranque (ya permitido
  por rol) y el aviso de pendientes le llega por el Pulso.
- **Métrica:** tiempo mediano entrega → validación; % de validaciones con feedback escrito.

### P7 · Pulso del responsable **[V2]** — la pieza que hace medible el hook
- **Objetivo:** capturar conducta real cada semana en el menor tiempo posible (objetivo de diseño: ≤ 20 s por
  persona).
- **Flujo:** una tarjeta por persona y situación que **surgió** esa semana: «Esta semana, cuando [situación],
  ¿qué pasó?» → No surgió · Lo resolvió solo · Con mi apoyo · Lo acabé haciendo yo. Opcional: una frase.
- **Canal:** panel y correo semanal con respuesta de un toque (enlaces firmados de un solo uso).
- **Microcopy:** «¿Qué tal esta semana con el equipo? Te lleva un minuto.» · Tras responder: «Hecho. Con esto
  tu informe del día 60 tendrá datos reales.»
- **Casos límite:** el responsable no responde 2 semanas → aviso al comprador (RR. HH./dirección) porque pone en
  riesgo la garantía; el responsable cambia → el Momento se reasigna y el informe lo anota; responde siempre lo
  mismo → se muestra la distribución sin juicio (el Guardián no «corrige» al responsable).
- **Métrica:** tasa de respuesta del Pulso (la variable que más condiciona la garantía); tiempo por respuesta.

### P8 · Check-in de aplicación **[HOY]** `/api/followup`
- **Se mantiene** el contrato de `AGENT-PROMPTS.md §11`. **[V2]** se liga a la situación crítica y, si el
  responsable marcó «Lo resolvió solo» en la misma ventana, el informe lo muestra como aplicación corroborada.
- **Microcopy:** «Hace dos semanas validaste cómo defender el calendario. ¿Te ha tocado usarlo? Cuéntame qué pasó.»

### P9 · Copiloto del responsable **[HOY·evolución de `panel.html` + chat `team_leader`]**
- **Vistas:** «Mi equipo» (Momentos activos, discrepancias, pendientes de validar, pulsos pendientes) · chat con
  A6 · «Encargar una práctica».
- **Microcopy:** «Describe el caso como se lo contarías a un compañero y lo convierto en una práctica.» · Respuesta
  tipo: «Progresa en preparar la reunión. Necesita práctica en cerrar próximos pasos. Esta semana: que sea ella
  quien proponga la fecha de seguimiento al cliente.»
- **Casos límite:** pregunta por algo que no es de trabajo («¿está deprimida?») → «Eso no lo puedo valorar ni es
  algo que registre esta herramienta. Si te preocupa, habla con ella o con RR. HH.»; pregunta comparativa
  («¿quién es el peor?») → se reconduce a necesidades de práctica por situación.
- **Métrica:** prácticas encargadas por el responsable que se completan; uso semanal.

### P10 · Informe de Retorno **[V2]** — dirección, RR. HH., CFO
- **Objetivo:** que alguien que no ha usado la herramienta entienda en dos minutos qué ha cambiado y cuánto ha
  costado.
- **Estructura:** veredicto de la garantía (arriba) → tabla base/actual por situación (M1, M2) → aplicación (M3)
  → tiempo a autonomía (M4) → riesgo de dependencia (M5) → coste neto (M9) → ROI o «pendiente: nos falta…» →
  lectura redactada (A7) → citas reales (con permiso) → recomendación.
- **Cada cifra:** chip de certeza (FACT verde · MANAGER-FEEDBACK azul · SELF-REPORT ámbar · pendiente gris) y
  enlace a su evidencia.
- **Microcopy:** «Base declarada por el responsable el 3 de octubre» · «Pendiente de medir: faltan 2 semanas de
  pulso en esta situación» · «Esto es lo que ha cambiado desde el inicio; no aislamos otras causas.»
- **Exportación:** PDF con marca (para adjuntar a la tarea del cliente) y enlace vivo.
- **Métrica:** % de informes del día 90 que cumplen la garantía; conversión piloto → continuidad.

### P11 · Calculadora de coste neto y FUNDAE **[V2]** — preventa, RR. HH.
- **Entradas del cliente:** tamaño de plantilla, masa salarial o crédito disponible si lo conoce, nº de Momentos.
- **Salida:** crédito estimado con la tabla oficial del ejercicio (norma y fecha visibles), coste neto estimado y
  calendario (comunicación ≥ 2 días antes; cierre de crédito el 31/12).
- **Microcopy:** «Estimación con los datos que nos has dado. Tu crédito real está en tu cuenta de FUNDAE.» Nunca
  «gratis».
- **Métrica:** % de visitas que completan la calculadora → petición de piloto.

### P12 · Mi expediente **[V2·evolución de `privacy.ts`]** — cada persona
- **Objetivo:** confianza. La persona ve todo lo que el sistema sabe de ella, con su certeza y su origen.
- **Contenido:** evidencias por certeza, sugerencias de IA (marcadas), pulsos que la afectan (con resultado, sin
  comentarios privados del responsable si el cliente lo configura así), exportación y borrado [HOY].
- **Microcopy:** «Esto es lo que SkillUp sabe de ti y de dónde sale. Las sugerencias de la IA no cuentan para tu
  nivel.»
- **Métrica:** incidencias o quejas de privacidad (debe ser cero); uso de la vista.

---

## 7. Reglas del sistema

### 7.1 Ciclo completo
`Momento → Base → Practicar → Validar → Aplicar → Observar (Pulso) → Adaptar → Enseñar → Cerrar con informe`.
**Enseñar [V2·fase 3]**: el nivel 3 se prueba enseñando (mentor simulado: «Tu compañera comete este error; ayúdala»),
coherente con la evidencia de aprender enseñando citada en `MODELO-BRANDOOERS.md §7`. Hoy el N3 se alcanza con
personas formadas que llegan a N2 (`propagation.evaluateReferente`).

### 7.2 Puerta de progreso y de gasto **[HOY]**
Sin validar el caso actual no se genera lo siguiente (`assertCanProgress`). **[V2]** se añade un **tope de gasto por
persona y periodo** (valor fijado tras el piloto 0 con el coste real medido en M8), aplicado por A8.

### 7.3 Niveles ≠ puntos **[HOY]**
Se mantiene la doctrina de `MODELO-BRANDOOERS.md §3`: los puntos no abren niveles; el primer año nada se ata a
nómina (`companyConfig.salaryLinked` por defecto `false`).

### 7.4 El cerebro que crece **[HOY]**
Al validar, `distillBestPractice` destila una buena práctica anónima al cerebro de la empresa. **[V2]** se etiqueta
por situación crítica, de modo que la siguiente persona con el mismo Momento practica con casos reales de su
propia empresa (base del efecto red interno, §10.2).

### 7.5 Qué se entrena ahora (jerarquía de señales) **[V2·fase 2]**
`Seguridad/cumplimiento > situación crítica con evento en fecha próxima > petición explícita del responsable >
discrepancia demostrado/observado > debilidad repetida (A4) > objetivo declarado por la persona > temario`.
Señales que se persisten (`signal(orgId, userId, kind, value, source, ts)`): `pulso_rescate`,
`discrepancia`, `debilidad_repetida`, `sin_practica_7d`, `evento_proximo`, `peticion_responsable`,
`aplicacion_si`, `logro`. **No** se persisten señales emocionales inferidas (§9.2).

---

## 8. Plan de construcción

### 8.1 Principio
Construir sobre lo que ya existe (Hono + Drizzle + better-auth + Stripe + Anthropic; sin colas hoy). No se añade
BullMQ ni otra dependencia mientras un temporizador del proceso o una consulta al abrir la pantalla basten; se
añade cuando haya un trabajo > 2 s que no pueda esperar a la petición (regla del stack). Cada bloque deja su test.

### 8.2 Fases

**Semana 0 · Honestidad del dato (2-3 días)**
- Correcciones de §3.2 (`null` frente a `0`, transferencia interna, cobertura vacía, `subjectUserId`, fecha de
  tarifas en `costs.ts`).
- **Salida:** tests unitarios de cada función con caso «sin datos» → `null`; typecheck 0.

**Semanas 1-2 · Momento, base y Pulso (el MVP vendible empieza aquí)**
- Tablas `moment`, `critical_situation`, `pulse` + migración; A2 (Arquitecto del Momento); P1 y P7; correo semanal
  del Pulso con enlaces de un solo uso.
- **Salida:** test de aislamiento multiempresa de las tres tablas; test de las fórmulas M1, M2 y M7 como funciones
  puras (incluidos «menos de 3 semanas → `null`»); e2e: alta de Momento → base → 3 pulsos → M2 calculado.

**Semana 3 · Práctica atada a la situación**
- Simulador con dificultad por regla y pausa correctiva; caso y check-in ligados a `situationId`; A4 con citas
  literales.
- **Salida:** test de que una debilidad repetida dispara la pausa; test de que A4 nunca modifica niveles.

**Semana 4 · Informe de Retorno y FUNDAE por Momento**
- `services/roi.ts` (cálculo determinista + A7 con comprobador de cifras); P10 con exportación PDF; P11; empaquetado
  de Momento como acción FUNDAE reutilizando `fundae.ts`.
- **Salida:** test del comprobador (un número inventado en la lectura → rechazo); informe D30 generado con datos de
  prueba sin ninguna cifra sin fuente (auditoría automática del `data`).

**Semana 5 · Guardián, transparencia y coste**
- A8 (reglas de veto + filtro de etiquetas + tope por persona); P12; aviso de IA en chat y simulador; ventana de
  historial en `chat.ts` y tope de turnos en roleplay.
- **Salida:** test de cada regla de veto; test de aislamiento del contexto entre organizaciones en A1 y A6.

**Semana 6 · Piloto 0 (dogfooding)**
- Un Momento real en casa (juniors de Boomatik/Nextdoo ante cliente: el caso fundacional del ICP, §4.5) con
  consentimiento informado.
- **Criterios de salida medibles del MVP:**
  1. Base completa en el 100 % de las situaciones del piloto 0.
  2. Informe D30 generado sin intervención manual y sin cifras sin fuente.
  3. **Coste de IA real por persona activa medido** (M8) → se fija el tope por persona y el suelo de precio (§11).
  4. Tiempo real de respuesta del Pulso medido (valida o tumba el objetivo de ≤ 20 s).
  5. Cero hallazgos P0 en revisión de seguridad (`boo-security-auditor`) y de código (`boo-code-reviewer`).
  6. Revisión legal cerrada de: texto de la garantía, aviso a la persona, evaluación de impacto (§9).

**Fase 2 · semanas 7-12 — profundidad**
- Columnas de certeza en `evidence` y vista `learnerState`; señales y jerarquía de §7.5 sustituyendo el disparo
  por calendario en `reminders.ts`; copiloto con «describe el caso → práctica»; lección por capas (P5); M10 (KPI
  del cliente); foto semanal programada; auditoría de sesgo de validaciones (§9.3).
- **Salida:** primer cliente externo con informe D90 entregado; comparación de tiempo a autonomía entre la primera
  y la segunda persona con el mismo Momento en una empresa (primera medición del efecto red interno).

**Fase 3 · trimestre siguiente — expansión**
- Examinador dinámico con estado actual; nivel Enseñar; Master Knowledge Object; biblioteca de Momentos entre
  empresas (anónima y con consentimiento, §10.3); B2C «Momento individual» si la demanda del formulario de admisión
  lo justifica; audiovisual inmersivo con coste aprobado.

---

## 9. Gobernanza, legal y sesgos (transversal, con veto)

> Esta sección detecta riesgos y prepara la pregunta para la asesoría; no sustituye a un abogado ni a un DPO.
> Toda norma citada se relee en BOE o EUR-Lex antes de usarla cara a cliente.

### 9.1 Reglamento de IA (Reglamento (UE) 2024/1689)
- **Transparencia (art. 50):** la persona sabe que habla con una IA (coach, simulador, copiloto). Contenido
  sintético etiquetado.
- **Alto riesgo (anexo III):** el anexo III incluye sistemas para **evaluar resultados de aprendizaje** en formación
  profesional y sistemas usados en el empleo para **evaluar el rendimiento y la conducta** o para decisiones de
  promoción. SkillUp roza ambos. Decisión de diseño para quedar como **apoyo a la decisión con supervisión
  humana**: la IA nunca decide un nivel, un certificado, una promoción ni una señal a RR. HH.; decide una persona
  con la evidencia a la vista; todo queda registrado. **Pendiente:** verificar en EUR-Lex el calendario vigente de
  aplicación de las obligaciones de alto riesgo (ha habido propuestas de aplazamiento) y si el diseño basta para
  quedar fuera o hay que cumplir como alto riesgo.
- **Alfabetización en IA (art. 4):** obligación del que despliega; opción de producto a valorar (no MVP).

### 9.2 Nada de inferir emociones
La v2.0 incluía un «Motivation Agent» y señales como `frustration_signal` y «estado contextual: frustración,
confianza». **[FUERA]**. El Reglamento de IA prohíbe los sistemas de reconocimiento de emociones en el lugar de
trabajo y en centros educativos (art. 5.1.f; su definición se refiere a datos biométricos, pero el riesgo
reputacional y de confianza es el mismo con texto). Sustitución: la persona **declara** cómo se siente (1-5) si
quiere; el sistema solo usa conducta observable (practicó o no, repitió el error o no).

### 9.3 Sesgos
- A4 no puntúa acento, registro ni ortografía salvo criterio explícito de la rúbrica.
- **Auditoría trimestral** de tasas de validación y de resultados del Pulso por equipo, puesto y validador (sin
  recoger categorías especiales de datos): diferencias persistentes → revisión humana por muestreo (`inspirador`).
- Un validador cuyas aprobaciones se revocan en auditoría pierde el rol, no puntos (doctrina de la cascada).

### 9.4 RGPD, LOPDGDD y derecho laboral
- **Evaluación de impacto:** probable (evaluación sistemática de empleados con tecnología nueva). Confirmar con DPO
  antes del primer cliente externo.
- **Decisiones automatizadas (RGPD art. 22):** no las hay por diseño (§9.1).
- **Representación de los trabajadores:** el Estatuto de los Trabajadores (art. 64.4.d, redacción de la Ley 12/2021)
  reconoce el derecho del comité a ser informado de los parámetros de algoritmos que afecten a condiciones de
  trabajo. El kit de implantación incluye una ficha para el cliente. Releer en BOE.
- **Minimización:** el responsable no ve conversaciones con el coach; ve estado por situación y evidencias de
  trabajo.
- **Olvido sin perder lo aprendido [HOY]:** `privacy.ts` exporta y borra; lo destilado al cerebro va anonimizado.
- **Proveedor de IA:** contrato de encargo y transferencias verificadas con la documentación oficial del proveedor.

### 9.5 FUNDAE y publicidad
- Sin «100 % gratis» ni «riesgo cero»; plazos y porcentajes con norma y ejercicio (ICP §11).
- La garantía se redacta sobre la medición (§1.3), nunca sobre resultados.

---

## 10. Disrupción y defensibilidad

### 10.1 Por qué es 10x y no 10 %
Un LMS mejor (más cursos, mejor tutor con IA, tests generados) es un 10 %: la IA generativa ha convertido eso en
mercancía (`STRATEGY.md §0`). SkillUp cambia **qué se compra** (preparación para un Momento con fecha), **qué se
mide** (conducta con línea base) y **quién paga** (crédito que ya existe). Para copiarlo no basta con añadir un
chat: hay que tener validación humana dentro del cliente, un protocolo de medición que el responsable use cada
semana y el empaquetado FUNDAE. Es un cambio de modelo operativo, no una función.

### 10.2 Efecto red interno (medible)
Cada caso validado se destila al cerebro por situación crítica → la siguiente persona con el mismo Momento practica
con casos reales de su empresa → más personas llegan a N2 y N3 → hay más validadores internos → el cuello de botella
de validación se abre y baja el coste de formar al siguiente. **Cómo se prueba (no se supone):** comparar M4 entre
cohortes sucesivas del mismo Momento en la misma empresa (fase 2).

### 10.3 Foso de datos
- **Dentro de cada cliente:** grafo de evidencias, casos validados y líneas base = coste de cambio alto y legítimo
  (el cliente puede exportarlo; aun así, rehacerlo lleva meses).
- **Entre clientes (fase 3, opt-in, anonimizado según el considerando 26 del RGPD):** biblioteca de Momentos —qué
  situaciones críticas tiene cada Momento por sector y qué prácticas preceden a la autonomía—. Nunca venta de datos
  (`MONETIZATION.md`, «no recomendados»).
- **Marca:** «los que miden». En un mercado donde casi nadie mide conducta, el protocolo es parte del producto.

### 10.4 El valor de Brandooers dentro de SkillUp
- **Origen consultoría Odoo/ERP** como prueba de autenticidad (ICP §4.5): el primer vertical y el piloto 0 son
  consultoras que ponen a juniors delante del cliente muy pronto.
- **Motor de contenido verificado** (`AGENT-PROMPTS.md §1-7`: investigador, curador, verificador independiente con
  veto): cada Momento tiene su guía verificada (ya existe la de primer equipo). Las situaciones que faltan en el
  catálogo (A2, `faltaEnCatalogo`) son la cola de producción del estratega de temas con demanda real.
- **Voz peninsular** en un tema dominado por contenido latinoamericano (ICP §0.7).
- **El cluster puente** (formación bonificable × talento joven con responsabilidad) como posicionamiento comercial.

---

## 11. Propuesta al cliente y precios (estructura; sin inventar precios)

**Fuentes:** `MONETIZATION.md` (tiers enterprise, certificados verificados, precio por resultado atado a
competencia demostrada y nunca al sueldo), `MODELO-BRANDOOERS.md §5 y §8`, `billing.ts` [HOY: suscripción mensual
por asiento en tres niveles `texto`, `video_corto`, `inmersivo`; el importe lo fija Boomatik en `pricingTier`, hoy
sin valores publicados en esta spec].

**Estructura propuesta:**

1. **Piloto de Momento · 90 días** (puerta de entrada B2B). Un equipo, un Momento por persona, línea base, Pulso,
   informes 30/60/90. Precio cerrado por piloto. **Garantía sobre la medición** (§1.3), con obligaciones del
   cliente por escrito. Empaquetado como acción FUNDAE cuando cumpla los mínimos.
2. **Continuidad** (tras un D90 con medición entregada): suscripción por **persona con Momento activo** en el nivel
   de `billing.ts` que corresponda. Se cobra por Momento activo, no por plantilla: el cliente paga por lo que usa y
   el precio se defiende con su propio informe.
3. **Complementos** (de `MONETIZATION.md`, primera ola): certificados verificables con la evidencia detrás;
   funciones de escala y gobierno (SSO, exportaciones) en niveles superiores.

**Reglas de precio (sin cifras hasta medir):**
- **Suelo de margen:** precio por persona activa ≥ k × coste de IA medido por persona (percentil alto de M8 en el
  piloto 0). **k** lo fija Marc con el dato real; esta spec no lo inventa.
- **Anclaje de venta:** el coste neto tras FUNDAE del propio cliente (P11), nunca «gratis».
- **Estacionalidad:** empuje comercial octubre-diciembre (cierre de crédito) y recordatorio de acumulación antes del
  30 de junio (ICP §2).
- **Precio por resultado** (tercera ola de `MONETIZATION.md`): solo atado a autonomía demostrada y observada (M1),
  nunca a sueldo ni a facturación del empleado.

**Guion de propuesta (una página para el comprador):** situación («Le acabas de dar su primer equipo») → qué
entrenamos (sus 3-5 situaciones críticas) → cómo lo medimos (base del día 0, Pulso de un minuto, informe a 30/60/90)
→ qué pones tú (un minuto por persona y semana, validar sus casos) → cuánto te cuesta de verdad (tu coste neto con
FUNDAE) → garantía (si no ves la medición, no pagas).

---

## 12. Riesgos abiertos

| Riesgo | Por qué importa | Siguiente paso |
|---|---|---|
| **El responsable no responde el Pulso** | Sin Pulso no hay M1/M2 y cae la garantía | Medir la tasa real en el piloto 0; si es baja, simplificar aún más o probar otro canal |
| **Calendario y alcance del anexo III del Reglamento de IA** | Puede exigir obligaciones de alto riesgo | Verificación en EUR-Lex + asesoría antes del primer cliente externo |
| **Inscripción en el Registro Estatal de Entidades de Formación** | `MODELO-BRANDOOERS.md §8` concluye que como proveedor docente no hace falta; el ICP (§4.3) dice que RR. HH. la pide como señal de confianza | Decisión de Marc: inscribirse por confianza comercial o explicar el encaje de proveedor docente |
| **Cuello de botella de validación humana** al arrancar | Sin N3 todo recae en uno o dos validadores | Responsable como validador de arranque + SLA visible |
| **Coste de IA por persona sin medir** | Sin M8 no hay suelo de precio | Piloto 0 obligatorio antes de publicar precios |
| **Línea base declarada** (no observada) | Es memoria del responsable, con su sesgo | Etiquetarla siempre; recomendar dos semanas de Pulso previo |
| **Capacidad del equipo** frente a otras prioridades del ecosistema | El MVP de 6 semanas asume dedicación sostenida | Confirmar con Marc antes de arrancar |
| **Tarifas de `costs.ts`** | Posible desfase con la tarifa oficial | Verificar y fechar |

---

## Anexo A · Registro de iteraciones (las tres rondas)

### Ronda 1 — Crítica dura del producto

**Críticas (sobre la v2.0):**
1. **Genérica en el hook.** «Arquitectura de aprendizaje adaptativo» es lo que dice cualquier plataforma con IA. No
   había una frase que un gerente repitiera en la cena.
2. **Lo que ya hace el mercado.** Tutor conversacional, tests generados, contenido personalizado por sector: están
   en catálogos grandes y en generadores con IA (`STRATEGY.md §1`). No son diferenciales por sí solos.
3. **Falsa precisión.** «Nivel 43/100, confidence 0,68» no tiene método que lo sostenga.
4. **Personalización por estilos de aprendizaje** como pilar: evidencia débil (Pashler y otros, 2008).
5. **Doce agentes**, varios de ellos decisiones deterministas (orden de temario, recálculo de fortalezas, dificultad):
   coste, latencia y opacidad sin retorno.
6. **Métricas que mienten hoy en el código:** `timeToAutonomyDays` y `internalTransferRate` devuelven `0` sin datos;
   la transferencia interna no cruza competencia; la línea base de un piloto recién empezado no mide nada; las fotos
   del panel tienen huecos.
7. **Coste que crece sin control:** chat y roleplay reenvían el historial completo cada turno.
8. **Desalineación spec-código:** cinco ejes de fortaleza en la spec, cuatro en `teamdna.ts`.
9. **Audiovisual inmersivo** en el plan sin medición de que mejore la conducta: caro sin retorno demostrado.

**Optimizaciones aplicadas:** el Momento como unidad (§1-2); escala ordinal con dos lentes (§2.2); personalización
por contexto y pericia, no por estilo (§4); ocho agentes con contrato, reglas donde basta una regla (§5); tabla de
correcciones del código (§3.2); control de coste por turno (§5.2 A1/A3); alineación con cuatro familias (§2.1);
audiovisual a fase 3 con condición (§5.2 A3).

### Ronda 2 — Crítica desde el comprador

| Quién | ¿Por qué pagaría? | Objeción que mata la venta | Respuesta en V2.1 |
|---|---|---|---|
| **CEO/gerente de pyme** | Dejar de estar encima de todo; no perder la cuenta | «Esto se aprende con la experiencia» · «¿Y si lo formo y se va?» | Se entrena su experiencia real antes de que ocurra; se mide con su propia vara (rescates); lo validado se queda en el cerebro de la empresa (M5, §7.4) |
| **RR. HH./People** | Ejecutar el crédito FUNDAE sin riesgo | «Papeleo» · «¿Estáis inscritos?» | Paquete justificativo [HOY]; calendario; el registro queda como riesgo abierto con decisión de Marc (§12) |
| **CFO** | Gasto con retorno defendible | «¿Cuánto me cuesta de verdad y qué recupero?» | Coste neto con sus datos (M9); ROI en euros solo con su coste hora; si no, componentes medidos (§3.3) |
| **Responsable de equipo** | Recuperar su tiempo | «No tengo tiempo» · «Esto me va a vigilar a mí» | Pulso de un minuto; el copiloto le prepara conversaciones; las métricas son de las situaciones de su equipo, no una nota suya |
| **Persona joven** | Que se le vea capaz en la próxima reunión | «Otro curso para el CV» · «Me están evaluando» | Practica su reunión real; «Mi expediente» (P12); la IA no decide nada; nada va a nómina el primer año |

**Qué se puede demostrar en 90 días, honestamente:** autonomía observada por situación, rescates, aplicación real,
tiempo a primera validación, riesgo de dependencia en las competencias del Momento. **Qué no:** efectos en la cuenta
de resultados o en rotación; se dejan como M10 opcional.

**Optimizaciones aplicadas:** Pulso del responsable (P7) como fuente de conducta; línea base del día 0 obligatoria
(§1.3, P1); informe 30/60/90 con semáforo de la garantía (§3.4); garantía bilateral sobre la medición (§1.3); ROI en
euros solo con datos del cliente (§3.1); calculadora FUNDAE sin «gratis» (P11); A7 con comprobador de cifras (§5.2).

### Ronda 3 — Crítica de disrupción, defensibilidad, legal y coste

**Críticas:**
1. **¿Es 10x o 10 %?** Con tutor más tests más roleplay es 10 %. Solo el cambio de unidad (Momento), de métrica
   (conducta con base) y de pagador (FUNDAE) lo hace distinto.
2. **Foso:** el contenido generado no es foso. Sí lo son la evidencia acumulada dentro de cada cliente, el protocolo
   de medición en uso semanal y, con consentimiento, la biblioteca de Momentos entre empresas.
3. **Riesgo legal serio:** inferir frustración o confianza de la conducta choca con la prohibición de reconocimiento
   de emociones en el trabajo (Reglamento de IA, art. 5.1.f) y erosiona la confianza; evaluar rendimiento y proponer
   ascensos roza el anexo III (alto riesgo); el comité de empresa tiene derecho a información sobre algoritmos (ET
   64.4.d).
4. **Sesgos:** un evaluador con IA puede penalizar formas de hablar; los validadores humanos también sesgan.
5. **Coste de IA por usuario:** sin medir y con dos fuentes de crecimiento conocidas (historial en chat y roleplay).

**Optimizaciones aplicadas:** tesis de 10x explícita (§10.1); efecto red con forma de medirlo (§10.2); foso de datos
en dos niveles (§10.3); Motivation Agent eliminado y sensación solo declarada (§9.2); IA siempre como apoyo con
decisión humana y registro (§9.1); auditoría de sesgo (§9.3); ficha para la representación de los trabajadores
(§9.4); M8 medido en el piloto 0 como condición para publicar precios (§8, §11); tope de gasto por persona (§7.2).

### Qué se descartó y por qué (resumen)
Nivel 0-100 con decimales · personalización por estilo cognitivo como motor · Motivation Agent y señales emocionales
· DNA Agent y Adaptation Agent como modelos · audiovisual inmersivo en el MVP · cualquier cifra de mejora
prometida · «FUNDAE gratis».

---

*SkillUp V2.1 · especificación de producto · vive junto a `AGENT-PROMPTS.md`, `MODELO-BRANDOOERS.md` y
`DATA-MODEL.md`. Se actualiza al construir cada bloque (lo que pase a real se marca [HOY]). Los costes y tiempos
reales se publican aquí cuando el piloto 0 los mida, nunca antes.*
