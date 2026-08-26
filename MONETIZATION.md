# Brandooers · Monetización (afiliación de recursos + modelos de negocio)

> Basado en investigación de mercado verificada (2025-2026). Regla de oro: **nuestro activo es la
> credibilidad del contenido verificado.** Todo modelo que la refuerce va primero; lo que la comprometa,
> fuera. Nada de esto es asesoramiento legal: validar afiliación/RGPD con abogado antes de activar dinero real.

---

## A. Afiliación de recursos (recomendar y monetizar el origen del autor)

### Realidad (lo que se puede y lo que no)
- **Descubrir si un dominio tiene programa: SÍ se automatiza.** El «apply/join» a cada programa: **NO** —
  es manual en las 7 redes (ninguna tiene endpoint de alta), con aceptación de T&C, KYC/fiscal y aprobación humana.
- **Auto-monetizadores reales (solo 3):** Skimlinks, Sovrn Commerce y Yieldkit. Un snippet JS convierte
  cualquier enlace saliente en afiliado a 45.000-50.000 comercios **sin aplicar a cada uno** (se quedan ~25%).
- **Amazon:** PA-API 5.0 descatalogada → **Creators API**; regla de **3 ventas en 180 días** para mantener la
  cuenta; libros ~5-7% en ES (¡ojo: **instituciones educativas 0%** en libros!). Carril propio.
- **Legal/ToS:** usar APIs oficiales para descubrir, deep-linkear y reportar es legítimo. **Auto-aplicar con
  bots viola ToS** (baneo). Amazon prohíbe scrapers. Afiliado debe **divulgarse** (transparencia FTC/UE).

### Stack recomendado (3 capas)
1. **Red de seguridad universal:** un auto-monetizador (Skimlinks/Sovrn/Yieldkit) monetiza el long tail al
   instante, sin trámites. Cubre casi todo lo que recomendamos.
2. **Alto valor directo:** aplicar a mano a los programas que más rinden (Amazon, editoriales, plataformas de
   cursos, SaaS) vía redes (Awin/CJ/Impact/PartnerStack) — mejor comisión que el agregador.
3. **Amazon aparte**, con su semáforo de salud (3 ventas/180 días, Creators API).

### Panel de oportunidades de afiliación
Una fila por (dominio recomendado × oportunidad). Estados:
`SIN_PROGRAMA` → `DISPONIBLE` → `SOLICITADA` → `EN_CURSO` → `MONETIZANDO` (+ `AUTO_MONETIZADO`, `RECHAZADA`).

Pipeline (marcado auto vs manual):
- **[AUTO] Descubrimiento** — crawler heurístico sobre los dominios que recomendamos: rutas `/affiliates`
  `/partners` `/creators`, firmas de script (Impact, PartnerStack, Refersion, Tapfiliate…), params `?ref=`.
- **[AUTO] Confirmación** — API de directorio de la red detectada (CJ/Awin/Rakuten/PartnerStack `notjoined`).
- **[AUTO] Red de seguridad** — el auto-monetizador cubre lo que no hayamos aplicado. → `AUTO_MONETIZADO`.
- **[MANUAL] Solicitud** — cola de «aplicar» con datos pre-rellenados por el sistema; un humano pulsa apply + T&C.
- **[MANUAL] KYC/fiscal** — alta única por red (una vez, no por programa): datos fiscales, banco.
- **[AUTO] Seguimiento** — poll de estado + reporting de ingresos por API.
- **[AUTO] Inserción del tag** — deep link con nuestro tag en el contenido, en cuanto esté `MONETIZANDO`.
- **Priorización:** la cola manual se ordena por **valor esperado** (tráfico saliente al dominio × comisión).

Encaja con lo ya construido: `resources.js` + `data-res` + el redirector `/r/:id` del backend (VPS).

---

## B. YouTube (tu pregunta directa)

- **Sí** puedes crear listas de reproducción con vídeos públicos de otros y embeberlas (curación permitida).
- **Pero NO puedes monetizar vídeos de otros.** Los ingresos de anuncios de YouTube van a **quien sube el
  vídeo**, no al que hace la lista. Solo se monetiza **tu propio contenido subido** (YouTube Partner Program).
  Re-subir vídeos ajenos = strikes de copyright.
- **Lo que sí funciona:** (1) embeber los vídeos oficiales de los autores en nuestros cursos (ya lo hacemos) →
  suma visitas al creador (goodwill + base para afiliación); (2) tener **nuestro propio canal** con contenido
  original (píldoras, previews) → monetizable por YPP + tráfico a la plataforma. La lista de terceros es útil
  para organizar/descubrir, no como fuente de ingresos.

---

## C. Modelos de monetización adicionales (más allá de la venta a empresa)

Prioridad por encaje con «verificado, sin inventar» + margen + riesgo:

**Primera ola (ya — bajo riesgo, no cambia el producto):**
1. **Enterprise upsells por tiers.** Asiento base + (analítica avanzada / SSO-SCIM / API / compliance /
   integraciones) en tiers superiores. Margen casi puro (el SSO cuesta ~0,015 $/usuario/mes). Ético: no
   encerrar el SSO básico; cobrar por escala y gobernanza.
2. **Certificados verificados de pago.** Es nuestra propuesta hecha producto: la verificación *es* lo que
   vendemos. Open Badges 3.0 vía Credly/Accredible. Referencia 49-300 $/certificado.

**Segunda ola (6-12 meses — más margen, requiere madurez):**
3. **White-label / API del motor de IA.** Vender el motor (genera cursos personalizados verificados) a otras
   plataformas L&D/empresas. Márgenes SaaS ~81% (Docebo). El mercado lo paga carísimo (**Workday compró Sana
   por 1.100 M$**). Sin perder control del contenido.
4. **Cohortes en directo + mentoría premium.** La IA hace el curso base; el humano añade la accountability que
   la IA no da. Complemento premium, no compite con el núcleo.

**Tercera ola / validar antes:**
5. **Precio por resultado** — solo atado a *competencia demostrada*, **nunca a % del sueldo** del alumno (eso
   es un ISA, riesgo CFPB/crédito — BloomTech acabó baneada).
6. **Bolsa de empleo** con talento certificado — viable **solo con consentimiento RGPD explícito** del alumno,
   jamás reventa de datos (LinkedIn fue multada con 310 M€ por base legal inválida).

**No recomendados (rompen el activo):**
- **Patrocinios / contenido patrocinado:** choque frontal con la imparcialidad → destruye la credibilidad.
- **Marketplace abierto de terceros:** pierdes el control editorial verificado. Si acaso, curación con sello propio.
- **Venta directa de datos de aprendizaje:** alto riesgo RGPD; nadie grande lo hace. Úsalo como marketing (informe gratuito), no como ingreso.

---

## Fuentes (verificadas)

**Afiliación:** Skimlinks (skimlinks.com, Refersion FAQ) · Sovrn Commerce (sovrn.com/commerce, developer.sovrn.com) · Yieldkit (yieldkit.com) · Awin/ShareASale merge (awin.com) · CJ/Awin/Rakuten/Impact/PartnerStack/FlexOffers API docs · Amazon PA-API deprecation + Creators API + Associates 3-sales rule (affiliate-program.amazon.com) · Amazon.es comisiones (afiliados.amazon.es).
**Modelos de negocio:** Coursera FY2024 (SEC 10-K) · Duolingo FY2024 (SEC 10-K) · Udemy FY2024 (SEC 10-K, 8-K instructor share) · Docebo FY2024 (SEC 40-F) · Workday↔Sana (educate-me) · sso.tax / ssotax.org · CFPB vs BloomTech (consumerfinance.gov) · LinkedIn 310M€ (IAPP) · GDPR Recital 26 (gdpr-info.eu) · FTC Endorsement Guides 2023 · Ley 34/1988 (BOE) · Maven/Reforge · Speak Serie C · a16z outcome-based pricing.
