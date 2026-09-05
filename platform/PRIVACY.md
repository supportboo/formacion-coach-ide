# RGPD · SkillUp platform

Boomatik es **encargado del tratamiento** (RGPD art. 28) de los datos de empleados de la
empresa cliente, que es la **responsable del tratamiento**. Base legal: ejecución del contrato
de formación entre la empresa cliente y sus empleados (no consentimiento individual por
funcionalidad — el empleado no puede "no participar" en la formación de su puesto igual que no
puede "no participar" en el resto de procesos internos de RR. HH.).

## Qué datos personales trata la plataforma

Identidad (nombre, email — tablas de better-auth `user`/`account`/`session`) + registros de
aprendizaje acotados por `organizationId` (onboarding, inscripciones, niveles, casos prácticos
con texto libre, validaciones, coaching, puntos, certificados, participación FUNDAE, hilos de
chat con el asistente IA).

## Retención

- **Identidad + registros de aprendizaje con texto libre** (onboarding, redacción de casos,
  chat): mientras la persona sea miembro activo de la organización. Se borran al procesar una
  solicitud de derecho al olvido (ver abajo).
- **Participación FUNDAE** (`fundae_participation`, `fundae_action`): **4 años**, por obligación
  legal (Orden TMS/368/2019, ver `MODELO-BRANDOOERS.md` §8). No se borra aunque el empleado lo
  solicite (RGPD art. 17.3.b, obligación legal).
- **Certificados, niveles, puntos, coaching** (sin texto libre, solo IDs/números): se conservan
  como evidencia de la capacidad certificada y para las métricas de cobertura/ROI de la empresa,
  incluso tras el borrado de identidad — dejan de ser datos personales identificables una vez
  desvinculados del nombre/email (pseudonimización de facto).

## Derechos ejercitables (implementados)

| Derecho | Endpoint | Quién |
|---|---|---|
| Acceso / portabilidad (art. 15/20) | `GET /api/privacy/export` | Autoservicio — cualquier usuario exporta lo suyo |
| Al olvido (art. 17) | `POST /api/privacy/users/:userId/erase` | Admin/dirección de la empresa cliente (es quien recibe y gestiona la solicitud, como responsable del tratamiento) |

El borrado (`eraseUserData`, `src/services/privacy.ts`) elimina identidad (`user`, cascada a
`session`/`account`/`member`) y texto libre (chat, onboarding, redacción del caso), y conserva
sin texto libre lo exigido por ley u obligación de evidencia (ver tabla de retención). Verificado
end-to-end: el certificado emitido sigue siendo válido tras borrar al titular; el equipo deja de
listarlo.

## Pendiente (no es código, es proceso/contrato)

- DPA (Data Processing Agreement) firmado con cada empresa cliente antes de onboarding real.
- Registro de Actividades de Tratamiento (RGPD art. 30) formal más allá de este documento.
- Canal de contacto para que un empleado ejercite sus derechos directamente ante Boomatik si su
  empresa no responde (obligación subsidiaria del encargado).

## Datos de la Academia interna (`affiliate/server.mjs`, producto distinto — formación Odoo I+D+E)

Mismo criterio aplicado sobre los ficheros JSONL (`views.jsonl`, `progress.jsonl`, `exams.jsonl`,
`applied.jsonl`, `clicks.jsonl`, `inbox.jsonl`, `users.json`):

- `POST /api/admin/privacy/export {user}` — exporta todo lo asociado a un nombre de usuario.
- `POST /api/admin/privacy/erase {user}` — borra su cuenta y reescribe los JSONL sin sus filas.
- `POST /api/admin/privacy/erase-lead {email}` — borra un lead de `leads.jsonl` por email
  (prospectos de partners/clientes, base legal: interés legítimo + derecho de oposición).
