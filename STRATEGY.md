# Brandooers · Estrategia de negocio, costes y engagement

> Basado en investigación de mercado verificada (2025-2026). Cada cifra lleva fuente al final.
> Lo estimado va marcado. Objetivo: ser disruptivos en modelo educativo, personalización y precio.

---

## 0. La tesis, en una frase

Generar contenido con IA ya es **commodity** (hay generadores desde 30 $/mes). El foso está en otra parte:
**(1) nuestro coste de contenido es casi cero y 100% nuestro** (no pagamos a creadores) → podemos ser
**baratos y muy rentables a la vez**; **(2) personalización real por alumno**; y **(3) que la formación
se TERMINE y se APLIQUE** — que es justo donde todos fracasan. Vendemos eso a la **pyme española** que los
enterprise (precio oculto, mínimos de 300 asientos) ignoran.

---

## 1. El mercado (datos verificados)

**Precios de referencia** (aprox., verificar; fuentes abajo):

| Plataforma | Individual | Empresa (asiento/año) | Coste de contenido |
|---|---|---|---|
| Udemy | ~10-20 $ curso | Team 360 $ · Enterprise ~240-600 $ | Paga 37% al instructor |
| Coursera | Plus 399 $/año | Teams 399 $ · Enterprise ~300-500 $ | «Content costs» a universidades |
| LinkedIn Learning | 239,88 $/año (Premium) | Teams 379,88 $ | Contenido propio + licencias |
| Duolingo | Super ~84-96 $/año · Max (IA) ~168 $ | — | Contenido propio |
| Generadores IA | Coursebox 30 $/mes, Disco 399 $, LearnWorlds 29 $ | — | IA (genéricos) |

**Márgenes (auditados, alta certeza):** Udemy **63%**, Coursera **55%** (Consumer 54% / Enterprise 69% /
Degrees 100%). Regla del sector: **quien depende de creadores/royalties tiene margen bajo y comprimible;
quien tiene contenido propio o modelo sin coste de contenido tiene margen alto.**

**Cuánto gasta la empresa:** ~**874 $/empleado/año** en formación (Training Report 2025, EE. UU.). Mercado
e-learning corporativo: **104 mil M$ (2024) → 335 mil M$ (2030), CAGR 21,7%** (Grand View).

**El hueco:** los competidores de IA/enterprise (Sana —comprada por Workday por ~1.100 M$—, Docebo,
360Learning, Uplimit, Multiperse) son **precio oculto con mínimos altos** (Sana pide 300 licencias). La
**pyme española de 10-200 empleados**, con precio transparente, self-service y **castellano peninsular
nativo**, no la sirve nadie bien. Ahí entramos.

**Dos verdades incómodas del mercado (a nuestro favor):**
1. **«IA sin humanos» es marketing, no realidad.** Hasta Uplimit dice «la IA NO reemplaza al instructor».
   El estado del arte es *IA genera el 80-95% + revisión humana + tutor IA*. «AI slop» fue palabra del año
   2025 y la GenAI entró en el «Trough of Disillusionment» de Gartner. → Nuestro **«IA genera, Marc valida»
   es lo honesto y lo que el mercado premia.** Coincide con nuestra doctrina anti-invención.
2. **Los cursos casi no se terminan.** Finalización mediana de MOOCs **12,6%** (Katy Jordan); en HarvardX/MITx
   **solo el 5% se certifica** y el **52% nunca empieza**. Uplimit presume **75-94% vs 3-6%** con cohortes +
   IA. → **El diferenciador no es generar contenido, es la finalización.**

---

## 2. Nuestro foso (por qué somos disruptivos)

- **Coste de contenido casi cero y propio.** Un curso personalizado nos cuesta unos **€ de cómputo** (ver §3),
  no un 37-45% de royalties para siempre. Los demás no pueden bajar precio sin romper a sus creadores; nosotros sí.
- **Personalización real** al negocio y sector del alumno (no un vídeo igual para todos). Nadie lo hace bien
  para la pyme en castellano.
- **Foco en finalización y aplicación**, el verdadero problema del sector.
- **Honestos**: IA genera, experto valida. El mercado castiga lo contrario.

---

## 3. Modelo de coste y control (lo que pediste)

**Coste de generar un curso (estimación, verificar con precios de API vigentes):** una tanda del pipeline
(research + curación + verificación + construcción + calidad + legal) mueve del orden de ~120k tokens de
entrada y ~90k de salida repartidos entre Sonnet y Opus → **≈ 3-5 $ por curso vía API**. **En modo actual
(Claude Code, pre-venta): coste marginal ≈ 0 €.** Comparado con pagar royalties a un creador para siempre,
es una ventaja estructural enorme.

**Registro de uso (a montar con la base de datos del VPS):**
- Por **curso**: palabras/contenidos generados, tokens in/out, modelo, coste estimado, tiempo.
- Por **empresa**: plan, cuota de contenidos/asientos, consumido, excedente (overage), coste real vs precio.
- Por **petición**: tema, alumno, fecha, estado (cola/creado/publicado).
Con esto sabemos el **coste real por curso y por empresa** y fijamos tramos con rentabilidad conocida.
(Base ya preparada: `boo_requests`, `resources.js`, pipeline con modelos definidos.)

---

## 4. Modelo de negocio y precios (propuesta a validar)

**B2B primero** — es donde está el dinero, el margen y, gratis, la **responsabilidad social del equipo**
(un manager que asigna y revisa progreso es tu «coste hundido» que sube la finalización).
- **Por cuota de contenidos personalizados** o por asiento, **por debajo de LinkedIn/Coursera Teams**
  (~380-400 $) pero con margen altísimo (coste ~€/curso). Ejemplos de tramos (a afinar con datos de coste real):
  - *Equipo* — €/mes por hasta N asientos + M cursos personalizados/mes.
  - *Empresa* — €/asiento/año con biblioteca + rutas + panel de progreso + certificados.
- **Ancla de venta:** «ya gastáis ~800 $/empleado/año en formación que no se termina; nosotros, personalizado
  y que sí se aplica, por una fracción». ROI: Bersin cita 40-60% de ahorro con IA.

**B2C después** — suscripción **barata** (referencia Coursera Plus 399 $/año o Duolingo Super ~90 $) pero
**100% personalizada**, algo que ellos no tienen. Freemium: **primer curso gratis** → suscripción. La
personalización es el premium (como Duolingo Max monetiza la IA).

**Certificados:** emitir **Open Badges 3.0** vía Credly/Accredible/Certifier (estándar, no inventar formato),
con URL de verificación pública y la LinkedIn Page de Brandooers (para que salga nuestro logo). Doble función:
credencial para el alumno + **marketing orgánico gratis** (cada certificado compartido nos da alcance, como
hace Google con sus certificados en Coursera). Aviso: LinkedIn quitó el auto-fill en 2024; diseñar el flujo
con eso en cuenta.

---

## 5. El bucle de enganche (por EVIDENCIA, no por intuición)

Orden de prioridad según fuerza de la evidencia (investigación verificada):
1. **Microlearning** — meta-análisis 2025: mejor retención y aprendizaje. Módulos cortos y aplicables (ya lo hacemos).
2. **Responsabilidad social / equipo** — en B2B viene gratis: compañeros + manager que revisa. Lo que más retiene.
3. **Rachas con «streak freeze»** — Duolingo: +21% de retención, −40% de churn en los mejores. Aversión a la pérdida.
4. **Ranking / ligas por equipo** — Duolingo: +17% de tiempo de aprendizaje.
5. **Push con sentido** (recordatorios útiles) y **activación temprana** (engancharle tras la 1ª lección: +20% D1).
6. **Badges y certificados** — **refuerzo secundario**: solos tienen evidencia débil (un RCT limpio dio efecto
   nulo). Funcionan **encadenados** a lo anterior y como marketing (LinkedIn). No son la columna vertebral.
7. **Referidos/ranking** — el bucle «me formo → aplico → invito → mi red se forma → subimos juntos».

> Corrección importante frente a la intuición: **los badges no enganchan por sí solos.** Lo que engancha es
> no querer perder la racha, no fallar al equipo, y ver el progreso. Los badges/certificados son la guinda
> (y el marketing), no el motor.

---

## 6. Posicionamiento y narrativa de venta

- **Promesa:** «Formación que se termina y se aplica, personalizada a tu negocio, sin inventar nada.»
- **Ataca dolores reales (con dato):** obsolescencia de skills (WEF: 39% de las core skills cambian para 2030;
  85% de empresas priorizará upskilling), el gap «80% valora la IA pero solo 25% la usa» (LinkedIn), y el
  ahorro 40-60% (Bersin).
- **Honesto:** IA genera, experto valida. Diferénciate del «AI slop».

---

## 7. Riesgos y avisos de honestidad (doctrina)

- **No prometer «sin humanos»** ni resultados garantizados. IA genera + validación humana (Marc).
- **No usar cifras no trazables** cara a cliente (el «44% de hiring managers» y los multiplicadores de LinkedIn
  no tienen fuente primaria; los precios enterprise de la competencia son estimaciones de terceros).
- **Verificar** el flujo de «Add to Profile» de LinkedIn (auto-fill deprecado 2024) antes de lanzar certificados.
- **Precio de API** para el coste por curso: recalcular con tarifas vigentes antes de fijar tramos.

---

## FUENTES (verificadas)

**Precios y márgenes:** Udemy Business (Vendr, TrainingCost) · Udemy 10-K (SEC) · Coursera Q4/FY2024 (investor.coursera.com, SEC) · LinkedIn Learning (UC Strategies, TrainingCost) · Duolingo (DealNews, SEC Q4FY24) · Training Report 2025 (trainingmag.com) · Grand View corporate e-learning market.
**Competidores IA:** Sana (educate-me, sanalabs.com) · Khanmigo (khanmigo.ai/pricing) · Coursera Coach (blog.coursera.org) · Uplimit (venturebeat, uplimit.com) · Docebo/360Learning (educate-me, elearningindustry) · Coursebox/Disco (webs oficiales) · MIT Tech Review «AI hype correction 2025».
**Engagement/retención:** Duolingo (Lenny's Newsletter ex-CPO, SEC) · Katy Jordan 2015 (ERIC) · Chuang & Ho HarvardX/MITx (SSRN) · Reich & Ruipérez-Valiente Science 2019 (Open Praxis) · Harvard Gazette (59% vs 5%) · meta-análisis microlearning 2025 (ResearchGate) · RCT badges (BMJ Open, PMC7137948) · Ruzuku «Completion Gap».
**Certificados/LinkedIn:** LinkedIn Help (Licencias y certificaciones; Add to Profile FAQs 2024) · 1EdTech Open Badges 3.0 · Credly Support · Accredible 2025 State of Credentialing · Pearson/Credly 100M · Coursera 2025 Learner Outcomes.
**Tendencia:** WEF Future of Jobs 2025 · LinkedIn Work Change / Workplace Learning 2025 · Josh Bersin «AI transforms $400B» 2026 · Gartner Top Predictions 2026 · McKinsey Superagency 2025 · PwC AI Jobs Barometer 2025 · BCG AI at Work 2025 · Deloitte Human Capital Trends 2025.
