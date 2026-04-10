/**
 Este va en el registro de ST
 * ═══════════════════════════════════════════════════════════════════════════
 */

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Si en doPost quedaron líneas antiguas (var bad = checkSecret_(body)), sin esta función falla el script.
 * Siempre permite; la versión actual de doPost no usa secreto.
 */
function checkSecret_(_body) {
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

/**
 * Plantilla única de **orden de salida ST** (Doc con marcadores <<…>>).
 * Coloca en el documento exactamente estos tokens (o añade más y replícalos aquí):
 *   <<Falla_final>> <<Tipo_falla>> <<Valor_reparacion>> <<Tecnico_nombre>>
 *   <<Repuesto_1>> <<Repuesto_2>> <<Repuesto_3>> <<Motivo_ST>> <<Revision>>
 *   (además de los de entrada: <<Solución>>, <<Observaciones>>, etc.)
 * ID: Formato salida ST (compartir el Doc con la cuenta que ejecuta el script).
 */
var SALIDA_ST_TEMPLATE_ID = '1D2kw7U-Qz5kwy6vMrtX_A3EvA6W7RrRN1qcGlimzGk4';

/**
 * Carpeta de salida por canal (misma lógica que informes de entrada).
 */
var SALIDA_TEMPLATE_BY_CANAL = {
  E: {
    templateId: SALIDA_ST_TEMPLATE_ID,
    folderId: '1RGITbdAModR4aOIDNtfEor949CPLEv4B',
    namePrefix: 'Informe Salida ST',
  },
  P: {
    templateId: SALIDA_ST_TEMPLATE_ID,
    folderId: '1Ni9vY9JcJYCmf22MUJlj93aI6Z5Ecp4L',
    namePrefix: 'Informe Salida Recepción ST',
  },
};

function salidaTemplateFor_(canal) {
  var c = String(canal || 'P').toUpperCase();
  if (c === 'E') return SALIDA_TEMPLATE_BY_CANAL.E;
  return SALIDA_TEMPLATE_BY_CANAL.P;
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
  body.replaceText('<<Evidencias_salida>>', String(d.evidencias_salida != null ? d.evidencias_salida : ''));
  /* Salida ST (técnico) — añade estos marcadores en la plantilla de salida */
  body.replaceText('<<Falla_final>>', String(d.falla_final != null ? d.falla_final : ''));
  body.replaceText('<<Tipo_falla>>', String(d.tipo_falla != null ? d.tipo_falla : ''));
  body.replaceText('<<Valor_reparacion>>', String(d.valor_reparacion != null ? d.valor_reparacion : ''));
  body.replaceText('<<Tecnico_nombre>>', String(d.tecnico_nombre != null ? d.tecnico_nombre : ''));
  body.replaceText('<<Repuesto_1>>', String(d.repuesto_1 != null ? d.repuesto_1 : ''));
  body.replaceText('<<Repuesto_2>>', String(d.repuesto_2 != null ? d.repuesto_2 : ''));
  body.replaceText('<<Repuesto_3>>', String(d.repuesto_3 != null ? d.repuesto_3 : ''));
  body.replaceText('<<Motivo_ST>>', String(d.motivo_st != null ? d.motivo_st : ''));
  body.replaceText('<<Revision>>', String(d.revision != null ? d.revision : ''));
}

/**
 * Variantes de correo: flujo (entrada | salida) × canal (E | P | S).
 * Reemplaza el HTML de cada rama con tus bodymailE, bodymailP, bodymail recepción (S) y salidas.
 */
function normalizeCanalMail_(c) {
  var x = String(c || 'P').toUpperCase();
  if (x === 'E' || x === 'P' || x === 'S') return x;
  return 'P';
}

function emailVariantKey_(flujo, canal) {
  var f = String(flujo || 'entrada').toLowerCase();
  if (f !== 'salida') f = 'entrada';
  var c = normalizeCanalMail_(canal);
  return f.toUpperCase() + '_' + c;
}

var LOGO_ENTRADA_PNG_ =
  'https://soymomo.es/cdn/shop/files/logo_horizontal-01_1200x1200.png?v=1661959213';

/** Normaliza estado de orden para la barra de progreso (bulk sender). */
function normalizeOrdenStatusForProgress_(raw) {
  var s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (s === 'recepcionado' || s === 'ingresado') return 'recepcionado';
  if (s.indexOf('revision') >= 0 || s.indexOf('revisión') >= 0) return 'en revision';
  if (s === 'revisado' || s === 'listo') return 'revisado';
  return 'en revision';
}

/** Barra de pasos HTML (3 etapas) según estado Firestore. */
function buildEntradaProgressHtml_(norm) {
  var active = norm || 'en revision';
  var c1 = active === 'recepcionado' ? '#2563eb' : '#e5e7eb';
  var c2 = active === 'en revision' ? '#f59e0b' : '#e5e7eb';
  var c3 = active === 'revisado' ? '#16a34a' : '#e5e7eb';
  var t1 = active === 'recepcionado' ? '#1e40af' : '#9ca3af';
  var t2 = active === 'en revision' ? '#92400e' : '#9ca3af';
  var t3 = active === 'revisado' ? '#15803d' : '#9ca3af';
  return (
    '<div style="margin:24px 0;padding:16px;background:#fff;border:1px solid #d6c7ff;border-radius:10px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;">' +
    '<tr>' +
    '<td align="center" style="width:33%;vertical-align:top;">' +
    '<div style="width:28px;height:28px;border-radius:50%;background:' +
    c1 +
    ';margin:0 auto 6px;line-height:28px;font-size:14px;color:#fff;">1</div>' +
    '<div style="font-size:11px;font-weight:700;color:' +
    t1 +
    ';">Recepcionado</div></td>' +
    '<td align="center" style="width:33%;vertical-align:top;">' +
    '<div style="width:28px;height:28px;border-radius:50%;background:' +
    c2 +
    ';margin:0 auto 6px;line-height:28px;font-size:14px;color:#fff;">2</div>' +
    '<div style="font-size:11px;font-weight:700;color:' +
    t2 +
    ';">En revisión</div></td>' +
    '<td align="center" style="width:33%;vertical-align:top;">' +
    '<div style="width:28px;height:28px;border-radius:50%;background:' +
    c3 +
    ';margin:0 auto 6px;line-height:28px;font-size:14px;color:#fff;">3</div>' +
    '<div style="font-size:11px;font-weight:700;color:' +
    t3 +
    ';">Revisado</div></td>' +
    '</tr></table></div>'
  );
}

function buildEntradaEmailHtml_P(nombreEsc, orden, docUrl, evid, statusNorm) {
  var prog = buildEntradaProgressHtml_(statusNorm);
  var bodyMain =
    'Te confirmamos que hemos recibido tu envío y el dispositivo ha sido ingresado a revisión por nuestro equipo especialista. Adjunto a este correo encontrarás la orden de ingreso con todos los detalles registrados al momento de la recepción.';
  return (
    '<div style="background:#6d28e9; padding:30px 10px; font-family: Arial, sans-serif;">' +
    '<div style="max-width:600px; margin:auto; background:#f5edff; border-radius:12px; padding:30px;">' +
    '<div style="text-align:center; margin-bottom:20px;"><img src="' +
    LOGO_ENTRADA_PNG_ +
    '" alt="SoyMomo" width="220" style="max-width:100%;height:auto;"/></div>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:22px 0;">' +
    '<h2 style="text-align:center; margin:0 0 10px 0; color:#2b0a3d;">¡Hemos recepcionado tu dispositivo! 📦</h2>' +
    '<p style="text-align:center; color:#5a3b6e; font-size:14px; margin-bottom:18px;">Tu equipo ha ingresado a nuestro servicio técnico</p>' +
    prog +
    '<div style="text-align:center;margin:18px 0;">' +
    '<span style="display:inline-block;background:#ede4ff;border:1px solid #d6c7ff;color:#2b0a3d;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">N° de Orden: ' +
    orden +
    '</span></div>' +
    '<p style="font-size:14px; color:#2b0a3d;">Hola <strong>' +
    nombreEsc +
    '</strong>,</p>' +
    '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">' +
    bodyMain +
    '</p>' +
    '<div style="text-align:center; margin:22px 0;">' +
    '<a href="' +
    docUrl +
    '" target="_blank" style="background:#7c3aed; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px; display:inline-block;">Ver orden de ingreso</a></div>' +
    (evid ? '<p style="text-align:center;font-size:13px;"><a href="' + evid + '" style="color:#6d28e9;">Enlace de evidencias</a></p>' : '') +
    '<div style="background:#ede4ff; border:1px solid #d6c7ff; padding:16px; border-radius:10px; margin:20px 0;">' +
    '<p style="margin:0; font-size:13px; color:#2b0a3d; text-align:center;">Plazo orientativo: <strong>5 días hábiles</strong> para el informe de salida.</p></div>' +
    '<p style="font-size:13px;color:#5a3b6e;">Equipo SoyMomo — ¡Saludos cordiales!<br/><strong>Servicio Técnico SoyMomo</strong></p>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:24px 0;">' +
    '<p style="font-size:12px; color:#6b4c7a; text-align:center; margin:0;">Servicio Técnico SoyMomo</p>' +
    '</div></div>'
  );
}

function buildEntradaEmailHtml_E(nombreEsc, orden, docUrl, evid, statusNorm) {
  var prog = buildEntradaProgressHtml_(statusNorm);
  var bodyMain =
    'Te confirmamos que hemos recibido tu envío desde tu ubicación y el dispositivo ha sido ingresado a revisión. Adjunto encontrarás la orden de ingreso. En el informe de salida te indicaremos los pasos para el retorno del equipo.';
  return (
    '<div style="background:#6d28e9; padding:30px 10px; font-family: Arial, sans-serif;">' +
    '<div style="max-width:600px; margin:auto; background:#f5edff; border-radius:12px; padding:30px;">' +
    '<div style="text-align:center; margin-bottom:20px;"><img src="' +
    LOGO_ENTRADA_PNG_ +
    '" alt="SoyMomo" width="220" style="max-width:100%;height:auto;"/></div>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:22px 0;">' +
    '<h2 style="text-align:center; margin:0 0 10px 0; color:#2b0a3d;">¡Hemos recepcionado tu dispositivo! 📦</h2>' +
    '<p style="text-align:center; color:#5a3b6e; font-size:14px; margin-bottom:18px;">Tu equipo ha ingresado a nuestro servicio técnico</p>' +
    prog +
    '<div style="text-align:center;margin:18px 0;">' +
    '<span style="display:inline-block;background:#ede4ff;border:1px solid #d6c7ff;color:#2b0a3d;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">N° de Orden: ' +
    orden +
    '</span></div>' +
    '<p style="font-size:14px; color:#2b0a3d;">Hola <strong>' +
    nombreEsc +
    '</strong>,</p>' +
    '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">' +
    bodyMain +
    '</p>' +
    '<div style="text-align:center; margin:22px 0;">' +
    '<a href="' +
    docUrl +
    '" target="_blank" style="background:#7c3aed; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px; display:inline-block;">Ver orden de ingreso</a></div>' +
    (evid ? '<p style="text-align:center;font-size:13px;"><a href="' + evid + '" style="color:#6d28e9;">Enlace de evidencias</a></p>' : '') +
    '<div style="background:#ede4ff; border:1px solid #d6c7ff; padding:16px; border-radius:10px; margin:20px 0;">' +
    '<p style="margin:0; font-size:13px; color:#2b0a3d; text-align:center;">Plazo orientativo: <strong>5 días hábiles</strong> para el informe de salida (incluirá instrucciones de envío de retorno si aplica).</p></div>' +
    '<p style="font-size:13px;color:#5a3b6e;">Equipo SoyMomo — ¡Saludos cordiales!<br/><strong>Servicio Técnico SoyMomo</strong></p>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:24px 0;">' +
    '<p style="font-size:12px; color:#6b4c7a; text-align:center; margin:0;">Servicio Técnico SoyMomo</p>' +
    '</div></div>'
  );
}

function buildSalidaEmailHtml_P(nombreEsc, orden, docUrl, evid, statusNorm) {
  var prog = buildEntradaProgressHtml_(statusNorm);
  var bodyMain =
    'Tu equipo ha sido revisado. Adjunto al cuerpo de este mensaje encontrarás el enlace al <strong>informe de salida</strong> con el detalle del servicio técnico.';
  return (
    '<div style="background:#6d28e9; padding:30px 10px; font-family: Arial, sans-serif;">' +
    '<div style="max-width:600px; margin:auto; background:#f5edff; border-radius:12px; padding:30px;">' +
    '<div style="text-align:center; margin-bottom:20px;"><img src="' +
    LOGO_ENTRADA_PNG_ +
    '" alt="SoyMomo" width="220" style="max-width:100%;height:auto;"/></div>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:22px 0;">' +
    '<h2 style="text-align:center; margin:0 0 10px 0; color:#2b0a3d;">Informe de salida · Servicio técnico</h2>' +
    '<p style="text-align:center; color:#5a3b6e; font-size:14px; margin-bottom:18px;">Estado de tu orden</p>' +
    prog +
    '<div style="text-align:center;margin:18px 0;">' +
    '<span style="display:inline-block;background:#ede4ff;border:1px solid #d6c7ff;color:#2b0a3d;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">N° de Orden: ' +
    orden +
    '</span></div>' +
    '<p style="font-size:14px; color:#2b0a3d;">Hola <strong>' +
    nombreEsc +
    '</strong>,</p>' +
    '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">' +
    bodyMain +
    '</p>' +
    '<div style="text-align:center; margin:22px 0;">' +
    '<a href="' +
    docUrl +
    '" target="_blank" style="background:#7c3aed; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px; display:inline-block;">Ver informe de salida</a></div>' +
    (evid ? '<p style="text-align:center;font-size:13px;"><a href="' + evid + '" style="color:#6d28e9;">Material adicional (fotos / video)</a></p>' : '') +
    '<p style="font-size:13px;color:#5a3b6e;">Equipo SoyMomo — ¡Saludos cordiales!<br/><strong>Servicio Técnico SoyMomo</strong></p>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:24px 0;">' +
    '<p style="font-size:12px; color:#6b4c7a; text-align:center; margin:0;">Servicio Técnico SoyMomo</p>' +
    '</div></div>'
  );
}

function buildSalidaEmailHtml_E(nombreEsc, orden, docUrl, evid, statusNorm) {
  var prog = buildEntradaProgressHtml_(statusNorm);
  var bodyMain =
    'Tu equipo ha sido revisado. En el informe de salida encontrarás el detalle del servicio y, si aplica, las instrucciones para el retorno del dispositivo.';
  return (
    '<div style="background:#6d28e9; padding:30px 10px; font-family: Arial, sans-serif;">' +
    '<div style="max-width:600px; margin:auto; background:#f5edff; border-radius:12px; padding:30px;">' +
    '<div style="text-align:center; margin-bottom:20px;"><img src="' +
    LOGO_ENTRADA_PNG_ +
    '" alt="SoyMomo" width="220" style="max-width:100%;height:auto;"/></div>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:22px 0;">' +
    '<h2 style="text-align:center; margin:0 0 10px 0; color:#2b0a3d;">Informe de salida · Canal envío</h2>' +
    '<p style="text-align:center; color:#5a3b6e; font-size:14px; margin-bottom:18px;">Estado de tu orden</p>' +
    prog +
    '<div style="text-align:center;margin:18px 0;">' +
    '<span style="display:inline-block;background:#ede4ff;border:1px solid #d6c7ff;color:#2b0a3d;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">N° de Orden: ' +
    orden +
    '</span></div>' +
    '<p style="font-size:14px; color:#2b0a3d;">Hola <strong>' +
    nombreEsc +
    '</strong>,</p>' +
    '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">' +
    bodyMain +
    '</p>' +
    '<div style="text-align:center; margin:22px 0;">' +
    '<a href="' +
    docUrl +
    '" target="_blank" style="background:#7c3aed; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:bold; font-size:15px; display:inline-block;">Ver informe de salida</a></div>' +
    (evid ? '<p style="text-align:center;font-size:13px;"><a href="' + evid + '" style="color:#6d28e9;">Material adicional (fotos / video)</a></p>' : '') +
    '<p style="font-size:13px;color:#5a3b6e;">Equipo SoyMomo — ¡Saludos cordiales!<br/><strong>Servicio Técnico SoyMomo</strong></p>' +
    '<hr style="border:none; border-top:1px solid #d6c7ff; margin:24px 0;">' +
    '<p style="font-size:12px; color:#6b4c7a; text-align:center; margin:0;">Servicio Técnico SoyMomo</p>' +
    '</div></div>'
  );
}

function buildSalidaEmailHtml_S(nombreEsc, orden, docUrl, evid, statusNorm) {
  var base = buildSalidaEmailHtml_P(nombreEsc, orden, docUrl, evid, statusNorm);
  var extra =
    '<div style="background:#fff4cc;border:1px solid #ffe08a;padding:14px;border-radius:8px;margin:16px 0;">' +
    '<p style="margin:0;font-size:13px;color:#2b0a3d;text-align:center;"><strong>Retiro en tienda</strong><br/>' +
    'Ricardo Lyon 1688, Providencia · Lun–Vie 10:30–19:30, Sáb 10:00–14:45</p></div>';
  return base.replace(
    '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">',
    extra + '<p style="font-size:14px; color:#2b0a3d; line-height:1.65;">'
  );
}

function buildEntradaEmailHtml_S(nombreEsc, orden, docUrl, evid, statusNorm) {
  var base = buildEntradaEmailHtml_P(nombreEsc, orden, docUrl, evid, statusNorm);
  var extra =
    '<div style="background:#fff4cc;border:1px solid #ffe08a;padding:14px;border-radius:8px;margin:16px 0;">' +
    '<p style="margin:0;font-size:13px;color:#2b0a3d;text-align:center;"><strong>Retiro en tienda</strong><br/>' +
    'Ricardo Lyon 1688, Providencia · Lun–Vie 10:30–19:30, Sáb 10:00–14:45<br/>' +
    'Pagos: débito, crédito o efectivo.</p></div>';
  return base.replace(
    '<div style="background:#ede4ff; border:1px solid #d6c7ff; padding:16px; border-radius:10px; margin:20px 0;">',
    extra +
      '<div style="background:#ede4ff; border:1px solid #d6c7ff; padding:16px; border-radius:10px; margin:20px 0;">'
  );
}

function buildEmailForVariant_(key, nombreEsc, num, docUrl, evid, ordenStatusRaw) {
  var mapSubject = {
    ENTRADA_E: 'SoyMomo — Informe ingreso (canal E) ' + num,
    ENTRADA_P: 'SoyMomo — Informe ingreso (canal P) ' + num,
    ENTRADA_S: 'SoyMomo — Informe ingreso (recepción S) ' + num,
    SALIDA_E: 'SoyMomo — Retiro / salida ST (E) ' + num,
    SALIDA_P: 'SoyMomo — Retiro / salida ST (P) ' + num,
    SALIDA_S: 'SoyMomo — Retiro / salida ST (S) ' + num,
  };
  var subject = mapSubject[key] || mapSubject['ENTRADA_P'];
  var stNorm = normalizeOrdenStatusForProgress_(ordenStatusRaw);

  if (key === 'ENTRADA_P' || key === 'ENTRADA_E' || key === 'ENTRADA_S') {
    var htmlBody;
    if (key === 'ENTRADA_E') htmlBody = buildEntradaEmailHtml_E(nombreEsc, num, docUrl, evid, stNorm);
    else if (key === 'ENTRADA_S') htmlBody = buildEntradaEmailHtml_S(nombreEsc, num, docUrl, evid, stNorm);
    else htmlBody = buildEntradaEmailHtml_P(nombreEsc, num, docUrl, evid, stNorm);
    return { subject: subject, html: htmlBody };
  }

  if (key === 'SALIDA_P' || key === 'SALIDA_E' || key === 'SALIDA_S') {
    var htmlSal;
    if (key === 'SALIDA_E') htmlSal = buildSalidaEmailHtml_E(nombreEsc, num, docUrl, evid, stNorm);
    else if (key === 'SALIDA_S') htmlSal = buildSalidaEmailHtml_S(nombreEsc, num, docUrl, evid, stNorm);
    else htmlSal = buildSalidaEmailHtml_P(nombreEsc, num, docUrl, evid, stNorm);
    return { subject: subject, html: htmlSal };
  }

  var mapIntro = {
    SALIDA_E: 'Actualización sobre retiro o cierre de tu orden (canal <strong>E</strong>), <strong>' + num + '</strong>.',
    SALIDA_P: 'Actualización sobre retiro o cierre de tu orden (canal <strong>P</strong>), <strong>' + num + '</strong>.',
    SALIDA_S: 'Actualización sobre retiro o cierre de tu orden (canal <strong>S</strong>), <strong>' + num + '</strong>.',
  };
  var intro = mapIntro[key] || mapIntro['SALIDA_P'];
  var html =
    '<p>Hola ' +
    nombreEsc +
    ',</p>' +
    '<p>' +
    intro +
    '</p>' +
    '<p><a href="' +
    docUrl +
    '">Abrir informe (Google Docs)</a></p>';
  if (evid) {
    html += '<p><a href="' + evid + '">Enlace de evidencias</a></p>';
  }
  html += '<p>Saludos,<br/>SoyMomo</p>';
  return { subject: subject, html: html };
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

function generarDocSalidaDesdeOrden_(orden) {
  var cfg = salidaTemplateFor_(orden.canal);
  var folder = DriveApp.getFolderById(cfg.folderId);
  var copy = DriveApp.getFileById(cfg.templateId).makeCopy(cfg.namePrefix + ' ' + orden.orden, folder);
  var doc = DocumentApp.openById(copy.getId());
  applyPlaceholders_(doc.getBody(), orden);
  doc.saveAndClose();
  return copy.getUrl();
}

/** Abrir la URL /exec en el navegador hace GET; sin esto aparece "doGet not found". El dash usa POST. */
function doGet() {
  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>ST informe · Web App</title></head><body style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;line-height:1.5;">' +
    '<h2 style="margin:0 0 12px;">Web App activa</h2>' +
    '<p>Esta dirección está bien publicada. El panel Servicio Técnico la usa con <strong>POST</strong> (acciones <code>generar</code>, <code>generar_salida</code> y <code>enviar</code>), no al abrirla aquí en el navegador.</p>' +
    '<p style="color:#666;font-size:14px;">URL en constante <code>INFORME_SCRIPT_URL</code> de <code>st/dash-app.js</code>.</p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ST informe');
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');

    var action = String(body.action || '');
    var orden = body.orden || {};

    if (action === 'generar') {
      if (!orden.orden) return jsonOut_({ error: 'Falta orden (num_orden)' });
      var url = generarDocDesdeOrden_(orden);
      return jsonOut_({ ok: true, url: url });
    }

    if (action === 'generar_salida') {
      if (!orden.orden) return jsonOut_({ error: 'Falta orden (num_orden)' });
      var urlSal = generarDocSalidaDesdeOrden_(orden);
      return jsonOut_({ ok: true, url: urlSal });
    }

    if (action === 'enviar') {
      var to = String(orden.correo || '').trim();
      if (!to) return jsonOut_({ error: 'Falta correo del cliente' });
      var num = String(orden.orden || '');
      var flujoCorreo = String(body.flujo_correo || body.flujoCorreo || '').toLowerCase();
      if (!flujoCorreo) {
        var legacyTipo = String(body.tipo_correo || body.tipoCorreo || '').toLowerCase();
        if (legacyTipo === 'salidas') flujoCorreo = 'salida';
        else flujoCorreo = 'entrada';
      }
      if (flujoCorreo !== 'salida') flujoCorreo = 'entrada';

      var docUrl = String(body.informe_url || body.informeUrl || '').trim();
      var evid = String(body.evidencias_url || body.evidenciasUrl || '').trim();

      if (!docUrl) {
        try {
          docUrl = flujoCorreo === 'salida' ? generarDocSalidaDesdeOrden_(orden) : generarDocDesdeOrden_(orden);
        } catch (err) {
          return jsonOut_({ error: 'No hay informe_url y no se pudo generar: ' + String(err.message || err) });
        }
      }

      var nombreEsc = orden.nombre ? String(orden.nombre).replace(/</g, '') : '';
      var vKey = emailVariantKey_(flujoCorreo, orden.canal);
      var ordenStatusRaw =
        body.orden_status ||
        body.ordenStatus ||
        orden.orden_status ||
        orden.estado ||
        orden.status ||
        'en revisión';
      var mail = buildEmailForVariant_(vKey, nombreEsc, num, docUrl, evid, ordenStatusRaw);

      GmailApp.sendEmail(to, mail.subject, 'Abre el informe desde el enlace del correo HTML.', { htmlBody: mail.html });
      return jsonOut_({ ok: true, informe_url: docUrl });
    }

    return jsonOut_({ error: 'action inválida (usa generar, generar_salida o enviar)' });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}

/**
 * Si la Web App dice que falta https://www.googleapis.com/auth/documents:
 * Abre script.google.com en incógnito (o solo la cuenta que DESPLIEGA la Web App).
 * Ejecutar → autorizarDocumentos → acepta permisos. Luego autorizarPlantillaSalida.
 * Implementar → Gestionar implementaciones → Web app → Nueva versión → Implementar.
 * Si persiste: myaccount.google.com/permissions → revoca acceso a Apps Script del proyecto → repetir Ejecutar.
 */
function autorizarDocumentos() {
  var p = templateFor_('P');
  DocumentApp.openById(p.templateId);
  var e = templateFor_('E');
  DocumentApp.openById(e.templateId);
}

function autorizarPlantillaSalida() {
  DocumentApp.openById(SALIDA_ST_TEMPLATE_ID);
}
