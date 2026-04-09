/**
 * Web App para buscar una fila por N° de solicitud y devolver JSON al dash (st/dash-app.js).
 *
 * IMPORTANTE: reemplaza TODO el código del editor de Apps Script por este archivo
 * (no mezcles solo ENCABEZADOS con un doGet viejo: hace falta coincideNumSolicitud_ y el fallback columna C).
 *
 * Libro P → CANAL = 'P' | Libro E → CANAL = 'E'
 * Luego Implementar → nueva versión de la aplicación web.
 */

const CANAL = 'P'; // en el script del libro E cambia a 'E'

const NOMBRE_HOJA = 'Respuestas de formulario 1'; // vacío = primera pestaña; si no, nombre exacto

/** Si no se reconoce el encabezado del N°, usar columna C (índice 0-based = 2). */
const INDICE_FALLBACK_COL_NUM_SOLICITUD = 2;

const ENCABEZADOS_NUM_SOLICITUD = [
  'N° solicitud',
  'Nº solicitud',
  'Numero solicitud',
  'Número de solicitud',
  'Número solicitud',
  'N solicitud',
  'ID solicitud',
];

const FIELD_BY_HEADER = {
  Nombre: 'nombre',
  'Nombre completo': 'nombre',
  Correo: 'correo',
  Email: 'correo',
  'Correo electrónico': 'correo',
  'Correo electronico': 'correo',
  'Dirección de correo electrónico': 'correo',
  'Direccion de correo electronico': 'correo',
  RUT: 'rut',
  Producto: 'producto',
  Modelo: 'modelo',
  Color: 'color',
  Origen: 'origen',
  Falla: 'falla1',
  'Falla principal': 'falla1',
  'Falla 1': 'falla1',
  IMEI: 'imei',
};

function norm_(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (NOMBRE_HOJA && String(NOMBRE_HOJA).trim()) return ss.getSheetByName(NOMBRE_HOJA);
  return ss.getSheets()[0];
}

function indiceColumnaSolicitud_(headersNorm) {
  for (var i = 0; i < ENCABEZADOS_NUM_SOLICITUD.length; i++) {
    var idx = headersNorm.indexOf(norm_(ENCABEZADOS_NUM_SOLICITUD[i]));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Compara celda (número o texto) con num enviado en la URL. */
function coincideNumSolicitud_(celda, num) {
  var want = String(num || '').trim();
  if (!want) return false;
  if (celda === '' || celda === null || celda === undefined) return false;
  var got = typeof celda === 'number' && isFinite(celda) ? String(Math.trunc(celda)) : String(celda).trim();
  if (got === want) return true;
  var nw = parseFloat(want.replace(/\s/g, '').replace(',', '.'));
  var ng =
    typeof celda === 'number'
      ? celda
      : parseFloat(String(celda).replace(/\s/g, '').replace(',', '.'));
  if (!isNaN(nw) && !isNaN(ng) && isFinite(nw) && isFinite(ng) && nw === ng) return true;
  return false;
}

function doGet(e) {
  try {
    var num = String(e.parameter.num || '').trim();
    if (!num) return jsonOut_({ error: 'Falta num' });

    var sh = hoja_();
    var values = sh.getDataRange().getValues();
    if (!values.length) return jsonOut_({ error: 'Hoja vacía' });

    var headersNorm = values[0].map(function (h) {
      return norm_(h);
    });
    var idxSol = indiceColumnaSolicitud_(headersNorm);
    if (idxSol < 0) {
      idxSol = INDICE_FALLBACK_COL_NUM_SOLICITUD;
      if (idxSol < 0 || idxSol >= (values[0] || []).length)
        return jsonOut_({ error: 'No hay columna de N° solicitud en fila 1' });
    }

    var row = null;
    for (var r = 1; r < values.length; r++) {
      if (coincideNumSolicitud_(values[r][idxSol], num)) {
        row = values[r];
        break;
      }
    }
    if (!row) return jsonOut_({ error: 'No encontrado' });

    var out = { canal: CANAL };
    for (var headerText in FIELD_BY_HEADER) {
      if (!Object.prototype.hasOwnProperty.call(FIELD_BY_HEADER, headerText)) continue;
      var col = headersNorm.indexOf(norm_(headerText));
      if (col < 0) continue;
      var val = row[col];
      if (val === '' || val === null || val === undefined) continue;
      out[FIELD_BY_HEADER[headerText]] = String(val).trim();
    }
    if (out.falla1) out.falla = out.falla1;
    return jsonOut_(out);
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}
