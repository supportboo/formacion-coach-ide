# Formación del Coach · Odoo I+D+E

Plataforma de formación para los coaches que acompañan a los nuevos del equipo durante sus primeros 6 meses (antes del paso a Partner Manager). Sitio estático, sin servidor, alojado en GitHub Pages.

## Qué hay

| Archivo | Qué es |
|---|---|
| `index.html` | La formación. Puerta de registro (nombre + email, con consentimiento), Paso 1 «ADN del coachee», 4 pilares, técnicas de 20+ autores (cada una con su charla en popup + libro en Amazon), herramientas de perfil (Eneagrama con test, DISC/colores, Johari, zonas, rueda de emociones, Ikigai + tests gratis), rutinas y planificación del día, calendario de 6 meses, metas, plantillas y chuleta. |
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
