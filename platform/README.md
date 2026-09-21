# SkillUp platform — Fase 0

Infraestructura de la app Brandooers · SkillUp: multi-tenant + RAG + agentes conversacionales por rol.

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

Fuera del repo, en el VPS: `/etc/brandooers/mail.env` es la ÚNICA ficha de correo (la leen `skillup.service` y `brandooers-aff.service`): poner ahí `RESEND_API_KEY=` y reiniciar ambos servicios. Sin clave, la recuperación de contraseña y los avisos no salen (el enlace queda solo en `journalctl -u skillup`). nginx (`/etc/nginx/nginx.conf`, bloque skillup): cabeceras nosniff/X-Frame-Options/Referrer-Policy/HSTS y 404 para `/.*`, `/platform/`, `/affiliate/`, `/server/`, `*.bak*` y extensiones de código/datos (el docroot es el checkout git entero).

## Autenticación en dev
Con `DEV_AUTH=true`, pasa cabeceras `X-Org-Id`, `X-User-Id`, `X-Role` (y opcional `X-Org-Name`, `X-User-Name`). En producción se usa la sesión de better-auth + organización activa. Nunca dejar `DEV_AUTH=true` en producción.

## Qué es esto y qué NO
Es la **Fase 0** del `GOAL-BRANDOOERS.md`: los cimientos (datos, auth, RAG, agentes) sobre los que las fases 1-9 montan validación, niveles, panel ROI, FUNDAE, etc. No incluye aún esas funcionalidades.

## Cambios
- **0.2.0 (2026-09-21) — endurecimiento pre-producción:** estado de cuenta no manipulable por el usuario y cuentas desactivadas bloqueadas en toda la app; validación humana atómica (una decisión por caso: sin puntos ni certificados dobles); borrado RGPD acotado a la propia empresa y que incluye notas y roleplays; hilos de chat, roleplays, entregas y evidencias solo del propio alumno; filtro anti-SSRF en el análisis de la web de empresa; límite de peticiones en vídeos; timeouts en YouTube y correo; migración 0016 que recoge las tablas/columnas creadas a mano en producción; typecheck y tests en verde; despliegue reproducible (`deploy/`). Contraseñas: botón «Restablecer contraseña» en Consola > Usuarios y roles (envía el enlace por correo; si el correo no sale, el enlace aparece solo al superadmin para pasarlo en mano), correo de recuperación con marca y «He olvidado mi contraseña» del login con validación, estado «Enviando…» y sin dobles envíos.
