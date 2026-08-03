/**
 * Odoo I+D+E · Backend de tracking de la formación del coach
 * ---------------------------------------------------------
 * Guarda cada evento (registro, vídeo visto, sección, tiempo) en una Hoja de Google
 * y los sirve al dashboard. Gratis, sin servidores, con la cuenta de Odoo.
 *
 * PASOS (hazlo con la cuenta mhgr@odoo.com):
 *  1. Crea una Hoja de cálculo de Google nueva (Drive → Nuevo → Hojas de cálculo).
 *  2. Extensiones → Apps Script. Borra lo que haya y pega TODO este archivo.
 *  3. Guarda. Implementar → Nueva implementación → tipo "Aplicación web".
 *       - Ejecutar como: Yo
 *       - Quién tiene acceso: Cualquier usuario
 *  4. Autoriza los permisos y copia la URL que termina en /exec.
 *  5. Pega esa URL en la constante TRACK_URL de:
 *       - index.html         (la formación, para que envíe los eventos)
 *       - dashboard.html     (para que los lea)
 *  Listo: cada vez que alguien entre y vea vídeos, quedará registrado y lo verás en el dashboard.
 */

var SHEET_NAME = 'eventos';

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['ts', 'email', 'name', 'ev', 'id', 'title', 'seconds', 'sid', 'path', 'raw']);
  }
  return sh;
}

// Recibe los eventos que envía la formación (navigator.sendBeacon).
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var data = d.data || {};
    sheet_().appendRow([
      d.ts || new Date().toISOString(),
      d.email || '', d.name || '', d.ev || '',
      data.id || '', data.title || '', data.seconds || '',
      d.sid || '', d.path || '', JSON.stringify(d)
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Sirve los eventos al dashboard. Soporta JSONP (?callback=) para evitar problemas de CORS.
function doGet(e) {
  var sh = sheet_();
  var rows = sh.getDataRange().getValues();
  rows.shift(); // cabecera
  var events = rows.map(function (r) {
    return {
      ts: r[0], email: r[1], name: r[2], ev: r[3],
      sid: r[7], path: r[8],
      data: { id: r[4], title: r[5], seconds: Number(r[6]) || 0 }
    };
  });
  var out = JSON.stringify(events);
  if (e && e.parameter && e.parameter.callback) {
    return ContentService.createTextOutput(e.parameter.callback + '(' + out + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
