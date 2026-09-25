// Datos de DEMO para la empresa "Demo SkillUp": rellenan los paneles (alumno, responsable,
// superadmin) con contenido realista para enseñar la plataforma a un validador.
// TODO lo sembrado lleva id con prefijo "demo:" -> el script es idempotente: borra y reinserta.
// NO toca cuentas reales (uuid) salvo para colgarles progreso de demo (filas con id "demo:").
// Uso (en el servidor): npx tsx scripts/seed-demo-data.ts
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { organization, user, member, competency, learningPath, lesson, enrollment,
  levelByCompetency, testAttempt, appliedCase, validation, evidence, coaching, pointsLedger,
  roleplaySession, agentThread, agentMessage, onboardingProfile, teamDna, annotation, companyConfig,
  ragDocument,
} from "../src/db/schema.js";
import { currentSeason } from "../src/services/propagation.js";

const ORG_NAME = "Demo SkillUp";
const SEASON = currentSeason();
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5);

const [org] = await db.select().from(organization).where(eq(organization.name, ORG_NAME));
if (!org) { console.error("No existe la org 'Demo SkillUp'. Ejecuta antes seed-demo-accounts.ts"); process.exit(1); }
const orgId = org.id;

// Cuentas reales de demo (para colgarles progreso y que su panel personal tenga contenido)
const [alumno] = await db.select().from(user).where(eq(user.email, "alumno.demo@brandooers.com"));
const [empleado] = await db.select().from(user).where(eq(user.email, "empleado.demo@brandooers.com"));
const [adminU] = await db.select().from(user).where(eq(user.email, "admin.demo@brandooers.com"));
const [resp] = await db.select().from(user).where(eq(user.email, "responsable.demo@brandooers.com"));
const validatorId = resp?.id ?? "demo:user:1";

// ---- 1) Limpieza idempotente (hijos -> padres, respeta FKs) ----
const clean = async (t: any) => db.delete(t).where(and(eq(t.organizationId, orgId), like(t.id, "demo:%")));
for (const t of [annotation, teamDna, agentMessage, agentThread, evidence, validation, appliedCase,
  testAttempt, enrollment, levelByCompetency, coaching, pointsLedger, roleplaySession,
  onboardingProfile, ragDocument, lesson, learningPath, competency]) await clean(t);
await db.delete(member).where(and(eq(member.organizationId, orgId), like(member.id, "demo:%")));
await db.delete(user).where(like(user.id, "demo:user:%"));

// ---- 2) Competencias (2 críticas) + ruta + lección publicada por cada una ----
const COMPS = [
  { id: "demo:comp:1", name: "Atención al cliente al teléfono", critical: true },
  { id: "demo:comp:2", name: "Cierre de ventas", critical: true },
  { id: "demo:comp:3", name: "Uso del CRM (Odoo)", critical: false },
  { id: "demo:comp:4", name: "Gestión de incidencias", critical: false },
];
for (const c of COMPS) {
  await db.insert(competency).values({ id: c.id, organizationId: orgId, name: c.name, critical: c.critical });
  const pathId = c.id.replace("comp", "path");
  await db.insert(learningPath).values({ id: pathId, organizationId: orgId, competencyId: c.id, title: `Ruta · ${c.name}` });
  await db.insert(lesson).values({ id: c.id.replace("comp", "lesson"), organizationId: orgId, pathId,
    title: `Fundamentos de ${c.name}`, body: `Lección de demo: cómo aplicar ${c.name} en tu día a día, paso a paso, con un ejercicio real al final.`,
    fuente: "Contenido de demostración", fechaRevision: now, published: true });
}
const pathOf = (ci: number) => `demo:path:${ci + 1}`;
const compOf = (ci: number) => `demo:comp:${ci + 1}`;

// ---- 3) Alumnos de demo (6) + el alumno real -> 7 aprendices ----
const NAMES = ["Ana Ruiz", "Luis Prado", "Marta Gil", "Iván Soto", "Nerea Vidal", "Hugo León"];
const learners: { id: string; name: string; puesto: string; sector: string }[] = [];
const PUESTOS = ["Comercial", "Atención al cliente", "Ventas", "Soporte", "Comercial", "Atención al cliente"];
for (let i = 0; i < NAMES.length; i++) {
  const id = `demo:user:${i + 1}`;
  await db.insert(user).values({ id, name: `${NAMES[i]} (demo)`, email: `demo${i + 1}@demo.skillup.local`, emailVerified: true });
  await db.insert(member).values({ id: `demo:member:${i + 1}`, organizationId: orgId, userId: id, role: "member", orgRole: "empleado" });
  learners.push({ id, name: NAMES[i], puesto: PUESTOS[i], sector: "Comercio y servicios" });
}
// Cuentas reales con login, como aprendices con datos (orden = filas 6,7,8 de LEVELS).
if (empleado) learners.push({ id: empleado.id, name: "Empleado Demo", puesto: "Comercial", sector: "Comercio y servicios" });
if (adminU) learners.push({ id: adminU.id, name: "Admin Demo", puesto: "Responsable de tienda", sector: "Comercio y servicios" });
if (alumno) learners.push({ id: alumno.id, name: "Alumno Demo", puesto: "Comercial", sector: "Comercio y servicios" });

// onboarding (da contexto real a los agentes)
let n = 0;
for (const l of learners)
  await db.insert(onboardingProfile).values({ id: `demo:onb:${++n}`, organizationId: orgId, userId: l.id,
    sector: l.sector, puesto: l.puesto, motivo: "Ser más autónomo y aplicar lo aprendido esta misma semana." });

// ---- 4) Nivel por competencia (repartido; C2 crítica con un solo referente = riesgo) ----
// filas = aprendices (mismo orden que learners), columnas = comps C1..C4. Nivel 0-4.
// Marta (fila 2) es la ÚNICA con nivel>=3 en C2 -> riesgo de dependencia. Empleado Demo es top
// por amplitud (Custodio en C1 y C3, Referente en C4) pero NO referente en C2, para no romper el riesgo.
const LEVELS: number[][] = [
  [2, 2, 3, 1], // Ana
  [3, 1, 2, 2], // Luis
  [2, 4, 2, 1], // Marta  (única referente en C2 crítica)
  [1, 1, 3, 2], // Iván
  [3, 2, 2, 3], // Nerea
  [2, 1, 4, 1], // Hugo
  [4, 2, 4, 3], // Empleado Demo (login: top del ranking)
  [2, 1, 2, 2], // Admin Demo
  [1, 0, 1, 0], // Alumno Demo (en formación)
];
let lv = 0;
for (let li = 0; li < learners.length; li++)
  for (let ci = 0; ci < COMPS.length; ci++) {
    const level = LEVELS[li]?.[ci] ?? 0;
    await db.insert(levelByCompetency).values({ id: `demo:lvl:${++lv}`, organizationId: orgId,
      userId: learners[li].id, competencyId: compOf(ci), level, updatedAt: daysAgo(30 - li) })
      .onConflictDoUpdate({ target: [levelByCompetency.organizationId, levelByCompetency.userId, levelByCompetency.competencyId],
        set: { level, updatedAt: daysAgo(30 - li) } });
  }

// ---- 5) Matrículas, tests, casos+validación+evidencia, roleplay, puntos, preguntas al chat ----
let e = 0, t = 0, ca = 0, va = 0, ev = 0, rp = 0, pt = 0, th = 0, ms = 0;
const buenasPracticasCaseIds: string[] = [];
for (let li = 0; li < learners.length; li++) {
  const l = learners[li];
  const lv1 = LEVELS[li]?.[0] ?? 0, lv3 = LEVELS[li]?.[2] ?? 0;
  // Matrículas C1 y C3
  for (const ci of [0, 2]) {
    const level = LEVELS[li]?.[ci] ?? 0;
    await db.insert(enrollment).values({ id: `demo:enr:${++e}`, organizationId: orgId, userId: l.id,
      pathId: pathOf(ci), competencyId: compOf(ci), status: level >= 3 ? "completado" : "en_curso", createdAt: daysAgo(40 - li) });
  }
  // Test C1 (pasa si nivel>=2)
  await db.insert(testAttempt).values({ id: `demo:att:${++t}`, organizationId: orgId, userId: l.id,
    pathId: pathOf(0), competencyId: compOf(0), score: 60 + lv1 * 9, passed: lv1 >= 2, createdAt: daysAgo(35 - li) });
  // Caso práctico C1: aprobado si nivel>=2, entregado (pendiente) si nivel==1
  if (lv1 >= 1) {
    const caseId = `demo:case:${++ca}`;
    const aprob = lv1 >= 2;
    await db.insert(appliedCase).values({ id: caseId, organizationId: orgId, userId: l.id, competencyId: compOf(0),
      pathId: pathOf(0), prompt: "Gestiona una llamada de un cliente enfadado por un retraso y deja constancia en el CRM.",
      submission: "Escuché, me disculpé sin excusas, ofrecí una solución concreta con fecha y lo registré como incidencia en el CRM.",
      status: aprob ? "aprobado" : "entregado", createdAt: daysAgo(20 - li), submittedAt: daysAgo(18 - li) });
    if (aprob) {
      await db.insert(validation).values({ id: `demo:val:${++va}`, organizationId: orgId, caseId, validatorId,
        decision: "aprobado", feedback: "Buen manejo emocional y registro correcto. Sube a nivel Aplica.", createdAt: daysAgo(16 - li) });
      await db.insert(evidence).values({ id: `demo:ev:${++ev}`, organizationId: orgId, ownerType: "applied_case",
        ownerId: caseId, kind: "kpi", note: "Incidencia resuelta en 1 llamada; cliente retenido.", createdBy: l.id, createdAt: daysAgo(16 - li) });
      if (buenasPracticasCaseIds.length < 2) buenasPracticasCaseIds.push(caseId);
    }
  }
  // Roleplay (la mitad)
  if (li % 2 === 0)
    await db.insert(roleplaySession).values({ id: `demo:rp:${++rp}`, organizationId: orgId, userId: l.id,
      competencyId: compOf(0), persona: "Cliente molesto por un retraso de entrega", status: "cerrado",
      transcript: [{ role: "assistant", content: "Llevo tres días esperando y nadie me dice nada." },
        { role: "user", content: "Le entiendo, siento el retraso. Le doy fecha concreta hoy mismo y le compenso el envío." }],
      summary: "Practicó una reclamación difícil manteniendo la calma.", createdAt: daysAgo(12 - li), closedAt: daysAgo(12 - li) });
  // Puntos (temporada actual): aplicar, completar, enseñar
  const rows = [
    { reason: "aplica_semana", points: 20 + lv1 * 5 },
    { reason: "completa_modulo", points: lv3 >= 3 ? 30 : 10 },
  ];
  if (lv1 >= 3) rows.push({ reason: "ensena_a_N2", points: 40 });
  for (const r of rows)
    await db.insert(pointsLedger).values({ id: `demo:pt:${++pt}`, organizationId: orgId, userId: l.id,
      season: SEASON, points: r.points, reason: r.reason, createdAt: daysAgo(10 - li) });
  // Preguntas al chat del agente (activeLearners + questionsAsked)
  const threadId = `demo:th:${++th}`;
  await db.insert(agentThread).values({ id: threadId, organizationId: orgId, userId: l.id, role: "empleado", title: "Dudas de la ruta", createdAt: daysAgo(9 - li) });
  const qs = ["¿Cómo aplico esto con un cliente que ya viene enfadado?", "¿Un ejemplo de mi puesto?"];
  for (const q of qs) {
    await db.insert(agentMessage).values({ id: `demo:ms:${++ms}`, organizationId: orgId, threadId, sender: "user", content: q, createdAt: daysAgo(9 - li) });
    await db.insert(agentMessage).values({ id: `demo:ms:${++ms}`, organizationId: orgId, threadId, sender: "agent", content: "Claro, en tu caso empezaría por reconocer el problema y dar una fecha concreta.", createdAt: daysAgo(9 - li) });
  }
}

// ---- 6) Coaching (referente enseña a otro) ----
const COACHINGS = [
  { coach: "demo:user:2", learner: "demo:user:4", comp: compOf(0), status: "activo" },   // Luis(N3 C1) -> Iván
  { coach: "demo:user:3", learner: "demo:user:6", comp: compOf(1), status: "logrado" },   // Marta(N4 C2) -> Hugo
  { coach: "demo:user:5", learner: alumno?.id ?? "demo:user:7", comp: compOf(3), status: "activo" }, // Nerea(N3 C4) -> Alumno
  ...(empleado ? [{ coach: empleado.id, learner: "demo:user:1", comp: compOf(0), status: "logrado" }] : []), // Empleado(Custodio C1) -> Ana
  ...(empleado && alumno ? [{ coach: empleado.id, learner: alumno.id, comp: compOf(2), status: "activo" }] : []), // Empleado -> Alumno (CRM)
];
let co = 0;
for (const c of COACHINGS)
  await db.insert(coaching).values({ id: `demo:coach:${++co}`, organizationId: orgId, coachId: c.coach,
    learnerId: c.learner, competencyId: c.comp, status: c.status, createdAt: daysAgo(14) });

// ---- 7) Buenas prácticas anónimas en el CEREBRO RAG (curadas: sin nombres ni clientes) ----
// Se guardan como ragDocument kind="buena_practica" (igual que en producción vía ingestDocument),
// que es donde las cuenta la métrica bestPracticesInBrain. Sin chunks: la demo solo necesita el conteo.
let bp = 0;
const BPS = [
  { title: "Buena práctica · Cliente enfadado", body: "Reconocer el problema antes de justificarse baja la tensión y abre la solución." },
  { title: "Buena práctica · Trazabilidad", body: "Registrar cada incidencia en el CRM en el momento evita repetir la conversación y da trazabilidad." },
];
for (const b of BPS)
  await db.insert(ragDocument).values({ id: `demo:bp:${++bp}`, organizationId: orgId, kind: "buena_practica",
    title: b.title, refId: buenasPracticasCaseIds[bp - 1] ?? "demo:case:1", createdAt: daysAgo(15) });

// ---- 8) Team DNA + notas del alumno + config de empresa ----
const DNA = [
  { u: "demo:user:1", primary: "conectora", secondary: "ejecutora", arch: "La que cierra con calidez" },
  { u: "demo:user:3", primary: "analitica", secondary: "resolutiva", arch: "La que ve el problema real" },
  { u: empleado?.id, primary: "ejecutora", secondary: "conectora", arch: "El que aplica y arrastra al equipo" },
  { u: alumno?.id, primary: "curiosa", secondary: "constante", arch: "El que quiere aplicar ya" },
];
let dna = 0;
for (const d of DNA) if (d.u)
  await db.insert(teamDna).values({ id: `demo:dna:${++dna}`, organizationId: orgId, userId: d.u,
    weights: { conexion: 0.7, ejecucion: 0.6, analisis: 0.5 }, primary: d.primary, secondary: d.secondary,
    archetype: d.arch, near: [], answers: [] }).onConflictDoNothing();

if (alumno) {
  await db.insert(annotation).values([
    { id: "demo:ann:1", organizationId: orgId, userId: alumno.id, source: "demo:lesson:1", card: 1,
      cardTitle: "Fundamentos de Atención al cliente", kind: "subrayado", quote: "reconocer el problema antes de justificarse", body: null },
    { id: "demo:ann:2", organizationId: orgId, userId: alumno.id, source: "demo:lesson:1", card: 2,
      cardTitle: "Fundamentos de Atención al cliente", kind: "pregunta", quote: null, body: "¿Y si el cliente no me deja hablar?" },
  ]);
}

await db.insert(companyConfig).values({ organizationId: orgId,
  levelLabels: { "1": "En formación", "2": "Aplica", "3": "Referente", "4": "Custodio" }, salaryLinked: false, updatedAt: now })
  .onConflictDoUpdate({ target: companyConfig.organizationId, set: { levelLabels: { "1": "En formación", "2": "Aplica", "3": "Referente", "4": "Custodio" }, salaryLinked: false, updatedAt: now } });

console.log(`Demo sembrada en ${ORG_NAME} (${orgId}) · temporada ${SEASON}`);
console.log(`  ${learners.length} aprendices · ${COMPS.length} competencias (2 críticas) · casos ${ca} · validaciones ${va} · roleplays ${rp} · puntos ${pt} filas · preguntas ${ms / 2} · buenas prácticas ${bp}`);
console.log("  C2 (Cierre de ventas, crítica) queda con 1 referente -> riesgo de dependencia visible en el panel.");
process.exit(0);
