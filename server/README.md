# Brandooers · servidor (IONOS)

> **Modo actual (pre-venta):** el VPS **sirve** la plataforma estática y (siguiente paso) guarda datos
> (progreso, badges, ranking, referidos) en Postgres. La generación de contenido y la personalización se
> hacen **en Claude Code** (agentes de `.claude/agents/`, sin API de pago) y se empujan ya hechas. Los
> endpoints de IA de abajo (`/api/personalize`, `/api/onboard`, `/api/exam`) quedan **listos para activar
> cuando Brandooers sea vendible** y el coste de API se justifique. Ver `PIPELINE.md`.

---

## (Futuro) servidor de personalización en vivo

El sitio funciona **estático** en GitHub Pages con personalización pre-generada (3 casos).
Este servidor añade lo que el estático no puede: un **agente que entrevista en lenguaje
natural** y **reescribe el contenido a cualquier caso/sector en vivo** con un modelo de IA
(la clave nunca se expone al navegador porque las llamadas salen del servidor).

## Qué hace

- Sirve toda la plataforma (los `.html`, `.js`, `.css` del repo).
- `POST /api/onboard` → **agente director académico** (tutor de máster, Haiku). Entrevista en
  lenguaje natural, averigua rol + nivel por materia + objetivo, y recomienda un **flujo de
  aprendizaje combinado** entre cursos (corto o largo). Este chat vive en la **home** (hub) y
  es el único sitio donde se hace el onboarding; los cursos solo aplican el perfil resultante.
- `POST /api/personalize` → reescribe una sección del curso al perfil (Sonnet). Cualquier
  sector, no listas cerradas.
- `POST /api/exam` → **agente examinador**. `{mode:"generate"}` crea un test del tema;
  `{mode:"grade"}` corrige, puntúa y, si aprueba (≥70), devuelve la **BADGE** ganada.
  (El almacenamiento de badges/ranking va con la base de datos, siguiente fase.)

> Infra: **solo VPS (IONOS)**. Nada de Vercel/serverless. Node + pm2 + Nginx.

## Modelos (recomendado)

- Reescritura de contenido: **Claude Sonnet 4.6** (`claude-sonnet-4-6`) — mejor copy en español.
- Entrevista/extracción de perfil: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — rápido y barato.

## Arranque local (prueba)

```bash
cd server
cp .env.example .env            # y pon tu ANTHROPIC_API_KEY
node --env-file=.env server.mjs # Node 20+ ; en Node 18 exporta las vars a mano
# → http://localhost:8080
```

## Despliegue en IONOS (VPS)

1. Sube el repo al VPS (o `git clone`).
2. Instala Node 18+ (`nvm install 20`).
3. `cd formacion-coach-ide/server && cp .env.example .env` y rellena `ANTHROPIC_API_KEY`.
4. Arranca con un gestor de procesos: `pm2 start server.mjs --name brandooers` (o systemd).
5. Nginx delante en el dominio elegido (p. ej. `formacion.boomatik.com`), proxy a `:8080`, con HTTPS (Let's Encrypt).

## Conectar el front-end al servidor

En las páginas, define la base del API antes de `profile.js`:

```html
<script>window.BOO_API_BASE = "";</script>  <!-- vacío = mismo origen en el VPS -->
```

Con `BOO_API_BASE` definido y un perfil escrito «con tus palabras», `profile.js` llama a
`/api/personalize` y reescribe cada sección `data-pf-slot` en vivo (con caché por sesión).
Sin `BOO_API_BASE` (GitHub Pages) sigue usando los casos pre-generados. Cero cambios para el usuario.

## Siguiente (cuando el VPS esté)

- Chat de onboarding a pantalla completa usando `/api/onboard` (sustituye al selector de casos).
- Login + base de datos (progreso, feedback, **ranking y referidos**).
- Pipeline de agentes (research → construcción → validación técnica con citas → feedback).
