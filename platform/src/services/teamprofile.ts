import { and, eq, like } from "drizzle-orm";
import { annotation, member, teamProfile, user } from "../db/schema.js";
import type { SvcDeps } from "./org.js";

/**
 * Team DNA v2 — perfil combinado de aprendizaje y comunicación. Scoring 100 % determinista (sin IA).
 *
 * Doctrina de honestidad (qué es cada capa y qué NO es):
 *  1. Big Five (IPIP, dominio público; ítems tipo Mini-IPIP, Donnellan et al. 2006, traducidos por nosotros)
 *     = el núcleo con respaldo científico. Es lo que decide la personalización concreta (tono, estructura, ritmo).
 *  2. Eneagrama = herramienta de autoconocimiento y de lenguaje común, SIN validación psicométrica sólida.
 *     Se usa para la narrativa («qué te mueve», «cómo darte feedback»), nunca para decidir rigor, acceso ni evaluación.
 *     Ítems originales en castellano (no copiados de RHETI/iEQ9).
 *  3. Hexad (Marczewski; escala validada por Tondello et al. 2016) = tipo de jugador → qué palancas de gamificación
 *     te motivan. Ítems originales en castellano.
 *  4. Preferencias pedagógicas con evidencia: ejemplos resueltos (Sweller; efecto inverso con experiencia, Kalyuga 2003),
 *     práctica de recuperación (Roediger y Karpicke 2006), repaso espaciado (Cepeda et al. 2006), feedback
 *     (Hattie y Timperley 2007). NO usamos estilos VAK («visual/auditivo/kinestésico»): es un neuromito
 *     (Pashler et al. 2008) — el formato se guarda como PREFERENCIA de comodidad, sin prometer que aprenda más rápido.
 *  5. Color = identidad visual derivada del eneatipo. No hay test de colores (serían pseudociencia).
 * Sigue en pie lo que el código ya rechazaba: nada de MBTI/DISC.
 */

/* ---------------------------------- Catálogo ---------------------------------- */

export type Big5 = "O" | "C" | "E" | "A" | "N";
export type Hexad = "filantropo" | "socializador" | "espiritu_libre" | "superador" | "jugador" | "disruptor";
export const HEXADS: Hexad[] = ["filantropo", "socializador", "espiritu_libre", "superador", "jugador", "disruptor"];
export const BIG5: Big5[] = ["O", "C", "E", "A", "N"];

// 5 ítems por eneatipo, en primera persona. Se intercalan al montar los bloques.
const ENNEA_TEXT: Record<number, string[]> = {
  1: ["Me cuesta dejar algo como está si sé que podría hacerse mejor.",
    "Tengo una voz interior que me señala enseguida lo que está mal hecho.",
    "Me molesta mucho que la gente se salte las normas o haga trampas.",
    "Prefiero hacer las cosas bien a hacerlas rápido.",
    "Me enfado conmigo cuando cometo un error que podía haber evitado."],
  2: ["Me doy cuenta enseguida de lo que necesitan los demás, a veces antes que ellos.",
    "Me cuesta decir que no cuando alguien me pide ayuda.",
    "Me siento bien cuando la gente cuenta conmigo.",
    "A menudo antepongo lo que necesitan otros a lo que necesito yo.",
    "Me duele más que no se valore mi ayuda que un fallo en mi trabajo."],
  3: ["Me pongo metas claras y me motiva mucho alcanzarlas.",
    "Me importa cómo se ven mis resultados ante los demás.",
    "Sé adaptar mi forma de presentarme según a quién tenga delante.",
    "Me frustra perder el tiempo en cosas que no llevan a ningún resultado.",
    "Cuando algo me sale bien, me gusta que se note."],
  4: ["Necesito que lo que hago tenga un sentido personal para mí.",
    "Vivo las emociones con mucha intensidad, tanto las buenas como las malas.",
    "Me incomoda hacer las cosas exactamente igual que todo el mundo.",
    "A veces siento que a los demás les resulta más fácil encajar que a mí.",
    "Valoro la autenticidad por encima de quedar bien."],
  5: ["Antes de opinar sobre algo necesito entenderlo a fondo.",
    "Necesito ratos a solas para recargar energía y pensar.",
    "Prefiero observar primero y participar después.",
    "Me gusta tener mis propios conocimientos y recursos para no depender de nadie.",
    "Me incomoda que me pidan actuar sin haberme preparado."],
  6: ["Suelo anticipar lo que podría salir mal para estar preparado.",
    "Me da seguridad saber con claridad qué se espera de mí.",
    "Soy muy fiel a las personas y a los equipos en los que confío.",
    "Tardo en fiarme de alguien, pero cuando lo hago es para largo.",
    "Antes de decidir algo importante me gusta contrastarlo con alguien."],
  7: ["Me entusiasman las ideas nuevas y los planes con muchas posibilidades.",
    "Me aburro rápido cuando algo se vuelve rutinario.",
    "Tiendo a ver el lado positivo incluso cuando las cosas se ponen feas.",
    "Me cuesta terminar algo cuando ya me ha llamado la atención otra cosa.",
    "Prefiero tener varias opciones abiertas a comprometerme con una sola."],
  8: ["Digo las cosas claras aunque incomoden.",
    "Me gusta tener el control de las situaciones importantes.",
    "Cuando veo una injusticia, intervengo.",
    "Me cuesta mostrarme vulnerable delante de los demás.",
    "Si alguien me pone un obstáculo, me crezco."],
  9: ["Hago lo posible por evitar conflictos y mantener la calma en el grupo.",
    "Entiendo con facilidad los distintos puntos de vista, aunque se contradigan.",
    "A veces aplazo lo importante haciendo cosas más cómodas.",
    "Me adapto a lo que prefieren los demás para que todos estén a gusto.",
    "Me cuesta saber qué quiero yo cuando hay varias opciones."],
};
/** e1..e45, intercalados: e1 = tipo 1, e2 = tipo 2 … e10 = tipo 1 (2.º ítem). */
export const ENNEA_ITEMS = Array.from({ length: 45 }, (_, i) => {
  const type = (i % 9) + 1;
  return { id: "e" + (i + 1), type, text: ENNEA_TEXT[type]![Math.floor(i / 9)]! };
});

// Big Five: ítems IPIP de dominio público (estructura Mini-IPIP, 4 por rasgo), traducción propia. r = inverso.
export const BIG5_ITEMS: { id: string; trait: Big5; r: boolean; text: string }[] = [
  { id: "b1", trait: "E", r: false, text: "Soy de los que animan las reuniones y celebraciones." },
  { id: "b2", trait: "A", r: false, text: "Me pongo en el lugar de los demás cuando lo pasan mal." },
  { id: "b3", trait: "C", r: false, text: "Hago las tareas pendientes en cuanto puedo." },
  { id: "b4", trait: "N", r: false, text: "Tengo cambios de humor frecuentes." },
  { id: "b5", trait: "O", r: false, text: "Tengo mucha imaginación." },
  { id: "b6", trait: "E", r: true, text: "Hablo poco." },
  { id: "b7", trait: "A", r: true, text: "No me interesan los problemas de los demás." },
  { id: "b8", trait: "C", r: true, text: "A menudo olvido dejar las cosas en su sitio." },
  { id: "b9", trait: "N", r: true, text: "Casi siempre mantengo la calma." },
  { id: "b10", trait: "O", r: true, text: "No me interesan las ideas abstractas." },
  { id: "b11", trait: "E", r: false, text: "En un evento hablo con mucha gente distinta." },
  { id: "b12", trait: "A", r: false, text: "Noto lo que sienten los demás." },
  { id: "b13", trait: "C", r: false, text: "Me gusta el orden." },
  { id: "b14", trait: "N", r: false, text: "Me altero con facilidad." },
  { id: "b15", trait: "O", r: true, text: "Me cuesta entender las ideas abstractas." },
  { id: "b16", trait: "E", r: true, text: "Prefiero quedarme en segundo plano." },
  { id: "b17", trait: "A", r: true, text: "En realidad, los demás no me interesan demasiado." },
  { id: "b18", trait: "C", r: true, text: "Suelo hacer las cosas de forma desordenada." },
  { id: "b19", trait: "N", r: true, text: "Rara vez me siento de bajón." },
  { id: "b20", trait: "O", r: true, text: "No tengo mucha imaginación." },
];

// Hexad: 3 ítems originales por tipo, intercalados.
const HEXAD_TEXT: Record<Hexad, string[]> = {
  filantropo: ["Me hace feliz ayudar a otros a aprender.", "Me gusta compartir lo que sé aunque no gane nada a cambio.", "Me siento bien cuando mi aportación le sirve al equipo."],
  socializador: ["Aprendo más a gusto cuando lo hago con otras personas.", "Me gusta formar parte de un equipo con un objetivo común.", "Me motiva conversar e intercambiar ideas con compañeros mientras aprendo."],
  espiritu_libre: ["Me gusta explorar a mi aire, sin un camino marcado.", "Prefiero elegir yo qué aprender y en qué orden.", "Me atrae descubrir contenidos que nadie me ha pedido que vea."],
  superador: ["Me gusta superar retos difíciles.", "Me motiva dominar una materia de principio a fin.", "Disfruto viendo cómo subo de nivel."],
  jugador: ["Me motivan las recompensas y los premios.", "Si hay puntos o un ranking, me esfuerzo más.", "Me gusta saber qué gano a cambio de mi esfuerzo."],
  disruptor: ["Me gusta cuestionar cómo se hacen las cosas.", "Suelo proponer cambios cuando algo no me convence.", "Me divierte buscar los límites de un sistema para ver hasta dónde llega."],
};
export const HEXAD_ITEMS = Array.from({ length: 18 }, (_, i) => {
  const hex = HEXADS[i % 6]!;
  return { id: "h" + (i + 1), hex, text: HEXAD_TEXT[hex][Math.floor(i / 6)]! };
});

export interface PedaOption { key: string; text: string; you: string; tutor: string }
export interface PedaItem { id: string; dim: string; text: string; options: PedaOption[] }
export const PEDA_ITEMS: PedaItem[] = [
  { id: "p1", dim: "ritmo", text: "¿Cuánto te cunde de verdad una sesión de estudio?", options: [
    { key: "corto", text: "Píldoras de 5 a 10 minutos", you: "Píldoras cortas, una idea cada vez.", tutor: "bloques muy cortos (5-10 min), una idea por vez" },
    { key: "medio", text: "Bloques de 20 a 30 minutos", you: "Bloques de 20-30 minutos con una comprobación al final.", tutor: "bloques de 20-30 min con una comprobación al cerrar" },
    { key: "largo", text: "Sesiones largas, de una hora o más", you: "Sesiones largas y profundas.", tutor: "aguanta sesiones largas y profundas" } ] },
  { id: "p2", dim: "entrada", text: "Ante un tema nuevo, ¿qué prefieres?", options: [
    { key: "ejemplo", text: "Ver primero un ejemplo resuelto paso a paso", you: "Primero un ejemplo resuelto, luego lo intentas tú.", tutor: "enséñale primero un ejemplo resuelto paso a paso y luego que lo intente" },
    { key: "explorar", text: "Intentarlo yo y luego ver cómo se hace", you: "Lo intentas tú primero y después ves la solución.", tutor: "déjale intentarlo primero y después enséñale la solución y el porqué (si el tema es nuevo para él, arranca con un ejemplo corto)" } ] },
  { id: "p3", dim: "orden", text: "¿Qué necesitas antes?", options: [
    { key: "porque", text: "Entender el porqué y la idea general", you: "Primero el porqué y la idea general.", tutor: "empieza por el porqué y la idea general" },
    { key: "como", text: "Saber el cómo, lo práctico; el porqué, después", you: "Primero lo práctico; el porqué, después.", tutor: "empieza por el cómo práctico y deja el porqué para después" } ] },
  { id: "p4", dim: "feedback", text: "¿Cuándo quieres que te corrijan?", options: [
    { key: "frecuente", text: "En cada paso, para no ir en mala dirección", you: "Correcciones en cada paso.", tutor: "corrígele en cada paso, pronto y concreto" },
    { key: "bloque", text: "Al terminar cada bloque", you: "Correcciones al terminar cada bloque.", tutor: "guarda las correcciones para el final de cada bloque" },
    { key: "demanda", text: "Solo cuando yo lo pida", you: "Correcciones cuando tú las pidas.", tutor: "corrige cuando lo pida; si ves un error grave, avísale igualmente" } ] },
  { id: "p5", dim: "practica", text: "¿Qué práctica te ayuda más a que se te quede?", options: [
    { key: "recuperacion", text: "Preguntas cortas para recordar sin mirar", you: "Preguntas cortas para recordar sin mirar.", tutor: "hazle preguntas cortas para recordar sin mirar" },
    { key: "casos", text: "Casos reales de mi trabajo", you: "Casos reales de tu trabajo.", tutor: "practica con casos reales de su trabajo" },
    { key: "simulacion", text: "Simular conversaciones con un cliente o compañero", you: "Simulaciones de conversación.", tutor: "propón simulaciones de conversación (roleplay)" } ] },
  { id: "p6", dim: "formato", text: "¿Con qué formato estás más a gusto? Es una preferencia, no cambia lo que aprendes.", options: [
    { key: "texto", text: "Leer", you: "Leer.", tutor: "prefiere leer" },
    { key: "video", text: "Ver vídeos", you: "Ver vídeos.", tutor: "prefiere vídeo: sugiérele el botón «Vídeos» cuando encaje" },
    { key: "audio", text: "Escuchar", you: "Escuchar.", tutor: "prefiere escuchar: frases que se entiendan bien en voz alta" },
    { key: "conversacion", text: "Conversar con el tutor", you: "Conversar con el tutor.", tutor: "prefiere conversar: pregúntale y construye con sus respuestas" } ] },
  { id: "p7", dim: "atasco", text: "Cuando te atascas, ¿qué te ayuda más?", options: [
    { key: "pista", text: "Una pista pequeña para seguir yo", you: "Una pista pequeña para seguir tú.", tutor: "si se atasca, dale una pista pequeña, no la solución" },
    { key: "ejemplo", text: "Un ejemplo parecido", you: "Un ejemplo parecido.", tutor: "si se atasca, dale un ejemplo parecido" },
    { key: "explicacion", text: "La explicación completa", you: "La explicación completa.", tutor: "si se atasca, explícaselo completo y luego comprueba" } ] },
  { id: "p8", dim: "repaso", text: "¿Cómo prefieres repasar?", options: [
    { key: "espaciado", text: "Repasos cortos repartidos en varios días", you: "Repasos cortos repartidos en varios días.", tutor: "repasos cortos espaciados en varios días" },
    { key: "intensivo", text: "Un repaso intenso antes de aplicarlo", you: "Un repaso intenso antes de aplicarlo.", tutor: "prefiere un repaso intenso; propón igualmente repasos breves espaciados, que fijan mejor" } ] },
];

export const LIKERT = ["Nada que ver conmigo", "Poco", "A medias", "Bastante", "Totalmente yo"];

export interface EnneaType {
  n: number; name: string; tagline: string; color: { name: string; hex: string };
  motivacion: string; miedo: string; fortalezas: string[]; atasco: string; aprende: string; feedback: string; motiva: string;
}
export const ENNEA_TYPES: EnneaType[] = [
  { n: 1, name: "El Perfeccionista", tagline: "Haces las cosas bien y con criterio.", color: { name: "Azul cobalto", hex: "#4F7DF3" },
    motivacion: "Hacer lo correcto y mejorar lo que te rodea. Tienes muy claro cómo deberían ser las cosas.",
    miedo: "equivocarte o que te consideren descuidado o injusto",
    fortalezas: ["Rigor y atención al detalle", "Coherencia: haces lo que dices", "Sentido de la calidad y de la mejora continua"],
    atasco: "Cuando te exiges tanto que no das nada por terminado, o te frustras con quien no llega a tu nivel.",
    aprende: "Con criterios claros de qué es «hacerlo bien», ejemplos correctos y ocasión de pulir tu trabajo.",
    feedback: "Concreto y justo: qué está bien, qué mejorar y por qué. Sin ironías ni críticas vagas.",
    motiva: "Ver que tu trabajo mejora de verdad y que la calidad se reconoce." },
  { n: 2, name: "El Ayudador", tagline: "Te importan las personas, y se nota.", color: { name: "Coral", hex: "#FF7A6B" },
    motivacion: "Sentirte útil y valorado; conectar con la gente y ayudarla a crecer.",
    miedo: "no ser necesario o que no se valore lo que aportas",
    fortalezas: ["Empatía: lees lo que necesitan los demás", "Generosidad y espíritu de equipo", "Facilidad para crear confianza"],
    atasco: "Cuando te vuelcas tanto en los demás que dejas tu propio aprendizaje para el final.",
    aprende: "Con casos de personas reales y viendo cómo lo que aprendes ayuda a tus clientes o compañeros.",
    feedback: "Cercano y personal: empieza reconociendo tu aportación y luego señala qué mejorar.",
    motiva: "Saber que lo que aprendes sirve para ayudar a otros." },
  { n: 3, name: "El Triunfador", tagline: "Vas a por el objetivo y lo consigues.", color: { name: "Oro", hex: "#F0B743" },
    motivacion: "Conseguir metas, avanzar y que tu valía se vea en los resultados.",
    miedo: "fracasar o no estar a la altura de lo que se espera de ti",
    fortalezas: ["Orientación a resultados", "Energía y capacidad de adaptación", "Sabes presentar y defender una idea"],
    atasco: "Cuando vas tan rápido que te saltas la base, o evitas lo que no luce enseguida.",
    aprende: "Con objetivos claros, hitos visibles y aplicación directa a tu trabajo.",
    feedback: "Directo y orientado a resultados: qué te acerca al objetivo y qué te frena.",
    motiva: "Superar retos, subir de nivel y lograr un certificado que demuestre lo conseguido." },
  { n: 4, name: "El Individualista", tagline: "Buscas lo auténtico y lo que tiene sentido.", color: { name: "Violeta", hex: "#A98BFF" },
    motivacion: "Ser tú y encontrar un sentido personal a lo que haces.",
    miedo: "ser uno más, sin identidad propia",
    fortalezas: ["Creatividad y sensibilidad", "Profundidad emocional y empatía", "Mirada original sobre los problemas"],
    atasco: "Cuando algo te parece rutinario o sin alma, o cuando tu estado de ánimo marca el ritmo.",
    aprende: "Cuando el tema conecta contigo, con historias reales y espacio para darle tu toque.",
    feedback: "Personal y respetuoso: reconoce lo que tiene de único tu trabajo antes de corregir.",
    motiva: "Crear algo propio y que se valore tu estilo." },
  { n: 5, name: "El Investigador", tagline: "Entiendes las cosas a fondo.", color: { name: "Turquesa", hex: "#3FD8E0" },
    motivacion: "Comprender cómo funcionan las cosas y sentirte competente.",
    miedo: "quedarte sin recursos o parecer incapaz",
    fortalezas: ["Capacidad de análisis", "Pensamiento independiente", "Calma y objetividad ante los problemas"],
    atasco: "Cuando sigues investigando para sentirte preparado y retrasas pasar a la práctica.",
    aprende: "Con explicaciones que van al fondo, lógica clara y tiempo para procesar a solas.",
    feedback: "Razonado y con datos; mejor por escrito y con tiempo para pensarlo.",
    motiva: "Dominar una materia y tener más profundidad a mano cuando la pides." },
  { n: 6, name: "El Leal", tagline: "Compromiso y previsión: se puede contar contigo.", color: { name: "Verde salvia", hex: "#54C79A" },
    motivacion: "Sentir seguridad y apoyo, y formar parte de algo en lo que confías.",
    miedo: "quedarte sin apoyo o sin guía ante lo incierto",
    fortalezas: ["Compromiso y responsabilidad", "Anticipas riesgos y problemas", "Lealtad al equipo"],
    atasco: "Cuando la duda te frena y das muchas vueltas antes de decidir.",
    aprende: "Con pasos claros, expectativas explícitas y libertad para preguntar sin sentirte juzgado.",
    feedback: "Claro, previsible y constructivo: que sepas en qué punto estás y qué viene después.",
    motiva: "Avanzar con seguridad y sentir el respaldo de tu equipo y de tu responsable." },
  { n: 7, name: "El Entusiasta", tagline: "Energía, ideas y ganas de probarlo todo.", color: { name: "Naranja", hex: "#FF9F43" },
    motivacion: "Vivir experiencias, tener opciones y disfrutar de lo que haces.",
    miedo: "quedarte atrapado en el aburrimiento o en las limitaciones",
    fortalezas: ["Optimismo contagioso", "Rapidez para conectar ideas", "Adaptación al cambio"],
    atasco: "Cuando algo se vuelve repetitivo y saltas a lo siguiente sin rematar.",
    aprende: "Con variedad, ritmo, retos cortos y libertad para explorar.",
    feedback: "Positivo y ágil: ve al grano, propón el siguiente paso y no lo conviertas en un sermón.",
    motiva: "La novedad, los retos variados y descubrir cosas nuevas." },
  { n: 8, name: "El Desafiador", tagline: "Decides, proteges y tiras del carro.", color: { name: "Carmesí", hex: "#E5484D" },
    motivacion: "Llevar las riendas de tu camino y proteger a los tuyos.",
    miedo: "que te controlen, te manipulen o te vean débil",
    fortalezas: ["Liderazgo y determinación", "Franqueza", "Capacidad para tomar decisiones difíciles"],
    atasco: "Cuando sientes que te imponen algo sin explicarte el porqué, o chocas con quien te lleva la contraria.",
    aprende: "Con autonomía, retos de verdad y aplicación inmediata al negocio.",
    feedback: "Franco y sin rodeos, argumentado y de igual a igual.",
    motiva: "Retos exigentes y ver el impacto real de lo que aprendes." },
  { n: 9, name: "El Pacificador", tagline: "Calma, escucha y visión de conjunto.", color: { name: "Azul cielo", hex: "#7CC4FA" },
    motivacion: "Estar en paz y en armonía contigo y con los demás.",
    miedo: "el conflicto y la desconexión con la gente",
    fortalezas: ["Escucha y paciencia", "Mediación: unes posturas", "Visión de conjunto y estabilidad"],
    atasco: "Cuando lo urgente o lo cómodo desplaza lo importante y lo vas aplazando.",
    aprende: "A un ritmo estable, sin presión, con pasos pequeños y un plan sencillo.",
    feedback: "Amable y tranquilo, pero concreto: un siguiente paso claro y pequeño.",
    motiva: "Avanzar a tu ritmo y ver que tu progreso suma al equipo." },
];

export interface HexadInfo { name: string; desc: string; levers: { t: string; href?: string }[] }
export const HEXAD_INFO: Record<Hexad, HexadInfo> = {
  filantropo: { name: "Filántropo", desc: "Te mueve aportar y ayudar a otros sin esperar nada a cambio.", levers: [
    { t: "Aportar casos reales al tutor: enriquecen el curso para todo tu equipo.", href: "/app/inicio.html" },
    { t: "Llevar a compañeros a su nivel 2 cuenta para llegar a Referente.", href: "/app/ranking.html" }] },
  socializador: { name: "Socializador", desc: "Te mueve la relación con los demás: aprender con gente y formar parte de un equipo.", levers: [
    { t: "El ranking de temporada de tu equipo.", href: "/app/ranking.html" },
    { t: "Los retos que te propone tu responsable.", href: "/app/inicio.html" },
    { t: "Simulaciones de conversación con el tutor." }] },
  espiritu_libre: { name: "Espíritu libre", desc: "Te mueve la autonomía: explorar y elegir tu propio camino.", levers: [
    { t: "Explorar temas por tu cuenta.", href: "/app/explorar.html" },
    { t: "Vídeos para profundizar en lo que te interese.", href: "/app/videos.html" },
    { t: "Montar y rehacer tu propia ruta.", href: "/app/ruta-crear.html" }] },
  superador: { name: "Superador", desc: "Te mueve superar retos y dominar una materia.", levers: [
    { t: "Subir de nivel en cada competencia.", href: "/app/inicio.html" },
    { t: "Certificados verificables de lo que dominas." },
    { t: "Retos cada vez más exigentes." }] },
  jugador: { name: "Jugador", desc: "Te mueven las recompensas: puntos, premios y ranking.", levers: [
    { t: "Puntos y ranking de temporada.", href: "/app/ranking.html" },
    { t: "Las recompensas que configura tu empresa." }] },
  disruptor: { name: "Disruptor", desc: "Te mueve cuestionar las cosas y cambiarlas para mejorarlas.", levers: [
    { t: "Cuestionar los casos y proponer mejoras en tus notas: el tutor las lee." },
    { t: "Preguntas al tutor que ponen a prueba lo aprendido." }] },
};

type Level = "bajo" | "medio" | "alto";
export const BIG5_LABEL: Record<Big5, string> = {
  O: "Apertura a la experiencia", C: "Responsabilidad", E: "Extraversión", A: "Amabilidad", N: "Estabilidad emocional",
};
// N se muestra invertido como «estabilidad emocional» (más claro y menos estigmatizante); level ya viene de la estabilidad.
const BIG5_TEXT: Record<Big5, Record<Level, { you: string; adj: string; tutor: string }>> = {
  O: { alto: { you: "Te atraen las ideas nuevas, las conexiones y lo abstracto.", adj: "curiosa", tutor: "proponle analogías, conexiones y temas para ir más allá" },
    medio: { you: "Combinas curiosidad por lo nuevo con sentido práctico.", adj: "", tutor: "" },
    bajo: { you: "Prefieres lo concreto, probado y útil a la teoría.", adj: "práctica", tutor: "ve a lo concreto y probado; ejemplos prácticos antes que teoría" } },
  C: { alto: { you: "Eres organizado y constante; te gustan los planes claros.", adj: "organizada", tutor: "dale estructura: objetivo claro, pasos numerados y lista de comprobación" },
    medio: { you: "Te organizas cuando hace falta sin volverte rígido.", adj: "", tutor: "" },
    bajo: { you: "Eres flexible y espontáneo; los planes largos se te hacen cuesta arriba.", adj: "flexible", tutor: "tareas muy cortas con fecha cercana; nada de planes largos" } },
  E: { alto: { you: "Te cargas de energía con la gente y aprendes hablando.", adj: "sociable", tutor: "propón simulaciones y retos con otros" },
    medio: { you: "Te mueves bien tanto en grupo como a solas.", adj: "", tutor: "" },
    bajo: { you: "Eres reflexivo; prefieres pensar antes de exponerte.", adj: "reflexiva", tutor: "dale tiempo para pensar y práctica individual antes de exponerse" } },
  A: { alto: { you: "Eres cercano y colaborador; te importa el impacto en los demás.", adj: "colaboradora", tutor: "enmarca en colaboración e impacto en otros; feedback cálido" },
    medio: { you: "Colaboras sin dejar de defender tu criterio.", adj: "", tutor: "" },
    bajo: { you: "Eres directo y exigente con los argumentos; valoras el debate.", adj: "directa", tutor: "sé directo y argumenta; acepta el debate" } },
  N: { alto: { you: "Mantienes la calma bajo presión.", adj: "serena bajo presión", tutor: "puedes ser exigente y retador" },
    medio: { you: "Llevas la presión razonablemente bien.", adj: "", tutor: "" },
    bajo: { you: "Sientes la presión con intensidad, lo que también te hace estar atento a los riesgos.", adj: "sensible a la presión", tutor: "tono tranquilizador, pasos pequeños, normaliza el error y celebra cada avance" } },
};

/* ---------------------------------- Bloques del test ---------------------------------- */

export interface CatalogItem { id: string; text: string; options?: string[] }
export interface CatalogBlock { key: string; title: string; intro: string; kind: "likert" | "choice"; items: CatalogItem[] }

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
// ~91 ítems en 10 bloques cortos: 10-12 minutos.
export const BLOCKS: CatalogBlock[] = [
  { key: "aprendes", title: "Cómo aprendes", kind: "choice", intro: "Elige lo que más se parezca a ti. No hay respuestas buenas ni malas.",
    items: PEDA_ITEMS.map((p) => ({ id: p.id, text: p.text, options: p.options.map((o) => o.text) })) },
  ...chunk(BIG5_ITEMS, 10).map((items, i) => ({ key: "rasgos" + (i + 1), title: "Tus rasgos (" + (i + 1) + "/2)", kind: "likert" as const,
    intro: "¿Cuánto se parece a ti cada frase? Piensa en cómo eres normalmente, no en cómo te gustaría ser.",
    items: items.map((x) => ({ id: x.id, text: x.text })) })),
  ...chunk(HEXAD_ITEMS, 9).map((items, i) => ({ key: "motiva" + (i + 1), title: "Qué te motiva (" + (i + 1) + "/2)", kind: "likert" as const,
    intro: "Piensa en cuando aprendes o trabajas en algo que te engancha.",
    items: items.map((x) => ({ id: x.id, text: x.text })) })),
  ...chunk(ENNEA_ITEMS, 9).map((items, i) => ({ key: "fondo" + (i + 1), title: "Lo que te mueve por dentro (" + (i + 1) + "/5)", kind: "likert" as const,
    intro: "Responde con lo primero que sientas. Sé sincero: nadie te va a juzgar por esto.",
    items: items.map((x) => ({ id: x.id, text: x.text })) })),
];

const PEDA_BY_ID = new Map(PEDA_ITEMS.map((p) => [p.id, p]));
const LIKERT_IDS = new Set([...ENNEA_ITEMS, ...BIG5_ITEMS, ...HEXAD_ITEMS].map((x) => x.id));
export const ALL_IDS: string[] = BLOCKS.flatMap((b) => b.items.map((i) => i.id));

export type Answers = Record<string, number>;

/** Quita ids desconocidos y valores fuera de rango (Likert 1-5, elección 0..n-1). */
export function sanitizeAnswers(input: Record<string, number>): Answers {
  const out: Answers = {};
  for (const [id, v] of Object.entries(input)) {
    if (!Number.isInteger(v)) continue;
    if (LIKERT_IDS.has(id) && v >= 1 && v <= 5) out[id] = v;
    const p = PEDA_BY_ID.get(id);
    if (p && v >= 0 && v < p.options.length) out[id] = v;
  }
  return out;
}
export function missingItems(a: Answers): string[] {
  return ALL_IDS.filter((id) => !(id in a));
}

/* ---------------------------------- Scoring ---------------------------------- */

const to100 = (mean: number) => Math.round(((mean - 1) / 4) * 100);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const level = (v: number): Level => (v < 40 ? "bajo" : v > 60 ? "alto" : "medio");

export interface ProfileResult {
  version: 1;
  enneagram: { type: number; wing: number; second: number; scores: Record<string, number> };
  bigFive: Record<Big5, number>; // 0-100; N = neuroticismo (la UI lo muestra como estabilidad = 100 - N)
  hexad: { main: Hexad; second: Hexad; scores: Record<Hexad, number> };
  pedagogy: Record<string, string>; // dim -> key de opción
}

/** Tipo principal = mayor puntuación (empate → número de tipo menor); ala = vecino con más puntuación (empate → t-1). */
export function scoreEnneagram(a: Answers): ProfileResult["enneagram"] {
  const scores: Record<string, number> = {};
  for (let t = 1; t <= 9; t++) scores[t] = to100(mean(ENNEA_ITEMS.filter((x) => x.type === t).map((x) => a[x.id] ?? 3)));
  const ranked = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort((x, y) => scores[y]! - scores[x]! || x - y);
  const type = ranked[0]!;
  const left = type === 1 ? 9 : type - 1, right = type === 9 ? 1 : type + 1;
  const wing = scores[right]! > scores[left]! ? right : left;
  return { type, wing, second: ranked[1]!, scores };
}

export function scoreBigFive(a: Answers): Record<Big5, number> {
  const out = {} as Record<Big5, number>;
  for (const t of BIG5) {
    out[t] = to100(mean(BIG5_ITEMS.filter((x) => x.trait === t).map((x) => { const v = a[x.id] ?? 3; return x.r ? 6 - v : v; })));
  }
  return out;
}

export function scoreHexad(a: Answers): ProfileResult["hexad"] {
  const scores = {} as Record<Hexad, number>;
  for (const h of HEXADS) scores[h] = to100(mean(HEXAD_ITEMS.filter((x) => x.hex === h).map((x) => a[x.id] ?? 3)));
  const ranked = [...HEXADS].sort((x, y) => scores[y] - scores[x] || HEXADS.indexOf(x) - HEXADS.indexOf(y));
  return { main: ranked[0]!, second: ranked[1]!, scores };
}

export function scoreProfile(a: Answers): ProfileResult {
  const pedagogy: Record<string, string> = {};
  for (const p of PEDA_ITEMS) { const o = p.options[a[p.id] ?? 0]; if (o) pedagogy[p.dim] = o.key; }
  return { version: 1, enneagram: scoreEnneagram(a), bigFive: scoreBigFive(a), hexad: scoreHexad(a), pedagogy };
}

/* ---------------------------------- Narrativa (determinista) ---------------------------------- */

const b5Level = (r: ProfileResult, t: Big5): Level => level(t === "N" ? 100 - r.bigFive.N : r.bigFive[t]);
const pedaOpt = (dim: string, key: string | undefined) => PEDA_ITEMS.find((p) => p.dim === dim)?.options.find((o) => o.key === key);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
const fb = (t: EnneaType) => "Feedback " + lc(t.feedback);
const LEVEL_F: Record<Level, string> = { bajo: "baja", medio: "media", alto: "alta" }; // los 5 rasgos son femeninos
function joinEs(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
}

export function enneaType(n: number): EnneaType { return ENNEA_TYPES[n - 1] ?? ENNEA_TYPES[0]!; }

export function profileView(r: ProfileResult) {
  const t = enneaType(r.enneagram.type);
  const adjs = BIG5.map((k) => BIG5_TEXT[k][b5Level(r, k)].adj).filter(Boolean);
  const hx = HEXAD_INFO[r.hexad.main], hx2 = HEXAD_INFO[r.hexad.second];
  const tutorRules = BIG5.map((k) => BIG5_TEXT[k][b5Level(r, k)].tutor).filter(Boolean);
  return {
    titulo: t.name,
    subtitulo: "Eneatipo " + t.n + " con ala " + r.enneagram.wing,
    color: t.color,
    tagline: t.tagline,
    quienEres: "Te mueve " + lc(t.motivacion) + " Lo que más te incomoda es " + t.miedo + ". " +
      (adjs.length ? "En el día a día eres una persona " + joinEs(adjs) + "." : "En los cinco grandes rasgos tienes un perfil equilibrado."),
    fortalezas: t.fortalezas,
    atasco: t.atasco,
    feedback: fb(t),
    motiva: t.motiva,
    aprende: t.aprende,
    comoAprendes: PEDA_ITEMS.map((p) => pedaOpt(p.dim, r.pedagogy[p.dim])?.you).filter((x): x is string => !!x),
    comoTeHablaran: [fb(t), ...tutorRules.map((x) => x.charAt(0).toUpperCase() + x.slice(1) + ".")],
    rasgos: BIG5.map((k) => {
      const score = k === "N" ? 100 - r.bigFive.N : r.bigFive[k];
      return { key: k, label: BIG5_LABEL[k], score, level: level(score), text: BIG5_TEXT[k][level(score)].you };
    }),
    gamificacion: { tipo: hx.name, desc: hx.desc, segundo: hx2.name, palancas: [...hx.levers, ...hx2.levers.slice(0, 1)] },
    eneagrama: { tipo: t.n, ala: r.enneagram.wing, segundo: r.enneagram.second, segundoNombre: enneaType(r.enneagram.second).name },
  };
}
export type ProfileView = ReturnType<typeof profileView>;

/** Resumen compacto en castellano para los prompts de tutores y asistente (va en la nota onboarding «[perfil] …»). */
export function profileBrief(r: ProfileResult): string {
  const t = enneaType(r.enneagram.type);
  const rasgos = BIG5.map((k) => BIG5_LABEL[k].toLowerCase() + " " + LEVEL_F[b5Level(r, k)]).join(", ");
  const reglas = BIG5.map((k) => BIG5_TEXT[k][b5Level(r, k)].tutor).filter(Boolean);
  const peda = PEDA_ITEMS.map((p) => pedaOpt(p.dim, r.pedagogy[p.dim])?.tutor).filter(Boolean);
  const hx = HEXAD_INFO[r.hexad.main], hx2 = HEXAD_INFO[r.hexad.second];
  return [
    "Perfil de aprendizaje (autoinforme orientativo, no diagnóstico).",
    "Eneatipo " + t.n + " ala " + r.enneagram.wing + " (" + t.name + "). Motivación de fondo: «" + t.motivacion + "» Miedo básico: «" + t.miedo + "».",
    "Rasgos Big Five: " + rasgos + ".",
    reglas.length ? "Cómo hablarle: " + reglas.join("; ") + "." : "",
    fb(t),
    "Cómo aprende: " + peda.join("; ") + ".",
    "Le motiva (gamificación): " + hx.name + " («" + hx.desc + "»), y en segundo lugar " + hx2.name + ".",
    "Dónde suele atascarse: «" + t.atasco + "»",
    "Ajusta tono, ritmo y formato; nunca el rigor. No le etiquetes ni menciones el test salvo que lo saque.",
  ].filter(Boolean).join(" ");
}

/** Una línea de motivación para el coach de voz (gamificación). */
export function motivationLine(r: ProfileResult): string {
  const hx = HEXAD_INFO[r.hexad.main];
  return hx.name + ": " + hx.desc + " Palancas: " + hx.levers.map((l) => l.t).join(" ");
}

/* ---------------------------------- Persistencia (multi-tenant) ---------------------------------- */

export async function getProfile(deps: SvcDeps, orgId: string, userId: string) {
  const [row] = await deps.db.select().from(teamProfile)
    .where(and(eq(teamProfile.organizationId, orgId), eq(teamProfile.userId, userId)));
  return row ? { ...row, result: row.result as unknown as ProfileResult | null } : null;
}

/** Guarda respuestas sobre la marcha (fusiona con lo ya guardado). */
export async function saveAnswers(deps: SvcDeps, orgId: string, userId: string, partial: Answers): Promise<Answers> {
  const row = await getProfile(deps, orgId, userId);
  const answers = { ...(row?.answers ?? {}), ...sanitizeAnswers(partial) };
  await deps.db.insert(teamProfile).values({ id: deps.newId(), organizationId: orgId, userId, answers })
    .onConflictDoUpdate({ target: [teamProfile.organizationId, teamProfile.userId], set: { answers, updatedAt: new Date() } });
  await maybeProvisional(deps, orgId, userId, answers);
  return answers;
}

/** Repetir el test: vacía las respuestas; el resultado anterior sigue vigente hasta terminar el nuevo. */
export async function restart(deps: SvcDeps, orgId: string, userId: string): Promise<void> {
  await deps.db.update(teamProfile).set({ answers: {}, updatedAt: new Date() })
    .where(and(eq(teamProfile.organizationId, orgId), eq(teamProfile.userId, userId)));
}

/* ---------------------------------- Perfil provisional (Marc, 28-09-2026) ----------------------------------
 * Los dos primeros bloques («Cómo aprendes» + rasgos, 28 respuestas, ~5 min) son los que personalizan tono, ritmo,
 * formato y tipo de práctica. En cuanto están, se deja un perfil provisional para tutor, «Para ti» y recursos; el
 * eneagrama y el Hexad pueden terminarse después y el perfil completo lo sustituye. */
const CORE_IDS = [...PEDA_ITEMS.map((p) => p.id), ...BIG5_ITEMS.map((x) => x.id)];
export function coreComplete(a: Answers): boolean { return CORE_IDS.every((id) => id in a); }

/** Preferencias pedagógicas (dim -> clave de opción) de lo ya respondido. */
export function pedagogyOf(a: Answers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PEDA_ITEMS) { if (!(p.id in a)) continue; const o = p.options[a[p.id] ?? 0]; if (o) out[p.dim] = o.key; }
  return out;
}

export function coreBrief(a: Answers): string {
  const r = { bigFive: scoreBigFive(a) } as ProfileResult; // b5Level solo lee bigFive
  const rasgos = BIG5.map((k) => BIG5_LABEL[k].toLowerCase() + " " + LEVEL_F[b5Level(r, k)]).join(", ");
  const reglas = BIG5.map((k) => BIG5_TEXT[k][b5Level(r, k)].tutor).filter(Boolean);
  const ped = pedagogyOf(a);
  const peda = PEDA_ITEMS.map((p) => pedaOpt(p.dim, ped[p.dim])?.tutor).filter(Boolean);
  return [
    "Perfil de aprendizaje provisional (autoinforme orientativo, no diagnóstico).",
    "Rasgos Big Five: " + rasgos + ".",
    reglas.length ? "Cómo hablarle: " + reglas.join("; ") + "." : "",
    "Cómo aprende: " + peda.join("; ") + ".",
    "Ajusta tono, ritmo y formato; nunca el rigor. No le etiquetes ni menciones el test salvo que lo saque.",
  ].filter(Boolean).join(" ");
}

/** Deja el perfil provisional si ya están los bloques clave y aún no hay perfil completo. */
async function maybeProvisional(deps: SvcDeps, orgId: string, userId: string, answers: Answers): Promise<void> {
  if (!coreComplete(answers)) return;
  const row = await getProfile(deps, orgId, userId);
  if (row?.result) return; // ya tiene el completo
  await deps.db.delete(annotation).where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId),
    eq(annotation.source, "onboarding"), like(annotation.body, "[perfil]%")));
  await deps.db.insert(annotation).values({ id: deps.newId(), organizationId: orgId, userId, source: "onboarding", kind: "insight", body: "[perfil] " + coreBrief(answers) });
}

/** Puntúa, guarda y deja el resumen donde lo leen los tutores (nota onboarding «[perfil]», sustituye la anterior). */
export async function finish(deps: SvcDeps, orgId: string, userId: string): Promise<{ missing: string[] } | { result: ProfileResult; brief: string }> {
  const row = await getProfile(deps, orgId, userId);
  const answers = row?.answers ?? {};
  const missing = missingItems(answers);
  if (missing.length) return { missing };
  const result = scoreProfile(answers);
  const brief = profileBrief(result);
  await deps.db.update(teamProfile).set({ result: result as unknown as Record<string, unknown>, brief, completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(teamProfile.organizationId, orgId), eq(teamProfile.userId, userId)));
  await deps.db.delete(annotation).where(and(eq(annotation.organizationId, orgId), eq(annotation.userId, userId),
    eq(annotation.source, "onboarding"), like(annotation.body, "[perfil]%")));
  await deps.db.insert(annotation).values({ id: deps.newId(), organizationId: orgId, userId, source: "onboarding", kind: "insight", body: "[perfil] " + brief });
  return { result, brief };
}

/** Vista de equipo (gestores): cada miembro de la org con su perfil, o null si aún no lo ha hecho. */
export async function teamProfiles(deps: SvcDeps, orgId: string) {
  const members = await deps.db.select({ userId: member.userId, orgRole: member.orgRole, name: user.name })
    .from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, orgId));
  const rows = await deps.db.select().from(teamProfile).where(eq(teamProfile.organizationId, orgId));
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  return members.map((m) => {
    const r = byUser.get(m.userId);
    const res = r?.result as unknown as ProfileResult | null | undefined;
    return { userId: m.userId, name: m.name, orgRole: m.orgRole, completedAt: r?.completedAt ?? null, view: res ? profileView(res) : null };
  });
}
