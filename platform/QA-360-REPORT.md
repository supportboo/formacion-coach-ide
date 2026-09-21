# SkillUp — Prueba 360 con 50 consumidores (pre-v1.0)

**Fecha:** 2026-09-21 · **Rama:** `feat/prod-readiness-audit` · **Entorno:** staging aislado en el VPS (BD `skillup_staging`, IA real de Anthropic, sin voz/YouTube/Stripe/correo), reproduciendo el enrutado real. **Nada de esto tocó producción ni su base de datos.**

Motor: BOO Consumers (50 perfiles sintéticos: 45 usuarios reales repartidos en 6 empresas + 5 hackers), peticiones HTTP reales, una sesión y una IP por consumidor.

## Resumen ejecutivo

- **45/45** consumidores se registraron, hicieron onboarding y recorrieron su flujo por rol. **6 roles** ejercitados (admin, dirección, team leader, inspirador, coach, empleado) en **6 empresas** de sectores distintos; 2 empresas con catálogo completo (mismo contenido, para comparar).
- **Seguridad (hackers): 30/30 intentos bloqueados, 0 vulnerabilidades** tras los arreglos. Sin fuga de datos entre empresas, sin robo de credenciales, sin escalada de rol, SSRF cerrado.
- **Núcleo de validación humana: intacto.** Nadie se autovalida, un no-referente no puede firmar, el referente sube al alumno a Nivel 2, y la doble aprobación queda bloqueada (arreglo atómico verificado en vivo).
- **Personalización: funciona por sector y puesto** (el examen y la ruta cambian entre comercial y técnico; el tutor da consejo del sector). Con dos gaps corregidos/anotados abajo.

Todo lo marcado **[ARREGLADO]** ya está desplegado en producción esta sesión.

## Lo que se probó (flujo 360)

| Área | Resultado |
|------|-----------|
| Registro / login / logout / sesión persistente | 45/45 OK |
| Onboarding (sector, puesto, objetivo, estilo) | 45/45 OK |
| Invitaciones (invitar → aceptar) | 39/39 OK, correo con enlace + enlace para copiar |
| Aprobación de altas por superadmin | 6/6 OK |
| Alta de catálogo (sectores/puestos/competencias/rutas/rúbricas) | OK (empresas A y B) |
| Auto-inscripción por perfil | 33/33 al matchear puesto |
| Solicitud de curso / crear ruta (IA) | OK, ruta real adaptada al perfil |
| Test de conocimiento (IA) → Nivel 1 | OK tras arreglo de fiabilidad |
| Notas / subrayados / preguntas / borrado | 45/45 OK |
| Validación humana caso → Nivel 2 | OK, todos los candados aguantan |
| Puntos / ranking / carrera / recordatorios | OK (ranking se puebla con relaciones de coaching reales) |
| Gestión de perfil y roles (superadmin) | OK |
| Config de empresa / privacidad (export, borrado) | OK |
| Aislamiento entre empresas (lectura y escritura) | Sin fugas |

## Hallazgos y arreglos

### Seguridad (todos [ARREGLADO] y verificados 30/30)
- **[ARREGLADO] Config de empresa legible por cualquier empleado.** `GET /api/config/company` exponía el flag «puntos ligados a salario» y las etiquetas de nivel a todo el mundo. Ahora solo gestores.
- **[ARREGLADO] Creación de caso con ids de otra empresa.** `POST /api/validation/cases` no comprobaba que la competencia fuera de la propia empresa ni que el usuario asignado fuera miembro. Cerrado.
- **[ARREGLADO — sesión previa] IP de rate-limit falsificable.** El límite de intentos de login se tomaba de una cabecera que el cliente podía falsear; ahora se toma de la IP real de nginx (probado: al 4º intento con la misma IP → 429).
- **Verificado sólido (sin cambios):** endpoints `/api/platform/*` cerrados a no-superadmin; reset de contraseña de terceros bloqueado; escalada de rol bloqueada; borrado RGPD entre empresas bloqueado; SSRF del escrapeo de empresa bloqueado a 127.0.0.1/metadatos/Postgres; fuente reservada `cuenta` no inyectable; XSS de notas se guarda pero se escapa al pintar.

### Fiabilidad
- **[ARREGLADO] El test de conocimiento fallaba de forma intermitente (~50% en la muestra).** La respuesta de la IA se truncaba a 1.200 tokens y el JSON quedaba a medias → error 400 feo al alumno. Ahora: más tokens y un lector de JSON que quita las vallas markdown, rescata respuestas truncadas y descarta preguntas incompletas. Con test unitario nuevo.

### Personalización (respuesta directa a la pregunta del test psicológico)
- **No hay un test psicométrico que decida la experiencia, y es correcto que no lo haya:** el propio código rechaza a propósito los tests de personalidad tipo MBTI/DISC («eso es pseudociencia»). La personalización real es **sector + puesto** (+ motivo para el caso), y **sí funciona**: probado con la misma competencia en dos empresas y con dos puestos distintos, el examen y la ruta cambian el enfoque (comercial vs técnico), y el tutor habla del sector.
- **[ARREGLADO] El tutor abría casi siempre con «no tengo información sobre tu ruta».** Primera impresión fría y repetida. Ahora recibe los módulos de su ruta y su nivel, y no empieza disculpándose (verificado: ahora referencia la ruta del alumno).
- **[PENDIENTE v1.0] «¿Cómo aprendes mejor?» se pregunta pero no cambia lo que ve el alumno.** Se guarda y solo alimenta la vista de equipo del admin. O se usa (p. ej. el tutor sugiere vídeo a quien es visual) o se quita la pregunta para no prometer algo que no pasa.
- **[PENDIENTE v1.0] `test-adn.html`** (test de personalidad con arquetipos) está suelto en la raíz, no conectado a nada y contradice la doctrina anti-pseudociencia. Quitar o marcar como juego opcional no vinculante.
- **[PENDIENTE v1.0] Auto-inscripción frágil.** El puesto es texto libre y se compara por coincidencia de texto con el catálogo; si el gerente escribe «técnico de taller» y el catálogo dice «técnico», puede no matchear. Mejorar el emparejamiento o dejar que el admin mapee puesto→ruta.

### Pendientes de producto (del repaso funcional previo, no bloquean el uso)
- «Mi ruta» pinta el catálogo fijo en vez de la ruta generada.
- Un reto de tipo «caso» no entra en la cola de validación.
- Falta subir el vídeo de la Píldora 1.
- Conviven el login antiguo y el nuevo.
- Faltan pantallas de edición para rúbricas, ajustes de empresa y FUNDAE (hoy solo por API).
- Copias de la base de datos: se guardan en el propio servidor; falta una copia fuera.

## Cómo reproducir
Scripts en `~/.claude/jobs/.../boo360/`: `harness.py` (perfiles + cliente), `run.py` (empresas+catálogo+miembros), `phase2.py` (journeys), `hacker.py` (ataques), `phase4_perso.py` (personalización), `phase5_validation.py` (validación). Levantar staging: `staging_setup.sh` en el VPS (BD propia, IA real, resto apagado) + túnel SSH al `:8081`.

## Veredicto
Apto para que el equipo empiece a probar la v1.0: los flujos de los 6 perfiles funcionan de punta a punta, la seguridad aguanta los ataques y el núcleo (validación humana) es sólido. Los pendientes de arriba son mejoras de experiencia y contenido, no fallos que rompan el uso.
