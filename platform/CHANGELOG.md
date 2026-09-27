# Changelog · SkillUp platform

## 1.0.1 — 2026-09-27

### Nuevo
- **Anuncio «La capacidad se demuestra» en el hero de la landing** (`skillup.html`): sustituye a la captura de la app. Póster ligero (83 KB) y el vídeo (`assets/skillup-anuncio.mp4`, 1:29, H.264 1080p, 25 MB) solo se descarga al darle al play; reproduce con sonido y controles y vuelve al póster al terminar. La etiqueta «Aprendiendo → Dominado» se oculta mientras suena para no tapar subtítulos ni controles.
- **Vídeos dentro del curso** (`curso.html`): el botón «Vídeos» ya no saca del curso; abre a la izquierda el panel «Vídeos del curso» con miniaturas (los mismos vídeos reales de YouTube de `videos.html`, misma caché por tema) y los del bloque que estás leyendo arriba con la marca «Este bloque». El vídeo se ve dentro del panel, se puede ampliar junto al texto (vista dividida) o a pantalla completa, y el texto conserva la posición de lectura. PC ≥1100 px: columna entre el texto y el chat; tableta y móvil: se desliza sobre el contenido. Recuerda si lo dejaste abierto (solo en PC), Esc cierra vídeo y panel.

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
