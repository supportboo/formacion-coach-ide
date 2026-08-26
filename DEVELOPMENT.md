# Brandooers · Plan de desarrollo e instrucciones de integración

> Documento maestro. Cómo está montado todo, cómo se conecta cada pieza, el orden de desarrollo y
> las convenciones. Objetivo: que cualquiera (o cualquier agente) pueda seguir sin romper nada, con
> calidad y sin inventar. Léelo antes de tocar el proyecto.

---

## 1. Arquitectura en tres capas

1. **Generación (Claude Code, aquí · sin API de pago).** Los agentes de `.claude/agents/` investigan,
   verifican, construyen y validan el contenido, y lo **empujan** ya hecho al repo. Patrón BOO SEO PRO.
2. **App (estático, servido).** Los `.html` + `.js` + `.css`. Hoy en GitHub Pages; pronto en el VPS de IONOS.
   No llama a ninguna IA en producción (pre-venta). Sirve la experiencia y guarda estado en el navegador.
3. **Datos (VPS IONOS · Postgres).** Progreso, badges, ranking, referidos, y logs de clics de recursos.
   No usa modelo: es base de datos + una pequeña API de datos. (Siguiente fase.)

Regla de oro: **la IA genera aquí y se empuja; el VPS sirve y guarda datos.** La ruta de IA en vivo
(`server/server.mjs`) queda escrita pero **apagada** hasta que Brandooers sea vendible.

---

## 2. Inventario de piezas (qué es cada archivo)

**Cursos (app):**
- `hub.html` — portada + onboarding + catálogo + rutas. Entrada. `window.BOO_HOME=true`.
- `index.html` — curso Coach. `outbound-sales.html` — Outbound. `reclutamiento-partners.html` — Partners (12 mód.).
  `marketing-partners.html` — Marketing (12 mód.). `por-que-brandooers.html` — página de posicionamiento.
- `dashboard.html` — panel de seguimiento (tracking local/Apps Script).

**Motor de front (compartido, se carga en cada página):**
- `profile.js` — personalización por perfil (slots `data-pf-slot`, tokens `{{icp}}`…). Editor solo en la home.
- `personalization.js` — contenido pre-generado por caso (odoo/ecommerce/servicios). Se amplía aquí.
- `feedback.js` — modo revisión (subrayar → Útil/Mejorar/Obsoleto/Comentario, panel, export JSON).
- `resources.js` — recursos con `data-res`: registra clics (promoción/afiliación), listo para el redirector.

**Generadores (Claude Code · fuente de verdad del contenido):**
- `../odoo-partner-outbound/build.py` (+ `modules/`, `assets/style.css`) → `reclutamiento-partners.html`.
- repo `marketing-partners` `build_brandooers.py` (lee `docs/formaciones/modulo-*.md`) → `marketing-partners.html`.
- `assets/styles/brandooers.css` — sistema de diseño Brandooers (compartido por los generados).

**Agentes (Claude Code):** `.claude/agents/brandooers-*.md` — estratega, researcher, curador, verificador,
constructor, quality-gate, editor legal. Prompts completos en `AGENT-PROMPTS.md`. Modelos en `PIPELINE.md`.

**Servidor (VPS, futuro):** `server/server.mjs` + `server/README.md` — servir estático + (futuro) API de IA/datos.

**Docs:** `PIPELINE.md` (mapa + doctrina), `AGENT-PROMPTS.md` (prompts), `pipeline-diagrama.html` (diagrama),
`README.md`, este `DEVELOPMENT.md`.

---

## 3. Cómo se conecta todo (flujos de datos)

- **Onboarding → personalización:** el onboarding (home) escribe `brand_prefs` en localStorage
  (`{preset|profileText, ticket, sector, goal, level}`). `profile.js` lo lee en cada curso y reescribe los
  bloques `data-pf-slot` con `personalization.js` (pre-gen) — o, en el futuro con VPS, con `/api/personalize`.
- **Registro de usuario:** `coach_user` (nombre+email) en localStorage; compartido por todos los cursos.
- **Feedback:** `feedback.js` guarda en `boo_feedback` + beacon opcional `window.BOO_FEEDBACK_URL` (VPS).
- **Recursos → promoción/afiliación:** cada enlace de recurso lleva `data-res="<id>"`. `resources.js` registra
  el clic en `boo_resclicks` (y, con VPS, sale por `/r/<id>` que añade UTM + tag de afiliado y loguea).
- **Agentes → contenido:** estratega → researcher → curador → verificador → constructor → quality-gate →
  editor legal → **revisión humana (Marc)** → publicar (commit). Cada paso con su gate (ver PIPELINE.md).
- **Badges/ranking/referidos:** los produce el examinador; se **guardan en el VPS (Postgres)**. Hasta el VPS,
  se pueden simular en localStorage (`boo_badges`), pero el ranking real necesita datos compartidos.

---

## 4. Convenciones (respétalas para que todo encaje)

- **localStorage keys:** `coach_user`, `brand_prefs`, `boo_feedback`, `boo_resclicks`, `coach_events`, `boo_badges`.
- **Atributos:** `data-pf-slot="grupo-campo"` (personalización), `data-res="<id>"` (recurso), `data-yt` (charla),
  `data-book` (portada), `data-when="audience:..."` (bloque condicional), `data-course` (feedback).
- **Diseño:** Inter + Caveat, paleta Odoo (`--odoo-primary #714B67`, `--odoo-secondary #017E84`), rail + barra
  de flujo + secciones. Nunca romper el sistema de diseño ni meter marca Boomatik en contenido Odoo.
- **Idioma contenido:** español de España. **Código/commits:** inglés.
- **Cuentas GitHub:** `MHGRPM/formacion-coach-ide` (origin) y `supportboo/formacion-coach-ide` (remote `boomatik`).
  Push a los dos: `git push origin main` (cuenta MHGRPM) y `git push boomatik main` (cuenta supportboo).
- **Modelos de agente:** Opus 4.8 en verificador y quality-gate; Sonnet 4.6 en el resto (ver PIPELINE.md).

---

## 5. Plan por fases

**Fase 0 — HECHO.** 4 cursos + hub + rutas + personalización pre-gen + feedback + flujo. Agentes definidos.
Página «Por qué Brandooers». Recursos con `data-res`. Diagrama y docs.

**Fase 1 — VPS IONOS (esta noche, con las claves de Jeanlouis).**
1. Acceso SSH + dominio (p. ej. `formacion.boomatik.com`).
2. Servir el repo: Nginx (o `node server/server.mjs`) + HTTPS (Let's Encrypt).
3. `.nojekyll` ya está; subir el repo o `git clone` en el VPS.
4. Validar que todo carga igual que en Pages.

**Fase 2 — Datos (badges, ranking, referidos).** Postgres en el VPS + una API de datos mínima
(`/api/progress`, `/api/badge`, `/api/rank`, `/api/refer`, `/r/:id`). El front pasa de localStorage a la API.
Sin IA: es datos. Aquí se activa el ranking real y el redirector de recursos con tracking.

**Fase 3 — Pipeline de contenido semi-auto.** Orquestar los agentes (Claude Code) para producir cursos nuevos
verificados que Marc revisa antes de publicar. Primer encargo: **módulo de Embudos por tipo de negocio**
(ver §7). Cron opcional que proponga borradores.

**Fase 4 — Vendible.** Encender la IA en vivo (`/api/personalize`, chat de onboarding para cualquier sector),
login real, afiliación (tag en `/r/:id`), acuerdos con autores/expertos.

---

## 6. Despliegue en IONOS (paso a paso, para la Fase 1)

1. Entrar por SSH. Instalar Node 20 (`nvm install 20`) y Nginx.
2. `git clone https://github.com/supportboo/formacion-coach-ide.git /var/www/brandooers`.
3. Servir estático con Nginx apuntando a esa carpeta, o `pm2 start server/server.mjs` (sirve estático).
4. Dominio + HTTPS (certbot). Probar `https://<dominio>/hub.html`.
5. (Fase 2) Instalar Postgres, crear la BD, desplegar la API de datos, definir `.env` (nunca en git).

> Recuerda: no leer secretos del VPS por SSH (quedan en logs). Usar `.env` local en el server, gitignored.

---

## 7. Pendiente concreto (tareas)

- **Embudos por tipo de negocio (Marketing).** Módulo NUEVO y **original** (high-ticket vs low-cost vs servicios
  vs ecommerce). ⚠️ No usar el material de Udemy de `Documents/MARKETING FUNNELS` (copyright de terceros): solo
  como referencia mental. Hacerlo con el pipeline: researcher (fuentes públicas) → verificador → constructor,
  y enlazar a los autores originales (libros/charlas). Añadir como `modulo-13-...md` en `marketing-partners` y regenerar.
- **Ampliar personalización pre-gen** a más secciones y casos (generado aquí, empujado).
- **Redirector `/r/:id`** en el VPS (Fase 2) + activar tracking real de recursos.
- **Login + badges + ranking + referidos** (Fase 2).
- **Copiar generadores a supportboo** (`marketing-partners`, `odoo-partner-outbound`) cuando Marc lo confirme.

---

## 8. Checklist de calidad (antes de publicar cualquier cosa)

- [ ] Cero información inventada · cada dato con fuente + fecha.
- [ ] Enlaces comprobados (HEAD 200).
- [ ] Recursos legales (del autor, no pirata) y que promocionan al autor (`data-res`).
- [ ] Disclaimers en precios/normativa.
- [ ] Castellano RAE · sin AI-slop · sin emojis en contenido.
- [ ] UX escaneable y accesible · móvil impecable.
- [ ] Probado en local (Playwright) antes de commit.
- [ ] Push a los DOS remotos (origin + boomatik).
- [ ] Revisión humana de Marc antes de que llegue a alumnos.
