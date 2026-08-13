const express = require('express');
const router = express.Router();
const db = require('../database/db');

const baseQuery = `
  SELECT t.*, m.nombre as mascota_nombre, m.especie, m.raza,
         m.edad_anios, m.edad_meses, m.peso as mascota_peso,
         d.nombre as dueno_nombre, d.telefono as dueno_telefono, d.direccion as dueno_direccion
  FROM tratamientos t
  JOIN mascotas m ON t.mascota_id = m.id
  JOIN duenos d ON m.dueno_id = d.id
`;

// GET /api/tratamientos?mes=YYYY-MM&tipo=...
router.get('/', (req, res) => {
  const { mes, tipo } = req.query;
  const conditions = [];
  const params = [];

  if (mes) { conditions.push(`t.fecha LIKE ?`); params.push(`${mes}%`); }
  if (tipo) { conditions.push(`t.tipo = ?`); params.push(tipo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  res.json(db.prepare(`${baseQuery} ${where} ORDER BY t.fecha ASC, t.hora ASC`).all(...params));
});

// GET /api/tratamientos/proximos?dias=30&tipo=...
router.get('/proximos', (req, res) => {
  const dias = Math.min(parseInt(req.query.dias) || 30, 365);
  const hoy = new Date().toISOString().split('T')[0];
  const fin = new Date();
  fin.setDate(fin.getDate() + dias);
  const finStr = fin.toISOString().split('T')[0];

  const conditions = [`t.fecha BETWEEN ? AND ?`];
  const params = [hoy, finStr];

  if (req.query.tipo) { conditions.push(`t.tipo = ?`); params.push(req.query.tipo); }

  res.json(db.prepare(`${baseQuery} WHERE ${conditions.join(' AND ')} ORDER BY t.fecha ASC, t.hora ASC`).all(...params));
});

// POST /api/tratamientos
router.post('/', (req, res) => {
  const { mascota_id, tipo, fecha, hora, notas } = req.body;
  const tiposValidos = ['vacunacion', 'desparasitacion', 'bano', 'consulta'];
  if (!mascota_id || !tipo || !fecha || !tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: 'mascota_id, tipo válido y fecha son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO tratamientos (mascota_id, tipo, fecha, hora, notas) VALUES (?, ?, ?, ?, ?)`
  ).run(mascota_id, tipo, fecha, hora || null, notas || null);
  res.status(201).json(db.prepare(`${baseQuery} WHERE t.id = ?`).get(result.lastInsertRowid));
});

// DELETE /api/tratamientos/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM tratamientos WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tratamiento no encontrado' });
  res.json({ mensaje: 'Tratamiento eliminado' });
});

module.exports = router;
