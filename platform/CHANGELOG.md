# Changelog · SkillUp platform

## 1.1.0 — 2026-09-27

### Nuevo
- **Team DNA v2: perfil profesional combinado** (`/app/team-dna.html`, sustituye al test de 8 preguntas). 91 ítems en 10 bloques cortos (10-12 min), con barra de progreso, guardado sobre la marcha, reanudación y repetición. Cuatro capas separadas y etiquetadas con honestidad:
  - **Big Five** (ítems IPIP de dominio público, estructura Mini-IPIP, con ítems inversos): la parte con respaldo científico; decide tono, estructura y ritmo.
  - **Eneagrama** (45 ítems originales en castellano): tipo + ala + segundo tipo, con motivación de fondo, miedo básico, fortalezas, dónde se atasca, cómo aprende, cómo darle feedback y qué le motiva. Presentado como herramienta de autoconocimiento, no como diagnóstico.
  - **Hexad** (tipos de jugador, 18 ítems originales) → palancas de gamificación reales de la plataforma (ranking, niveles, certificados, explorar, aportaciones).
  - **Preferencias pedagógicas** con evidencia (ejemplos resueltos, práctica de recuperación, repaso espaciado, feedback). Sin estilos VAK (neuromito): el formato es solo una preferencia.
  - **Color** de identidad derivado del eneatipo (no hay test de colores).
- **Los tutores usan el perfil de verdad:** al terminar se guarda un resumen («[perfil] …» en las notas de onboarding) que reciben el chat de agentes (`registry.ts`), los tutores de curso, Explorar y el asistente BOO; el coach de voz usa la motivación para su empujón.
- **Perfiles del equipo para gestores** (`/app/team-dna.html#equipo`, enlazado desde el mapa del equipo): cómo hablar, cómo aprende y qué motiva a cada persona.
- Endpoints `/api/teamdna/profile/{catalog,me,answers,finish,restart,team}` (Zod, multiempresa, puntuación determinista en servidor, sin IA). Migración `0018_teamdna_profile_v2` (tabla `team_profile`).
- RGPD: el perfil (y el Team DNA antiguo) entran en la exportación y en el derecho al olvido; el reinicio de onboarding del superadmin también lo borra.

### Informe de ROI con metodología reconocida (sustituye al de 1.0.0)
- **Niveles 1-4 de Kirkpatrick medidos por la plataforma**: valoración, pruebas superadas, mejora entre intentos, rutas finalizadas, casos aprobados por un referente, aplicación en el puesto, cobertura, tiempo hasta la competencia (mediana), transferencia interna y competencias críticas en riesgo. Cada indicador con fórmula, fuente, periodo, n, certeza (Medido / Estimado con método / Sin datos), intervalo de confianza del 95 % (Wilson) en porcentajes y aviso de muestra pequeña.
- **Nivel 5 (ROI de Phillips) solo con datos de la empresa**: costes completos (plataforma, horas × coste/hora con cargas, tiempo interno, otros) y métricas de negocio antes/después con grupo de control o % atribuido × % de confianza, primer año como máximo. Sin esos datos el informe dice «Sin datos suficientes para calcular el ROI» y lista lo que falta.
- **Retirado lo inventado**: los supuestos por defecto (350 € por curso externo, 22 €/h, 2 h/mes ahorradas por competencia, 8.000 € por persona clave) y la afirmación «con FUNDAE el coste neto es 0». La bonificación FUNDAE se muestra aparte y no se resta del ROI.
- Intangibles listados sin convertir a euros. Sección «Metodología y fuentes» con las referencias leídas.
- Nueva tabla `roi_study` (migración `0019_roi_study`). Endpoint `POST /api/analytics/roi/inputs` (Zod, solo admin/dirección) sustituye a `/api/analytics/roi/assumptions`.
- El resumen de IA para dirección solo usa cifras del informe y no da euros si el ROI no es calculable.

### Agentes que aprenden y tienen criterio
- **Glosario que aprende de las correcciones** (`services/glossary.ts`): si alguien corrige cómo se dice o escribe un término («se dice partner manager», «es Nextdoo, no NextTodo»), el agente lo marca, se guarda para toda la empresa y desde entonces va en el prompt de todas las llamadas a la IA, se corrige en lo que escribe la IA y en el dictado por voz (`GET /api/agent/terms`). Sin tabla nueva (notas `source=glossary`).
- **Criterio ante información dudosa**: los tutores, el asistente y el roleplay cuestionan con tacto lo que parece falso o ajeno al temario, sin ser rígidos con la realidad de cada empresa.

## 1.0.1 — 2026-09-27

### Nuevo
- **Anuncio «La capacidad se demuestra» en el hero de la landing** (`skillup.html`): sustituye a la captura de la app. Póster ligero (83 KB) y el vídeo (`assets/skillup-anuncio.mp4`, 1:29, H.264 1080p, 25 MB) solo se descarga al darle al play; reproduce con sonido y controles y vuelve al póster al terminar. La etiqueta «Aprendiendo → Dominado» se oculta mientras suena para no tapar subtítulos ni controles.

### Diseño y accesibilidad de la landing
- Contraste AA en el texto blanco de los botones y del play (mismo degradado violeta→turquesa un tono más profundo, `--grad-cta`), en los números del recorrido, en la letra pequeña del pie y en los enlaces al pasar el ratón.
- Jerarquía de títulos sin saltos (h2 → h3 en recorrido y carrusel), visor de capturas sin `src` vacío.
- Móvil: el recorrido ya no se queda en dos columnas estrechas a 360 px (las reglas de escritorio izq/der ganaban por especificidad); bocadillos legibles; sin desbordamiento horizontal.

### Reglas de progresión (ya en producción desde el 25-sep, ahora versionadas)
- **N2 más exigente:** 3 casos aprobados repartidos en al menos 6 semanas + 1 aplicación confirmada en seguimiento. Nadie baja de nivel (solo sube).
- **Referente (N3):** 3 alumnos llevados a N2 (antes 2). **Coach (N4):** 5 alumnos a N2 y nombramiento por admin/inspirador (`POST /api/propagation/grant-coach`); nadie firma su propia defensa. El nivel 4 pasa a llamarse «Coach» (antes «Custodio»).
- **Recertificación anual** de N3/N4 (`GET /api/propagation/recert-status`): informa de quién lleva más de un año sin validar; no degrada automáticamente.
- **Panel de expertos para crear cursos** (`POST /api/catalog/course-panel`): borrador + revisión con veto legal; pide confirmación de coste (2 llamadas de IA), límite de 4 por minuto por empresa y no publica nada solo.

## 1.0.0 — 2026-09-25 (V1.0 para prueba con equipo real)

### Nuevo
- **Informe de ROI** (`/app/informe-roi.html`) con marco FUNDAE, desglose HECHO+ESTIMACIÓN clicable, riesgo en euros y **agente de ROI** (IA) que redacta para dirección. Endpoints `/api/analytics/roi*`.
- **Pirámides de conocimiento** por competencia con alerta de dependencia (`/app/piramides.html`) + **perks por nivel configurables** por empresa (`/api/config/perks`).
- **Panel de ayuda por perfil** (`/app/ayuda.html`) con pantallazos reales de la plataforma y guía visual.
- **Menú lateral plegable** (nav.js) con burbujas, por rol, en toda la app.
- **Popup de vídeo de bienvenida** antes del onboarding (bienvenida + onboarding), una sola vez.
- **Consola de superadmin**: vista de agentes (prompt, herramientas, memoria, cerebro), métricas por empresa, cambio de contraseña de soporte.
- **Cuentas de demo** con datos ricos para los 4 roles.

### Seguridad y robustez
- Tope de gasto de IA por empresa/día (`ORG_AI_DAILY_CAP_USD`, un punto para los 17 endpoints).
- Guardián de coste de IA cableado (no se genera con un caso sin validar).
- Fuga cerrada: la evidencia de un caso solo la ve su dueño o quien puede validarlo.
- Gate de aprobación en generación de contenido de pago.
- Cabeceras de seguridad base (nosniff, X-Frame-Options, Referrer-Policy, HSTS).
- Rate-limit en roleplay/close; timeout en embeddings; contraseña temporal de alta entropía; texto de web de empresa tratado como dato no confiable (anti prompt-injection).

### Experiencia
- Cero emojis en la UI (iconos SVG de marca).
- Errores amables en español (antes se veía el error crudo de la API).
- Burbuja de voz en todas las páginas donde faltaba; botón de menú reubicado (sin colisiones).
- Voz de los vídeos rehecha (expresiva, sin salto ni jadeos) y servida en alta calidad.

### Pendiente (post-V1, con motivo)
- Rotación de secretos expuestos en el historial público del repo (acción del dueño).
- Envío automático de informes de ROI mensuales/trimestrales (requiere programador en el VPS + `RESEND_API_KEY`).
- Vídeo-tour de la app con pantallazos y vídeo en 4K (capacidad de render / avatar 4K de HeyGen).
