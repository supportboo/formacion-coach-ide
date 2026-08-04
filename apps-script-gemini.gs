/**
 * Brandooers · Chat de expertos con Gemini + búsqueda web (proxy seguro)
 * ---------------------------------------------------------------------
 * La web es pública, así que la clave de Gemini NO puede ir en el código.
 * Este proxy la guarda en el servidor (Propiedades del Script) y la web solo habla con el proxy.
 * Además activa Google Search (grounding): Gemini busca en la web en tiempo real y devuelve fuentes.
 *
 * PASOS (con la cuenta de Google que tenga la API de Gemini):
 *  1. script.google.com → Nuevo proyecto. Pega TODO este archivo.
 *  2. Configuración del proyecto (rueda) → Propiedades del script → Añadir:
 *        Nombre: GEMINI_API_KEY    Valor: (tu clave de Gemini)
 *  3. Implementar → Nueva implementación → Aplicación web.
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario. Autoriza.
 *  4. Copia la URL /exec y pégala en la constante CHAT_URL de index.html. Commit + push.
 *
 * NOTA sobre "hosting": esto NO es un hosting ni un VPS. Es una función gratis de Google
 * que solo sirve para no exponer la clave. La web sigue en GitHub Pages (gratis).
 */

var MODEL = 'gemini-flash-latest'; // modelo vigente; también valen gemini-2.5-flash o gemini-3.5-flash

var BASE = ' Contexto: formación para coaches del equipo/ecosistema de Odoo (Odooers) que acompañan a personas nuevas en sus primeros 6 meses (apoyo emocional y motivacional, NO operativa). Responde en español de España, cercano, práctico y breve (máx 7 frases), con un consejo accionable o una frase textual que el coach pueda decir. Si te piden vídeos, artículos o estudios, busca fuentes reales y fiables (charlas TED, YouTube oficial, webs de los autores, papers). Si hay sufrimiento emocional serio, recomienda escuchar sin diagnosticar y derivar a un profesional.';

var SYS = {
  liderazgo: 'Eres experto en liderazgo y acompañamiento (Simon Sinek, Greenleaf, John Maxwell, Stephen Covey, Kim Scott, Marshall Goldsmith, modelo SBI).',
  personalidades: 'Eres experto en personalidades y perfiles (Eneagrama y sus 9 tipos, DISC y colores, ventana de Johari, zonas de confort/aprendizaje/pánico, rueda de emociones, Ikigai, Big Five). No encasillas a la persona.',
  motivacion: 'Eres experto en motivación y mente (Tony Robbins, Daniel Pink, Deci y Ryan, Carol Dweck, Viktor Frankl, Martin Seligman, Mel Robbins).',
  escucha: 'Eres experto en escucha y conversación de coaching (Carl Rogers, Michael Bungay Stanier, modelo GROW, Nancy Kline, niveles de escucha, validar antes de resolver).',
  organizacion: 'Eres experto en organización, foco y rutinas prácticas (Tony Robbins priming, Robin Sharma 20/20/20, Brian Tracy, matriz de Eisenhower, Ivy Lee, Cal Newport, Pomodoro, James Clear). Método práctico, nada esotérico.'
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback, q = p.q || '', expert = p.expert || '', ctx = p.ctx || '';
  var answer = '', sources = [];
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) throw new Error('Falta GEMINI_API_KEY en Propiedades del script');
    var sys = (SYS[expert] || 'Eres un experto en coaching y acompañamiento.') + BASE;
    var userText = (ctx ? ('Conversación previa:\n' + ctx + '\n\nPregunta actual: ') : '') + q;
    var body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
    };
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + key,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
    );
    var j = JSON.parse(res.getContentText());
    var c = (j.candidates && j.candidates[0]) || {};
    if (c.content && c.content.parts) {
      answer = c.content.parts.map(function (x) { return x.text || ''; }).join('');
    }
    if (!answer) answer = 'No he podido responder ahora mismo.';
    var chunks = (c.groundingMetadata && c.groundingMetadata.groundingChunks) || [];
    sources = chunks.map(function (x) { return x.web ? { title: x.web.title, uri: x.web.uri } : null; })
                    .filter(function (x) { return x; }).slice(0, 4);
  } catch (err) {
    answer = '(El experto no está disponible en este momento.)';
  }
  var out = JSON.stringify({ answer: answer, sources: sources });
  if (cb) return ContentService.createTextOutput(cb + '(' + out + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
