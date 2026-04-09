/**
 * Panel ST — datos en Cloud Firestore (colecciones st_validaciones, st_ordenes).
 * Misma app Firebase que el inventario; el usuario debe entrar con sesión de Google ya activa.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  runTransaction,
  getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDzCUE7t1T3oyM48jej8gWTRU_n2Cb1hec',
  authDomain: 'soymomo-inventario.firebaseapp.com',
  projectId: 'soymomo-inventario',
  storageBucket: 'soymomo-inventario.firebasestorage.app',
  messagingSenderId: '807454155183',
  appId: '1:807454155183:web:09b5211a01c2ea197d8f5a',
};

const COL_V = 'st_validaciones';
const COL_O = 'st_ordenes';
const META_SERIAL = 'st_meta';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const LS_INVENTARIO_URL = 'soymomo_inventario_url';

(function consumeStTokenFromHash() {
  if (typeof location === 'undefined' || !location.hash) return;
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(raw);
  const t = params.get('st_token');
  const inv = params.get('inv');
  if (inv && inv.startsWith('http')) {
    try {
      localStorage.setItem(LS_INVENTARIO_URL, inv.replace(/\/$/, ''));
    } catch (_) {}
  }
  if (!t) return;
  try {
    sessionStorage.setItem('st_token', t.includes('%') ? decodeURIComponent(t) : t);
  } catch (_) {
    sessionStorage.setItem('st_token', t);
  }
  history.replaceState(null, '', location.pathname + location.search);
})();

function inventarioLoginUrl() {
  try {
    const b = localStorage.getItem(LS_INVENTARIO_URL);
    if (b && b.startsWith('http')) {
      const base = b.replace(/\/$/, '');
      const sep = base.includes('?') ? '&' : '?';
      return base + sep + 'continue=st';
    }
  } catch (_) {}
  return '../index.html?continue=st';
}

const PAGE_SIZE = 30;
/** Web Apps Apps Script por canal (implementación “Cualquiera” o según tu política) */
const SHEETS_EXEC_URL_P =
  'https://script.google.com/macros/s/AKfycbw9b56uioUAC1RsF7QSu-SnnddYtJVqRV-9NFxLppw3i0H5swgsvnaE2HN1xZiEG-U/exec';
const SHEETS_EXEC_URL_E =
  'https://script.google.com/macros/s/AKfycbw6VM8fta5QuZRHBkXztfrL-ozQaV0PNL47AN4wZJnFTcXjllEOJgtpuQI7hxa0EKEL/exec';

/** Web App st/google-apps-script-informe.gs — deja URL vacía hasta publicar e implementar */
const INFORME_SCRIPT_URL = '';
/** Misma clave que ST_SECRET en Propiedades del proyecto (Apps Script) */
const INFORME_SCRIPT_SECRET = '';

/** Opcional: sin redeploy, en consola del navegador → localStorage.setItem('st_informe_script_url','https://…/exec') */
const LS_INFORME_URL = 'st_informe_script_url';
const LS_INFORME_SECRET = 'st_informe_script_secret';

function getInformeScriptUrl() {
  try {
    const u = (localStorage.getItem(LS_INFORME_URL) || '').trim();
    if (u) return u;
  } catch (_) {}
  return (INFORME_SCRIPT_URL || '').trim();
}

function getInformeScriptSecret() {
  try {
    const s = (localStorage.getItem(LS_INFORME_SECRET) || '').trim();
    if (s) return s;
  } catch (_) {}
  return (INFORME_SCRIPT_SECRET || '').trim();
}

function informeConfigFaltaMsg() {
  return (
    'Informe (Google Docs): falta la Web App. Rellena INFORME_SCRIPT_URL e INFORME_SCRIPT_SECRET en st/dash-app.js, ' +
    'o en consola: localStorage.setItem("' +
    LS_INFORME_URL +
    '","https://script.google.com/macros/s/…/exec") y lo mismo para ' +
    LS_INFORME_SECRET +
    ' con tu ST_SECRET. Luego recarga el dash.'
  );
}

const LS_CAMBIOS = 'st_cambios_garantia_v1';
const LOGO_URL_CAMBIOS_ST =
  'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExdno4OXRqYWFwdW54ZWxvY24wdGk3OHdsMGJ0b3hwMmVpdmxzYTRkNCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/DwJu8tKcfVX9aRPWsD/giphy.gif';

let TOKEN = '';
let AGENT = null;
let valEstadoTab = 'pendiente';
let valPendingId = null;
let ordenesOffset = 0;
let ordenesTotal = 0;
let ordenesDebounce = null;
let ordenesCache = [];
let currentOrden = null;
let pendingAprobacion = { id: null, canal: null };
let pendingRechazoId = null;
let emailTarget = null;
let nuevaOrdenCanal = null;

function tsToMillis(v) {
  if (!v) return 0;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v.seconds != null) return v.seconds * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function tsToIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v.seconds != null) return new Date(v.seconds * 1000).toISOString();
  if (typeof v === 'string') return v;
  return null;
}

function normalizeValidacion(id, data) {
  return {
    id,
    ...data,
    created_at: tsToIso(data.created_at) || data.created_at,
    aprobado_at: tsToIso(data.aprobado_at) || data.aprobado_at,
  };
}

function normalizeOrden(id, data) {
  return {
    id,
    ...data,
    fecha: tsToIso(data.fecha) || data.fecha,
  };
}

function getSheetsExecBase(canal) {
  if (canal === 'P') return SHEETS_EXEC_URL_P.replace(/\/$/, '');
  if (canal === 'E') return SHEETS_EXEC_URL_E.replace(/\/$/, '');
  return '';
}

function buildSheetsExecUrl(base, num) {
  const u = base.replace(/\/$/, '');
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}num=${encodeURIComponent(num)}`;
}

/**
 * Llama al Web App de Google Apps Script. Si no hay URL, error de red o JSON con error → null (fallback Firestore).
 */
async function fetchSolicitudFromSheets(num, tipo) {
  const t = (tipo || '').toUpperCase();
  if (t !== 'P' && t !== 'E') return null;
  const base = getSheetsExecBase(t);
  if (!base) return null;
  const url = buildSheetsExecUrl(base, num);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Sheets: HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data && data.error) {
    const err = String(data.error);
    // "No encontrado" → seguir buscando en Firestore; el resto son errores de configuración/hoja
    if (err === 'No encontrado') return null;
    throw new Error(`Sheets: ${err}`);
  }
  const useful =
    data &&
    (data.nombre ||
      data.correo ||
      data.rut ||
      data.producto ||
      data.modelo ||
      data.falla1 ||
      data.falla ||
      data.imei ||
      data.comprobante_url ||
      data.segundo_equipo_txt);
  if (!useful) {
    const extra = data ? Object.keys(data).filter((k) => k !== 'canal' && k !== 'falla') : [];
    if (data && data.canal != null && extra.length === 0) {
      throw new Error(
        'Sheets: El N° existe en la hoja pero no se mapeó ningún dato. Actualiza Apps Script con st/google-apps-script-solicitud-lookup.gs (FIELD_BY_HEADER / email de formulario) y vuelve a implementar.'
      );
    }
    return null;
  }
  return data;
}

function setFirestoreHint() {
  const el = document.getElementById('api-hint');
  if (!el) return;
  el.style.display = '';
  el.innerHTML =
    '<span title="ST usa Firestore: st_validaciones (ingreso) y st_ordenes (dash). No son products/movements. Colecciones st_* solo aparecen en la consola tras el primer documento.">Datos: <strong>Firebase</strong><code style="font-size:10px;margin:0 4px;">st_validaciones · st_ordenes</code>' +
    ' · Sheets <span style="color:#64748b;">P/E</span></span>';
}

async function waitForFirebaseUser(maxMs = 12000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      unsub();
      reject(new Error('timeout'));
    }, maxMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(t);
        unsub();
        resolve(user);
      }
    });
  });
}

async function checkAuth() {
  TOKEN = sessionStorage.getItem('st_token') || '';
  if (!TOKEN) {
    window.location.replace(inventarioLoginUrl());
    return false;
  }
  try {
    await waitForFirebaseUser();
  } catch {
    toast('No hay sesión de Firebase. Entra desde Inventario (Servicio Técnico).', 'warning');
    window.location.replace(inventarioLoginUrl());
    return false;
  }
  try {
    const payload = JSON.parse(atob(TOKEN.split('.')[1]));
    AGENT = { name: payload.name || payload.email || 'Agente', email: payload.email || '' };
  } catch {
    AGENT = { name: auth.currentUser?.displayName || auth.currentUser?.email || 'Agente', email: auth.currentUser?.email || '' };
  }
  const initials = (AGENT.name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
  document.getElementById('agentAvatarSidebar').textContent = initials;
  document.getElementById('agentNameSidebar').textContent = AGENT.name;
  try {
    await getCountFromServer(query(collection(db, COL_V), limit(1)));
  } catch (e) {
    toast('Firestore: ' + (e.code || e.message) + '. Revisa reglas de seguridad.', 'error');
    return false;
  }
  return true;
}

function salir() {
  sessionStorage.removeItem('st_token');
  window.location.href = '../index.html';
}

function toast(msg, type = 'info', duration = 3500) {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  validacion: 'Proceso de validación',
  ordenes: 'Órdenes',
  cambios: 'Cambios garantía ST',
};

function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-view]').forEach((n) => n.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById('topbarTitle').textContent = VIEW_TITLES[name] || name;
  const searchViews = ['ordenes'];
  document.getElementById('topbarSearchWrap').style.display = searchViews.includes(name) ? 'flex' : 'none';
  if (name === 'dashboard') loadDashboard();
  if (name === 'validacion') loadValidacion();
  if (name === 'ordenes') loadOrdenes();
  if (name === 'cambios') loadCambiosST();
}

const ESTADO_BADGE = {
  Ingresado: '<span class="badge badge-blue">Ingresado</span>',
  'En revisión': '<span class="badge badge-amber">En revisión</span>',
  Listo: '<span class="badge badge-green">Listo ✓</span>',
  Entregado: '<span class="badge badge-gray">Entregado</span>',
  'No reparado': '<span class="badge badge-red">No reparado</span>',
  'Pendiente presupuesto': '<span class="badge badge-purple">Pdte. presupuesto</span>',
};

function estadoBadge(e) {
  return ESTADO_BADGE[e] || `<span class="badge badge-gray">${e || '—'}</span>`;
}

function canalPill(c) {
  const labels = { P: 'Garantía', E: 'Sin Garantía', S: 'Presencial' };
  return `<span class="canal-pill canal-${c}">${c} · ${labels[c] || c}</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function formatPlazoOrden(o) {
  if (!o) return '—';
  if (o.plazo_dias_habiles) {
    const base =
      o.plazo_dias_habiles === 'otro' ? o.plazo_otro || 'Otro' : `${o.plazo_dias_habiles} días hábiles`;
    if (o.plazo && String(o.plazo).trim()) return `${base} · ${o.plazo}`;
    return base;
  }
  if (o.plazo) {
    const tryFmt = fmtDate(o.plazo);
    return tryFmt !== '—' ? tryFmt : String(o.plazo);
  }
  return '—';
}

function ynAcc_(o, key) {
  return o[key] ? 'Sí' : 'No';
}

/** Payload para Apps Script (marcadores <<…>> del Doc). */
function buildInformePayloadFromOrden(o) {
  const boleta =
    o.fecha_boleta && String(o.fecha_boleta).trim()
      ? String(o.fecha_boleta).slice(0, 10)
      : o.numero_boleta || '—';
  const adic =
    o.valor_cobrado != null && o.valor_cobrado !== ''
      ? '$' + Number(o.valor_cobrado).toLocaleString('es-CL')
      : '—';
  const pres =
    o.presupuesto != null && o.presupuesto !== ''
      ? '$' + Number(o.presupuesto).toLocaleString('es-CL')
      : '—';
  return {
    canal: o.canal,
    orden: String(o.num_orden || ''),
    ingresoST: fmtDate(o.fecha),
    rut: o.rut || '—',
    nombre: o.nombre || '—',
    correo: o.correo || '—',
    boleta,
    garantia: o.garantia ? 'Sí' : 'No',
    origen: o.origen || '—',
    producto: o.producto || '—',
    modelo: o.modelo || '—',
    color: o.color || '—',
    imei: o.imei || '—',
    solucion: o.solucion || '—',
    adicionales: adic,
    falla1: o.falla1 || '—',
    falla2: o.falla2 || '—',
    observaciones: o.obs || '—',
    carga: ynAcc_(o, 'carga'),
    pantalla: ynAcc_(o, 'pantalla'),
    botones: ynAcc_(o, 'botones'),
    sim: ynAcc_(o, 'sim'),
    caja: ynAcc_(o, 'caja'),
    cable: ynAcc_(o, 'cable'),
    adaptador: ynAcc_(o, 'adaptador'),
    funda: ynAcc_(o, 'funda'),
    mica: ynAcc_(o, 'mica'),
    plazost: formatPlazoOrden(o),
    observaciones2: o.obs2 || '—',
    presupuesto: pres,
  };
}

async function postInformeScript(bodyObj) {
  const base = getInformeScriptUrl().replace(/\/$/, '');
  const res = await fetch(base, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || 'Respuesta no JSON del script');
  }
  if (!res.ok || j.error) throw new Error(j.error || 'Error del script');
  return j;
}

async function loadDashboard() {
  document.getElementById('dashFecha').textContent =
    'Hoy, ' + new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  try {
    const [totalSnap, pendVSnap, revSnap, listoSnap, presSnap, pendItemsSnap, ordenesSnap] = await Promise.all([
      getCountFromServer(collection(db, COL_O)),
      getCountFromServer(query(collection(db, COL_V), where('estado', '==', 'pendiente'))),
      getCountFromServer(query(collection(db, COL_O), where('estado', '==', 'En revisión'))),
      getCountFromServer(query(collection(db, COL_O), where('estado', '==', 'Listo'))),
      getCountFromServer(query(collection(db, COL_O), where('estado', '==', 'Pendiente presupuesto'))),
      getDocs(query(collection(db, COL_V), where('estado', '==', 'pendiente'), limit(200))),
      getDocs(query(collection(db, COL_O), orderBy('fecha', 'desc'), limit(120))),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    let hoyIngresos = 0;
    const ordenesRecientes = [];
    ordenesSnap.forEach((d) => {
      const o = normalizeOrden(d.id, d.data());
      const f = (o.fecha || '').slice(0, 10);
      if (f === today) hoyIngresos++;
      ordenesRecientes.push(o);
    });
    ordenesRecientes.sort((a, b) => tsToMillis(b.fecha) - tsToMillis(a.fecha));
    const recientes = ordenesRecientes.slice(0, 8).map((o) => ({
      id: o.id,
      num_orden: o.num_orden,
      nombre: o.nombre,
      estado: o.estado,
      canal: o.canal,
    }));

    const pendList = pendItemsSnap.docs
      .map((d) => normalizeValidacion(d.id, d.data()))
      .sort((a, b) => tsToMillis(b.created_at) - tsToMillis(a.created_at))
      .slice(0, 20)
      .map((v) => ({
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
        initials: v.initials,
      }));

    const stats = {
      total: totalSnap.data().count,
      en_revision: revSnap.data().count,
      listo: listoSnap.data().count,
      pendiente_presup: presSnap.data().count,
      validacion_pendiente: pendVSnap.data().count,
      validacion_pendiente_items: pendList,
      hoy: { ingresos: hoyIngresos },
      recientes,
    };

    renderStats(stats);
    renderRecentOrders(stats.recientes || []);
    renderDashVal(stats.validacion_pendiente_items || []);
    const badge = document.getElementById('valBadge');
    const cnt = stats.validacion_pendiente || 0;
    badge.textContent = cnt;
    badge.classList.toggle('hidden', cnt === 0);
  } catch (e) {
    if (e.code === 'failed-precondition') {
      toast('Firestore: falta índice compuesto. Abre el enlace del error en la consola del navegador.', 'error');
    } else {
      toast('Error cargando estadísticas: ' + e.message, 'error');
    }
  }
}

function renderStats(s) {
  const grid = document.getElementById('statsGrid');
  const items = [
    { label: 'Total órdenes', value: s.total ?? '—', sub: `Hoy: ${s.hoy?.ingresos ?? 0} ingresadas` },
    { label: 'En revisión', value: s.en_revision ?? '—' },
    { label: 'Listos p/entrega', value: s.listo ?? '—', dot: '#16a34a' },
    { label: 'Pdte. presupuesto', value: s.pendiente_presup ?? '—', dot: '#d97706' },
    { label: 'Validación pend.', value: s.validacion_pendiente ?? '—', dot: '#7c3aed' },
  ];
  grid.innerHTML = items
    .map(
      (i) => `
    <div class="stat-card">
      <div class="stat-label">${i.label}</div>
      <div class="stat-value">${i.value}</div>
      ${i.sub ? `<div class="stat-sub">${i.sub}</div>` : ''}
    </div>
  `
    )
    .join('');
}

function renderRecentOrders(rows) {
  const tbody = document.getElementById('recentTbody');
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:24px;">Sin órdenes recientes</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (o) => `
    <tr style="cursor:pointer;" onclick="abrirOrden('${o.id}')">
      <td><strong>${o.num_orden}</strong></td>
      <td>${o.nombre}</td>
      <td>${estadoBadge(o.estado)}</td>
      <td>${canalPill(o.canal)}</td>
    </tr>
  `
    )
    .join('');
}

function renderDashVal(items) {
  const el = document.getElementById('dashValList');
  if (!items.length) {
    el.innerHTML = '<div class="empty" style="padding:24px;"><div class="empty-icon">✅</div><p>Sin pendientes</p></div>';
    return;
  }
  el.innerHTML = items
    .slice(0, 5)
    .map(
      (v) => `
    <div style="padding:12px 16px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div>
        <div style="font-weight:600;font-size:13px;">${v.nombre}</div>
        <div style="font-size:11px;color:#6b7280;">${v.producto} · ${v.modelo} · ${canalPill(v.canal)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="switchView('validacion')">Ver →</button>
    </div>
  `
    )
    .join('');
}

function setValTab(estado, el) {
  valEstadoTab = estado;
  document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  loadValidacion();
}

async function loadValidacion() {
  const el = document.getElementById('valList');
  el.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><p>Cargando…</p></div>';
  try {
    const snap = await getDocs(query(collection(db, COL_V), where('estado', '==', valEstadoTab), limit(400)));
    const items = snap.docs
      .map((d) => normalizeValidacion(d.id, d.data()))
      .sort((a, b) => tsToMillis(b.created_at) - tsToMillis(a.created_at));
    if (valEstadoTab === 'pendiente') {
      const badge = document.getElementById('valBadge');
      badge.textContent = items.length;
      badge.classList.toggle('hidden', items.length === 0);
    }
    if (!items.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>No hay solicitudes en este estado</p></div>';
      return;
    }
    el.innerHTML = items.map((v) => renderValCard(v)).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderValCard(v) {
  const fallas = [v.falla1, v.falla2].filter(Boolean).join(', ');
  const acciones =
    valEstadoTab === 'pendiente'
      ? `
    <button class="btn btn-danger btn-sm" onclick="abrirRechazo('${v.id}')">✕ Rechazar</button>
    <button class="btn btn-primary btn-sm" onclick="abrirAprobacion('${v.id}','${v.canal || ''}')">✓ Aprobar</button>
  `
      : '';
  return `
    <div class="val-card">
      <div class="val-card-header">
        <div>
          <div class="val-card-name">${v.nombre}</div>
          <div class="val-card-sub">${v.correo}${v.rut ? ' · ' + v.rut : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${canalPill(v.canal)}
          ${v.initials ? `<span style="font-size:11px;color:#6b7280;">Agente: ${v.initials}</span>` : ''}
        </div>
      </div>
      <div class="val-card-body">
        <div class="detail-item"><span class="detail-key">Producto</span><span class="detail-val">${v.producto}</span></div>
        <div class="detail-item"><span class="detail-key">Modelo</span><span class="detail-val">${v.modelo}</span></div>
        <div class="detail-item"><span class="detail-key">Origen</span><span class="detail-val">${v.origen || '—'}</span></div>
        <div class="detail-item"><span class="detail-key">Color</span><span class="detail-val">${v.color || '—'}</span></div>
        <div class="detail-item"><span class="detail-key">IMEI</span><span class="detail-val" style="font-family:monospace;">${v.imei || '—'}</span></div>
        <div class="detail-item"><span class="detail-key">Falla(s)</span><span class="detail-val">${fallas}</span></div>
        ${v.obs ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-key">Observaciones</span><span class="detail-val">${v.obs}</span></div>` : ''}
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">${fmtDate(v.created_at)}</div>
      ${v.rechazado_motivo ? `<div style="background:#fee2e2;color:#7f1d1d;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:8px;">Motivo rechazo: ${v.rechazado_motivo}</div>` : ''}
      <div class="val-card-actions">${acciones}</div>
    </div>
  `;
}

function htmlPlazoDias(prefix) {
  return `
        <div class="form-group">
          <label>Plazo (días hábiles)</label>
          <select class="form-control" id="${prefix}_plazo_sel" onchange="togglePlazoOtro('${prefix}')">
            <option value="">— Seleccionar —</option>
            <option value="3">3 días hábiles</option>
            <option value="5">5 días hábiles</option>
            <option value="7">7 días hábiles</option>
            <option value="14">14 días hábiles</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="form-group" id="${prefix}_plazo_otro_wrap" style="display:none;">
          <label>Especifica plazo *</label>
          <input class="form-control" id="${prefix}_plazo_otro" placeholder="Ej: 21 días hábiles o nota interna"/>
        </div>`;
}

function togglePlazoOtro(prefix) {
  const v = document.getElementById(prefix + '_plazo_sel')?.value;
  const w = document.getElementById(prefix + '_plazo_otro_wrap');
  if (w) w.style.display = v === 'otro' ? 'block' : 'none';
}

function readPlazoDias(prefix) {
  const sel = document.getElementById(prefix + '_plazo_sel')?.value;
  const ot = document.getElementById(prefix + '_plazo_otro')?.value.trim();
  if (sel === 'otro') {
    return {
      plazo_dias_habiles: 'otro',
      plazo_otro: ot || null,
      plazo: ot ? `Otro: ${ot}` : null,
    };
  }
  if (sel) {
    return {
      plazo_dias_habiles: sel,
      plazo_otro: null,
      plazo: `${sel} días hábiles`,
    };
  }
  return { plazo_dias_habiles: null, plazo_otro: null, plazo: null };
}

function abrirAprobacion(id, canal) {
  pendingAprobacion = { id, canal: (canal || 'S').toUpperCase() };
  const isP = pendingAprobacion.canal === 'P';
  const body = document.getElementById('aprobarModalBody');
  body.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Datos de la orden</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Agente *</label>
          <input class="form-control" id="ap_agente" placeholder="Iniciales, ej. JV" maxlength="5"/>
        </div>
        ${htmlPlazoDias('ap')}
        ${isP ? `
        <div class="form-group span2">
          <label>Garantía</label>
          <p style="font-size:13px;color:#374151;padding:8px 0;">Canal <strong>P</strong>: garantía <strong>Sí</strong> (no aplica cambiar).</p>
          <input type="hidden" id="ap_garantia" value="true"/>
        </div>` : `
        <div class="form-group">
          <label>¿Garantía?</label>
          <select class="form-control" id="ap_garantia">
            <option value="false">No</option>
            <option value="true">Sí</option>
          </select>
        </div>`}
        <div class="form-group">
          <label>N° boleta / documento</label>
          <input class="form-control" id="ap_numero_boleta" placeholder="Ej: 123456, F-8890…"/>
        </div>
        <div class="form-group">
          <label>Fecha boleta (si aplica)</label>
          <input class="form-control" id="ap_fecha_boleta" type="date"/>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Accesorios recibidos</div>
      <div class="check-grid" id="ap_accesorios">
        ${['mica', 'carga', 'pantalla', 'botones', 'sim', 'caja', 'cable', 'adaptador', 'funda']
          .map(
            (a) => `
          <label class="check-item">
            <input type="checkbox" id="ap_${a}"/>
            <span>${a.charAt(0).toUpperCase() + a.slice(1)}</span>
          </label>
        `
          )
          .join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Observaciones internas (opcional)</div>
      <div class="form-group">
        <textarea class="form-control" id="ap_obs2" placeholder="Notas del técnico para la orden…"></textarea>
      </div>
    </div>
  `;
  openModal('aprobarModal');
}

async function confirmarAprobacion() {
  const id = pendingAprobacion.id;
  if (!id) return;
  const agente = document.getElementById('ap_agente').value.trim();
  if (!agente) {
    toast('Ingresa las iniciales del agente', 'warning');
    return;
  }
  const isP = pendingAprobacion.canal === 'P';
  const plazoInfo = readPlazoDias('ap');
  const selPlazo = document.getElementById('ap_plazo_sel')?.value;
  if (!selPlazo) {
    toast('Selecciona un plazo en días hábiles', 'warning');
    return;
  }
  if (selPlazo === 'otro' && !document.getElementById('ap_plazo_otro')?.value.trim()) {
    toast('Completa el plazo cuando eliges «Otro»', 'warning');
    return;
  }
  const acc = {};
  ['mica', 'carga', 'pantalla', 'botones', 'sim', 'caja', 'cable', 'adaptador', 'funda'].forEach((a) => {
    acc[a] = document.getElementById(`ap_${a}`)?.checked || false;
  });
  const btn = document.getElementById('aprobarConfirmBtn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const numOrden = await runTransaction(db, async (transaction) => {
      const vRef = doc(db, COL_V, id);
      const vSnap = await transaction.get(vRef);
      if (!vSnap.exists() || vSnap.data().estado !== 'pendiente') {
        throw new Error('Solicitud no encontrada o ya procesada');
      }
      const v = vSnap.data();
      const canal = String(v.canal || 'S')
        .toUpperCase()
        .slice(0, 1);
      const serRef = doc(db, META_SERIAL, 'ordenes');
      const serSnap = await transaction.get(serRef);
      const counts = serSnap.exists() ? serSnap.data() : { P: 0, E: 0, S: 0 };
      const preRaw = v.numero_seguimiento != null ? String(v.numero_seguimiento).trim() : '';
      const preOk =
        preRaw &&
        /^[PES]\d+$/.test(preRaw) &&
        preRaw.charAt(0) === canal &&
        parseInt(preRaw.slice(1), 10) >= 1;
      let num_orden;
      if (preOk) {
        num_orden = preRaw;
        const nPre = parseInt(preRaw.slice(1), 10);
        const prev = counts[canal] || 0;
        transaction.set(serRef, { ...counts, [canal]: Math.max(prev, nPre) }, { merge: true });
      } else {
        const next = (counts[canal] || 0) + 1;
        transaction.set(serRef, { ...counts, [canal]: next }, { merge: true });
        num_orden = `${canal}${next}`;
      }
      const newOrdenRef = doc(collection(db, COL_O));
      const garantia = isP ? true : document.getElementById('ap_garantia').value === 'true';
      transaction.set(newOrdenRef, {
        num_orden,
        fecha: serverTimestamp(),
        nombre: v.nombre,
        correo: v.correo,
        rut: v.rut ?? null,
        imei: v.imei ?? null,
        producto: v.producto,
        modelo: v.modelo,
        origen: v.origen,
        color: v.color ?? null,
        falla1: v.falla1,
        falla2: v.falla2 ?? null,
        obs: v.obs ?? null,
        canal,
        estado: 'Ingresado',
        agente,
        garantia,
        fecha_boleta: document.getElementById('ap_fecha_boleta').value || null,
        numero_boleta: document.getElementById('ap_numero_boleta')?.value.trim() || null,
        plazo: plazoInfo.plazo,
        plazo_dias_habiles: plazoInfo.plazo_dias_habiles,
        plazo_otro: plazoInfo.plazo_otro,
        obs2: document.getElementById('ap_obs2').value || null,
        ...acc,
        solucion: null,
        presupuesto: null,
        valor_cobrado: null,
        informe_url: null,
        validacion_id: id,
      });
      transaction.update(vRef, {
        estado: 'aprobado',
        aprobado_at: serverTimestamp(),
        orden_id: newOrdenRef.id,
        num_orden,
      });
      return num_orden;
    });
    closeModal('aprobarModal');
    toast(`Orden ${numOrden} creada exitosamente`, 'success');
    loadValidacion();
    loadDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.innerHTML = '<span>Crear orden</span>';
    btn.disabled = false;
  }
}

function abrirRechazo(id) {
  pendingRechazoId = id;
  document.getElementById('rechazarMotivo').value = '';
  openModal('rechazarModal');
}

async function confirmarRechazo() {
  const motivo = document.getElementById('rechazarMotivo').value.trim();
  if (!motivo) {
    toast('Ingresa el motivo del rechazo', 'warning');
    return;
  }
  try {
    await updateDoc(doc(db, COL_V, pendingRechazoId), {
      estado: 'rechazado',
      rechazado_motivo: motivo,
    });
    closeModal('rechazarModal');
    toast('Solicitud rechazada', 'warning');
    loadValidacion();
    loadDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function debouncedLoadOrdenes() {
  clearTimeout(ordenesDebounce);
  ordenesDebounce = setTimeout(() => {
    ordenesOffset = 0;
    loadOrdenes();
  }, 350);
}

function debouncedSearch() {
  document.getElementById('ordenSearch').value = document.getElementById('topbarSearch')?.value || '';
  debouncedLoadOrdenes();
}

async function loadOrdenes() {
  const tbody = document.getElementById('ordenesTbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="8"><span class="spinner spinner-dark"></span></td></tr>';
  const q = (document.getElementById('ordenSearch')?.value || '').trim().toLowerCase();
  const estado = document.getElementById('ordenEstado')?.value || '';
  const canal = document.getElementById('ordenCanal')?.value || '';
  try {
    let snap;
    if (estado) {
      snap = await getDocs(query(collection(db, COL_O), where('estado', '==', estado), limit(500)));
    } else if (canal) {
      snap = await getDocs(query(collection(db, COL_O), where('canal', '==', canal), limit(500)));
    } else {
      snap = await getDocs(query(collection(db, COL_O), orderBy('fecha', 'desc'), limit(500)));
    }
    let rows = snap.docs.map((d) => normalizeOrden(d.id, d.data()));
    if (estado && canal) rows = rows.filter((o) => o.canal === canal);
    rows.sort((a, b) => tsToMillis(b.fecha) - tsToMillis(a.fecha));
    if (q) {
      rows = rows.filter(
        (o) =>
          (o.nombre && o.nombre.toLowerCase().includes(q)) ||
          (o.correo && o.correo.toLowerCase().includes(q)) ||
          (o.num_orden && String(o.num_orden).toLowerCase().includes(q)) ||
          (o.imei && String(o.imei).toLowerCase().includes(q))
      );
    }
    ordenesCache = rows;
    ordenesTotal = rows.length;
    const page = rows.slice(ordenesOffset, ordenesOffset + PAGE_SIZE);
    if (!page.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:32px;">Sin resultados</td></tr>';
      renderPager();
      return;
    }
    tbody.innerHTML = page
      .map(
        (o) => `
      <tr style="cursor:pointer;" onclick="abrirOrden('${o.id}')">
        <td><strong style="font-family:monospace;">${o.num_orden}</strong></td>
        <td>${fmtDate(o.fecha)}</td>
        <td>
          <div style="font-weight:500;">${o.nombre}</div>
          <div style="font-size:11px;color:#6b7280;">${o.correo}</div>
        </td>
        <td>${o.producto} ${o.modelo}</td>
        <td>${estadoBadge(o.estado)}</td>
        <td>${canalPill(o.canal)}</td>
        <td>${o.agente || '—'}</td>
        <td>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();abrirOrden('${o.id}')" title="Ver detalle">→</button>
        </td>
      </tr>
    `
      )
      .join('');
    renderPager();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#dc2626;padding:24px;">Error: ${e.message}</td></tr>`;
  }
}

function renderPager() {
  const wrap = document.getElementById('ordenesPager');
  if (!wrap) return;
  const pages = Math.ceil(ordenesTotal / PAGE_SIZE);
  const cur = Math.floor(ordenesOffset / PAGE_SIZE) + 1;
  if (pages <= 1) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${cur === 1 ? 'disabled' : ''} onclick="goPage(${cur - 2})">← Anterior</button>
    <span style="font-size:13px;color:#6b7280;padding:0 8px;">Página ${cur} de ${pages}</span>
    <button class="btn btn-ghost btn-sm" ${cur === pages ? 'disabled' : ''} onclick="goPage(${cur})">Siguiente →</button>
  `;
}

function goPage(pageIndex) {
  ordenesOffset = pageIndex * PAGE_SIZE;
  loadOrdenes();
}

async function abrirOrden(id) {
  openModal('ordenModal');
  document.getElementById('ordenModalTitle').textContent = 'Cargando…';
  document.getElementById('ordenModalBody').innerHTML =
    '<div style="text-align:center;padding:40px;"><span class="spinner spinner-dark"></span></div>';
  document.getElementById('ordenModalFooter').innerHTML = '';
  try {
    const d = await getDoc(doc(db, COL_O, id));
    if (!d.exists()) throw new Error('Orden no encontrada');
    const o = normalizeOrden(d.id, d.data());
    currentOrden = o;
    renderOrdenModal(o);
  } catch (e) {
    document.getElementById('ordenModalBody').innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderOrdenModal(o) {
  document.getElementById('ordenModalTitle').textContent = o.num_orden;
  const accs =
    ['mica', 'carga', 'pantalla', 'botones', 'sim', 'caja', 'cable', 'adaptador', 'funda'].filter((a) => o[a]).join(', ') ||
    '—';
  document.getElementById('ordenModalBody').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
      ${estadoBadge(o.estado)} ${canalPill(o.canal)}
      ${o.garantia ? '<span class="badge badge-green">Garantía</span>' : ''}
      <span style="font-size:12px;color:#6b7280;margin-left:auto;">Agente: ${o.agente || '—'}</span>
    </div>

    <div class="form-section">
      <div class="form-section-title">Cliente</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-key">Nombre</span><span class="detail-val">${o.nombre}</span></div>
        <div class="detail-item"><span class="detail-key">Correo</span><span class="detail-val">${o.correo}</span></div>
        <div class="detail-item"><span class="detail-key">RUT</span><span class="detail-val">${o.rut || '—'}</span></div>
        <div class="detail-item"><span class="detail-key">IMEI</span><span class="detail-val" style="font-family:monospace;">${o.imei || '—'}</span></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Equipo</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-key">Producto</span><span class="detail-val">${o.producto}</span></div>
        <div class="detail-item"><span class="detail-key">Modelo</span><span class="detail-val">${o.modelo}</span></div>
        <div class="detail-item"><span class="detail-key">Color</span><span class="detail-val">${o.color || '—'}</span></div>
        <div class="detail-item"><span class="detail-key">Origen</span><span class="detail-val">${o.origen}</span></div>
        <div class="detail-item"><span class="detail-key">Fecha ingreso</span><span class="detail-val">${fmtDate(o.fecha)}</span></div>
        <div class="detail-item"><span class="detail-key">Plazo</span><span class="detail-val">${formatPlazoOrden(o)}</span></div>
        <div class="detail-item"><span class="detail-key">N° boleta</span><span class="detail-val">${o.numero_boleta || '—'}</span></div>
        ${
          o.comprobante_url && /^https?:\/\//i.test(o.comprobante_url)
            ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-key">Comprobante</span><span class="detail-val"><a href="${escapeAttr(o.comprobante_url)}" target="_blank" rel="noopener">Abrir enlace</a></span></div>`
            : o.comprobante_url
              ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-key">Comprobante</span><span class="detail-val">${escapeAttr(o.comprobante_url)}</span></div>`
              : ''
        }
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Boleta (editar)</div>
      <div class="form-grid">
        <div class="form-group">
          <label>N° boleta / documento</label>
          <input class="form-control" id="edit_numero_boleta" value="${escapeAttr(o.numero_boleta || '')}"/>
        </div>
        <div class="form-group">
          <label>Fecha boleta</label>
          <input class="form-control" id="edit_fecha_boleta" type="date" value="${o.fecha_boleta ? String(o.fecha_boleta).slice(0, 10) : ''}"/>
        </div>
        <div class="form-group span2">
          <button type="button" class="btn btn-primary btn-sm" onclick="guardarBoletaOrden('${o.id}')">Guardar boleta</button>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Falla</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-key">Falla principal</span><span class="detail-val">${o.falla1}</span></div>
        ${o.falla2 ? `<div class="detail-item"><span class="detail-key">Falla secundaria</span><span class="detail-val">${o.falla2}</span></div>` : ''}
        ${o.obs ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-key">Obs. cliente</span><span class="detail-val">${o.obs}</span></div>` : ''}
        ${o.obs2 ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-key">Obs. técnico</span><span class="detail-val">${o.obs2}</span></div>` : ''}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Accesorios recibidos</div>
      <p style="font-size:13px;color:#374151;">${accs}</p>
    </div>

    ${
      o.solucion || o.presupuesto
        ? `
    <div class="form-section">
      <div class="form-section-title">Diagnóstico / Presupuesto</div>
      <div class="detail-grid">
        ${o.solucion ? `<div class="detail-item"><span class="detail-key">Solución</span><span class="detail-val">${o.solucion}</span></div>` : ''}
        ${o.presupuesto ? `<div class="detail-item"><span class="detail-key">Presupuesto</span><span class="detail-val">$${Number(o.presupuesto).toLocaleString('es-CL')}</span></div>` : ''}
        ${o.valor_cobrado ? `<div class="detail-item"><span class="detail-key">Valor cobrado</span><span class="detail-val">$${Number(o.valor_cobrado).toLocaleString('es-CL')}</span></div>` : ''}
      </div>
    </div>
    `
        : ''
    }

    <div class="form-section">
      <div class="form-section-title">Cambiar estado</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <select class="form-control" id="cambiarEstadoSel" style="width:auto;min-width:200px;">
          ${['Ingresado', 'En revisión', 'Listo', 'Entregado', 'No reparado', 'Pendiente presupuesto']
            .map((e) => `<option ${e === o.estado ? 'selected' : ''}>${e}</option>`)
            .join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="cambiarEstado('${o.id}')">Actualizar estado</button>
      </div>
    </div>
  `;

  document.getElementById('ordenModalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal('ordenModal')">Cerrar</button>
    <button class="btn btn-amber btn-sm" onclick="abrirEnvioEmail('${o.id}', ${JSON.stringify(o.correo)}, '${o.canal}')">✉ Enviar correo</button>
    <button class="btn btn-ghost btn-sm" onclick="generarInforme('${o.id}')">📄 Generar informe</button>
    ${o.informe_url ? `<a href="${escapeAttr(o.informe_url)}" target="_blank" class="btn btn-green btn-sm">📥 Ver informe</a>` : ''}
  `;
}

async function guardarBoletaOrden(id) {
  const numero_boleta = document.getElementById('edit_numero_boleta')?.value.trim() || null;
  const fecha_boleta = document.getElementById('edit_fecha_boleta')?.value || null;
  try {
    await updateDoc(doc(db, COL_O, id), { numero_boleta, fecha_boleta });
    toast('Boleta guardada', 'success');
    const d = await getDoc(doc(db, COL_O, id));
    const o = normalizeOrden(d.id, d.data());
    currentOrden = o;
    renderOrdenModal(o);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function cambiarEstado(id) {
  const estado = document.getElementById('cambiarEstadoSel').value;
  try {
    await updateDoc(doc(db, COL_O, id), { estado });
    toast('Estado actualizado', 'success');
    closeModal('ordenModal');
    loadOrdenes();
    loadDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function abrirEnvioEmail(id, correo, canal) {
  emailTarget = id;
  const labels = { P: 'Garantía (tipo P)', E: 'Sin Garantía (tipo E)', S: 'Presencial (tipo S)' };
  document.getElementById('emailModalDesc').textContent = `Se enviará un correo tipo ${labels[canal] || canal} a ${correo}.`;
  document.getElementById('emailEvidenciasUrl').value = '';
  openModal('emailModal');
}

async function confirmarEnvioEmail() {
  const id = emailTarget;
  const evidencias = document.getElementById('emailEvidenciasUrl')?.value.trim() || '';
  closeModal('emailModal');
  if (!id) return;
  const urlOk = getInformeScriptUrl();
  if (!urlOk || !/^https:\/\//i.test(urlOk)) {
    toast(informeConfigFaltaMsg(), 'warning', 9000);
    return;
  }
  if (!getInformeScriptSecret()) {
    toast(informeConfigFaltaMsg(), 'warning', 9000);
    return;
  }
  try {
    toast('Enviando correo…', 'info');
    const d = await getDoc(doc(db, COL_O, id));
    if (!d.exists()) throw new Error('Orden no encontrada');
    const o = normalizeOrden(d.id, d.data());
    const orden = buildInformePayloadFromOrden(o);
    const j = await postInformeScript({
      action: 'enviar',
      secret: getInformeScriptSecret(),
      orden,
      informe_url: o.informe_url || '',
      evidencias_url: evidencias,
    });
    if (j.informe_url && j.informe_url !== o.informe_url) {
      await updateDoc(doc(db, COL_O, id), { informe_url: j.informe_url });
    }
    toast('Correo enviado', 'success');
    if (currentOrden && currentOrden.id === id) {
      const d2 = await getDoc(doc(db, COL_O, id));
      if (d2.exists()) {
        currentOrden = normalizeOrden(d2.id, d2.data());
        renderOrdenModal(currentOrden);
      }
    }
  } catch (e) {
    toast(e.message || 'No se pudo enviar el correo', 'error');
  }
}

async function generarInforme(_id) {
  const urlOk = getInformeScriptUrl();
  if (!urlOk || !/^https:\/\//i.test(urlOk)) {
    toast(informeConfigFaltaMsg(), 'warning', 9000);
    return;
  }
  if (!getInformeScriptSecret()) {
    toast(informeConfigFaltaMsg(), 'warning', 9000);
    return;
  }
  try {
    toast('Generando informe en Google Docs…', 'info');
    const d = await getDoc(doc(db, COL_O, _id));
    if (!d.exists()) throw new Error('Orden no encontrada');
    const o = normalizeOrden(d.id, d.data());
    const orden = buildInformePayloadFromOrden(o);
    const j = await postInformeScript({
      action: 'generar',
      secret: getInformeScriptSecret(),
      orden,
    });
    await updateDoc(doc(db, COL_O, _id), { informe_url: j.url });
    toast('Informe generado', 'success');
    if (currentOrden && currentOrden.id === _id) {
      currentOrden = { ...currentOrden, informe_url: j.url };
      renderOrdenModal(currentOrden);
    }
  } catch (e) {
    toast(e.message || 'No se pudo generar el informe', 'error');
  }
}

const PRODUCTOS = {
  Reloj: ['Space 1', 'Space 2', 'Space Lite', 'Space 3', 'Space 4'],
  Tablet: ['Lite 1', 'Lite 2', 'Lite 3', 'Pro', 'Pro 2.0'],
  Monitores: ['Baby monitor Lite', 'Baby Monitor Pro', 'Baby Monitor Pro 2'],
  Camaras: ['Camara Baby Monitor Lite', 'Camara Baby Monitor Pro', 'Camara Baby Monitor Pro 2'],
  Momophone: ['Momophone', 'Momophone Pro'],
  BabyDreams: ['BabyDreams'],
  Otro: ['Otro'],
};
const ORIGENES = ['SoyMomo', 'Falabella', 'Ripley', 'Mercado Libre', 'Paris', 'Hites', 'Otro', 'No recuerdo'];
const COLORES = ['Negro', 'Azul', 'Violeta', 'Celeste', 'lilium', 'Midnight', 'Coral', 'Verde', 'Gris', 'Otro'];
const FALLAS1 = [
  'Pantalla rota',
  'No enciende',
  'No carga',
  'Batería',
  'Botón roto',
  'Cámara',
  'Audio',
  'Wifi/BT',
  'Táctil',
  'Correa',
  'Sistema/Software',
  'No conecta reloj',
  'Golpe sin daño visible',
  'Otro',
];
const FALLAS2 = ['Pantalla rota', 'No enciende', 'No carga', 'Batería', 'Botón roto', 'Cámara', 'Audio', 'Otro'];

function abrirNuevaOrden() {
  nuevaOrdenCanal = null;
  const body = document.getElementById('nuevaOrdenBody');
  body.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Canal de ingreso</div>
      <div class="canal-selector">
        <div class="canal-opt" onclick="selNuevaCanal('P',this)">
          <div class="canal-icon">📦</div>
          <div class="canal-name">Garantía</div>
          <div class="canal-desc">Envío gratuito (P)</div>
        </div>
        <div class="canal-opt" onclick="selNuevaCanal('E',this)">
          <div class="canal-icon">🚚</div>
          <div class="canal-name">Sin Garantía</div>
          <div class="canal-desc">Cliente coordina envío (E)</div>
        </div>
        <div class="canal-opt" onclick="selNuevaCanal('S',this)">
          <div class="canal-icon">🏪</div>
          <div class="canal-name">Presencial</div>
          <div class="canal-desc">Recepción Ricardo Lyon (S)</div>
        </div>
      </div>
    </div>

    <div id="nuevaOrdenLoader" class="solicitud-loader" style="display:none;">
      <span style="font-size:14px;">🔍</span>
      <input type="text" id="numSolicitud" placeholder="N° solicitud (Registro E/P) o ID Firestore para pre-llenar…"/>
      <button class="btn btn-ghost btn-sm" onclick="cargarSolicitud()">Cargar</button>
    </div>

    <div id="nuevaOrdenForm" style="display:none;">
      <div class="form-section">
        <div class="form-section-title">Cliente</div>
        <div class="form-grid">
          <div class="form-group"><label>Nombre completo *</label><input class="form-control" id="no_nombre" placeholder="Ana Pérez"/></div>
          <div class="form-group"><label>Correo electrónico *</label><input class="form-control" id="no_correo" type="email" placeholder="ana@email.cl"/></div>
          <div class="form-group"><label>RUT</label><input class="form-control" id="no_rut" placeholder="12.345.678-9"/></div>
          <div class="form-group"><label>IMEI</label><input class="form-control" id="no_imei" placeholder="354…" maxlength="17"/></div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Equipo</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Producto *</label>
            <select class="form-control" id="no_producto" onchange="updateModelos()">
              <option value="">Seleccionar…</option>
              ${Object.keys(PRODUCTOS).map((p) => `<option>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Modelo *</label>
            <select class="form-control" id="no_modelo"><option value="">Primero elige producto</option></select>
          </div>
          <div class="form-group">
            <label>Origen *</label>
            <select class="form-control" id="no_origen" onchange="toggleOtroField('no_origen','no_origen_otro_wrap')">
              <option value="">Seleccionar…</option>
              ${ORIGENES.map((o) => `<option>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="no_origen_otro_wrap" style="display:none;">
            <label>Especifica origen *</label>
            <input class="form-control" id="no_origen_otro" placeholder="Ej: retail local, marketplace..." />
          </div>
          <div class="form-group">
            <label>Color</label>
            <select class="form-control" id="no_color" onchange="toggleOtroField('no_color','no_color_otro_wrap')">
              <option value="">Seleccionar…</option>
              ${COLORES.map((c) => `<option>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="no_color_otro_wrap" style="display:none;">
            <label>Especifica color *</label>
            <input class="form-control" id="no_color_otro" placeholder="Ej: grafito, púrpura oscuro..." />
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Falla</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Falla principal *</label>
            <select class="form-control" id="no_falla1">
              <option value="">Seleccionar…</option>
              ${FALLAS1.map((f) => `<option>${f}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Falla secundaria</label>
            <select class="form-control" id="no_falla2">
              <option value="">Ninguna</option>
              ${FALLAS2.map((f) => `<option>${f}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span2">
            <label>Observaciones</label>
            <textarea class="form-control" id="no_obs" placeholder="Descripción adicional…"></textarea>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Accesorios recibidos</div>
        <div class="check-grid">
          ${['mica', 'carga', 'pantalla', 'botones', 'sim', 'caja', 'cable', 'adaptador', 'funda']
            .map(
              (a) => `
            <label class="check-item"><input type="checkbox" id="no_${a}"/><span>${a.charAt(0).toUpperCase() + a.slice(1)}</span></label>
          `
            )
            .join('')}
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Garantía, boleta y plazo</div>
        <div id="no_comprobante_host" style="display:none;"></div>
        <div class="form-grid">
          <div class="form-group" id="no_garantia_group">
            <label id="no_garantia_label">¿Tiene garantía?</label>
            <select class="form-control" id="no_garantia">
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </div>
          <div class="form-group">
            <label>N° boleta / documento</label>
            <input class="form-control" id="no_numero_boleta" placeholder="Ej: 123456, F-8890"/>
          </div>
          <div class="form-group">
            <label>Fecha boleta</label>
            <input class="form-control" id="no_fecha_boleta" type="date"/>
          </div>
          <div class="form-group">
            <label>Agente *</label>
            <input class="form-control" id="no_agente" placeholder="Iniciales, ej. JV" maxlength="5"/>
          </div>
          ${htmlPlazoDias('no')}
        </div>
      </div>
    </div>
  `;
  openModal('nuevaOrdenModal');
  setTimeout(() => {
    syncNuevaOrdenGarantiaUI();
    refreshComprobantePUI();
  }, 0);
}

function syncNuevaOrdenGarantiaUI() {
  const g = document.getElementById('no_garantia');
  const lbl = document.getElementById('no_garantia_label');
  if (!g || !lbl) return;
  if (nuevaOrdenCanal === 'P') {
    g.value = 'true';
    g.disabled = true;
    lbl.textContent = 'Garantía (canal P)';
  } else {
    g.disabled = false;
    lbl.textContent = '¿Tiene garantía?';
  }
}

/** Solo canal P: inserta el bloque boleta/comprobante; E y S no tienen URL en el formulario. */
function mountComprobantePStrip(canal) {
  const host = document.getElementById('no_comprobante_host');
  if (!host) return;
  if (canal !== 'P') {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = 'block';
  host.innerHTML =
    '<div style="margin:0 0 14px;padding:10px 14px;background:linear-gradient(100deg,#ecfdf5,#f0fdf4);border:1px solid #6ee7b7;border-radius:12px;">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
    '<span style="font-size:10px;font-weight:800;color:#047857;letter-spacing:0.06em;">BOLETA · CANAL P</span>' +
    '<a id="no_comprobante_tab_link" class="btn btn-ghost btn-sm" href="#" target="_blank" rel="noopener" style="display:none;font-size:12px;padding:5px 12px;border-radius:999px;background:#fff;border:1px solid #34d399;color:#065f46;font-weight:600;">Ver comprobante ↗</a>' +
    '<input type="hidden" id="no_comprobante_url" value=""/>' +
    '<input type="url" id="no_comprobante_micro" class="form-control" placeholder="Pegar enlace si falta" style="flex:1;min-width:160px;max-width:280px;font-size:12px;height:34px;padding:6px 10px;" oninput="syncComprobanteMicro()"/>' +
    '</div></div>';
  refreshComprobantePUI();
}

function refreshComprobantePUI() {
  const link = document.getElementById('no_comprobante_tab_link');
  const hidden = document.getElementById('no_comprobante_url');
  if (!link || !hidden) return;
  const u = (hidden.value || '').trim();
  const ok = /^https?:\/\//i.test(u);
  if (ok) {
    link.href = u;
    link.style.display = 'inline-flex';
  } else {
    link.removeAttribute('href');
    link.style.display = 'none';
  }
}

function syncComprobanteMicro() {
  const m = document.getElementById('no_comprobante_micro');
  const h = document.getElementById('no_comprobante_url');
  if (m && h) h.value = m.value.trim();
  refreshComprobantePUI();
}

function selNuevaCanal(canal, el) {
  nuevaOrdenCanal = canal;
  document.querySelectorAll('.canal-opt').forEach((o) => o.classList.remove('selected'));
  el.classList.add('selected');
  const showLoader = canal === 'P' || canal === 'E';
  document.getElementById('nuevaOrdenLoader').style.display = showLoader ? 'flex' : 'none';
  document.getElementById('nuevaOrdenForm').style.display = 'block';
  syncNuevaOrdenGarantiaUI();
  mountComprobantePStrip(canal);
}

function updateModelos() {
  const prod = document.getElementById('no_producto').value;
  const sel = document.getElementById('no_modelo');
  const opts = PRODUCTOS[prod] || [];
  sel.innerHTML = opts.length
    ? opts.map((m) => `<option>${m}</option>`).join('')
    : '<option value="">Seleccionar producto primero</option>';
}

function toggleOtroField(selectId, wrapId) {
  const value = document.getElementById(selectId)?.value;
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.style.display = value === 'Otro' ? 'block' : 'none';
}

function mapToSolicitudPayload(x) {
  return {
    nombre: x.nombre,
    correo: x.correo,
    rut: x.rut,
    modelo: x.modelo,
    producto: x.producto,
    origen: x.origen,
    color: x.color,
    falla1: x.falla1 || x.falla,
    imei: x.imei,
    comprobante_url: x.comprobante_url || undefined,
    obs_extra: x.segundo_equipo_txt || undefined,
  };
}

async function cargarSolicitud() {
  const num = document.getElementById('numSolicitud').value.trim();
  if (!num) {
    toast('Ingresa el número de solicitud', 'warning');
    return;
  }
  const tipo = nuevaOrdenCanal;
  try {
    if (tipo === 'P' || tipo === 'E') {
      try {
        const sheetRow = await fetchSolicitudFromSheets(num, tipo);
        if (sheetRow) {
          applySolicitudToNuevaOrden(mapToSolicitudPayload(sheetRow));
          toast('Datos cargados desde Google Sheets', 'success');
          return;
        }
      } catch (err) {
        const msg = err && err.message ? String(err.message) : '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          toast('No se pudo contactar Sheets (CORS o red). Revisa URL o usa un proxy.', 'warning');
        } else if (msg.startsWith('Sheets:')) {
          toast(msg, 'error');
          return;
        }
        /* otro error HTTP, etc. → intentar Firestore */
      }
    }

    const vDoc = await getDoc(doc(db, COL_V, num));
    if (vDoc.exists()) {
      const v = vDoc.data();
      if (!tipo || (v.canal || '').toUpperCase() === tipo) {
        const data = mapToSolicitudPayload({ ...v, falla: v.falla1 });
        applySolicitudToNuevaOrden(data);
        toast('Datos cargados desde validación', 'success');
        return;
      }
    }
    const qv = query(collection(db, COL_V), where('canal', '==', tipo), limit(200));
    const vs = await getDocs(qv);
    let hit = vs.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((r) => r.numero_solicitud === num || r.registro_excel_id === num || r.id === num);
    if (hit) {
      applySolicitudToNuevaOrden(mapToSolicitudPayload(hit));
      toast('Datos cargados desde Firestore', 'success');
      return;
    }
    const qo = query(collection(db, COL_O), where('canal', '==', tipo), limit(200));
    const os = await getDocs(qo);
    hit = os.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((r) => r.num_orden === num || r.numero_solicitud === num);
    if (hit) {
      applySolicitudToNuevaOrden(mapToSolicitudPayload(hit));
      toast('Datos cargados desde orden existente', 'success');
      return;
    }
    throw new Error(
      'No encontrado en Sheets ni en Firestore. Revisa el número de solicitud o importa los datos.'
    );
  } catch (e) {
    toast(e.message || 'No se pudo cargar', 'error');
  }
}

function applySolicitudToNuevaOrden(data) {
  if (data.nombre) document.getElementById('no_nombre').value = data.nombre;
  if (data.correo) document.getElementById('no_correo').value = data.correo;
  if (data.rut) document.getElementById('no_rut').value = data.rut;
  if (data.producto) {
    const prodSel = document.getElementById('no_producto');
    if (prodSel && [...prodSel.options].some((o) => o.value === data.producto)) prodSel.value = data.producto;
    updateModelos();
  }
  if (data.modelo) document.getElementById('no_modelo').value = data.modelo;
  if (data.origen) {
    const oSel = document.getElementById('no_origen');
    if (oSel && [...oSel.options].some((o) => o.value === data.origen)) oSel.value = data.origen;
    toggleOtroField('no_origen', 'no_origen_otro_wrap');
  }
  if (data.color) document.getElementById('no_color').value = data.color;
  if (data.falla1) document.getElementById('no_falla1').value = data.falla1;
  if (data.imei) document.getElementById('no_imei').value = data.imei;
  if (data.comprobante_url) {
    const h = document.getElementById('no_comprobante_url');
    const m = document.getElementById('no_comprobante_micro');
    if (h) h.value = data.comprobante_url;
    if (m) m.value = data.comprobante_url;
    refreshComprobantePUI();
  }
  if (data.obs_extra) {
    const ta = document.getElementById('no_obs');
    if (ta) ta.value = data.obs_extra;
  }
}

async function submitNuevaOrden() {
  if (!nuevaOrdenCanal) {
    toast('Selecciona el canal de ingreso', 'warning');
    return;
  }
  const nombre = document.getElementById('no_nombre')?.value.trim();
  const correo = document.getElementById('no_correo')?.value.trim();
  const producto = document.getElementById('no_producto')?.value;
  const modelo = document.getElementById('no_modelo')?.value;
  const origen = document.getElementById('no_origen')?.value;
  const origenOtro = document.getElementById('no_origen_otro')?.value.trim();
  const colorValue = document.getElementById('no_color')?.value;
  const colorOtro = document.getElementById('no_color_otro')?.value.trim();
  const falla1 = document.getElementById('no_falla1')?.value;
  const agente = document.getElementById('no_agente')?.value.trim();
  if (!nombre || !correo || !producto || !modelo || !origen || !falla1 || !agente) {
    toast('Completa los campos obligatorios (*)', 'warning');
    return;
  }
  if (origen === 'Otro' && !origenOtro) {
    toast('Completa el origen cuando seleccionas "Otro"', 'warning');
    return;
  }
  if (colorValue === 'Otro' && !colorOtro) {
    toast('Completa el color cuando seleccionas "Otro"', 'warning');
    return;
  }
  const selPlazo = document.getElementById('no_plazo_sel')?.value;
  if (!selPlazo) {
    toast('Selecciona el plazo en días hábiles', 'warning');
    return;
  }
  if (selPlazo === 'otro' && !document.getElementById('no_plazo_otro')?.value.trim()) {
    toast('Completa el plazo cuando eliges «Otro»', 'warning');
    return;
  }
  const plazoInfo = readPlazoDias('no');
  const acc = {};
  ['mica', 'carga', 'pantalla', 'botones', 'sim', 'caja', 'cable', 'adaptador', 'funda'].forEach((a) => {
    acc[a] = document.getElementById(`no_${a}`)?.checked || false;
  });
  const canal = nuevaOrdenCanal;
  const garantia = canal === 'P' ? true : document.getElementById('no_garantia')?.value === 'true';
  try {
    const numOrden = await runTransaction(db, async (transaction) => {
      const serRef = doc(db, META_SERIAL, 'ordenes');
      const serSnap = await transaction.get(serRef);
      const counts = serSnap.exists() ? serSnap.data() : { P: 0, E: 0, S: 0 };
      const next = (counts[canal] || 0) + 1;
      transaction.set(serRef, { ...counts, [canal]: next }, { merge: true });
      const num_orden = `${canal}${next}`;
      const newOrdenRef = doc(collection(db, COL_O));
      transaction.set(newOrdenRef, {
        num_orden,
        fecha: serverTimestamp(),
        nombre,
        correo,
        rut: document.getElementById('no_rut')?.value || null,
        imei: document.getElementById('no_imei')?.value || null,
        producto,
        modelo,
        origen: origen === 'Otro' ? origenOtro : origen,
        color: colorValue === 'Otro' ? colorOtro : colorValue || null,
        falla1,
        falla2: document.getElementById('no_falla2')?.value || null,
        obs: document.getElementById('no_obs')?.value || null,
        canal,
        estado: 'Ingresado',
        agente,
        garantia,
        numero_boleta: document.getElementById('no_numero_boleta')?.value.trim() || null,
        fecha_boleta: document.getElementById('no_fecha_boleta')?.value || null,
        comprobante_url:
          nuevaOrdenCanal === 'P'
            ? document.getElementById('no_comprobante_url')?.value.trim() || null
            : null,
        numero_solicitud: document.getElementById('numSolicitud')?.value.trim() || null,
        plazo: plazoInfo.plazo,
        plazo_dias_habiles: plazoInfo.plazo_dias_habiles,
        plazo_otro: plazoInfo.plazo_otro,
        ...acc,
        solucion: null,
        presupuesto: null,
        valor_cobrado: null,
        informe_url: null,
      });
      return num_orden;
    });
    closeModal('nuevaOrdenModal');
    toast(`Orden ${numOrden} creada`, 'success');
    loadOrdenes();
    loadDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function readCambiosLS() {
  try {
    const raw = localStorage.getItem(LS_CAMBIOS);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeCambiosLS(rows) {
  try {
    localStorage.setItem(LS_CAMBIOS, JSON.stringify(rows));
  } catch (_) {}
}

function loadCambiosST() {
  const tbody = document.getElementById('cambiosTbody');
  if (!tbody) return;
  const rows = readCambiosLS();
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">Sin registros. Usa «+ Agregar fila» para pruebas piloto.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td><strong>${escapeHtml(r.orden)}</strong></td>
      <td>${escapeHtml(r.cliente)}</td>
      <td>${escapeHtml(r.correo)}</td>
      <td>${r.estado === 'listo' ? '<span class="badge badge-green">Listo</span>' : '<span class="badge badge-amber">Pendiente</span>'}</td>
      <td>${r.correo_enviado ? '✓' : '—'}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn btn-ghost btn-sm" onclick="marcarCambioListo('${r.id}')">Listo</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="previewCambioMail('${r.id}')">Ver mail</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="eliminarCambio('${r.id}')">✕</button>
      </td>
    </tr>
  `
    )
    .join('');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function abrirModalCambio() {
  document.getElementById('cambioModalTitle').textContent = 'Nuevo cambio ST';
  document.getElementById('cm_orden').value = '';
  document.getElementById('cm_cliente').value = '';
  document.getElementById('cm_correo').value = '';
  openModal('cambioModal');
}

function guardarCambioRow() {
  const orden = document.getElementById('cm_orden').value.trim();
  const cliente = document.getElementById('cm_cliente').value.trim();
  const correo = document.getElementById('cm_correo').value.trim();
  if (!orden || !cliente || !correo) {
    toast('Completa orden, cliente y correo', 'warning');
    return;
  }
  const rows = readCambiosLS();
  const id = 'cm-' + Date.now();
  rows.push({ id, orden, cliente, correo, estado: 'pendiente', correo_enviado: false });
  writeCambiosLS(rows);
  closeModal('cambioModal');
  loadCambiosST();
  toast('Fila guardada (solo en este navegador)', 'success');
}

function marcarCambioListo(id) {
  const rows = readCambiosLS();
  const r = rows.find((x) => x.id === id);
  if (r) {
    r.estado = 'listo';
    writeCambiosLS(rows);
    loadCambiosST();
    toast('Marcado como listo', 'success');
  }
}

function eliminarCambio(id) {
  if (!confirm('¿Eliminar esta fila de prueba?')) return;
  writeCambiosLS(readCambiosLS().filter((x) => x.id !== id));
  loadCambiosST();
}

function buildCambioEmailHtml({ cliente, orden }) {
  return `
<div style="background:#6d28e9; padding:30px 10px; font-family: Arial, sans-serif;">
  <div style="max-width:600px; margin:auto; background:#f5edff; border-radius:12px; padding:30px;">
    <div style="text-align:center; margin-bottom:25px;">
      <img src="${LOGO_URL_CAMBIOS_ST}" alt="SoyMomo" width="180" />
    </div>
    <hr style="border:none; border-top:1px solid #d6c7ff; margin:30px 0;">
    <h2 style="text-align:center; margin:0 0 10px 0; color:#2b0a3d;">Tu nuevo equipo ya está disponible ✅</h2>
    <p style="text-align:center; color:#5a3b6e; font-size:14px; margin-bottom:25px;">El nuevo dispositivo está listo para retiro.</p>
    <div style="background:#ede4ff; border:1px solid #d6c7ff; padding:20px; border-radius:10px; margin:25px 0;">
      <p style="margin:0; font-size:14px; color:#2b0a3d; text-align:center;"><strong>Orden:</strong> ST ${escapeHtml(orden)}</p>
    </div>
    <p style="font-size:14px; color:#2b0a3d;">Hola <strong>${escapeHtml(cliente)}</strong></p>
    <p style="font-size:14px; color:#2b0a3d; line-height:1.6;">Debido a la alta demanda, el stock presentó un retraso. Sin embargo, <strong>tu equipo ya se encuentra disponible para ser retirado.</strong></p>
    <p style="font-size:14px; color:#2b0a3d;">Gracias por tu paciencia y confianza.</p>
    <hr style="border:none; border-top:1px solid #d6c7ff; margin:30px 0;">
    <p style="font-size:13px; color:#5a3b6e; text-align:center; margin:0;">Servicio Técnico SoyMomo</p>
  </div>
</div>`;
}

function previewCambioMail(id) {
  const r = readCambiosLS().find((x) => x.id === id);
  if (!r) return;
  document.getElementById('cambioPreviewBody').innerHTML = buildCambioEmailHtml({ cliente: r.cliente, orden: r.orden });
  openModal('cambioPreviewModal');
}

Object.assign(window, {
  switchView,
  closeModal,
  openModal,
  loadDashboard,
  loadValidacion,
  setValTab,
  abrirAprobacion,
  confirmarAprobacion,
  abrirRechazo,
  confirmarRechazo,
  debouncedLoadOrdenes,
  debouncedSearch,
  loadOrdenes,
  goPage,
  abrirOrden,
  guardarBoletaOrden,
  cambiarEstado,
  abrirEnvioEmail,
  confirmarEnvioEmail,
  generarInforme,
  abrirNuevaOrden,
  selNuevaCanal,
  updateModelos,
  toggleOtroField,
  cargarSolicitud,
  syncComprobanteMicro,
  refreshComprobantePUI,
  submitNuevaOrden,
  togglePlazoOtro,
  loadCambiosST,
  abrirModalCambio,
  guardarCambioRow,
  marcarCambioListo,
  eliminarCambio,
  previewCambioMail,
  salir,
});

setFirestoreHint();
(async () => {
  const ok = await checkAuth();
  if (!ok) return;
  await loadDashboard();
})();
