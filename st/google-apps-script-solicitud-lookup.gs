/**
 * Web App: busca fila por N° solicitud y devuelve JSON para st/dash-app.js.
 * Reemplaza TODO el código en Apps Script del libro P o E.
 * Libro P → CANAL = 'P' | Libro E → CANAL = 'E'
 * Implementar → nueva versión de la aplicación web.
 */

const CANAL = 'P'; // en el script del libro E cambia a 'E'

const NOMBRE_HOJA = 'Respuestas de formulario 1';

/** Si no hay encabezado reconocible para el N°, usar columna C (índice 2). */
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

/**
 * Encabezados reales de tus formularios (P = compra, E = envío).
 * Clave = texto exacto de la fila 1 de la hoja (salvo espacios finales).
 */
const FIELD_BY_HEADER_P = {
  'Dirección de correo electrónico': 'correo',
  'Nombre y Apellidos del Comprador': 'nombre',
  'RUT del Comprador': 'rut',
  'Modelo del dispositivo que envía': 'modelo',
  'Indique el color del dispositivo': 'color',
  'Indique la razón de revisión o servicio técnico.': 'falla1',
  'Carga la foto, captura o PDF del Comprobante de Compra (Boleta o Factura)': 'comprobante_url',
  'En caso de Reloj, indique el ID o IMEI del SoyMomo': 'imei',
};

const FIELD_BY_HEADER_E = {
  'Dirección de correo electrónico': 'correo',
  'Nombre completo': 'nombre',
  'Modelo del dispositivo que envía': 'modelo',
  'Indique el color del dispositivo': 'color',
  'Indique la razón de revisión o servicio técnico.': 'falla1',
  'En caso de Reloj, indique el (o los) ID o IMEI del SoyMomo': 'imei',
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

function valByHeader_(headersNorm, row, label) {
  var col = headersNorm.indexOf(norm_(label));
  if (col < 0) return '';
  var v = row[col];
  if (v === '' || v === null || v === undefined) return '';
  return String(v).trim();
}

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

function fieldMap_() {
  return CANAL === 'E' ? FIELD_BY_HEADER_E : FIELD_BY_HEADER_P;
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
    var map = fieldMap_();
    for (var headerText in map) {
      if (!Object.prototype.hasOwnProperty.call(map, headerText)) continue;
      var col = headersNorm.indexOf(norm_(headerText));
      if (col < 0) continue;
      var val = row[col];
      if (val === '' || val === null || val === undefined) continue;
      out[map[headerText]] = String(val).trim();
    }

    var otroFalla = valByHeader_(headersNorm, row, 'En caso de seleccionar otro, indique la falla:');
    if (otroFalla) {
      out.falla1 = (out.falla1 ? out.falla1 + ' — ' : '') + otroFalla;
    }

    if (CANAL === 'E') {
      var p2 = [];
      var s1 = valByHeader_(headersNorm, row, 'En caso de enviar un segundo dispositivo (opcional)');
      var c2 = valByHeader_(headersNorm, row, 'Indique el color del segundo dispositivo (opcional)');
      var f2 = valByHeader_(headersNorm, row, 'Indique la falla del segundo dispositivo (opcional).');
      if (s1) p2.push('2º equipo: ' + s1);
      if (c2) p2.push('Color 2º: ' + c2);
      if (f2) p2.push('Falla 2º: ' + f2);
      if (p2.length) out.segundo_equipo_txt = p2.join(' | ');
    }

    if (out.falla1) out.falla = out.falla1;
    return jsonOut_(out);
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}
