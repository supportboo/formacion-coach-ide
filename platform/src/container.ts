import { db } from "./db/index.js";
import { makeEmbeddings } from "./rag/embeddings.js";
import { PgVectorStore } from "./rag/store.js";
import { makeLlm, type Llm, type LlmCall } from "./agents/llm.js";
import type { ChatDeps } from "./agents/chat.js";
import { newId } from "./util/id.js";
import { makeUsageRecorder, orgCost } from "./services/costs.js";
import { env } from "./config/env.js";
import { DEFAULT_LANG, getUserLang, langSuffix, normalizeLang } from "./services/lang.js";
import { applyTerms, extractLearned, glossaryPrompt, learnTerm, LEARN_INSTRUCTION, LEARNING_KINDS, orgTerms } from "./services/glossary.js";

// Singletons de la app.
export const emb = makeEmbeddings();
const rawLlm = makeLlm(makeUsageRecorder({ db, newId }));

// Criterio en conversación (Marc, 27-09-2026): el tutor no se deja engañar. Si el alumno afirma algo que parece
// falso, inverosímil o ajeno al temario, lo cuestiona con tacto y curiosidad; sin ser rígido, porque no conoce la
// realidad concreta de cada empresa.
const CRITERIO = "\n\nCRITERIO: si el usuario afirma algo que parece falso, exagerado, inverosímil o que no tiene que ver con el temario, no lo des por bueno ni le sigas la corriente. Cuestiónalo con tacto y buen humor: di con naturalidad lo que no te cuadra o que se sale del tema, pregunta de dónde sale o pide un ejemplo concreto, y reconduce al contenido. Deja ver que estás atento y que no es fácil colarte algo, sin acusar ni sermonear. Si puede ser verdad en su empresa (no conoces su realidad), dale el beneficio de la duda pero pide que lo concrete. En un roleplay hazlo dentro de tu personaje. Si solo está probando el bot, trolleando o diciendo tonterías sin relación con su trabajo, responde en UNA frase, con humor y sin sermonear, y reconduce al temario: no gastes en respuestas largas.";

// Verdad sobre los datos (Marc, 28-09-2026): un tutor contestó «solo las uso en esta sesión, no se guardan», y es
// FALSO (el chat, lo que cuenta la persona y su actividad se guardan en la cuenta de su empresa; ver PRIVACY.md).
// Cualquier agente conversacional responde lo que de verdad pasa y remite a «Tus datos». Además: siempre de tú.
const DATOS = "\n\nDATOS Y PRIVACIDAD (responde siempre con la verdad, en positivo y sin minimizar): si te preguntan qué se hace con sus conversaciones o sus datos, transmite que compartir le ayuda a él y a su equipo, y explica con sencillez que sus conversaciones con los tutores y lo que cuenta (entrevistas, notas, respuestas de tests y roleplays) se guardan en la plataforma, en la cuenta de su empresa, y se usan para personalizar su formación y para las métricas de aprendizaje; que sus compañeros no ven sus conversaciones; que sus responsables (coach, team leader, admin) pueden ver su progreso y leer sus conversaciones con los tutores, y que siempre verá un aviso con el nombre de quien siga su sesión; que las correcciones de términos que hace se aprenden para toda su empresa; que la actividad de uso se guarda 90 días y que el uso del chat se controla (tope diario y palabras prohibidas) para evitar abusos y gasto innecesario de su empresa; que los textos se procesan con proveedores de IA para generar las respuestas; y que puede ver y descargar sus datos en «Tus datos» del menú, y pedir el borrado a su empresa. Nunca digas que no se guarda nada, que solo dura la sesión ni que «queda entre tú y yo». Si no sabes un detalle, dilo y remite a «Tus datos» o a su empresa.";
// El trato (tú, castellano de España) y el texto plano viven ahora en la regla de idioma (services/lang.ts): en
// español siguen igual; en los demás idiomas, registro informal natural de ese idioma (1.5.0).

// Tope de gasto de IA por empresa/día (red de seguridad anti-abuso, un solo punto para los 17 endpoints).
// Se comprueba ANTES de generar; si la empresa ya superó su tope hoy, se bloquea con mensaje claro.
export const llm: Llm = {
  async generate(call: LlmCall): Promise<string> {
    if (call.orgId && env.ORG_AI_DAILY_CAP_USD > 0) {
      const spent = await orgCost({ db, newId }, call.orgId, 1).then((c) => c.usd).catch(() => 0);
      if (spent >= env.ORG_AI_DAILY_CAP_USD) {
        throw new Error("Se ha alcanzado el límite de uso de IA de tu empresa por hoy. Vuelve mañana o pide al administrador que lo amplíe.");
      }
    }
    // Glosario que aprende (services/glossary.ts): la terminología corregida por el equipo va en el prompt de
    // TODAS las llamadas, se corrige en la salida y, en conversación, el agente marca las correcciones nuevas.
    // La traducción de cursos se guarda para TODA la plataforma: sin el glosario de una empresa concreta.
    const terms = call.kind === "translate" ? [] : await orgTerms(db, call.orgId).catch(() => []);
    const learning = !!(call.orgId && call.userId && LEARNING_KINDS.has(call.kind || ""));
    // Idioma de la persona (1.5.0): toda llamada con userId responde en su idioma, salvo contenido compartido
    // (SHARED_KINDS). Los resúmenes de supervisión llevan el userId del supervisor: salen en SU idioma.
    const lang = normalizeLang(call.lang) ?? await getUserLang(db, call.userId).catch(() => DEFAULT_LANG);
    const conversational = LEARNING_KINDS.has(call.kind || "");
    const out = await rawLlm.generate({ ...call, system: call.system + glossaryPrompt(terms) + (learning ? LEARN_INSTRUCTION + CRITERIO + DATOS : "") + langSuffix(lang, call.kind, conversational) });
    const { clean, learned } = extractLearned(out);
    if (learning) for (const t of learned) await learnTerm(db, newId, call.orgId!, call.userId!, t).catch(() => false);
    return applyTerms(clean, learned.length ? await orgTerms(db, call.orgId).catch(() => terms) : terms);
  },
};
export const store = new PgVectorStore(db, newId);
export const chatDeps: ChatDeps = { db, store, emb, llm, newId };
export { db, newId };
