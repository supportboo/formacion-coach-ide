# Formaciones · Odoo I+D+E (Brandooers)

Plataforma de formación del equipo Odoo I+D+E (**Brandooers**): la escuela del equipo, de rookie a experto. Sitio estático, sin servidor, alojado en GitHub Pages. Un hub que enlaza varios cursos y **rutas de aprendizaje** que conectan cursos entre sí (p. ej. Outbound → módulo Webinars → *próximamente* Marketing).

- **Hub** (`hub.html`): portada + onboarding (objetivo + nivel → ruta recomendada) + catálogo de cursos + rutas 0→100. Punto de entrada. Los nodos «próximamente» ya marcan por dónde crecerá el mapa.
- **Formación del Coach** (`index.html`): acompañar a los nuevos del equipo durante sus primeros 6 meses (antes del paso a Partner Manager).
- **Formación Outbound Sales** (`outbound-sales.html`): captación de clientes y de partners, playbooks prácticos y recursos verificados.
- **Reclutamiento de Partners** (`reclutamiento-partners.html`): manual completo de 12 módulos para captar empresas tecnológicas y convertirlas en partners de Odoo (outbound consultivo). Generado desde `../odoo-partner-outbound/` (`build.py` + `modules/*.html`); aquí va la copia publicada.

> Nota: `hub.html` es la portada recomendada. Para hacerla la home del sitio, renombrar (mover el Coach a `coach.html` y `hub.html` → `index.html`) cuando se decida.

## Qué hay

| Archivo | Qué es |
|---|---|
| `index.html` | Formación del Coach. Puerta de registro (nombre + email, con consentimiento), Paso 1 «ADN del coachee», 4 pilares, técnicas de 20+ autores (cada una con su charla en popup + libro en Amazon), herramientas de perfil (Eneagrama con test, DISC/colores, Johari, zonas, rueda de emociones, Ikigai + tests gratis), rutinas y planificación del día, calendario de 6 meses, metas, plantillas y chuleta. |
| `outbound-sales.html` | Formación **Outbound Sales**: captación de clientes y de partners. Frameworks (MEDDIC, SPIN, Challenger, Sandler, GAP, BANT, Command of the Message) con charla + libro, cadencia multicanal 14-21 días y plantillas de copy (PAS/BAB/3 frases), objeciones al teléfono, ángulos de mensaje para pymes españolas, captación de partners (perfil ideal + programa oficial de Odoo), el stack de herramientas real, marco legal España/UE (RGPD/LSSI/AEPD) y biblioteca de recursos (libros, charlas, podcasts, blogs y perfiles de LinkedIn). Mismo diseño y mismo registro/tracking que la del Coach (comparten la clave `coach_user`). Todo con fuente verificada. |
| `hub.html` | **Portada de Brandooers**: onboarding (objetivo + nivel → ruta), catálogo de cursos y rutas de aprendizaje 0→100 que conectan cursos. Entrada recomendada. Guarda preferencias en `brand_prefs`. |
| `reclutamiento-partners.html` | Curso **Reclutamiento de Partners** (12 módulos): negocio, mindset, partner ideal (ICP), prospección, copywriting, LinkedIn, email en frío, cadencia multicanal, webinars, objeciones, stack e IA, métricas. Copia publicada del manual de `../odoo-partner-outbound/`. Enlazado con back-link a `hub.html`. |
| `dashboard.html` | Panel de seguimiento: quién entra, qué charlas ve y cuánto tiempo dedica. |
| `apps-script-tracking.gs` | Backend opcional (Google Apps Script) para el tracking real de todo el equipo. |
| `guia-coach-odoo.html` | Copia de `index.html` (mismo contenido). |

## Cómo funciona el registro y el tracking

- Al entrar, cada coach pone **nombre y email** (sin contraseña) y acepta el consentimiento. Queda guardado en su navegador.
- Se registra su actividad: charlas abiertas, tiempo en cada una, secciones vistas, libros consultados, ADN guardado.
- **Por defecto los datos se quedan solo en el navegador de cada persona** (modo local). El `dashboard.html` los muestra de ese navegador.
- Para ver a **todo el equipo en un único panel**, activa el backend (abajo).

## Activar el tracking real (5 minutos, cuenta mhgr@odoo.com)

1. Crea una **Hoja de cálculo de Google** nueva.
2. `Extensiones → Apps Script`. Pega todo el contenido de `apps-script-tracking.gs`. Guarda.
3. `Implementar → Nueva implementación → Aplicación web`. Ejecutar como: **Yo**. Acceso: **Cualquier usuario**. Autoriza.
4. Copia la URL que acaba en `/exec`.
5. Pega esa URL en la constante `TRACK_URL` de **`index.html`** y de **`dashboard.html`** (búscala arriba del `<script>`), haz commit y push.

A partir de ahí, cada visita queda en la hoja y el dashboard la lee.

## Privacidad (RGPD)

- Solo se pide nombre y email, con consentimiento explícito, para seguimiento interno de la formación del equipo Odoo I+D+E. No se comparte con terceros.
- Sin backend configurado, ningún dato sale del navegador del usuario.
- Los recursos externos (charlas, libros, tests) son gratuitos y de los propios autores o de referencia (Wikipedia, tests libres). Las charlas se ven incrustadas de YouTube; el libro enlaza a una búsqueda en Amazon.

## Deploy

Alojado en GitHub Pages (cuenta MHGRPM / Odoo). Para actualizar: edita, `git commit`, `git push`. GitHub Pages republica solo.
