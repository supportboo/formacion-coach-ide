# Changelog · SkillUp platform

## 1.20.0 — 2026-09-30

### V2 fase 6a: repaso de 3 minutos con tus errores reales
- **Repaso** (`/app/repaso.html`): hasta 3 preguntas que la persona falló en sus tests hace al menos 2 días («Hace 18 días fallaste esto en el test del bloque 3 de…»), otra vez con las opciones barajadas; al responder ve la explicación; y termina con «¿dónde vas a usar esto esta semana?», que se guarda en su ficha como aplicación.
- **Espaciado**: lo más antiguo primero; tras un acierto espera una semana; dos aciertos espaciados = aprendido y deja de salir; un fallo lo vuelve a traer.
- Sin IA (coste cero, corrección exacta); la respuesta correcta no sale del servidor hasta que contesta. Solo preguntas de opción múltiple por ahora.
- En Inicio, «Tu siguiente mejor paso» propone primero el repaso cuando hay errores que tocan hoy.
- `GET /api/learning/review` (`?peek=1` solo cuenta), `POST /api/learning/review/answer`; cada respuesta queda como evidencia `repaso`.

## 1.19.0 — 2026-09-30

### V2 fase 2: demostrar sin ayuda y enseñar (teach-back)
- **Demuéstralo sin ayuda** (`/app/demostrar.html`): una situación de su trabajo sacada del contenido real de un bloque del curso y de lo que sabemos de su día a día; responde sin tutor, sin pistas y sin poder pegar texto (sí dictar). Se revisa conducta a conducta.
- **Explícaselo a un compañero** (teach-back): elige un bloque que ya aprobó; lo explica por escrito o con el micro, sin mirar el curso. Los conceptos esperados son los apartados reales del bloque; se revisa qué cubre, si pone un ejemplo, la claridad y qué le falta.
- **La nota no la inventa la IA**: el modelo juzga cada criterio con una frase literal de la respuesta, y el servidor comprueba que esa frase está de verdad en el texto; sin prueba, el criterio no cuenta. La nota se calcula con reglas fijas.
- **Evidencias propias** en la tabla `evidence_event` (migración 0030) con independencia («independiente», «enseñó») y ayuda de la IA («ninguna»). En «Tu capacidad»: la demostración suma a autonomía y se ve aparte como «Sin ayuda de la IA»; el teach-back suma como mucho 25 puntos a transferencia (explicar no es haber formado a alguien) y nunca da N3 por sí solo. Nuevas casillas en la lista de evidencias y accesos directos en cada tema.
- Siguiente paso: tras dominar la teoría, «Demuéstralo sin ayuda»; con conocimiento alto, «Explícaselo a un compañero».
- `POST /api/learning/demo/start`, `POST /api/learning/demo/submit`. Criterios y conceptos solo se enseñan al final.

## 1.18.0 — 2026-09-29

### Arquitectura V2, fase 1: la capacidad de la persona es la unidad principal
- **Tu capacidad** (Ficha): por cada competencia (o curso sin vincular), conocimiento, aplicación, autonomía y transferencia de 0 a 100, cada una con su porqué; lista de evidencias (test, examen, roleplay, caso real validado, aplicación repetida, haber acompañado a alguien); confianza de la estimación (baja/media/alta, con motivos); vigencia; y «¿Por qué creemos esto?» con cada evidencia y su fecha.
- **Tu siguiente mejor paso** (Inicio): una sola acción con su porqué (refrescar, repetir el bloque más flojo, practicar, examen, caso real o acompañar a alguien).
- Las evidencias se derivan de lo que ya existe (sin tabla nueva ni doble escritura): funciona con todo el histórico desde el primer día. Reglas fijas y explicables en `capability.ts`; el nivel oficial N0-N4 no cambia y se muestra al lado.
- **Cursos ↔ competencias** (Panel): hasta ahora lo que alguien hacía en un curso nunca sumaba a una competencia. Admin y dirección vinculan cada curso; sin vínculo, el curso es una capacidad propia. Tabla `course_competency` (migración 0029), `GET /api/learning/capability`, `GET/PUT /api/org/course-skills`.
- Arreglo: tras llegar a N2, cada caso aprobado posterior repetía la cascada de N2 (puntos al coach y certificado). Ahora solo la primera vez.
- Plan completo de la V2 (modelo de datos, memoria en tres capas, permisos, rutas, 10 fases y migración sin romper producción) en `ARQUITECTURA-V2.md`.

## 1.17.0 — 2026-09-29

### Privacidad, gasto y cumplimiento (auditoría externa, P1)
- **Conversaciones con el tutor privadas** (decisión de Marc): en «En directo» el responsable ve progreso, señales y discrepancias, pero no lo que la persona habla con el tutor; solo ve una conversación desde que él mismo escribe en ella con su nombre. Del resto, solo cuántas hay. El resumen con IA de la persona usa solo la parte compartida. Textos de privacidad actualizados en los 5 idiomas y en lo que responde el tutor.
- **El tutor ya no calla al coach**: apoya su indicación, pero si choca con el curso, la ficha de la empresa o un dato comprobable, lo dice con respeto, recomienda confirmarlo y deja una discrepancia que el responsable ve en la ficha de la persona.
- **Borrado y exportación completos**: «Descargar mis datos» incluye los mensajes del chat y las evidencias; el borrado quita también el enunciado personalizado de sus casos, sus evidencias y el feedback escrito sobre ellos.
- **Voz con tope**: solo voces de la lista oficial y cada lectura cuenta en el tope diario de gasto de IA de la empresa (~0,20 $ por 1.000 caracteres).
- **Pagos**: abrir el pago ya no cambia el plan ni los asientos; solo cambian cuando Stripe confirma la suscripción (activa o en prueba).
- **Expediente FUNDAE completo** (Panel › FUNDAE): fechas de inicio y fin, información a la representación de los trabajadores (≥15 días antes), comunicación de inicio (≥2 días naturales), 1 tutor por cada 80, máximo 8 h/día, participantes que finalizan (≥75 % de controles), cuestionario de calidad, diplomas en ≤2 meses y conservación 4 años. Cada punto sale como Correcto, Pendiente o Falta; se descarga el expediente. `GET /api/fundae/actions`, `PATCH /api/fundae/actions/:id`; migración 0028.
- **Reglamento de IA**: los tutores dicen que son una inteligencia artificial; el resumen con IA de una persona no puede valorar su rendimiento laboral ni sugerir decisiones de empleo. Postura y preguntas para el abogado en `REGLAMENTO-IA.md` (alto riesgo del anexo III: 2-dic-2027).

## 1.16.0 — 2026-09-28

### Seguridad (auditoría externa, P0)
- Exámenes: la sesión de examen queda ligada a la persona, la empresa y la competencia que lo generaron; nadie más puede entregarlo ni gastarlo, y el itinerario enviado debe ser de esa empresa y esa competencia. Se retira la ruta que aceptaba la nota calculada en el navegador.
- Superadmin: además del correo, exige el identificador de usuario ya dado de alta (una cuenta nueva registrada con el mismo correo no hereda el acceso). Aplica también a la vista como otro perfil.
- «Mi equipo» deja de ser «toda la empresa»: coaches y team leaders ven solo a las personas que un administrador les asigna y a quienes acompañan como coach, en En directo, Métricas, fichas, mensajes y resúmenes. Sin asignaciones, el equipo está vacío. En la vista equipo los totales de empresa siguen siendo agregados y anónimos.
- Panel › Equipos: admin y dirección asignan el equipo de cada responsable. `GET /api/org/teams`, `PUT /api/org/teams/:managerId`; tabla `team_assignment` (migración 0027).

## 1.15.0 — 2026-09-28

### Circuito de módulo: ajustar, practicar, entregar, aplicar
- Al empezar un curso, «Ajusta el curso a tu nivel · 1 minuto»: micropráctica con el tema del curso; su nivel provisional queda en la ficha viva como «observado» para ese curso (no toca la acreditación N1-N4). Se puede aparcar con «Ahora no».
- Bloque «Para ti»: la espera enseña con qué datos reales se está preparando (su caso, su objetivo, cómo prefiere aprender), sin progreso inventado; y la sección siguiente se prepara por adelantado mientras lee la actual.
- Al terminar cada módulo, «Cierre del módulo»: un entregable hecho con su realidad (guion, lista o plan) y una siguiente acción para esta semana, con «Lo aplicaré esta semana» o «Necesito repasarlo». Misma caché que «Para ti» (se rehace si cambia lo que sabemos de él).
- Inicio, «¿Qué tal fue?»: a los 3 días de comprometerse a aplicar algo, pregunta si lo hizo (sí, a medias, todavía no) y qué pasó; la respuesta entra en la ficha viva como aplicación.
- `POST /api/learning/module-close`, `GET /api/learning/applied/pending`, `POST /api/learning/applied`; la micropráctica devuelve un nivel provisional.

## 1.14.0 — 2026-09-28

### Bienvenida v2: primero algo útil
- Empieza por la situación real que la persona quiere resolver en las próximas semanas (con ejemplos para elegir), en lugar de «¿qué quieres aprender?». Se guarda como su objetivo, así tutor y ruta siguen funcionando igual.
- Nueva pregunta: qué ha probado ya y qué pasó.
- Si la empresa ya tiene ficha validada, no se pregunta su web a cada alumno.
- Micropráctica de un minuto antes del DNA: un escenario breve con su situación, responde y sale con un entregable que puede usar ya (preguntas para su próxima conversación, un guion o una lista), más qué hizo bien y una mejora concreta. Se evalúan conductas, nunca personalidad, y no acredita nivel. Su respuesta alimenta la ficha viva y el entregable queda en sus notas.
- Textos nuevos traducidos a inglés, catalán, portugués y francés.
- `GET /api/learning/company-ready`, `POST /api/learning/micropractice` y `/micropractice/eval`.

## 1.13.0 — 2026-09-28

### Ficha de la empresa, validada por un responsable
- Nueva tarjeta «Ficha de la empresa» en el Panel (admin, dirección, team leader, inspirador): qué ofrece, a quién se dirige, términos propios, herramientas que usa, herramientas que no se deben recomendar, competencias prioritarias y límites (qué no se puede decir ni prometer).
- «Preparar borrador» la rellena desde la web de la empresa; solo cuenta cuando un responsable pulsa «Guardar y validar» (queda registrado quién y cuándo).
- La ficha validada llega al tutor y al bloque «Para ti» (y cambiarla rehace los bloques). Así ningún alumno tiene que explicar el contexto de su empresa.
- Recursos: además de la lista global, se retiran las herramientas que la empresa marque como no recomendables.
- `GET/PUT /api/config/company/profile`, `POST /api/config/company/profile/draft`. Migración `0026`: columnas `profile`, `profile_validated_at`, `profile_validated_by` en `company_config`.

## 1.12.0 — 2026-09-28

### Ficha viva del alumno (memoria con evidencias)
- Nueva tabla `learner_fact`: lo que sabemos de cada alumno para adaptar su formación, por capas (su trabajo, objetivos, casos que tiene entre manos, competencias, preferencias, lo que le ayuda, lo que ha aplicado, a quién ayuda). Cada dato lleva fuente, fecha, cita literal y estado: declarado, observado, confirmado o desactualizado.
- Se alimenta sola en segundo plano con lo que escribe el alumno (respuestas de «Tu turno» y «Para ti», su bienvenida y sus mensajes al tutor). Reglas en código: sin cita literal de su texto no entra ningún dato; nada de rasgos psicológicos; «confirmado» solo lo pone él.
- El tutor y el bloque «Para ti» usan la ficha como fuente principal. Corregir o retirar un dato rehace los bloques «Para ti» la siguiente vez; las respuestas y notas de evaluación no cambian.
- Pantalla `/app/ficha.html`, «Así estoy adaptando tu formación»: el alumno ve cada dato con su origen, lo confirma, lo corrige, deja de usarlo o añade algo. Enlazada desde cada bloque «Para ti» y desde «Tus datos».
- Privada del alumno: no la ven responsables ni entra en métricas de empresa. Incluida en la exportación y el borrado de datos (RGPD).
- Recursos: la comisión de afiliación ya no cambia el orden; manda la utilidad para aprender.

## 1.11.0 — 2026-09-28

### Itinerario a especialista
- Tarjeta «Tu camino» en Inicio con cuatro etapas: Base → Especialidad → Especialista → Coach.
- Base: el alumno elige su especialidad entre los cursos temáticos (Outbound, Reclutamiento, Marketing, Negociación, Objeciones, Prospección y social selling); se puede cambiar. La ruta de aprendizaje le da peso a la especialidad elegida.
- Especialidad: avance medido con los bloques aprobados del curso (100 % con el certificado).
- Especialista: al terminar, el siguiente paso es la Guía del Coach.
- Coach (nivel Coach N4 o rol coach/admin/dirección): invitación lista para copiar y enviar a compañeros, con el objetivo de atraer a 2 a su área; se cuenta cada invitación copiada.
- `GET /api/learning/path`, `POST /api/learning/path/specialty`, `POST /api/learning/path/invite`. Sin tablas nuevas: notas `[especialidad]` e `[invitacion]` del propio alumno.

## 1.10.0 — 2026-09-28

### Bienvenida y Team DNA en un solo recorrido
- Perfil provisional: en cuanto la persona responde los dos primeros bloques del Team DNA («Cómo aprendes» y rasgos, 28 respuestas, unos 5 minutos) se guarda un perfil que ya usan el tutor, el bloque «Para ti» y los recursos. El eneagrama y el Hexad se terminan cuando quiera; el perfil completo sustituye al provisional.
- La bienvenida ya no pregunta «¿Cómo aprendes mejor?»: lo mide el Team DNA con ítems con respaldo científico (y sus opciones «vídeos / teoría» rozaban el mito de los estilos de aprendizaje). Traducciones alineadas en los 5 idiomas.
- El «trato» elegido en la bienvenida (directo, con tacto, retándome) marca el tono del tutor; antes se guardaba sin usarse.
- El tiempo semanal de la bienvenida fija los módulos por semana del calendario de la ruta (1, 2 o 4) mientras la persona no ajuste el suyo; también decide cuántos recursos «para ti» ve.
- El mensaje final de la bienvenida explica que con 5 minutos del DNA todo se adapta ya.

## 1.9.0 — 2026-09-28

### Contenido vivo: bloque «Para ti» en cada sección
- Al abrir cada sección aparece arriba un bloque «Para ti»: una frase que la conecta con su objetivo, un ejemplo resuelto ambientado en su realidad y una práctica paso a paso para aplicarlo a su caso esta semana. Termina con una pregunta para conocerle mejor.
- Se construye solo con lo que el alumno ha dicho: bienvenida (puesto, empresa, objetivo, nivel, freno), su perfil del Team DNA (orden ejemplo o práctica primero, porqué o cómo, tipo de práctica, tono), la síntesis del tutor y sus respuestas anteriores en el curso. Si falta un dato, plantea una situación típica de su puesto sin presentarla como suya; nunca inventa clientes ni cifras.
- Se regenera cuando cambia lo que sabemos de él: lo que responde en un bloque ya se usa en el siguiente. El texto de la sección no cambia (cuadra con lo declarado a FUNDAE).
- `POST /api/learning/adapt`. Guardado por alumno y sección (anotación `adapt`), fuera de «Mi curso» y de las métricas de equipo.

## 1.8.0 — 2026-09-28

### Recursos del curso tipo Netflix, con podcasts, herramientas y afiliación
- Los recursos se piden al abrir el curso (con su temario), no sección a sección. Página `/app/recursos.html` con pestañas Todo · Para ti · Vídeos · Podcasts · Libros · Herramientas; los vídeos se ven dentro de SkillUp. Al final de cada sección, los 3 que mejor casan con ella y el enlace a todos.
- Podcasts desde Apple Podcasts (iTunes Search API, sin clave): calidad = autoridad + que siga activo; valor = episodios publicados. Herramientas propuestas por la IA, solo si su web responde.
- Afiliación detrás del control de calidad: libros a Amazon.es con la etiqueta `AMAZON_ES_TAG` (si está configurada) y herramientas con enlace de afiliado por dominio (`src/config/affiliates.ts`); entre recursos que ya pasan la calidad, lo rentabilizable sube de puesto. Cada enlace de afiliado lleva la marca «Enlace de afiliado» y `rel="sponsored"`.
- Pestañas en el orden del formato preferido del Team DNA; «Para ti» con 2, 4 u 8 recursos según el tiempo semanal.
- Sin textos que expliquen al alumno cómo se puntúa.
- Nunca se guarda en caché un resultado vacío, y el registro del servidor anota candidatos y aceptados por tipo en cada búsqueda.
- Service worker: no intercepta la navegación (fallaba siempre porque una petición de navegación no admite opciones y la página acababa en «error de red») ni peticiones de otros orígenes (extensiones de Chrome); solo guarda respuestas buenas.

## 1.7.0 — 2026-09-28

### Recursos por sección con agente de calidad
- En cada sección de cada curso, «Recursos para esta sección»: libros y vídeos de YouTube que existen de verdad, elegidos por IA y verificados sin revisión humana.
- Libros verificados en Open Library (existe y el autor coincide; si no, se descarta), con su edición en castellano cuando Open Library la confirma. Google Books no se usa: sin clave propia su cuota compartida está agotada.
- El agente de calidad puntúa cada recurso de 0 a 100 en **calidad** (valoración media corregida por número de valoraciones, reediciones, «me gusta» y comentarios por visita, autoridad del autor o canal), **valor** (lectores en Open Library, visitas, tamaño del canal) y **relevancia** para esa sección concreta. Solo pasan los que tienen relevancia ≥ 60 y nota total ≥ 50. Cada recurso enseña el dato que lo justifica.
- Personalización: el formato preferido del Team DNA decide si van primero libros o vídeos, el tiempo semanal de la bienvenida decide cuántos se ven (2, 4 u 8) y el idioma es el de la persona.
- `POST /api/learning/resources` (tema + texto de la sección). Caché por tema e idioma 14 días; límite 10 peticiones por minuto y persona.

## 1.6.0 — 2026-09-28

### Dos planes por persona y mes
- **Esencial, 9 €** (antes `texto`): cursos con texto, herramientas y esquemas, vídeos seleccionados, modo escucha cuando está disponible, tutor IA con voz, tests por bloque, examen final y certificado.
- **Profesional, 13 €** (antes `video_corto`): todo lo de Esencial más roleplays, Team DNA, supervisión «En directo», métricas e insights, informe de ROI y asignaciones del responsable.
- `inmersivo` se retira de la venta: no aparece en `GET /api/billing/tiers` ni se puede contratar (`/api/billing/checkout` solo acepta `texto` y `video_corto`), pero la fila y cualquier suscripción existente se conservan.
- Facturación del panel de empresa con comparativa de los dos planes y nota FUNDAE: cada curso puede venderse además como acción bonificable, hasta 7,50 € por hora y participante en teleformación (20 h → hasta 150 € por alumno), según el crédito de cada empresa y los requisitos de FUNDAE.

### Créditos de creación (monedero por empresa)
- 1 crédito = 0,10 €. Packs de pago único por Stripe Checkout: 100 créditos 10 €, 500 créditos 45 €, 1.000 créditos 80 €. Los compra admin o dirección.
- Precio en créditos (editable por el superadmin, tabla `credit_price`): voz narrada 3/min, vídeo con avatar estándar (HeyGen Avatar IV) 12/min, vídeo con avatar realista (Avatar V) 35/min, crear avatar propio 100, clonar voz 150, crear curso con IA 20. Junto a cada uno, el coste **estimado** del proveedor con su fuente (ElevenLabs ~0,17–0,20 $ por 1.000 caracteres; HeyGen Pro 49 $/1.000 créditos: Avatar IV ≈ 0,78 $/min, Avatar V ≈ 2,35 $/min; avatar y voz propios «por medir»).
- Puerta de nivel Coach: solo gasta quien tiene N4 en alguna competencia, rol coach/admin/dirección o es superadmin. El resto ve en su panel lo que desbloquearía.
- **Conectado hoy**: crear un curso con IA (`POST /api/catalog/course-panel`) cuesta 20 créditos. Mantiene la confirmación previa (ahora muestra créditos y saldo), cobra de forma atómica antes de llamar a la IA y devuelve los créditos si la creación falla. Tarjeta «Créditos de creación» en «Mi panel» con saldo, lo que se puede crear y el formulario del curso.
- **Preparado, sin función todavía**: voz narrada, vídeos con avatar, avatar propio y clonar voz aparecen como «Próximamente»; `spendCredits` ya los cobra cuando se construyan.
- Panel de empresa: saldo, compra de packs, tabla de precios y movimientos (quién gastó qué). Superadmin → Ajustes: editor de precios en créditos y monederos de todas las empresas.

### Técnico
- Migración `0024_pricing_credits` (idempotente): tablas `credit_price` y `credit_ledger` (índice único parcial por sesión de Stripe en las compras), planes Esencial 900 y Profesional 1300 céntimos y precios en créditos por defecto.
- `services/credits.ts`: `spendCredits` bloquea el monedero con `pg_advisory_xact_lock` dentro de la transacción; nunca deja saldo negativo. Error 402 con mensaje claro si no hay saldo y 403 si no se llega a Coach.
- Webhook de Stripe: `checkout.session.completed` (y `async_payment_succeeded`) con `metadata.kind = credits` abona el pack del catálogo una sola vez por sesión.
- Rutas nuevas: `GET /api/billing/plans`, `GET /api/billing/credits`, `GET /api/billing/credits/ledger`, `POST /api/billing/credits/checkout`, `GET /api/platform/credits`, `POST /api/platform/credits/prices/set`.
- Tests: planes, packs, puerta Coach, gasto atómico e insuficiente, devolución e idempotencia del webhook (Stripe simulado); test de integración `itest/credits.itest.ts` contra Postgres.

## 1.5.0 — 2026-09-28

### Idioma de la plataforma (fase 1)
- **Cada persona elige su idioma**: español (por defecto), inglés, catalán, portugués o francés. Es el primer paso de la bienvenida (se propone el del navegador si está entre los soportados; si no, español) y se cambia cuando se quiera desde el menú («Idioma»). Se guarda en la cuenta (`user.lang`), `GET /api/org/me` lo devuelve (`lang`, `langChosen`) y `PUT /api/org/me/lang` lo cambia. Cada página pone `<html lang>` en consecuencia.
- **La IA responde en ese idioma**, de forma central (envoltorio `llm` de `container.ts`, se resuelve por `userId` con caché de 60 s): tutores, asistente de los ojos, Explorar, roleplays y entrevistas previas, tests de bloque, examen final, corrección y comentarios de respuestas, saludo del coach y resúmenes de supervisión (en el idioma del supervisor, que es quien los pide). En español se mantiene el trato de tú en castellano de España (nunca «vos»); en los demás idiomas, registro informal natural (tutoiement en francés, «tu» y portugués europeo en portugués). El contenido que se comparte con toda la empresa (lecciones, cursos del panel, retos, moderación, buenas prácticas) se sigue generando en español.
- **Voz y dictado**: la voz lee el texto en el idioma de la persona (ElevenLabs multilingual v2 / turbo v2.5 hablan inglés, portugués y francés; el catalán solo lo habla `eleven_v3`, que se usa para «ca»). La voz de Marc sigue con su panel de ElevenLabs. El dictado escucha en es-ES, en-GB, ca-ES, pt-PT o fr-FR.
- **Interfaz traducida** (capa `/app/i18n.js`, `data-i18n` + `SUI18n.t()`): menú, asistente de los ojos, pulgares y formulario de sugerencias, pantalla de espera y minijuegos, dictado, aviso de transparencia y de supervisión en directo, «Tus datos», bienvenida, página de vídeos y panel de vídeos del curso. El resto de páginas sigue en español en esta fase.
- **Cursos traducidos al vuelo**: quien usa otro idioma ve cada sección traducida («Traducido automáticamente · ver original»). El servidor solo traduce texto que está de verdad en el curso, exige que la traducción conserve exactamente las mismas etiquetas y atributos (si no, se muestra el original) y guarda cada sección una sola vez para toda la plataforma (`content_translation`, por curso + sección + idioma + hash). Modelo rápido; límite por persona y empresa y tope diario de IA de la empresa. Coste estimado: unos 0,07 $ por curso típico y idioma, 0,70 $ el más largo, ~1,2 $ por idioma todo el catálogo, una sola vez (coste real en `ai_usage`, `kind=translate`).

### Vídeos por idioma y calidad
- **Selector de idioma** en «Vídeos» y en el panel de vídeos del curso (por defecto, el de la persona) con el aviso «Solo vídeos en español», «Only videos in English», etc.
- La búsqueda usa `relevanceLanguage` + `regionCode` del idioma y después **filtra** por el idioma declarado del vídeo (`defaultAudioLanguage`, luego `defaultLanguage`) o, si el canal no lo declara, por una heurística de palabras del título y la descripción.
- **Nota de calidad 0-100** con datos medidos de la API (nada estimado): 40 «me gusta» por vista (satura al 4 %), 20 comentarios por vista (satura al 0,5 %), 25 alcance (log de vistas, satura en 1 M), 10 canal (log de suscriptores), 5 actualidad. Fuera Shorts (< 2 min; la búsqueda ya pide 4-20 min), pocas vistas y canales pequeños (umbrales más bajos en catalán). «Mejor valorados» se ordena por esa nota.
- Caché de 12 h por tema + idioma. Cuota: 2 búsquedas × 102 unidades = 204 u por tema e idioma cada 12 h (la portada junta 7 temas: ~2.900 u/día por idioma en uso; el límite por defecto es 10.000 u/día). «Brandooers Favs» solo cuenta lo visto en ese idioma.

### Técnico
- Migración `0023_i18n_language` (idempotente): `user.lang`, `video_event.lang`, tabla `content_translation` con índice único.
- `POST /api/learning/translate` (Zod, cuenta aprobada, curso del catálogo, 20/min por persona y 60/min por empresa en fallos de caché). `GET /api/learning/videos(?topic)&lang=`, `GET /api/learning/videos/home?lang=` (ahora también con límite de peticiones).
- Tests: `tests/i18n.test.ts` (resolución del idioma, regla del prompt, modelo de voz, mapa del dictado, nota de calidad y filtros, validador de estructura, clave de caché).

## 1.4.0 — 2026-09-28

### Métricas e insights por rol (una entrada de menú, dos pestañas)
- **Métricas** = solo datos medidos (definición, periodo, n, «Medido / Estimado / Sin datos»), gráficos por día con selector 7/30/90 días, tablas ordenables y exportables a CSV. **Insights** = interpretación y acciones sacadas solo de esas métricas, cada una con enlace a su dato y a la acción.
- **Superadmin** (Consola › «Métricas e insights», sustituye a «Resumen» e «Insights»): salud 0-100 por empresa (40 % adopción + 35 % progreso + 25 % recencia, fórmula a la vista), riesgo de baja con motivo, uso, aprendizaje, economía (coste IA de 30 días frente a lo que paga cada empresa, alerta > 20 % o IA sin pagar), gráficos globales (activas, minutos, certificados, coste IA frente a ingresos), cursos por prioridad de mejora, bloques más difíciles, salud técnica (errores: Sin datos; modelo que respondió) y «qué aprende el sistema de verdad» (se corrige la afirmación falsa de que las notas y el Team DNA personalizan al tutor). Resumen del negocio con IA (modelo rápido, caché 15 min, 6/min). «Ver como su admin», En directo, ROI y ficha de cada empresa en modo solo lectura; cada acceso a otra empresa queda en `audit_log` (`platform.view`). «Métricas» pasa a llamarse «Competencias».
- **Admin / dirección** (`/app/metricas.html`): adopción, resultados por curso, bloque y persona, certificados, tiempo hasta certificarse, práctica, casos, Team DNA, ROI (euros solo si la empresa los introduce), pruebas asignadas, las 3 acciones de la semana, dónde apoyar y «Enviar sugerencia a Brandooers».
- **Team leader / coach**: quién necesita ayuda hoy, progreso por persona, pruebas asignadas (vencidas, resultados), validaciones pendientes y acciones rápidas. Aún no hay equipos: se ve toda la empresa y se dice.
- En directo acepta `?persona=` y `?tab=metrics`; el superadmin no puede escribir a la gente de otra empresa (solo lectura).
- Endpoints: `GET /api/platform/cockpit`, `GET /api/platform/cockpit/summary`, `GET /api/analytics/home`. Sin migraciones. Tests: `tests/dashboards.test.ts`.
### Feedback: valorar respuestas y enviar sugerencias
- **Pulgar arriba / abajo bajo cada respuesta de la IA**: tutor del curso (chat y corrección de ejercicios), chat de la lección, asistente de los ojos (panel y bocadillo de «mantener para hablar»), Explorar, turnos y valoración final de los roleplays (Reto y Roleplays) y explicaciones y correcciones de la evaluación. Un voto por persona y respuesta, se puede cambiar o quitar. El pulgar abajo abre motivos («Dato incorrecto», «Fuera de tema», «No lo entiendo», «Suena mal o falla la voz», «Palabra mal escrita», «Otro») y un comentario opcional. Botones de 44 px en móvil. Script compartido `/app/feedback.js`.
- **«Enviar sugerencia» en el menú** para todos los roles (sugerencia, error, petición de contenido u otro); el admin y la dirección lo ven como «Enviar sugerencia a Brandooers». Se adjunta solo la página, el rol, la empresa y el navegador. Cada persona ve el estado de lo que ha enviado.
- **Bandeja de feedback** (`/app/feedback.html`, menú «Feedback» y botón en la Consola): el superadmin ve todas las empresas, filtra (empresa, qué, valoración, tipo, motivo, estado, curso, página, fechas), ve la pregunta anterior y la respuesta valorada, cambia el estado (nuevo, en revisión, resuelto, descartado) con nota de resolución y, en «Palabra mal escrita», añade el término al glosario de esa empresa. Gráficos de satisfacción por semana, agente, curso y empresa, motivos más repetidos y bloques con más pulgares abajo. «Resumen de feedback» con IA (modelo rápido, caché 1 h, solo con reportes reales). Admin y dirección ven la bandeja de su empresa en solo lectura.
- **Cierre del círculo**: cuando algo se resuelve, quien lo envió ve el aviso («Tu sugerencia se ha resuelto: …») la próxima vez que entra.
- RGPD: la exportación y el borrado incluyen las valoraciones y sugerencias.

### Técnico
- Migración `0022_feedback` (tabla `feedback`, índice único por empresa + persona + respuesta). Idempotente.
- `POST /api/agent/chat` devuelve también `messageId` (el mensaje de la IA) para poder valorarlo.
- Endpoints bajo `/api/agent/feedback/*` (`rate`, `general`, `mine`, `notices`, `inbox`, `:id/status`, `:id/glossary`, `summary`). No se usa `/api/feedback` (va al servicio antiguo). Zod y límites de peticiones en todos; permisos en `inboxAccess` (empleado lo suyo, admin/dirección su empresa en lectura, superadmin todo).

## 1.3.0 — 2026-09-28

### Supervisión en directo («En directo», `/app/en-directo.html`)
- **Tablero en directo** para coach, team leader, admin, dirección y superadmin (con selector de empresa): quién está conectado (latido en 60 s), en qué curso y sección, cuánto tiempo lleva, % leído, inactivos y señales de atasco (≥ 12 min en la misma sección, 2 suspensos del mismo test sin aprobar después, roleplay abierto ≥ 30 min, 7 días sin entrar). Filtros y búsqueda. Inspirador: solo métricas agregadas. Aún no hay equipos en la plataforma: «equipo» = toda la empresa.
- **Ficha por persona**: progreso por curso (anillos, notas por bloque, examen final, certificados), roleplays, tiempo activo real, racha, sesiones, puntos, mapa de calor día × hora, Team DNA, actividad reciente y la conversación con el tutor.
- **Vista previa** de la misma página y sección que lee la persona, reproducida con la sesión del responsable en un iframe reducido (no es su pantalla). No se reproducen tests ni roleplays.
- **Intervención humana**: el responsable escribe en el chat del tutor; llega con nombre y rol, distinto de la IA, en casi tiempo real; el tutor lo tiene en cuenta y no lo contradice. Si no está en el curso, le llega como aviso en su siguiente página.
- **Métricas tipo Odoo**: activos 24 h / 7 / 30 días, minutos activos y sesiones por día, embudo por curso, bloques más difíciles, tiempo hasta certificarse, roleplays y quién necesita ayuda primero. Cada cifra con definición, n y «Medido / Sin datos».
- **Resumen con IA** (modelo rápido, caché 15 min) de la persona o de la empresa, solo con datos medidos.
- **Garantías (ET art. 20.3 y 20 bis, LOPDGDD art. 87-89)**: aviso visible y obligatorio «Tu coach X está siguiendo tu sesión»; aviso informativo único de qué se ve; sin grabación de pantalla, teclado ni cámara; interruptor de empresa para el seguimiento en directo; retención de 90 días; exportación y borrado RGPD; auditoría de cada ficha abierta y cada intervención. La ayuda de supervisión solo la reciben los roles que la usan.
- Migración `0021_live_supervision` (tabla `activity_event`; columnas nuevas en `agent_thread`, `agent_message` y `company_config`).

## 1.2.0 — 2026-09-27

### Evaluación y certificación
- **Test del bloque** (`/app/evaluacion.html`): al pasar de un bloque al siguiente dentro del curso aparece «Bloque completado» con el test personalizado: 6 preguntas (4 de opción múltiple con escenarios, 1 respuesta breve y 1 caso) hechas SOLO con el contenido de ese bloque y ambientadas con lo que la persona ha escrito en el chat y en los ejercicios de ese bloque y con su perfil. Corrección inmediata (las abiertas con rúbrica), revisión pregunta a pregunta con la respuesta modelo, y repetición con preguntas nuevas (máximo 5 por bloque y día). Nota orientativa para superarlo: 70/100.
- **Roleplay de control** cada 2 bloques (ajustable por curso y empresa en «Asignar pruebas»; 0 = desactivado): entrevista de 2-4 preguntas sobre su situación real (se salta si ya la conocemos), caso generado con el temario visto y esas respuestas, y cierre con fortalezas, áreas de mejora y valoración orientativa 0-10. Las respuestas de la entrevista se guardan como notas del alumno (el tutor las usa después).
- **Menú «Roleplays»** (`/app/roleplays.html`): generar un roleplay cuando quieras (de un curso o de un tema libre), con entrevista opcional, e historial con valoración, feedback y lo que contaste; los que quedaron a medias se pueden continuar.
- **Examen final** al terminar todos los tests de bloque: unas 24 preguntas nuevas de todo el curso (16 de opción múltiple de aplicación, 4 breves y 4 análisis de caso con rúbrica), dificultad alta, 60 minutos (se entrega solo al llegar a cero), **aprobado con 80/100** (constante única en `services/assessment.ts`), 3 intentos con 24 h de espera y preguntas distintas en cada intento; un examen abierto se reanuda, nunca se regenera.
- **Certificado** (`/app/certificado.html`): diseño propio de Brandooers en A4 apaisado (imprimir o guardar como PDF), con titular, curso, fecha, nota, código único y enlace público de verificación (`/verificar`, que ahora muestra titular, emisor y nota). Dice con claridad «Certificado interno de Brandooers. No constituye una acreditación oficial». Emisor y acreditación configurables (`CERT_ISSUER`, `CERT_ACCREDITATION`) para cuando haya un organismo externo.
- **Responsables asignan** (`/app/asignar.html`, menú «Asignar pruebas»): test de un bloque, un intento extra del examen final, un roleplay o un caso práctico (reutiliza los retos), con fecha y hora y un mensaje. La persona lo ve en su inicio (como «Programado» hasta la fecha), en recordatorios y por correo; si tiene Google Calendar conectado, se le crea el evento. El responsable ve el estado y el resultado (nota o resumen).
- **Puntos**: test de bloque 5-15 según la nota (solo suma la mejora sobre tu mejor intento), examen final aprobado 100, roleplay terminado 15 (con 3 o más intervenciones) y 5 por cada respuesta con contenido real en la entrevista (máximo 20); roleplays y entrevistas con tope de 60 puntos al día.
- El informe de ROI (nivel 2) cuenta también los tests de bloque y el examen final (`test_attempt`, ruta `curso:<curso>:b<n>|final`).
- Menú: «Roleplays», «Certificados» y, para responsables, «Asignar pruebas».

### Técnico
- Migración `0020_assessment`: tabla `assessment_attempt` (preguntas con su clave solo en servidor, respuestas, corrección, nota, tiempo) y columnas nuevas en `roleplay_session` (`source`, `topic`, `score`, `feedback`, `interview`). Idempotente.
- Endpoints: `GET /api/learning/assess/outline`, `POST /api/learning/assess/quiz`, `POST /api/learning/assess/final`, `POST /api/learning/assess/:id/submit`, `POST /api/roleplay/interview`, `POST /api/roleplay/checkpoint`, `GET/POST /api/config/assessment`, `GET /api/certificates/mine`, `GET /api/learning/challenges/assigned`; `POST /api/learning/challenges` admite `test_bloque`/`examen_final`, `programadoPara` y `mensaje`. Zod en todas, límites de peticiones en las que llaman a la IA, todo acotado por empresa.
- Toda la IA pasa por el `llm` central (tope de gasto, glosario, `orgId`/`userId`/`kind`: `block_quiz`, `final_exam`, `exam_grading`, `roleplay_interview`, `roleplay_brief`). `LlmCall.timeoutMs` para las generaciones largas del examen.
- RGPD: los intentos de evaluación entran en la exportación y se borran con el derecho al olvido (la nota numérica queda en `test_attempt`).
- Tests: `tests/assessment.test.ts` (nota y aprobado, intentos y espera, puntos y antitrampas, tope diario, programación, bloques del curso, llamadas a la IA).

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
- **Vídeos dentro del curso** (`curso.html`): el botón «Vídeos» ya no saca del curso; abre a la izquierda el panel «Vídeos del curso» con miniaturas (los mismos vídeos reales de YouTube de `videos.html`, misma caché por tema) y los del bloque que estás leyendo arriba con la marca «Este bloque». El vídeo se ve dentro del panel, se puede ampliar junto al texto (vista dividida) o a pantalla completa, y el texto conserva la posición de lectura. PC ≥1100 px: columna entre el texto y el chat; tableta y móvil: se desliza sobre el contenido. Recuerda si lo dejaste abierto (solo en PC), Esc cierra vídeo y panel.
- **Flechas y notas del mapa de la ruta editables** (`ruta.html`): seleccionar, mover, curvar con el punto central, borrar (botón o Supr) y deshacer (Ctrl+Z o botón, 60 pasos); las notas se editan con doble toque.
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

## 0.2.1 (2026-09-21) — fallos de la prueba funcional

cerrar sesión invalida de verdad la sesión (antes seguía viva); cambiar la contraseña cierra las sesiones abiertas; matrícula solo en rutas/competencias de la propia empresa; «Descargar mis datos» incluye notas, subrayados, preguntas y roleplays; «Terminar», «Formaciones», lección y onboarding ya no mandan al login antiguo y los enlaces entre cursos abren el visor; aceptar invitación entra por el inicio nuevo; correo de invitación con marca y enlace para copiar en el panel de empresa; registrarse de nuevo con el mismo email ya no crea una segunda empresa; errores de acceso en español; la cola de validación muestra nombres y no incluye el caso propio; rol legible en el perfil; borrar una nota ajena devuelve 404.

## 0.2.0 (2026-09-21) — endurecimiento pre-producción

estado de cuenta no manipulable por el usuario y cuentas desactivadas bloqueadas en toda la app; validación humana atómica (una decisión por caso: sin puntos ni certificados dobles); borrado RGPD acotado a la propia empresa y que incluye notas y roleplays; hilos de chat, roleplays, entregas y evidencias solo del propio alumno; filtro anti-SSRF en el análisis de la web de empresa; límite de peticiones en vídeos; timeouts en YouTube y correo; migración 0016 que recoge las tablas/columnas creadas a mano en producción; typecheck y tests en verde; despliegue reproducible (`deploy/`). Contraseñas: botón «Restablecer contraseña» en Consola > Usuarios y roles (envía el enlace por correo; si el correo no sale, el enlace aparece solo al superadmin para pasarlo en mano), correo de recuperación con marca y «He olvidado mi contraseña» del login con validación, estado «Enviando…» y sin dobles envíos.
