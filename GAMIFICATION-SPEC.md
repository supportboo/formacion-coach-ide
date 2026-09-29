# SkillUp · Sistema de gamificación y pirámides de conocimiento — especificación

> Convierte la visión de Marc en producto: puntos por valor real, ranking, camino a **coach** y
> **pirámides de conocimiento especializado** (anti-dependencia), perks configurables por la empresa,
> y un **agente de gamificación** que traduce lo que la empresa quiere en dashboards, retos y premios
> visuales (conectado a Higgsfield / HeyGen / Nano Banana / ElevenLabs). Marcas: **[HOY]** existe en
> `platform/src`, **[V2]** nuevo. LEY #0: cero cifras/ROI inventados; los puntos y perks son reglas
> configurables, no promesas.

---

## 0. Principio: multiplicar talento en pirámides, no acaparar coaches

El objetivo no es que unos pocos acumulen a todos los aprendices, sino que el conocimiento se
**especialice y se multiplique en pirámides**: quien domina *ventas* forma a los de ventas; quien
elige *construcción* forma a los de construcción. Regla anti-dependencia: **una competencia validada
debe tener siempre ≥2 personas** (el referente + al menos un coachee con su misma habilidad), para que
ningún saber crítico dependa de una sola cabeza. El sistema premia formar al siguiente, no retenerlo.

---

## 1. Motor de puntos — el valor real, medible

Los puntos salen de **señales de valor reales**, nunca inventadas, cada una con su fuente y su peso
configurable por la empresa. Familias de señales (el catálogo objetivo son 50-100 variables; aquí las
canónicas, ampliables):

| Familia | Ejemplos de señal | Fuente [HOY]/[V2] |
|---|---|---|
| **Aprender** | módulo completado, test aprobado, nivel subido, horas reales de práctica | testAttempt, levelByCompetency [HOY] |
| **Aplicar** | caso práctico validado por un humano, roleplay superado, aplicación reportada en seguimiento | appliedCase/validation [HOY], followup kpi [HOY] |
| **Enseñar (coach)** | coachee que sube de nivel contigo, coachee que valida su caso, horas de acompañamiento | propagation.onLearnerReachedN2 [HOY], coaching [HOY] |
| **Multiplicar** | nº de coachees activos en tu pirámide, profundidad de la pirámide, cobertura de tu especialidad | [V2] |
| **Calidad** | mejores tests/roleplays diseñados, casos que entran como material del Inspirador | validation/inspirador [HOY parcial] |
| **Constancia** | racha de práctica, días hasta autonomía, no abandonar | analytics.timeToAutonomy [HOY] |
| **Humano** | conocimiento emocional del puesto (cómo se siente, qué le cuesta), voz del usuario capturada | annotations/DNA [HOY parcial] |

- Ledger append-only de puntos por señal (`pointsLedger` [HOY]) con `source`, `weight`, `ts`,
  `ref` — auditable, reversible, sin duplicar (compare-and-swap ya usado en validación [HOY]).
- **Multiplicadores**: `MULT_CROSS_TEAM` existe pero está inerte (propagation.ts:8,138 — nunca se
  calcula el `crossTeam`); [V2] activarlo cuando la empresa tenga departamentos/pirámides.
- **Ponderación por empresa**: cada señal tiene un peso que el admin ajusta (ver §4). Sin configurar
  → pesos por defecto conservadores.

---

## 2. Ranking, niveles y camino a coach

- Niveles por competencia (0 novato → 1 en formación → 2 aplica → 3 referente/coach) [HOY].
- Al llegar a **referente (N3)** en una competencia, se desbloquea el rol **coach** de esa habilidad
  (`assignCoach`, cascada de pago al aprobar el coachee [HOY]).
- **Master coach [V2]**: umbral configurable (coachees formados + horas + calidad) que da rango y más
  peso de puntos por cada coachee nuevo.
- Ranking por temporada (`seasonPoints`/`seasonRanking` [HOY]), por empresa y por especialidad/pirámide
  [V2] (no un único ranking global que homogeneíce).

## 2.1 Pirámides de conocimiento [V2]

- Entidad `pyramid` (competencia/especialidad + industria opcional): raíz = master coach; ramas =
  coaches; hojas = aprendices. Un coachee puede subir a coach de la misma rama.
- Reglas: no puedes acaparar coachees de otra especialidad; tu pirámide crece dentro de tu habilidad.
  Anti-dependencia: alerta si una competencia crítica cae a <2 personas (ya hay `dependencyRisks`/bus
  factor en analytics.ts [HOY]; [V2] conectarlo a la pirámide).
- Vista de pirámide para admin y para el propio coach (quién cuelga de ti, quién está cerca de
  graduarse, dónde hay riesgo).

---

## 3. Perks y recompensas (lo tangible)

- Los puntos/logros se traducen en **perks** que **define la empresa**: reconocimiento, insignias,
  beneficios, y —si la empresa lo configura— subidas salariales u oportunidades de carrera.
- **Doctrina**: SkillUp NO promete salarios; ofrece el **motor de reglas** para que la empresa ate (o
  no) puntos a perks. Por defecto, el primer año NO se ata a nómina (regla ya presente en el asistente
  admin, registry.ts). Todo perk configurado queda **auditado** y visible para el empleado (qué da
  puntos, qué desbloquea) — transparencia, no caja negra.
- `rewards.ts` [HOY] ya evalúa reglas y otorga (badges/certificados con caducidad); [V2] ampliar a
  perks configurables + catálogo visual (ver §5).

---

## 4. Configuración y control — quién manda

Jerarquía de control (clave de la petición de Marc):
- **Superadmin = Marc** [HOY, PLATFORM_ADMIN_EMAILS]: todas las empresas, todos los usuarios, toda la
  plataforma. Consola `/superadmin.html` [HOY].
- **Admin de empresa** [HOY, orgRole=admin]: **el punto de control dentro de su empresa**. Configura
  competencias, pesos de puntos, umbrales de coach/master, perks y retos. Los **team leaders y usuarios
  NO** configuran gamificación (solo la viven).
- La configuración vive por organización (multi-tenant, `organizationId` en todo [HOY]).
- Todo lo que el admin configure debe **reflejarse** en los dashboards y en la experiencia del usuario
  (ranking, perks, retos) sin tocar código.

---

## 5. Agente de gamificación [V2] — traduce deseo de empresa en dashboards + creatividades

Un agente con el que **el admin habla en lenguaje natural** («quiero un reto trimestral para el equipo
de ventas, con un premio visual de un trofeo, que dé puntos por cada coachee que gradúen»). El agente:

1. **Traduce** la intención en configuración real (reglas de puntos, umbrales, reto con fechas,
   criterios) y la deja lista para que el admin la apruebe (nunca activa gasto ni cambios sin OK).
2. **Diseña los dashboards** de gamificación de esa empresa (ranking, pirámides, progreso a perks).
3. **Genera las creatividades** del premio/insignia/reto conectado a las herramientas del estudio:
   - Nano Banana (imagen) para el trofeo/insignia/escena; puede pedir **fotos de referencia** primero.
   - HeyGen para avatares; ElevenLabs para voz.
   - Monta el brief como en cada plataforma nativa (simula) y, con OK de coste, **envía a generar**.
   - **Puerta de coste obligatoria**: toda generación IA avisa coste estimado y pide OK (LEY brain
     `AI_GENERATION_COSTS`), texto en imagen con motor determinista (nunca IA), y pasa QA de marca.
4. **Alternativa sin generar**: si la empresa no quiere producir sus propias creatividades, aparece el
   **avatar de Marc** presentando los premios y la mecánica en un vídeo editado con full effects
   (mismo pipeline que el explicativo), que los usuarios ven en el apartado de **Gamificación / Ranking**.

Guardarraíles: el agente propone y configura; **activar y gastar** lo aprueba el admin (o Marc). Nada
de crear cuentas/perks que aten nómina sin confirmación. Todo auditado.

---

## 6. Protección de datos en la gamificación (enlaza con el agente curador)

El ranking y las pirámides muestran **logros y capacidad**, nunca datos privados de un usuario a otro
(clientes, nombres, casos sensibles). El **agente curador de memoria** (ver SKILLUP-V2-SPEC §12 y el
módulo de protección de datos) revisa lo que se expone: deja pasar la experiencia **transformada** en
conocimiento práctico/emocional útil, y bloquea lo identificable o comprometido. RGPD: derechos de
export/olvido intactos; la persona ve qué se comparte de ella y por qué.

---

## 7. Delta de construcción (sobre lo que ya existe)

**[HOY] real:** niveles y validación humana, coach + cascada de pago al aprobar el coachee,
puntos/ledger/temporada/ranking, rewards con reglas, analytics (bus factor, transferencia interna,
tiempo a autonomía), multi-tenant, superadmin + admin de empresa, consola superadmin.

**[V2] por prioridad:**
1. Catálogo de señales de puntos ampliado + **pesos configurables por el admin** (reflejo inmediato).
2. Entidad `pyramid` + vistas de pirámide + regla anti-dependencia conectada a bus factor.
3. Master coach + ranking por especialidad.
4. Perks configurables (más allá de badges) + catálogo visual.
5. **Agente de gamificación** (config por lenguaje natural → reglas + dashboards) con puerta de coste.
6. Integración creativa (Nano Banana / HeyGen / ElevenLabs) tras OK de coste, o vídeo del avatar de Marc.
7. Curación de datos en todo lo que se expone (agente curador).

**Regla de oro:** ningún agente nuevo se enciende sin que su salida se consuma/persista, sin puerta de
coste para lo que genera, y sin pasar por protección de datos. Cada incremento deja su prueba y se mide.
