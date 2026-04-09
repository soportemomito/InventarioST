'use strict';

const express = require('express');
const cors = require('cors');
const store = require('./store.cjs');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'st-api', time: new Date().toISOString() });
});

app.get('/api/stats', (req, res) => {
  res.json(store.getStats());
});

app.get('/api/validacion', (req, res) => {
  const estado = req.query.estado || 'pendiente';
  const items = store.listValidacion(estado);
  res.json({ items });
});

app.post('/api/validacion', (req, res) => {
  const body = req.body || {};
  if (!body.nombre || !body.correo || !body.producto || !body.modelo || !body.origen || !body.falla1) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const v = store.createValidacion(body);
  res.status(201).json(v);
});

app.patch('/api/validacion/:id/aprobar', (req, res) => {
  const r = store.aprobarValidacion(req.params.id, req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r.orden);
});

app.patch('/api/validacion/:id/rechazar', (req, res) => {
  const motivo = (req.body && req.body.motivo) || 'Sin motivo';
  const r = store.rechazarValidacion(req.params.id, motivo);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

app.get('/api/ordenes', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const q = req.query.q || '';
  const estado = req.query.estado || '';
  const canal = req.query.canal || '';
  const out = store.listOrdenes({ limit, offset, q, estado, canal });
  res.json(out);
});

app.get('/api/ordenes/:id', (req, res) => {
  const o = store.getOrden(req.params.id);
  if (!o) return res.status(404).json({ error: 'No encontrado' });
  res.json(o);
});

app.patch('/api/ordenes/:id', (req, res) => {
  const o = store.patchOrden(req.params.id, req.body || {});
  if (!o) return res.status(404).json({ error: 'No encontrado' });
  res.json(o);
});

app.post('/api/ordenes', (req, res) => {
  const body = req.body || {};
  if (!body.nombre || !body.correo || !body.producto || !body.modelo || !body.origen || !body.falla1) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const o = store.createOrdenManual(body);
  res.status(201).json(o);
});

app.get('/api/solicitudes/:num', async (req, res) => {
  const num = req.params.num;
  const tipo = req.query.tipo || '';
  const sheetsUrl = process.env.SHEETS_LOOKUP_URL;
  if (sheetsUrl) {
    try {
      const u = new URL(sheetsUrl);
      u.searchParams.set('num', num);
      if (tipo) u.searchParams.set('tipo', tipo);
      const r = await fetch(u.toString(), { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j && (j.nombre || j.correo)) return res.json(j);
    } catch (e) {
      return res.status(502).json({ error: 'Sheets lookup falló', detail: String(e.message) });
    }
  }
  const local = store.buscarSolicitudLocal(num, tipo);
  if (local) return res.json(local);
  return res.status(404).json({ error: 'No encontrado' });
});

app.post('/api/email/enviar', (req, res) => {
  res.json({ success: true, stub: true, received: !!req.body });
});

app.post('/api/reports/generar', (req, res) => {
  res.json({
    url: 'https://example.com/informe-stub.pdf',
    stub: true,
    received: !!req.body
  });
});

module.exports = app;
