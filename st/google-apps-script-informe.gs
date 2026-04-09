/**
 * Web App: generar Google Doc (plantilla orden de ingreso) y/o enviar por Gmail.
 *
 * Configuración:
 * 1) Editor → Configuración del proyecto (engranaje) → Propiedades de secuencias de comandos:
 *    Clave ST_SECRET = mismo valor que INFORME_SCRIPT_SECRET en st/dash-app.js
 * 2) Implementar → Nueva implementación → Aplicación web
 *    Ejecutar como: yo | Quién tiene acceso: Cualquier usuario (o restricción por dominio)
 * 3) Copia la URL …/exec en INFORME_SCRIPT_URL del dash.
 *
 * Plantillas (mismas que tus scripts de Sheets):
 * - P / S: Docs 1DlI3IA… carpeta 1Ni9vY9…
 * - E: Docs 1fcwUlv… carpeta 1RGITbd…
 */

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkSecret_(body) {
  var want = PropertiesService.getScriptProperties().getProperty('ST_SECRET');
  if (!want || body.secret !== want) {
    return 'No autorizado: configura ST_SECRET en Propiedades del proyecto (y el mismo valor en dash-app.js)';
  }
  return null;
}

var TEMPLATE_BY_CANAL = {
  E: {
    templateId: '1fcwUlvbcFSwDonKNCWlbjkISxPhpECOCbc78dhUOx9A',
    folderId: '1RGITbdAModR4aOIDNtfEor949CPLEv4B',
    namePrefix: 'Informe Entrada',
  },
  P: {
    templateId: '1DlI3IA_E5nXtLKv370ULVUDSPpIl-j9GcqdYcfv4m5s',
    folderId: '1Ni9vY9JcJYCmf22MUJlj93aI6Z5Ecp4L',
    namePrefix: 'Informe Entrada Recepción',
  },
};

function templateFor_(canal) {
  var c = String(canal || 'P').toUpperCase();
  if (c === 'E') return TEMPLATE_BY_CANAL.E;
  return TEMPLATE_BY_CANAL.P;
}

function applyPlaceholders_(body, d) {
  body.replaceText('<<Orden>>', String(d.orden != null ? d.orden : ''));
  body.replaceText('<<Fecha>>', String(d.ingresoST != null ? d.ingresoST : ''));
  body.replaceText('<<Nombre>>', String(d.nombre != null ? d.nombre : ''));
  body.replaceText('<<Correo>>', String(d.correo != null ? d.correo : ''));
  body.replaceText('<<Fecha_boleta>>', String(d.boleta != null ? d.boleta : ''));
  body.replaceText('<<Garantía>>', String(d.garantia != null ? d.garantia : ''));
  body.replaceText('<<Origen>>', String(d.origen != null ? d.origen : ''));
  body.replaceText('<<Producto>>', String(d.producto != null ? d.producto : ''));
  body.replaceText('<<Modelo>>', String(d.modelo != null ? d.modelo : ''));
  body.replaceText('<<Color>>', String(d.color != null ? d.color : ''));
  body.replaceText('<<ID>>', String(d.imei != null ? d.imei : ''));
  body.replaceText('<<Solución>>', String(d.solucion != null ? d.solucion : ''));
  body.replaceText('<<Adicionales>>', String(d.adicionales != null ? d.adicionales : ''));
  body.replaceText('<<Falla1>>', String(d.falla1 != null ? d.falla1 : ''));
  body.replaceText('<<Falla2>>', String(d.falla2 != null ? d.falla2 : ''));
  body.replaceText('<<Observaciones>>', String(d.observaciones != null ? d.observaciones : ''));
  body.replaceText('<<Carga>>', String(d.carga != null ? d.carga : ''));
  body.replaceText('<<Pantalla>>', String(d.pantalla != null ? d.pantalla : ''));
  body.replaceText('<<Botones>>', String(d.botones != null ? d.botones : ''));
  body.replaceText('<<SIM>>', String(d.sim != null ? d.sim : ''));
  body.replaceText('<<Caja>>', String(d.caja != null ? d.caja : ''));
  body.replaceText('<<Cable>>', String(d.cable != null ? d.cable : ''));
  body.replaceText('<<Adaptador>>', String(d.adaptador != null ? d.adaptador : ''));
  body.replaceText('<<Funda_Correa>>', String(d.funda != null ? d.funda : ''));
  body.replaceText('<<Mica>>', String(d.mica != null ? d.mica : ''));
  body.replaceText('<<Plazo>>', String(d.plazost != null ? d.plazost : ''));
  body.replaceText('<<Observaciones2>>', String(d.observaciones2 != null ? d.observaciones2 : ''));
  body.replaceText('<<Presupuesto>>', String(d.presupuesto != null ? d.presupuesto : ''));
  body.replaceText('<<RUT>>', String(d.rut != null ? d.rut : ''));
}

function generarDocDesdeOrden_(orden) {
  var cfg = templateFor_(orden.canal);
  var folder = DriveApp.getFolderById(cfg.folderId);
  var copy = DriveApp.getFileById(cfg.templateId).makeCopy(cfg.namePrefix + ' ' + orden.orden, folder);
  var doc = DocumentApp.openById(copy.getId());
  applyPlaceholders_(doc.getBody(), orden);
  doc.saveAndClose();
  return copy.getUrl();
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    var bad = checkSecret_(body);
    if (bad) return jsonOut_({ error: bad });

    var action = String(body.action || '');
    var orden = body.orden || {};

    if (action === 'generar') {
      if (!orden.orden) return jsonOut_({ error: 'Falta orden (num_orden)' });
      var url = generarDocDesdeOrden_(orden);
      return jsonOut_({ ok: true, url: url });
    }

    if (action === 'enviar') {
      var to = String(orden.correo || '').trim();
      if (!to) return jsonOut_({ error: 'Falta correo del cliente' });
      var num = String(orden.orden || '');
      var subject = 'SoyMomo — Informe ingreso ' + num;
      var docUrl = String(body.informe_url || body.informeUrl || '').trim();
      var evid = String(body.evidencias_url || body.evidenciasUrl || '').trim();

      if (!docUrl) {
        try {
          docUrl = generarDocDesdeOrden_(orden);
        } catch (err) {
          return jsonOut_({ error: 'No hay informe_url y no se pudo generar: ' + String(err.message || err) });
        }
      }

      var nombreEsc = orden.nombre ? String(orden.nombre).replace(/</g, '') : '';
      var html =
        '<p>Hola ' +
        nombreEsc +
        ',</p>' +
        '<p>Información de tu ingreso a Servicio Técnico (orden <strong>' +
        num +
        '</strong>).</p>' +
        '<p><a href="' +
        docUrl +
        '">Abrir informe (Google Docs)</a></p>';
      if (evid) {
        html += '<p><a href="' + evid + '">Enlace de evidencias</a></p>';
      }
      html += '<p>Saludos,<br/>SoyMomo</p>';

      GmailApp.sendEmail(to, subject, 'Abre el informe desde el enlace del correo HTML.', { htmlBody: html });
      return jsonOut_({ ok: true, informe_url: docUrl });
    }

    return jsonOut_({ error: 'action inválida (usa generar o enviar)' });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}
