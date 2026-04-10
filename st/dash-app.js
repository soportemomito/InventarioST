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

/** Web App st/google-apps-script-informe.gs (Implementar → URL /exec) */
const INFORME_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz3Mz5_sc9jDpZlkDg13xw4qpgWQNJfi2_tjN3K9j2Uf1tRUfWGD7cjI5NmmgX9mE8c/exec';

/** Opcional: localStorage.setItem('st_informe_script_url','https://…/exec') */
const LS_INFORME_URL = 'st_informe_script_url';

function getInformeScriptUrl() {
  try {
    const u = (localStorage.getItem(LS_INFORME_URL) || '').trim();
    if (u) return u;
  } catch (_) {}
  return (INFORME_SCRIPT_URL || '').trim();
}

function informeConfigFaltaMsg() {
  return 'Informe Google Docs: falta la URL de la Web App. Edita INFORME_SCRIPT_URL en st/dash-app.js o localStorage st_informe_script_url.';
}

function getInformeConfigSource() {
  try {
    if ((localStorage.getItem(LS_INFORME_URL) || '').trim()) return 'localStorage';
  } catch (_) {}
  if ((INFORME_SCRIPT_URL || '').trim()) return 'codigo';
  return null;
}

function abrirInformeConfigModal() {
  const urlEl = document.getElementById('informeCfgUrl');
  const stEl = document.getElementById('informeCfgStatus');
  if (!urlEl || !stEl) return;
  urlEl.value = getInformeScriptUrl();
  const src = getInformeConfigSource();
  stEl.textContent = src
    ? `Origen actual: ${src === 'codigo' ? 'archivo st/dash-app.js' : 'este navegador (localStorage)'}. Puedes sobrescribir la URL guardando aquí.`
    : 'No hay URL: completa el campo o edita INFORME_SCRIPT_URL en dash-app.js.';
  openModal('informeConfigModal');
}

function guardarInformeConfig() {
  const url = document.getElementById('informeCfgUrl')?.value.trim() || '';
  if (!url || !/^https:\/\//i.test(url)) {
    toast('Indica una URL https válida del Apps Script (termina en /exec).', 'warning');
    return;
  }
  try {
    localStorage.setItem(LS_INFORME_URL, url);
    closeModal('informeConfigModal');
    toast('URL guardada en este navegador.', 'success');
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, 'error');
  }
}

function limpiarInformeConfigLocal() {
  try {
    localStorage.removeItem(LS_INFORME_URL);
    try {
      localStorage.removeItem('st_informe_script_secret');
    } catch (_) {}
    closeModal('informeConfigModal');
    toast('Se quitó la URL del navegador (y un posible secreto antiguo). Si está en dash-app.js, sigue al recargar.', 'info', 5500);
  } catch (e) {
    toast(e.message, 'error');
  }
}

const LS_CAMBIOS_SCRIPT_URL = 'st_cambios_st_script_url';
/** Pega aquí la URL /exec tras publicar st/google-apps-script-cambios-st.gs */
const CAMBIOS_ST_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwboQyvtZYnwnU6OgkqV0Ck_wTf3jE5ILRP1N7UesKDeyeMqGVDt_ssC1mGTmLPFFDn/exec';
/** @type {{ headers: string[], rows: Record<string,string>[] }} */
let cambiosStCache = { headers: [], rows: [] };

function getCambiosStScriptUrl() {
  try {
    const u = (localStorage.getItem(LS_CAMBIOS_SCRIPT_URL) || '').trim();
    if (u && u.startsWith('http')) return u.replace(/\/$/, '');
  } catch (_) {}
  return (CAMBIOS_ST_SCRIPT_URL || '').trim().replace(/\/$/, '');
}

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
  const av = document.getElementById('stUserbarAvatar');
  const nm = document.getElementById('stUserbarName');
  if (av) av.textContent = initials;
  if (nm) nm.textContent = AGENT.name;
  try {
    await getCountFromServer(query(collection(db, COL_V), limit(1)));
  } catch (e) {
    toast('Firestore: ' + (e.code || e.message) + '. Revisa reglas de seguridad.', 'error');
    return false;
  }
  setInventarioLinkHref();
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
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  validacion: 'Proceso de validación',
  ordenes: 'Órdenes',
  mailst: 'Envío correos',
  cambios: 'Cambios garantía ST',
};

function switchView(name) {
  try {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item[data-view]').forEach((n) => n.classList.remove('active'));
    const view = document.getElementById(`view-${name}`);
    if (view) view.classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-view="${name}"]`);
    if (navItem) navItem.classList.add('active');
    const tt = document.getElementById('topbarTitle');
    if (tt) tt.textContent = VIEW_TITLES[name] || name;
    const searchViews = ['ordenes'];
    const sw = document.getElementById('topbarSearchWrap');
    if (sw) sw.style.display = searchViews.includes(name) ? 'flex' : 'none';
    if (name === 'dashboard') loadDashboard();
    if (name === 'validacion') loadValidacion();
    if (name === 'ordenes') loadOrdenes();
    if (name === 'cambios') loadCambiosST();
    if (name === 'mailst') correoStOnEnterView();
  } catch (e) {
    console.error('switchView', name, e);
    toast('Error al cambiar de vista: ' + (e.message || e), 'error');
  }
}

function stCloseMobileNav() {
  document.body.classList.remove('st-nav-open');
}

/** Clic en sidebar vía delegación (onclick + type=module no siempre exponen funciones al handler inline). */
function bindStSidebarNav() {
  const side = document.querySelector('.sidebar');
  if (!side) return;
  side.addEventListener('click', (e) => {
    const linkInv = e.target.closest('a#stNavInventario');
    if (linkInv) {
      stCloseMobileNav();
      return;
    }
    const item = e.target.closest('.nav-item[data-view]');
    if (!item || item.tagName === 'A') return;
    e.preventDefault();
    const v = item.getAttribute('data-view');
    if (!v) return;
    if (v === 'nueva') abrirNuevaOrden();
    else switchView(v);
    stCloseMobileNav();
  });
  side.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.nav-item[data-view]');
    if (!item || item.tagName === 'A') return;
    e.preventDefault();
    item.click();
  });
}

function bindStShellUi() {
  document.getElementById('stMenuBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('st-nav-open');
  });
  document.getElementById('stSidebarBackdrop')?.addEventListener('click', stCloseMobileNav);
  document.getElementById('stTopNuevaOrden')?.addEventListener('click', () => abrirNuevaOrden());
  document.getElementById('topbarSearch')?.addEventListener('input', debouncedSearch);
}

/** Si inventario está en otro dominio, usa localStorage.soymomo_inventario_url para el enlace del menú. */
function setInventarioLinkHref() {
  const a = document.getElementById('stNavInventario');
  if (!a) return;
  let base = '';
  try {
    base = (localStorage.getItem(LS_INVENTARIO_URL) || '').trim();
  } catch (_) {}
  const path = 'index.html';
  if (base.startsWith('http')) {
    const clean = base.replace(/\/$/, '');
    a.href = `${clean}/${path}`;
  } else {
    a.href = `../${path}`;
  }
}

const ESTADO_BADGE = {
  Ingresado: '<span class="badge badge-blue">Ingresado</span>',
  'En revisión': '<span class="badge badge-amber">En revisión</span>',
  Listo: '<span class="badge badge-green">Listo ✓</span>',
  Entregado: '<span class="badge badge-gray">Entregado</span>',
  'No reparado': '<span class="badge badge-red">No reparado</span>',
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
    const extra = o.plazo && String(o.plazo).trim();
    // readPlazoDias ya guarda plazo igual que base ("7 días hábiles"); no repetir en informe/UI
    if (extra && extra !== base) return `${base} · ${extra}`;
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
    const [totalSnap, pendVSnap, revSnap, listoSnap, pendItemsSnap, ordenesSnap] = await Promise.all([
      getCountFromServer(collection(db, COL_O)),
      getCountFromServer(query(collection(db, COL_V), where('estado', '==', 'pendiente'))),
      getCountFromServer(query(collection(db, COL_O), where('estado', '==', 'En revisión'))),
      getCountFromServer(query(collection(db, COL_O), where('estado', '==', 'Listo'))),
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
    el.innerHTML = `
      <div class="empty" style="padding:20px 16px 24px;text-align:left;">
        <div class="empty-icon" style="text-align:center;">✅</div>
        <p style="text-align:center;font-weight:600;color:#374151;margin-bottom:8px;">Nadie esperando aprobación</p>
        <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0;">
          Aquí solo aparecen envíos del <strong>formulario web</strong> (<code style="font-size:10px;">st/ingreso.html</code>) que todavía hay que aprobar o rechazar.
          Las órdenes ya creadas (p. ej. con <strong>Nueva orden</strong> o tras aprobar una solicitud) están en la tabla <strong>Órdenes recientes</strong> y en la vista <strong>Órdenes</strong>, no en esta lista.
        </p>
        <p style="text-align:center;margin-top:14px;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="switchView('ordenes')">Ir a Órdenes</button>
        </p>
      </div>`;
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
          ${['Ingresado', 'En revisión', 'Listo', 'Entregado', 'No reparado']
            .map((e) => `<option ${e === o.estado ? 'selected' : ''}>${e}</option>`)
            .join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="cambiarEstado('${o.id}')">Actualizar estado</button>
      </div>
    </div>
  `;

  document.getElementById('ordenModalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal('ordenModal')">Cerrar</button>
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

const MAIL_LOG_KEY = { entrada: 'st_mail_log_entrada', salida: 'st_mail_log_salida' };
const MAIL_TAB_IDS = ['entrada', 'log_entrada', 'salida', 'log_salida'];

function correoStLogRead(flujo) {
  try {
    const raw = localStorage.getItem(MAIL_LOG_KEY[flujo]);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function correoStLogWrite(flujo, arr) {
  localStorage.setItem(MAIL_LOG_KEY[flujo], JSON.stringify(arr.slice(0, 500)));
}

function correoStAppendLog(flujo, entry) {
  const arr = correoStLogRead(flujo);
  arr.unshift({
    ts: Date.now(),
    orden: entry.orden || '—',
    cliente: entry.cliente || '—',
    correo: entry.correo || '—',
    equipo: entry.equipo || '—',
    canal: entry.canal || '—',
    ok: !!entry.ok,
    mensaje: entry.mensaje || '',
  });
  correoStLogWrite(flujo, arr);
}

function correoStRenderLogTable(flujo) {
  const tbody = document.getElementById(flujo === 'entrada' ? 'stMailLogTbody_entrada' : 'stMailLogTbody_salida');
  if (!tbody) return;
  const rows = correoStLogRead(flujo);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:#6b7280;font-size:13px;">Sin registros aún.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((e) => {
      const dt = new Date(e.ts);
      const fecha = dt.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
      const badge = e.ok
        ? '<span class="badge badge-green">Enviado</span>'
        : '<span class="badge" style="background:#fee2e2;color:#991b1b">Error</span>';
      return `<tr>
        <td style="white-space:nowrap;font-size:12px;">${escapeAttr(fecha)}</td>
        <td><strong>${escapeAttr(String(e.orden))}</strong></td>
        <td>${escapeAttr(String(e.cliente))}</td>
        <td style="font-size:12px;">${escapeAttr(String(e.correo))}</td>
        <td>${escapeAttr(String(e.equipo))}</td>
        <td>${escapeAttr(String(e.canal))}</td>
        <td>${badge}</td>
        <td style="font-size:12px;color:#4b5563;">${escapeAttr(String(e.mensaje || ''))}</td>
      </tr>`;
    })
    .join('');
}

function correoStSetTab(tab) {
  MAIL_TAB_IDS.forEach((id) => {
    const btn = document.querySelector(`[data-mailst-tab="${id}"]`);
    const panel = document.getElementById(`mailst-panel-${id}`);
    const on = id === tab;
    if (btn) btn.classList.toggle('active', on);
    if (panel) panel.classList.toggle('active', on);
  });
  if (tab === 'log_entrada') correoStRenderLogTable('entrada');
  if (tab === 'log_salida') correoStRenderLogTable('salida');
}

function correoStOnEnterView() {
  correoStRenderLogTable('entrada');
  correoStRenderLogTable('salida');
}

function correoStVaciarLog(flujo) {
  if (!confirm('¿Vaciar el log de esta pestaña en este navegador?')) return;
  correoStLogWrite(flujo, []);
  correoStRenderLogTable(flujo);
  toast('Log vaciado', 'info');
}

function correoStEmailValido(s) {
  const t = String(s || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function enviarCorreoInformeOrden(ordenId, evidenciasUrl, flujoCorreo) {
  const urlOk = getInformeScriptUrl();
  if (!urlOk || !/^https:\/\//i.test(urlOk)) {
    throw new Error(informeConfigFaltaMsg());
  }
  const d = await getDoc(doc(db, COL_O, ordenId));
  if (!d.exists()) throw new Error('Orden no encontrada');
  const o = normalizeOrden(d.id, d.data());
  const orden = buildInformePayloadFromOrden(o);
  const fc = flujoCorreo === 'salida' ? 'salida' : 'entrada';
  const j = await postInformeScript({
    action: 'enviar',
    orden,
    informe_url: o.informe_url || '',
    evidencias_url: evidenciasUrl || '',
    flujo_correo: fc,
    orden_status: o.estado || '',
  });
  if (j.informe_url && j.informe_url !== o.informe_url) {
    await updateDoc(doc(db, COL_O, ordenId), { informe_url: j.informe_url });
  }
  return j;
}

async function lookupOrdenPorNumero(num) {
  const snap = await getDocs(query(collection(db, COL_O), where('num_orden', '==', num), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, data: d.data() };
}

function correoStDocCell(informeUrl) {
  const u = String(informeUrl || '').trim();
  if (!u) return '<span style="color:#d97706;font-size:12px;">Sin doc · se genera al enviar</span>';
  const safe = escapeAttr(u);
  return `<a href="${safe}" target="_blank" rel="noopener" style="color:var(--p600);font-size:12px;">Abrir</a>`;
}

async function correoStCargar(kind) {
  const ta = document.getElementById(`stMailTa_${kind}`);
  const tbody = document.getElementById(`stMailTbody_${kind}`);
  if (!ta || !tbody) return;
  const nums = ta.value.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean);
  tbody.innerHTML = '';
  if (!nums.length) {
    toast('Escribe al menos un N° de orden', 'warning');
    return;
  }
  try {
    for (const num of nums) {
      const hit = await lookupOrdenPorNumero(num);
      const tr = document.createElement('tr');
      if (!hit) {
        tr.innerHTML = `<td></td><td>${escapeAttr(num)}</td><td colspan="8" style="color:#dc2626">No encontrada en Firestore</td>`;
        tbody.appendChild(tr);
        continue;
      }
      const o = normalizeOrden(hit.id, hit.data);
      tr.dataset.ordenId = hit.id;
      const equipo = escapeAttr(o.producto || '—');
      const modelo = escapeAttr(o.modelo || '—');
      const color = escapeAttr(o.color || '—');
      const warnCorreo = !correoStEmailValido(o.correo) ? ' · revisar correo' : '';
      tr.innerHTML = `
        <td><input type="checkbox" class="st-mail-sel" checked title="Incluir al enviar" aria-label="Incluir al enviar"/></td>
        <td><strong>${escapeAttr(o.num_orden || num)}</strong></td>
        <td>${escapeAttr(o.nombre || '—')}</td>
        <td>${escapeAttr(o.correo || '—')}</td>
        <td>${equipo}</td>
        <td>${modelo}</td>
        <td>${color}</td>
        <td>${correoStDocCell(o.informe_url)}</td>
        <td><strong>${escapeAttr(o.canal || '—')}</strong></td>
        <td style="font-size:12px;">${escapeAttr(o.estado || '—')}${warnCorreo}</td>`;
      tbody.appendChild(tr);
    }
    toast('Órdenes cargadas', 'success');
  } catch (e) {
    toast(e.message || 'Error al cargar', 'error');
  }
}

async function correoStEnviar(kind) {
  const flujo = kind === 'salida' ? 'salida' : 'entrada';
  const tbody = document.getElementById(`stMailTbody_${kind}`);
  const evid = document.getElementById(`stMailEvid_${kind}`)?.value.trim() || '';
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr[data-orden-id]')];
  const toSend = rows.filter((tr) => {
    const cb = tr.querySelector('.st-mail-sel');
    return cb && cb.checked;
  });
  if (!toSend.length) {
    toast('No hay filas marcadas para enviar (o falta cargar órdenes válidas)', 'warning');
    return;
  }
  let ok = 0;
  let fail = 0;
  try {
    for (const tr of toSend) {
      const id = tr.dataset.ordenId;
      let o;
      try {
        const d = await getDoc(doc(db, COL_O, id));
        if (!d.exists()) throw new Error('Orden no encontrada');
        o = normalizeOrden(d.id, d.data());
      } catch (e) {
        fail++;
        correoStAppendLog(flujo, {
          orden: id,
          cliente: '—',
          correo: '—',
          equipo: '—',
          canal: '—',
          ok: false,
          mensaje: e.message || 'Error al leer orden',
        });
        continue;
      }
      const num = o.num_orden || '—';
      const cliente = o.nombre || '—';
      const correo = (o.correo || '').trim();
      const equipo = `${o.producto || ''} ${o.modelo || ''}`.trim() || '—';
      const canal = o.canal || '—';

      if (!correoStEmailValido(correo)) {
        fail++;
        correoStAppendLog(flujo, {
          orden: num,
          cliente,
          correo: correo || '—',
          equipo,
          canal,
          ok: false,
          mensaje: 'Correo vacío o inválido',
        });
        continue;
      }

      try {
        await enviarCorreoInformeOrden(id, evid, flujo);
        ok++;
        await new Promise((r) => setTimeout(r, 500));
        correoStAppendLog(flujo, {
          orden: num,
          cliente,
          correo,
          equipo,
          canal,
          ok: true,
          mensaje: 'Correo enviado correctamente',
        });
      } catch (err) {
        fail++;
        console.error(err);
        correoStAppendLog(flujo, {
          orden: num,
          cliente,
          correo,
          equipo,
          canal,
          ok: false,
          mensaje: err.message || 'Error al enviar',
        });
      }
    }
    correoStRenderLogTable(flujo);
    const parts = [];
    if (ok) parts.push(`${ok} enviado(s)`);
    if (fail) parts.push(`${fail} error(es)`);
    toast(parts.join(' · ') || 'Nada que enviar', ok && !fail ? 'success' : fail ? 'error' : 'warning', 5000);
  } catch (e) {
    toast(e.message || 'Error', 'error');
  }
}

function correoStLimpiar(kind) {
  const ta = document.getElementById(`stMailTa_${kind}`);
  if (ta) ta.value = '';
  const tb = document.getElementById(`stMailTbody_${kind}`);
  if (tb) tb.innerHTML = '';
  const ev = document.getElementById(`stMailEvid_${kind}`);
  if (ev) ev.value = '';
}

async function generarInforme(_id) {
  const urlOk = getInformeScriptUrl();
  if (!urlOk || !/^https:\/\//i.test(urlOk)) {
    toast(informeConfigFaltaMsg(), 'warning', 6000);
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
        <div class="form-section-title">Diagnóstico / presupuesto (opcional)</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Solución</label>
            <select class="form-control" id="no_solucion">
              <option value="">— Seleccionar —</option>
              <option value="Enviar diagnóstico">Enviar diagnóstico</option>
              <option value="Cambio">Cambio</option>
              <option value="Reparación">Reparación</option>
            </select>
          </div>
          <div class="form-group">
            <label>Presupuesto (CLP)</label>
            <input class="form-control" id="no_presupuesto" type="number" min="0" step="1" placeholder="Ej: 45000"/>
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
  const solucionNueva = document.getElementById('no_solucion')?.value.trim() || null;
  const presRaw = document.getElementById('no_presupuesto')?.value.trim();
  const presupuestoNueva = presRaw && Number.isFinite(Number(presRaw)) ? Number(presRaw) : null;
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
        solucion: solucionNueva,
        presupuesto: presupuestoNueva,
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

const CST_TIPO_FALLA_OPTS = [
  'Firmware / Sistema Operativo',
  'Bateria',
  'Display',
  'Touch',
  'Parlante',
  'Microfono',
  'Botones (Encendido o Volumen)',
  'Cámara',
  'Antena',
  'Cámara Baby Monitor (Lite o BMPRO2)',
  'Color Dispositivo',
  'No Enciende Monitor',
  'No Enciende Cámara',
  'No Carga',
  'No Enciende',
  'Usado',
  'Otro',
];

let cambiosFilterDebounce = null;

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

/**
 * Inicializa checkboxes TIPO DE FALLA y listeners Otro (técnico / ingresos / falla).
 */
function initCambiosStFormControls() {
  const grid = document.getElementById('cst_falla_grid');
  if (grid && !grid.dataset.ready) {
    grid.dataset.ready = '1';
    grid.innerHTML = CST_TIPO_FALLA_OPTS.map(
      (l) =>
        `<label class="check-item"><input type="checkbox" name="cst_falla" value="${escapeAttr(l)}"/> ${escapeHtml(l)}</label>`
    ).join('');
  }
  if (window.__cstFormListeners) return;
  window.__cstFormListeners = true;
  const syncTec = () => {
    const v = document.querySelector('input[name="cst_tecnico"]:checked')?.value;
    const o = document.getElementById('cst_tecnico_otro');
    if (o) o.style.display = v === '__otro' ? 'block' : 'none';
  };
  const syncIng = () => {
    const v = document.querySelector('input[name="cst_ingresos"]:checked')?.value;
    const o = document.getElementById('cst_ingresos_otro');
    if (o) o.style.display = v === '__otro' ? 'block' : 'none';
  };
  const syncFallaOtro = () => {
    const chk = document.querySelector('input[name="cst_falla"][value="Otro"]');
    const o = document.getElementById('cst_falla_otro');
    if (o && chk) o.style.display = chk.checked ? 'block' : 'none';
  };
  document.querySelectorAll('input[name="cst_tecnico"]').forEach((r) => {
    r.addEventListener('change', syncTec);
  });
  document.querySelectorAll('input[name="cst_ingresos"]').forEach((r) => {
    r.addEventListener('change', syncIng);
  });
  document.getElementById('cst_falla_grid')?.addEventListener('change', syncFallaOtro);
}

/**
 * Descarga filas desde Apps Script (action=listar_cambios).
 */
async function loadCambiosST() {
  const base = getCambiosStScriptUrl();
  const thead = document.getElementById('cambiosThead');
  const tbody = document.getElementById('cambiosTbody');
  if (!tbody) return;
  if (!base) {
    if (thead) thead.innerHTML = '<tr><th>Sin URL</th></tr>';
    tbody.innerHTML =
      '<tr><td style="padding:24px;color:#92400e;">Configura la Web App: en consola <code>localStorage.setItem(\'st_cambios_st_script_url\',\'https://…/exec\')</code> o edita CAMBIOS_ST_SCRIPT_URL en dash-app.js.</td></tr>';
    toast('Falta URL de Apps Script para Cambios ST', 'warning');
    return;
  }
  tbody.innerHTML = '<tr class="loading-row"><td><span class="spinner spinner-dark"></span></td></tr>';
  try {
    const res = await fetch(`${base}?action=listar_cambios`);
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    cambiosStCache = { headers: j.headers || [], rows: j.rows || [] };
    renderCambiosSTTable();
    toast('Cambios ST actualizado', 'success', 2200);
  } catch (e) {
    tbody.innerHTML = `<tr><td style="padding:24px;color:#b91c1c;">${escapeHtml(e.message)}</td></tr>`;
    toast('Error cargando hoja: ' + e.message, 'error');
  }
}

function debouncedRenderCambiosST() {
  clearTimeout(cambiosFilterDebounce);
  cambiosFilterDebounce = setTimeout(() => renderCambiosSTTable(), 200);
}

/**
 * Renderiza tabla con encabezados de la hoja y aplica clases por estado / entregado.
 */
function renderCambiosSTTable() {
  const thead = document.getElementById('cambiosThead');
  const tbody = document.getElementById('cambiosTbody');
  if (!thead || !tbody) return;
  const { headers, rows } = cambiosStCache;
  const q = (document.getElementById('cambiosFilter')?.value || '').trim().toLowerCase();
  let list = rows;
  if (q) {
    list = rows.filter((r) => {
      const ord = String(r['N ORDEN'] || r['N° ORDEN'] || r['N orden'] || '').toLowerCase();
      const tec = String(r['TECNICO'] || r['TÉCNICO'] || '').toLowerCase();
      return ord.includes(q) || tec.includes(q);
    });
  }
  if (!headers.length) {
    thead.innerHTML = '<tr><th>—</th></tr>';
    tbody.innerHTML =
      '<tr><td style="text-align:center;padding:24px;color:#9ca3af;">La hoja está vacía o sin encabezados.</td></tr>';
    return;
  }
  thead.innerHTML = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="' +
      headers.length +
      '" style="text-align:center;padding:24px;color:#9ca3af;">Sin filas (o sin coincidencias con el filtro).</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map((r) => {
      const est = String(r['ESTADO DEL DISPOSITIVO'] || '').toLowerCase();
      const ent = String(r['ENTREGADO A OPERACIONES'] || '').toLowerCase();
      let cls = '';
      if (est.includes('irreparable')) cls += ' cambios-irr';
      else if (est.includes('reparable')) cls += ' cambios-rep';
      if (ent === 'sí' || ent === 'si') cls += ' cambios-ent-si';
      else if (ent === 'no') cls += ' cambios-ent-no';
      return (
        `<tr class="${cls.trim()}">` +
        headers.map((h) => `<td title="${escapeAttr(r[h] || '')}">${escapeHtml(r[h] || '')}</td>`).join('') +
        `</tr>`
      );
    })
    .join('');
}

function abrirModalCambiosSt() {
  initCambiosStFormControls();
  document.getElementById('cst_correo').value = '';
  document.getElementById('cst_n_orden').value = '';
  document.querySelectorAll('input[name="cst_tecnico"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_caja"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_sim"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_ingresos"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_falla"]').forEach((x) => (x.checked = false));
  document.getElementById('cst_tecnico_otro').value = '';
  document.getElementById('cst_ingresos_otro').value = '';
  document.getElementById('cst_falla_otro').value = '';
  document.getElementById('cst_imei').value = '';
  document.querySelectorAll('input[name="cst_estado_dev"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_form"]').forEach((x) => (x.checked = false));
  document.querySelectorAll('input[name="cst_entregado"]').forEach((x) => (x.checked = false));
  openModal('cambiosStModal');
}

/**
 * Envía fila nueva a Apps Script (append_cambio).
 */
async function submitCambiosStForm() {
  const base = getCambiosStScriptUrl();
  if (!base) {
    toast('Falta URL Web App Cambios ST', 'warning');
    return;
  }
  const correo = document.getElementById('cst_correo')?.value.trim();
  const nOrden = document.getElementById('cst_n_orden')?.value.trim();
  const tecEl = document.querySelector('input[name="cst_tecnico"]:checked');
  let tecnico = tecEl ? tecEl.value : '';
  if (tecnico === '__otro') tecnico = document.getElementById('cst_tecnico_otro')?.value.trim() || '';
  const caja = document.querySelector('input[name="cst_caja"]:checked')?.value || '';
  const sim = document.querySelector('input[name="cst_sim"]:checked')?.value || '';
  const ingEl = document.querySelector('input[name="cst_ingresos"]:checked');
  let ingresos = ingEl ? ingEl.value : '';
  if (ingresos === '__otro') ingresos = document.getElementById('cst_ingresos_otro')?.value.trim() || '';
  const fallas = [...document.querySelectorAll('input[name="cst_falla"]:checked')].map((x) => x.value);
  const fallaOtroTxt = document.getElementById('cst_falla_otro')?.value.trim() || '';
  if (fallas.includes('Otro') && fallaOtroTxt) {
    const i = fallas.indexOf('Otro');
    fallas[i] = 'Otro: ' + fallaOtroTxt;
  }
  const tipoFalla = fallas.join('; ');
  const imei = document.getElementById('cst_imei')?.value.trim() || '';
  const estDev = document.querySelector('input[name="cst_estado_dev"]:checked')?.value || '';
  const formSt = document.querySelector('input[name="cst_form"]:checked')?.value || '';
  const entregado = document.querySelector('input[name="cst_entregado"]:checked')?.value || '';

  if (
    !correo ||
    !nOrden ||
    !tecnico ||
    !caja ||
    !sim ||
    ingresos === '' ||
    !tipoFalla ||
    !imei ||
    !estDev ||
    !formSt ||
    !entregado
  ) {
    toast('Completa todos los campos obligatorios (*)', 'warning');
    return;
  }

  const row = {
    'Correo electrónico': correo,
    'N ORDEN': nOrden,
    TECNICO: tecnico,
    'CONTIENE CAJA': caja,
    'CONTIENE SIM': sim,
    'NUMERO DE INGRESOS EXTRA A SERVICIO TECNICO': ingresos,
    'TIPO DE FALLA': tipoFalla,
    'IMEI (RELOJ)': imei,
    'ESTADO DEL DISPOSITIVO': estDev,
    'FORMULARIO DE CAMBIOS ST': formSt,
    'ENTREGADO A OPERACIONES': entregado,
  };

  const btn = document.getElementById('cstSubmitBtn');
  const prev = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-dark"></span> Guardando…';
  }
  try {
    const res = await fetch(base, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'append_cambio', row }),
    });
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(text.slice(0, 200));
    }
    if (!res.ok || j.error) throw new Error(j.error || 'Error');
    closeModal('cambiosStModal');
    toast('Fila agregada en «Cambios ST»', 'success');
    await loadCambiosST();
  } catch (e) {
    toast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prev || '<span>Guardar en hoja</span>';
    }
  }
}

bindStSidebarNav();
bindStShellUi();
setInventarioLinkHref();

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
  generarInforme,
  correoStCargar,
  correoStEnviar,
  correoStLimpiar,
  correoStSetTab,
  correoStVaciarLog,
  abrirInformeConfigModal,
  guardarInformeConfig,
  limpiarInformeConfigLocal,
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
  debouncedRenderCambiosST,
  abrirModalCambiosSt,
  submitCambiosStForm,
  salir,
});

setFirestoreHint();
(async () => {
  const ok = await checkAuth();
  if (!ok) return;
  await loadDashboard();
})();
