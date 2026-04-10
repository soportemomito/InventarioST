/**
 * Web App: leer / agregar filas en la hoja "Cambios ST" del libro:
 * https://docs.google.com/spreadsheets/d/1G0BgG84J0OJiJ7SWZyMfGxgMjJsFg56JuwpKuWznjQ4
 *
 * Implementar → Nueva implementación → Ejecutar como: yo · Acceso: (según tu política).
 * Guardar URL /exec en localStorage del navegador: st_cambios_st_script_url
 * o constante CAMBIOS_ST_SCRIPT_URL en st/dash-app.js.
 */

var CAMBIOS_ST_SPREADSHEET_ID = '1G0BgG84J0OJiJ7SWZyMfGxgMjJsFg56JuwpKuWznjQ4';
var CAMBIOS_ST_SHEET_NAME = 'Cambios ST';

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = e && e.parameter ? String(e.parameter.action || '') : '';
    if (action === 'listar_cambios') {
      var ss = SpreadsheetApp.openById(CAMBIOS_ST_SPREADSHEET_ID);
      var sh = ss.getSheetByName(CAMBIOS_ST_SHEET_NAME);
      if (!sh) return jsonOut_({ error: 'No existe la hoja: ' + CAMBIOS_ST_SHEET_NAME });
      var data = sh.getDataRange().getValues();
      if (!data.length) return jsonOut_({ headers: [], rows: [] });
      var headers = data[0].map(function (c) {
        return String(c || '').trim();
      });
      var rows = [];
      for (var r = 1; r < data.length; r++) {
        var o = {};
        var row = data[r];
        for (var c = 0; c < headers.length; c++) {
          var h = headers[c];
          if (!h) continue;
          var v = row[c];
          o[h] = v != null && v !== '' ? String(v) : '';
        }
        rows.push(o);
      }
      return jsonOut_({ ok: true, headers: headers, rows: rows });
    }
    return jsonOut_({ error: 'Usa ?action=listar_cambios' });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    var action = String(body.action || '');
    if (action !== 'append_cambio') return jsonOut_({ error: 'action inválida (usa append_cambio)' });

    var ss = SpreadsheetApp.openById(CAMBIOS_ST_SPREADSHEET_ID);
    var sh = ss.getSheetByName(CAMBIOS_ST_SHEET_NAME);
    if (!sh) return jsonOut_({ error: 'No existe la hoja: ' + CAMBIOS_ST_SHEET_NAME });

    var lastCol = sh.getLastColumn();
    if (lastCol < 1) return jsonOut_({ error: 'Hoja sin encabezados' });
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (c) {
      return String(c || '').trim();
    });

    var payload = body.row || body.data || body;
    var out = [];
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (!h) {
        out.push('');
        continue;
      }
      var val = payload[h];
      if (val == null || val === '') val = payload[normalizeKey_(h)] || '';
      out.push(val != null ? String(val) : '');
    }
    sh.appendRow(out);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}

function normalizeKey_(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
