# SkillUp y el Reglamento Europeo de IA (Reglamento (UE) 2024/1689)

Postura del producto decidida el 29-09-2026. **No es asesoramiento jurídico**: es el diseño con el que SkillUp reduce el riesgo, y lo que un abogado especialista tiene que revisar.

## Fechas (fuente oficial: [AI Act Service Desk, Comisión Europea](https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act), consultada el 29-09-2026)

- Obligaciones de alto riesgo del anexo III (educación y empleo, entre otras): **2 de diciembre de 2027**, tras el acuerdo «AI Omnibus».
- Transparencia (art. 50: avisar de que se habla con una IA) y alfabetización en IA (art. 4): ya se aplican a quien usa la IA.

## Por qué nos afecta

El anexo III considera de alto riesgo la IA que **evalúa resultados de aprendizaje o decide el acceso a un nivel formativo** (punto 3) y la que **vigila o evalúa a trabajadores** o se usa para decisiones de empleo (punto 4). SkillUp se usa en empresas, con sus empleados. Por eso el diseño es: **la IA ayuda y personaliza; las decisiones sobre personas las toma una persona o una regla fija y comprobable.**

## Cómo está diseñado hoy

| Riesgo | Cómo lo evita SkillUp |
|---|---|
| La IA acredita a alguien | Los niveles se acreditan solo con un caso real validado por una persona con rúbrica. Tests y examen final se corrigen con la respuesta correcta guardada, no con IA. El nivel de la micropráctica es «observado» y no acredita. |
| La IA evalúa a un trabajador | El resumen con IA de una persona habla solo de su aprendizaje en la plataforma y tiene prohibido valorar su rendimiento en el trabajo o su personalidad, o sugerir decisiones de empleo. Las señales de atasco son reglas fijas (tiempo, suspensos, días sin entrar), no IA. |
| Vigilancia de empleados | «En directo» avisa a la persona con el nombre de quien la sigue; nada de pantalla, teclado ni cámara; actividad borrada a los 90 días. La conversación con el tutor es privada: el responsable solo la ve desde que escribe en ella con su nombre. |
| Análisis de formaciones reales (1.22.0) | Lo inicia la propia persona sobre sesiones en las que ella formó; solo se la evalúa a ella, con frases literales como prueba; el resto de asistentes se anonimiza y la transcripción no se guarda; el resultado es privado (su responsable no lo ve). Debe confirmar que los asistentes sabían que se grababa. |
| Perfil psicológico usado contra alguien | El Team DNA solo decide tono, ritmo y formato; se presenta como autoconocimiento, no como diagnóstico, y nunca se usa para evaluar. |
| No saber que se habla con una IA | Los tutores se presentan como tutores de IA; los mensajes humanos llevan el nombre y el rol de la persona. |
| Datos personales | Ficha viva visible y corregible por la persona; exportación completa y borrado a petición (1.17.0). |

## Lo que queda por hacer

1. **Revisión por un abogado especialista en IA y protección de datos antes del primer cliente de pago externo**, y en todo caso antes del 2 de diciembre de 2027. Preguntas concretas:
   - ¿El test por bloque y el examen final (preguntas generadas por IA, corrección fija) cuentan como «IA que evalúa resultados de aprendizaje»?
   - ¿El resumen con IA de una persona para su responsable entra en el punto 4 del anexo III aunque se limite al aprendizaje?
   - ¿Quién es «proveedor» y quién «responsable del despliegue» entre Brandooers y la empresa cliente, y qué debe decir el contrato?
   - ¿Hace falta evaluación de impacto (RGPD art. 35) para «En directo» y el Team DNA en cada cliente?
2. Si la respuesta a alguna de las dos primeras es «sí»: o se cambia el diseño para quedar fuera, o se prepara la documentación de alto riesgo (gestión de riesgos, registro de eventos, supervisión humana, instrucciones de uso).
