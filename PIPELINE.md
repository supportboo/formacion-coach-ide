# Brandooers · Pipeline de agentes y doctrina de calidad

> Objetivo: que Brandooers cree y haga crecer sus cursos **de forma casi automática**, pero con
> una garantía innegociable — **cero información inventada**. Formamos a profesionales de verdad;
> un dato falso es un riesgo legal y reputacional. Este documento es el contrato de calidad.

---

## 0. Estado de automatización real (2026-08-26)

| Agente / pieza | ¿Existe? | Dónde | ¿Automático? |
|---|---|---|---|
| **Onboarding** (director académico) | Código listo | `server/server.mjs` `/api/onboard` | Semi — falta desplegar en IONOS |
| **Personalizador** (reescribe por perfil) | Funcionando (estático) + código servidor | `profile.js` + `/api/personalize` | Estático sí; en vivo falta IONOS |
| **Examinador** (tests → badges) | Código listo | `/api/exam` | Falta IONOS + base de datos |
| **Estratega de temas** | Especificado aquí | — | Pendiente (orquestación) |
| **Investigador técnico** | Especificado + **reusa** `industry-research-expert`, `blog-seo-topic-researcher` | Claude Code agents | Semi (se lanza a demanda) |
| **Verificador de fuentes** (fact-check) | Especificado + **reusa** `blog-seo-fact-checker`, skill `boo-data-certainty` | — | Pendiente de encadenar |
| **Constructor de curso** | Especificado + **reusa** `build.py` / `build_brandooers.py` | generadores | Semi |
| **Validador de calidad** (veto) | Especificado + **reusa** `quality-gate-supreme`, `boo-post-grader` | — | Pendiente de encadenar |
| **Editor legal / disclaimers** | Especificado aquí | — | Pendiente |
| **Feedback + refresh** | `feedback.js` funcionando; refresh pendiente | todas las páginas | Feedback sí; refresh no |

**Resumen honesto:** los agentes de *uso* (onboarding, personalizar, examinar) están **escritos y listos**;
faltan el VPS y la base de datos para que corran solos. Los agentes de *creación* (research → construir →
validar) están **especificados y reutilizan agentes que ya tienes**; falta el orquestador que los encadene
sin intervención. Hoy el pipeline es **semi-automático** (yo lanzo las fases); el objetivo es que se
autocomplete con un orquestador en el VPS.

---

## 1. La escalera — de un tema a un curso publicado y examinado

Cada peldaño tiene un **agente**, lo que **entra**, lo que **sale**, y su **puerta de calidad** (nadie sube al
siguiente peldaño sin pasar la puerta).

**Peldaño 1 · Estratega de temas**
- Función: decide qué crear a continuación (huecos del catálogo, demanda detectada en los onboardings, temas marcados en el feedback).
- Entra: catálogo actual + datos de onboarding + notas de feedback.
- Sale: **brief** (tema, audiencia, nivel, resultado de aprendizaje, encaje con qué cursos).
- Puerta: el brief no inventa demanda; se apoya en datos reales de uso.

**Peldaño 2 · Investigador técnico**  *(reusa `industry-research-expert` + `blog-seo-topic-researcher`)*
- Función: investigación profunda del tema en fuentes de autoridad.
- Entra: brief.
- Sale: **dossier de research** — cada afirmación con **fuente + URL**, etiquetada `HECHO` / `INFERENCIA` / `SIN DATOS`; lista de recursos (libros, charlas, podcasts, expertos) con enlace.
- Puerta: **solo fuentes Tier-1** (oficiales, académicas, expertos reconocidos, libros). Nada de "según internet".

**Peldaño 3 · Verificador de fuentes / fact-checker**  *(reusa `blog-seo-fact-checker` + skill `boo-data-certainty`)*
- Función: comprobar, de forma **independiente**, cada dato del dossier contra su fuente.
- Entra: dossier.
- Sale: **dossier verificado** (solo lo que pasa) + informe de descartes.
- Puerta dura: se cae cualquier cifra/afirmación sin fuente comprobable; se cae cualquier enlace que no dé **HEAD 200**; se cae cualquier cita de experto no verificable. Lo dudoso se marca, no se publica.

**Peldaño 4 · Constructor de curso**  *(reusa `build.py` / `build_brandooers.py`)*
- Función: convertir el dossier verificado en módulos Brandooers (playbook 0→100, diseño de la app), con las fuentes citadas.
- Entra: dossier verificado.
- Sale: curso/módulos en HTML Brandooers.
- Puerta: **grounding estricto** — el constructor SOLO usa hechos del dossier verificado. Tiene prohibido añadir datos, cifras o ejemplos "de su cosecha". Si falta info, lo deja como `[pendiente de research]`, no lo inventa.

**Peldaño 5 · Validador de calidad (veto)**  *(reusa `quality-gate-supreme` + `boo-post-grader`)*
- Función: puntuar calidad pedagógica, profesionalidad, voz de marca y **re-comprobar que no hay inventos**.
- Entra: curso construido.
- Sale: APROBADO / A CORREGIR (con motivos).
- Puerta: score mínimo + checklist obligatorio (≥3 fuentes de autoridad, 0 enlaces 4xx, 0 afirmaciones sin fuente, castellano RAE, sin AI-slop). **Poder de veto**: si falla, no pasa.

**Peldaño 6 · Editor legal / disclaimers**
- Función: blindaje legal (lo de "nos podrían denunciar").
- Entra: curso aprobado.
- Sale: curso con disclaimers donde toca (precios, normativa, benchmarks) y con el lenguaje ajustado para no afirmar como hecho lo que es estimación.
- Puerta: toda cifra sensible lleva "estimación de referencia, no vinculante" y su fuente y fecha.

**Peldaño 7 · Publicación** → se sube al repo (GitHub Pages hoy, VPS mañana).

**Peldaño 8 · Personalizador** *(ya construido)* — adapta el curso al perfil del alumno en vivo, sin cambiar los hechos, solo el envoltorio (ejemplos, titulares, sector).

**Peldaño 9 · Examinador → BADGES** *(ya construido)* — genera el test, corrige y otorga la badge al aprobar.

**Peldaño 10 · Feedback + Refresh** *(feedback.js + agente refresh pendiente)*
- El alumno/experto subraya y marca `Útil / Mejorar / Obsoleto`.
- El agente de refresh recoge lo marcado como obsoleto, **vuelve a investigar y verificar** (peldaños 2-3) y actualiza. El conocimiento no envejece sin que nadie lo mire.

**Puerta humana (transversal):** antes de publicar contenido nuevo, **Marc lo revisa** con el sistema de feedback. Ningún curso sale a alumnos sin ese OK. La automatización propone; Marc dispone.

---

## 2. Doctrina anti-invención (lo que nos protege)

Reglas que TODOS los prompts del pipeline llevan escritas y que el validador comprueba:

1. **Grounding**: el constructor solo puede afirmar lo que esté en el dossier **verificado**. Prohibido generar hechos.
2. **Fuente visible por afirmación**: toda cifra, estadística, normativa o "dato" lleva fuente + URL + fecha.
3. **Etiqueta de certeza**: cada afirmación es `HECHO` (con fuente), `INFERENCIA` (razonamiento propio, marcado como tal) o `SIN DATOS` (se dice que no se sabe). Nunca se disfraza una inferencia de hecho.
4. **Enlaces vivos**: ningún enlace externo sin **HEAD 200**; whitelist de fuentes de autoridad.
5. **Verificación independiente**: quien investiga no es quien valida. Un segundo agente comprueba.
6. **Sin cifras redondas inventadas**: si no hay fuente para un número, no se pone número.
7. **Disclaimers legales**: precios/normativa/benchmarks siempre con "estimación no vinculante" + fecha.
8. **Puerta humana**: Marc revisa antes de publicar.
9. **Refresh**: lo obsoleto se re-verifica, no se deja pudrir.

Esto no es nuevo: es tu doctrina de siempre (`boo-data-certainty`, certeza HECHO/INFERENCIA/SIN DATOS, "jamás links sin HEAD 200", `quality-gate-supreme`). El pipeline la hace **obligatoria y automática** en cada curso.

---

## 3. Los prompts (especificados)

Sistema de cada agente, listos para el orquestador. Todos: español de España, sin inventar.

### 3.1 Estratega de temas
> Eres el estratega de contenidos de Brandooers. A partir del catálogo actual, los datos de onboarding (qué piden los alumnos) y las notas de feedback, propone el PRÓXIMO curso o módulo a crear. No inventes demanda: justifica cada propuesta con una señal real (hueco de catálogo, nº de onboardings que lo piden, temas marcados). Devuelve JSON: {tema, audiencia, nivel, resultado_aprendizaje, encaje_cursos:[...], señal_de_demanda}.

### 3.2 Investigador técnico
> Eres investigador técnico PhD-level para una formación profesional. Investiga {tema} SOLO en fuentes Tier-1 (organismos oficiales, normativa, papers, fabricantes/plataformas oficiales, libros de autor reconocido, expertos citables). Para CADA afirmación devuelve: texto, fuente (nombre), URL, fecha, y etiqueta HECHO/INFERENCIA/SIN DATOS. Prohibido afirmar sin fuente; si no hay dato fiable, decláralo SIN DATOS. Añade recursos (libros, charlas, podcasts, expertos) con enlace real. Devuelve JSON estructurado.

### 3.3 Verificador de fuentes
> Eres verificador independiente. Recibes un dossier de research. Para cada afirmación: comprueba que la fuente existe, que dice lo que se afirma y que el enlace responde 200. Marca cada una como VERIFICADA, DUDOSA o RECHAZADA (con motivo). Devuelve solo lo VERIFICADO + informe de rechazos. No corrijas inventando: si algo no se puede verificar, se rechaza.

### 3.4 Constructor de curso
> Eres constructor de cursos Brandooers. Convierte el dossier VERIFICADO en módulos playbook (0→100) con el diseño de la app. REGLA ABSOLUTA: solo puedes afirmar lo que esté en el dossier verificado; tienes prohibido añadir cifras, datos, normativa o ejemplos no verificados. Cita la fuente donde uses un dato. Si falta información para una sección, escribe [PENDIENTE DE RESEARCH], no la rellenes de tu cosecha. Español de España, práctico, sin AI-slop.

### 3.5 Validador de calidad (veto)
> Eres el guardián de calidad con poder de veto. Puntúa 0-100 (pedagogía, profesionalidad, voz de marca) y aplica un checklist obligatorio: ≥3 fuentes de autoridad, 0 enlaces 4xx, 0 afirmaciones sin fuente, 0 cifras sin fuente, castellano RAE, disclaimers donde hay precios/normativa. Si algo del checklist falla → RECHAZADO con la lista de fallos. Umbral de aprobado alto. Ante la duda, rechaza.

### 3.6 Editor legal / disclaimers
> Eres editor de cumplimiento. Revisa el curso y asegura que ninguna estimación se presenta como hecho, que precios/normativa/benchmarks llevan "estimación de referencia, no vinculante" + fecha + fuente, y que no hay promesas de resultados. Añade los disclaimers necesarios sin romper la lectura.

---

## 4. Cómo crece Brandooers (y por qué beneficia a todos)

El bucle que se retroalimenta:

1. **Onboarding** → sabemos qué perfiles entran y qué piden (datos reales de demanda).
2. **Estratega** → prioriza los cursos que la gente pide de verdad.
3. **Pipeline research→construir→validar** → crea contenido de valor, verificado.
4. **Puerta humana (Marc)** → aprueba.
5. **Personalización + exámenes + badges** → el alumno aprende, aplica y demuestra.
6. **Feedback** → alumnos y expertos mejoran y corrigen el contenido (incluido lo obsoleto).
7. **Referidos/ranking** → el alumno que crece invita a otros; su red también se forma y aplica.

Todos ganan a la vez: el alumno se profesionaliza y lo demuestra (badges), el experto que corrige eleva la
calidad y gana reputación, la empresa gana equipo más eficiente, y Brandooers gana contenido verificado que
crece solo. El motor de crecimiento es la **confianza** — y la confianza se sostiene en la doctrina
anti-invención de arriba. Sin eso, nada de esto vale.

---

## 5. Qué falta para que sea 100% automático

1. **VPS IONOS** con la clave del modelo → activa onboarding/personalización/exámenes en vivo.
2. **Base de datos** → progreso, badges, ranking, referidos, y el histórico de research verificado.
3. **Orquestador** → encadena estratega → research → verificación → construir → validar → editor legal → (revisión Marc) → publicar, y el bucle de refresh. Reusa `industry-research-expert`, `blog-seo-fact-checker`, `quality-gate-supreme`, `boo-data-certainty`, `boo-post-grader`.
4. **Cron de crecimiento** → cada X, el estratega propone y el pipeline produce un borrador para que Marc revise.
