'use strict';

const crypto = require('crypto');

/** @type {{ validaciones: object[], ordenes: object[], seq: Record<string, number> }} */
const data = {
  validaciones: [],
  ordenes: [],
  seq: { P: 0, E: 0, S: 0 }
};

function uuid() {
  return crypto.randomUUID();
}

function nextNumOrden(canal) {
  const c = (canal || 'S').toUpperCase().slice(0, 1);
  if (!data.seq[c]) data.seq[c] = 0;
  data.seq[c] += 1;
  return `${c}${data.seq[c]}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(iso) {
  if (!iso) return false;
  return String(iso).slice(0, 10) === todayISO();
}

function getStats() {
  const ordenes = data.ordenes;
  const pend = data.validaciones.filter(v => v.estado === 'pendiente');
  const hoyIngresos = ordenes.filter(o => isToday(o.fecha)).length;
  const recientes = [...ordenes]
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
    .slice(0, 8)
    .map(o => ({
      id: o.id,
      num_orden: o.num_orden,
      nombre: o.nombre,
      estado: o.estado,
      canal: o.canal
    }));
  const valItems = pend.slice(0, 20).map(v => ({
    id: v.id,
    nombre: v.nombre,
    correo: v.correo,
    rut: v.rut,
    producto: v.producto,
    modelo: v.modelo,
    canal: v.canal,
    origen: v.origen,
    color: v.color,
    imei: v.imei,
    falla1: v.falla1,
    falla2: v.falla2,
    obs: v.obs,
    created_at: v.created_at,
    initials: v.initials
  }));
  return {
    total: ordenes.length,
    en_revision: ordenes.filter(o => o.estado === 'En revisión').length,
    listo: ordenes.filter(o => o.estado === 'Listo').length,
    pendiente_presup: ordenes.filter(o => o.estado === 'Pendiente presupuesto').length,
    validacion_pendiente: pend.length,
    validacion_pendiente_items: valItems,
    hoy: { ingresos: hoyIngresos },
    recientes
  };
}

function listValidacion(estado) {
  const map = { pendiente: 'pendiente', aprobado: 'aprobado', rechazado: 'rechazado' };
  const e = map[estado] || estado;
  return data.validaciones.filter(v => v.estado === e);
}

function createValidacion(body) {
  const v = {
    id: uuid(),
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    nombre: body.nombre,
    correo: body.correo,
    rut: body.rut || null,
    imei: body.imei || null,
    producto: body.producto,
    modelo: body.modelo,
    origen: body.origen,
    color: body.color || null,
    falla1: body.falla1,
    falla2: body.falla2 || null,
    obs: body.obs || null,
    canal: (body.canal || 'S').toUpperCase(),
    initials: body.initials || null,
    rechazado_motivo: null
  };
  data.validaciones.push(v);
  return v;
}

function findValidacion(id) {
  return data.validaciones.find(x => x.id === id);
}

function aprobarValidacion(id, payload) {
  const v = findValidacion(id);
  if (!v || v.estado !== 'pendiente') return { error: 'Solicitud no encontrada o ya procesada' };
  v.estado = 'aprobado';
  v.aprobado_at = new Date().toISOString();

  const canal = v.canal;
  const num_orden = nextNumOrden(canal);
  const orden = {
    id: uuid(),
    num_orden,
    fecha: new Date().toISOString(),
    nombre: v.nombre,
    correo: v.correo,
    rut: v.rut,
    imei: v.imei,
    producto: v.producto,
    modelo: v.modelo,
    origen: v.origen,
    color: v.color,
    falla1: v.falla1,
    falla2: v.falla2,
    obs: v.obs,
    canal,
    estado: 'Ingresado',
    agente: payload.agente,
    garantia: !!payload.garantia,
    fecha_boleta: payload.fecha_boleta || null,
    numero_boleta: payload.numero_boleta || null,
    plazo: payload.plazo || null,
    plazo_dias_habiles: payload.plazo_dias_habiles || null,
    plazo_otro: payload.plazo_otro || null,
    obs2: payload.obs2 || null,
    mica: !!payload.mica,
    carga: !!payload.carga,
    pantalla: !!payload.pantalla,
    botones: !!payload.botones,
    sim: !!payload.sim,
    caja: !!payload.caja,
    cable: !!payload.cable,
    adaptador: !!payload.adaptador,
    funda: !!payload.funda,
    solucion: null,
    presupuesto: null,
    valor_cobrado: null,
    informe_url: null
  };
  data.ordenes.push(orden);
  v.orden_id = orden.id;
  v.num_orden = num_orden;
  return { orden, validacion: v };
}

function rechazarValidacion(id, motivo) {
  const v = findValidacion(id);
  if (!v || v.estado !== 'pendiente') return { error: 'Solicitud no encontrada' };
  v.estado = 'rechazado';
  v.rechazado_motivo = motivo;
  return { ok: true };
}

function listOrdenes({ limit, offset, q, estado, canal }) {
  let rows = [...data.ordenes];
  if (estado) rows = rows.filter(o => o.estado === estado);
  if (canal) rows = rows.filter(o => o.canal === canal);
  if (q) {
    const t = q.toLowerCase();
    rows = rows.filter(o =>
      (o.nombre && o.nombre.toLowerCase().includes(t)) ||
      (o.correo && o.correo.toLowerCase().includes(t)) ||
      (o.num_orden && String(o.num_orden).toLowerCase().includes(t)) ||
      (o.imei && String(o.imei).toLowerCase().includes(t))
    );
  }
  const total = rows.length;
  const slice = rows.slice(offset, offset + limit);
  return { items: slice, total };
}

function getOrden(id) {
  return data.ordenes.find(o => o.id === id);
}

function patchOrden(id, patch) {
  const o = getOrden(id);
  if (!o) return null;
  Object.assign(o, patch);
  return o;
}

function createOrdenManual(body) {
  const canal = (body.canal || 'S').toUpperCase();
  const num_orden = nextNumOrden(canal);
  const orden = {
    id: uuid(),
    num_orden,
    fecha: new Date().toISOString(),
    nombre: body.nombre,
    correo: body.correo,
    rut: body.rut || null,
    imei: body.imei || null,
    producto: body.producto,
    modelo: body.modelo,
    origen: body.origen,
    color: body.color || null,
    falla1: body.falla1,
    falla2: body.falla2 || null,
    obs: body.obs || null,
    canal,
    estado: 'Ingresado',
    agente: body.agente,
    garantia: !!body.garantia,
    fecha_boleta: body.fecha_boleta || null,
    numero_boleta: body.numero_boleta || null,
    plazo: body.plazo || null,
    plazo_dias_habiles: body.plazo_dias_habiles || null,
    plazo_otro: body.plazo_otro || null,
    numero_solicitud: body.numero_solicitud || null,
    mica: !!body.mica,
    carga: !!body.carga,
    pantalla: !!body.pantalla,
    botones: !!body.botones,
    sim: !!body.sim,
    caja: !!body.caja,
    cable: !!body.cable,
    adaptador: !!body.adaptador,
    funda: !!body.funda,
    solucion: null,
    presupuesto: null,
    valor_cobrado: null,
    informe_url: null
  };
  data.ordenes.push(orden);
  return orden;
}

function buscarSolicitudLocal(num, tipo) {
  const n = String(num || '').trim().toLowerCase();
  const t = (tipo || '').toUpperCase();
  for (const v of data.validaciones) {
    if (t && v.canal !== t) continue;
    const idm = String(v.id).toLowerCase() === n;
    const solic = v.numero_solicitud && String(v.numero_solicitud).toLowerCase() === n;
    if (idm || solic) {
      return {
        nombre: v.nombre,
        correo: v.correo,
        rut: v.rut,
        modelo: v.modelo,
        producto: v.producto,
        color: v.color,
        falla: v.falla1,
        falla1: v.falla1,
        imei: v.imei
      };
    }
  }
  for (const o of data.ordenes) {
    if (t && o.canal !== t) continue;
    if (String(o.num_orden).toLowerCase() === n || (o.numero_solicitud && String(o.numero_solicitud).toLowerCase() === n)) {
      return {
        nombre: o.nombre,
        correo: o.correo,
        rut: o.rut,
        modelo: o.modelo,
        producto: o.producto,
        color: o.color,
        falla: o.falla1,
        falla1: o.falla1,
        imei: o.imei
      };
    }
  }
  return null;
}

module.exports = {
  data,
  getStats,
  listValidacion,
  createValidacion,
  findValidacion,
  aprobarValidacion,
  rechazarValidacion,
  listOrdenes,
  getOrden,
  patchOrden,
  createOrdenManual,
  buscarSolicitudLocal
};
