# Changelog · SkillUp platform

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
