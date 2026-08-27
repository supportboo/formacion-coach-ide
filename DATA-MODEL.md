# Brandooers · Modelo de datos y bandeja de instrucciones

Toda la data vive en el VPS, en `/var/lib/brandooers-aff/` (fuera del repo, no versionada).
El servicio Node (`affiliate/server.mjs`) la captura y la sirve al panel admin. **Doctrina: cero cifras
inventadas** — lo que no se mide se muestra como *pendiente*, nunca como un número falso.

## 1. Ficheros de datos (en el VPS)

| Fichero | Qué guarda | Lo escribe | Lo lee |
|---|---|---|---|
| `users.json` | Cuentas: `{usuario:{salt,hash,role,created}}` | login/alta | app + panel |
| `inbox.jsonl` | Eventos append-only: `{id,kind,data,ts}` (kind = feedback \| request \| onboarding) | app (alumnos) | panel |
| `inbox-meta.json` | Estado + decisión del admin por id: `{id:{status,instruction,reply,updatedTs}}` | admin | panel + **Claude Code interno** |
| `views.jsonl` | Uso: `{page,user,ts}` por vista de página | app | panel |
| `clicks.jsonl` | Clics a recursos (redirector afiliación): `{id,domain,course,ts}` anónimo | redirector | panel + `/aff/` |
| `leads.jsonl` | Solicitudes de acceso: `{name,email,company,ts}` | landing SkillUp | panel |
| `affiliates.json` / `status-overrides.json` | Tags e estados de afiliación | admin `/aff/` | redirector |

## 2. Entidades y campos

- **Usuario** — `usuario`, `role` (admin\|member), `created`. (Falta: `lastSeen` — derivable de `views`.)
- **Perfil de onboarding** (`kind:onboarding` → `data.prefs`): `level` (rookie\|intermedio\|pro), `sector`,
  `role`, `learn` (visual\|lectura\|audio\|practico), `mindset` (esceptico\|analitico\|pragmatico\|innovador),
  `time` (pasado\|presente\|futuro), `driver`, `archetype`. → alimenta personalización de contenido **y de tests**.
- **Petición de curso** (`kind:request` → `data`): `topic`, `email`, `ts`, `status`.
- **Feedback** (`kind:feedback` → `data`): `type` (good\|improve\|stale\|note), `quote`, `comment`,
  `course`, `section`, `user`, `name`, `ts`; + meta `status`, `instruction`, `reply`.
- **Vista/uso**: `page`, `user`, `ts`.
- **Lead**: `name`, `email`, `company`, `ts`. (Falta: `status` comercial nuevo\|contactado\|cliente.)
- **Economía** *(pendiente de fuente real)*: ingresos suscripción (falta pasarela), ingresos afiliación
  (requiere alta manual en redes), coste de generación (se hace en Claude Code interno, 0€ API en la app).

## 3. Estados

- **Feedback / Petición**: `nuevo → aceptado → aplicado` · `rechazado` · `reabrir`.
- **Instrucción**: existe cuando el admin escribe el campo `instruction`. Entra en la **cola del motor**
  mientras `status ∉ {aplicado, rechazado}`.

## 4. El bucle feedback → instrucción → motor (Claude Code interno)

1. El alumno marca contenido (Útil/Mejorar/Obsoleto) o pide un curso → `inbox.jsonl`.
2. El admin (tú) lo revisa en **/revisiones.html**: acepta/rechaza, **redacta la instrucción** (viene
   sugerida y es 100% editable) y opcionalmente **responde al alumno**.
3. La instrucción queda en `inbox-meta.json` y en la **cola**: `GET /api/admin/queue` (solo admin) →
   `{queue:[{id,kind,status,ref,instruction}]}`.
4. **Este Claude Code interno lee la cola** (por `ssh brandooers-vps cat /var/lib/brandooers-aff/inbox-meta.json`
   o vía la API), ejecuta la mejora **con el pipeline verificado** (fuentes, anti-invención), publica el
   contenido (push al VPS) y marca `status:aplicado`.
5. El panel refleja el cambio. Nada se toca sin tu decisión: **el admin siempre puede editar la instrucción**
   antes de que el motor actúe.

> Regla de oro: el motor solo actúa sobre instrucciones que tú has aceptado y redactado. Formamos a gente
> real; ninguna corrección entra sin pasar por verificación de fuentes y por tu OK.

## 5. Endpoints

Captura (público): `POST /api/feedback` · `POST /api/track` (peticiones) · `POST /api/onboarding` · `POST /api/view`.
Admin (sesión rol admin): `GET /api/admin/dashboard` · `GET /api/admin/inbox` · `POST /api/admin/status`
(`{id,status?,instruction?,reply?}`) · `GET /api/admin/queue`.

## 6. Pendiente (definido, aún no medido)

- `lastSeen` por usuario y **progreso por curso** (derivar de `views` + eventos de examen).
- **Examen → badge** (capturar intento, nota, badge otorgado).
- **Estado comercial** del lead.
- **Pasarela de pago** → ingresos reales por suscripción.
