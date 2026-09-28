# SkillUp platform — V1.0

Plataforma Brandooers · SkillUp: formación que mide CAPACIDAD aplicada, no asistencia. Multi-tenant + RAG + agentes por rol.

## Qué hace la V1.0
- **Aprendizaje aplicado por rol**: ruta por sector/puesto, test, caso práctico validado por un humano (no autoservicio), coach de voz, juego de rol.
- **Panel de empresa**: cobertura por competencia, riesgo de dependencia, transferencia interna, autonomía en días.
- **Pirámides de conocimiento** por competencia (quién sostiene cada una) + **perks configurables** por empresa.
- **Informe de ROI** con método Kirkpatrick (niveles 1-4 medidos, con n e intervalo de confianza) y Phillips (ROI solo con costes completos y métricas de negocio aisladas que aporta la empresa; si faltan, «Sin datos suficientes»). Fuentes citadas en el propio informe.
- **Itinerario a especialista (1.11.0)**: base → especialidad → especialista → coach que atrae a 2 compañeros a su área, con el avance real de cada etapa.
- **Onboarding unificado (1.10.0)**: bienvenida y Team DNA forman un solo recorrido; con 5 minutos del DNA ya hay un perfil que personaliza tutor, contenido y recursos, y el tiempo y el trato elegidos se usan de verdad.
- **Contenido vivo (1.9.0)**: cada sección abre con un bloque «Para ti» (ejemplo y práctica) hecho con lo que el alumno ya ha contado; lo que responde en un bloque se usa en el siguiente.
- **Recursos del curso (1.8.0)**: vídeos, podcasts, libros y herramientas verificados y puntuados por un agente de calidad (calidad, valor y relevancia), en una página tipo Netflix y al final de cada sección; ordenados por utilidad para aprender, según cómo aprende cada persona y su tiempo. La comisión de afiliación nunca cambia el orden y se marca siempre.
- **Planes y créditos (1.6.0)**: dos planes por persona y mes (Esencial 9 €, Profesional 13 €) y un monedero de créditos de creación por empresa (1 crédito = 0,10 €) para crear contenido con IA, reservado a quien llega a nivel Coach. Ver «Precios».
- **Idioma (1.5.0)**: cada persona elige español, inglés, catalán, portugués o francés (bienvenida y menú); la IA, la voz, el dictado, la interfaz compartida y los vídeos se adaptan, y los cursos se traducen al vuelo con «ver original». Vídeos filtrados por idioma y ordenados por una nota de calidad con datos reales de YouTube.
- **Feedback (1.4.0)**: pulgar arriba/abajo con motivos bajo cada respuesta de la IA (tutores, asistente, Explorar, roleplays, evaluación), «Enviar sugerencia» en el menú para todos los roles y bandeja `/app/feedback.html` para el superadmin (estado, nota, glosario, gráficos y resumen con IA) con vista de solo lectura para admin y dirección; quien envía ve cuándo se resuelve.
- **Supervisión en directo (1.3.0)**: menú «En directo» para coach, team leader, admin, dirección y superadmin: quién aprende ahora y dónde se atasca, ficha por persona con progreso, vista previa de su página, su chat con el tutor (y escribirle con tu nombre), métricas de uso tipo Odoo y resumen con IA. Transparente por ley: la persona ve cuándo la siguen; nada de pantalla, teclado ni cámara; datos 90 días.
- **Métricas e insights (1.4.0)**: un cuadro de mando por rol con dos pestañas: Métricas (solo datos medidos, gráficos 7/30/90 días, CSV) e Insights (qué significan y qué hacer, con enlace al dato y a la acción). Superadmin: salud y riesgo de baja de cada empresa, coste IA frente a ingresos, cursos a arreglar y acceso de solo lectura a cualquier empresa. Admin: adopción, resultados, ROI y dónde apoyar. Team leader: quién necesita ayuda hoy.
- **Evaluación y certificación (1.2.0)**: test personalizado al terminar cada bloque, roleplay de control cada N bloques con entrevista previa, menú «Roleplays» para practicar cuando quieras, examen final difícil (mínimo 80/100, con tiempo, intentos limitados) y certificado interno de Brandooers imprimible y verificable. Los responsables asignan tests, exámenes, roleplays y casos con fecha y ven el resultado (`/app/asignar.html`).
- **Gamificación**: puntos por aplicar/enseñar, ranking de temporada, rangos.
- **Consola de superadmin**: agentes (prompt+herramientas+memoria+cerebro), métricas por empresa, gestión de usuarios y contraseñas.
- **Panel de ayuda por perfil** con pantallazos reales y guía visual.
- **Seguridad**: aislamiento multi-tenant, tope de gasto de IA por empresa, rate-limit, cabeceras de seguridad, curador de datos (anti-fuga entre usuarios).

Ver [CHANGELOG.md](./CHANGELOG.md) para el detalle por versión.

## Precios

| Plan | €/persona/mes | Incluye |
|------|---------------|---------|
| Esencial (`texto`) | 9 € | Cursos con texto, herramientas y esquemas, vídeos seleccionados, modo escucha cuando está disponible, tutor IA con voz, tests por bloque, examen final, certificado |
| Profesional (`video_corto`) | 13 € | Todo lo de Esencial + roleplays, Team DNA, «En directo», métricas e insights, informe de ROI, asignaciones del responsable |

`inmersivo` está retirado de la venta (se conservan sus datos). Los precios vigentes están en la tabla `pricing_tier` (los edita el superadmin o `npx tsx scripts/set-pricing.ts`).

**FUNDAE**: cada curso puede venderse además como acción bonificable: hasta 7,50 € por hora y participante en teleformación (20 h → hasta 150 € por alumno), según el crédito de cada empresa y los requisitos de FUNDAE.

**Créditos de creación** (monedero por empresa, 1 crédito = 0,10 €). Packs: 100 = 10 €, 500 = 45 €, 1.000 = 80 € (pago único, Stripe). Precio por defecto en créditos (tabla `credit_price`, editable por el superadmin):

| Qué se crea | Créditos | Coste del proveedor (estimado, fuente) | Estado |
|---|---|---|---|
| Crear un curso con IA (panel de expertos) | 20 | 2 llamadas a Claude; coste real en `ai_usage` | Disponible |
| Voz narrada | 3 / min | ElevenLabs ~0,17–0,20 $ por 1.000 caracteres ≈ 1 min (precios oficiales, 20-sep-2026) | Próximamente |
| Vídeo con avatar estándar (HeyGen Avatar IV) | 12 / min | ≈ 0,78 $/min (plan Pro 49 $/1.000 créditos, ~16 créd/min; 28-sep-2026) | Próximamente |
| Vídeo con avatar realista (HeyGen Avatar V) | 35 / min | ≈ 2,35 $/min (~48 créd/min; 28-sep-2026) | Próximamente |
| Crear avatar propio | 100 | Por medir | Próximamente |
| Clonar voz | 150 | Por medir | Próximamente |

Solo gasta créditos quien tiene nivel N4 (Coach) en alguna competencia, rol coach/admin/dirección o es superadmin. Admin y dirección compran packs y ven los movimientos. La compra se abona en el webhook de Stripe (`checkout.session.completed`), una sola vez por sesión.

## Stack
- **Postgres + Drizzle ORM** (datos, multi-tenant por `organizationId`).
- **better-auth** con plugin `organization` (una empresa = una organización; escala de 1 usuario a multinacional).
- **RAG** propio: embeddings pluggables (`dev` offline / `openai`) + store en Postgres (coseno en app; pgvector como mejora).
- **Agentes** por rol del organigrama (empleado, coach, team_leader, inspirador, admin, direccion), conversacionales, con contexto RAG. LLM: Anthropic (Sonnet 4.6 / Haiku 4.5), con mock sin clave.
- **Hono** (API HTTP).

## Puesta en marcha
```bash
cd platform
npm install
cp .env.example .env.local     # rellena DATABASE_URL (Postgres local en :5432)
npm run db:generate            # genera el SQL de migración desde el esquema
npm run db:migrate             # aplica migraciones (requiere DATABASE_URL válido)
npm run dev                    # arranca en :8080
```

## Verificación
```bash
npm run typecheck              # el código compila
npm test                      # tests unitarios (RAG + agentes, offline)
curl localhost:8080/health     # {"ok":true}
```

## Endpoints (Fase 0)
- `GET  /health`
- `ALL  /api/auth/*` — better-auth (registro/login/organización/invitaciones).
- `POST /api/agent/chat` — turno con el agente del rol de la sesión (el cliente no elige rol). Body: `{ message, threadId? }`.
- `POST /api/rag/ingest` — ingesta contenido al RAG (admin/inspirador). Body: `{ title, text, kind?, refId? }`.

## Despliegue (producción, VPS `brandooers-vps`)
Siempre desde git, nunca con scp ni editando en el servidor:
```bash
git push origin <rama>                                   # desde tu equipo
ssh brandooers-vps 'bash /var/www/brandooers/platform/deploy/deploy.sh <rama>'
```
`deploy/deploy.sh` se niega a correr si hay ficheros versionados editados en el servidor, y antes de reiniciar pasa typecheck + tests + backup fresco de Postgres + migraciones; si algo falla vuelve al commit anterior. Otros ficheros de `deploy/`: `skillup-backup.sh` (instalado en `/usr/local/bin`, cron diario 3:30 en `/etc/cron.d/skillup-backup`, 14 días en `/var/backups/skillup`) y `skillup.service.hardening.conf` (drop-in de systemd: el servicio corre como `brandooers`, sin root, sistema de ficheros en solo lectura).

Fuera del repo, en el VPS: `/etc/brandooers/mail.env` es la ÚNICA ficha de correo (la leen `skillup.service` y `brandooers-aff.service`): poner ahí `RESEND_API_KEY=` y `MAIL_FROM=` (dirección sola, sin nombre; el dominio tiene que estar verificado en Resend: hoy solo lo está boomatik.com, así que `MAIL_FROM=no-reply@boomatik.com`) y reiniciar ambos servicios. Sin clave, la recuperación de contraseña y los avisos no salen (el enlace queda solo en `journalctl -u skillup`). nginx (`/etc/nginx/nginx.conf`, bloque skillup): cabeceras nosniff/X-Frame-Options/Referrer-Policy/HSTS y 404 para `/.*`, `/platform/`, `/affiliate/`, `/server/`, `*.bak*` y extensiones de código/datos (el docroot es el checkout git entero).

## Autenticación en dev
Con `DEV_AUTH=true`, pasa cabeceras `X-Org-Id`, `X-User-Id`, `X-Role` (y opcional `X-Org-Name`, `X-User-Name`). En producción se usa la sesión de better-auth + organización activa. Nunca dejar `DEV_AUTH=true` en producción.

## Qué es esto y qué NO
Es la **Fase 0** del `GOAL-BRANDOOERS.md`: los cimientos (datos, auth, RAG, agentes) sobre los que las fases 1-9 montan validación, niveles, panel ROI, FUNDAE, etc. No incluye aún esas funcionalidades.

## Cambios
- **0.2.1 (2026-09-21) — fallos de la prueba funcional:** cerrar sesión invalida de verdad la sesión (antes seguía viva); cambiar la contraseña cierra las sesiones abiertas; matrícula solo en rutas/competencias de la propia empresa; «Descargar mis datos» incluye notas, subrayados, preguntas y roleplays; «Terminar», «Formaciones», lección y onboarding ya no mandan al login antiguo y los enlaces entre cursos abren el visor; aceptar invitación entra por el inicio nuevo; correo de invitación con marca y enlace para copiar en el panel de empresa; registrarse de nuevo con el mismo email ya no crea una segunda empresa; errores de acceso en español; la cola de validación muestra nombres y no incluye el caso propio; rol legible en el perfil; borrar una nota ajena devuelve 404.
- **0.2.0 (2026-09-21) — endurecimiento pre-producción:** estado de cuenta no manipulable por el usuario y cuentas desactivadas bloqueadas en toda la app; validación humana atómica (una decisión por caso: sin puntos ni certificados dobles); borrado RGPD acotado a la propia empresa y que incluye notas y roleplays; hilos de chat, roleplays, entregas y evidencias solo del propio alumno; filtro anti-SSRF en el análisis de la web de empresa; límite de peticiones en vídeos; timeouts en YouTube y correo; migración 0016 que recoge las tablas/columnas creadas a mano en producción; typecheck y tests en verde; despliegue reproducible (`deploy/`). Contraseñas: botón «Restablecer contraseña» en Consola > Usuarios y roles (envía el enlace por correo; si el correo no sale, el enlace aparece solo al superadmin para pasarlo en mano), correo de recuperación con marca y «He olvidado mi contraseña» del login con validación, estado «Enviando…» y sin dobles envíos.
