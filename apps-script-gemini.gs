/**
 * Brandooers · Chat de expertos con Gemini (proxy seguro)
 * ------------------------------------------------------
 * La web es pública, así que la clave de Gemini NO puede ir en el código.
 * Este proxy la guarda en el servidor (Propiedades del Script) y la web solo habla con el proxy.
 *
 * PASOS (con la cuenta de Google que tenga la API de Gemini):
 *  1. Apps Script nuevo (script.google.com → Nuevo proyecto). Pega TODO este archivo.
 *  2. Rueda dentada (Configuración del proyecto) → Propiedades del script → Añadir propiedad:
 *        Nombre:  GEMINI_API_KEY      Valor: (tu clave de Gemini)
 *  3. Implementar → Nueva implementación → Aplicación web.
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario. Autoriza.
 *  4. Copia la URL que acaba en /exec y pégala en la constante CHAT_URL de index.html. Commit + push.
 *  Listo: el chat de expertos pasa a responder con Gemini, y la clave nunca sale del servidor.
 */

var MODEL = 'gemini-2.0-flash';

var BASE = ' Contexto: formación para coaches del equipo de Odoo que acompañan a personas nuevas durante sus primeros 6 meses (apoyo emocional y motivacional, NO operativa). Responde en español de España, cercano, práctico y breve (máximo 6 frases), con al menos un consejo accionable o una frase textual que el coach pueda decir. Si aparece sufrimiento emocional serio, recomienda escuchar sin diagnosticar y derivar a un profesional.';

var SYS = {
  liderazgo: 'Eres un experto en liderazgo y acompañamiento, con el conocimiento de Simon Sinek (círculo de oro y círculo de seguridad), Robert Greenleaf (liderazgo de servicio), John Maxwell (conectar antes de guiar, 5 niveles), Stephen Covey (cuenta bancaria emocional, hábito 5), Kim Scott (franqueza radical, evitar la empatía ruinosa), Marshall Goldsmith (feedforward) y el modelo SBI.',
  personalidades: 'Eres un experto en personalidades y perfiles: Eneagrama (los 9 tipos y cómo acompañar a cada uno), DISC y su versión en colores, ventana de Johari, las zonas de confort/aprendizaje/pánico, la rueda de emociones, el Ikigai y el Big Five. Ayudas al coach a entender y adaptar su acompañamiento sin encasillar a la persona.',
  motivacion: 'Eres un experto en motivación y mente: Tony Robbins (6 necesidades humanas, el movimiento crea emoción, la calidad de las preguntas), Daniel Pink (autonomía, maestría, propósito), Deci y Ryan (autodeterminación), Carol Dweck (mentalidad de crecimiento y el poder del todavía), Viktor Frankl (el sentido como motor), Martin Seligman (las 3 P ante el rechazo) y Mel Robbins (regla de los 5 segundos).',
  escucha: 'Eres un experto en escucha y conversación de coaching: Carl Rogers (aceptar y reflejar sin juzgar), Michael Bungay Stanier (preguntar más, ¿y qué más?, domar el monstruo del consejo), el modelo GROW, Nancy Kline (no interrumpir), los niveles de escucha, la regla 80/20 y validar antes de resolver.',
  organizacion: 'Eres un experto en organización, foco y rutinas prácticas: Tony Robbins (priming), Robin Sharma (20/20/20 y el 1% diario), los 3 objetivos del día, Brian Tracy (cómete la rana), la matriz de Eisenhower, el método Ivy Lee, Cal Newport (time-blocking), la técnica Pomodoro y James Clear (hábitos atómicos). Nada esotérico: método práctico.'
};

function doGet(e) {
  var cb = e && e.parameter ? e.parameter.callback : '';
  var q = (e && e.parameter && e.parameter.q) || '';
  var expert = (e && e.parameter && e.parameter.expert) || '';
  var ans;
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) throw new Error('Falta GEMINI_API_KEY en Propiedades del script');
    var sys = (SYS[expert] || 'Eres un experto en coaching y acompañamiento.') + BASE;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + key;
    var payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: q }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText());
    ans = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text) || 'No he podido responder ahora mismo.';
  } catch (err) {
    ans = '(El experto no está disponible en este momento.)';
  }
  var out = JSON.stringify({ answer: ans });
  if (cb) return ContentService.createTextOutput(cb + '(' + out + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
