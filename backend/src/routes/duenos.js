const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
  const duenos = db.prepare(`SELECT * FROM duenos ORDER BY nombre ASC`).all();
  res.json(duenos);
});

// Buscar por teléfono (debe ir ANTES de /:id)
router.get('/buscar', (req, res) => {
  const { telefono } = req.query;
  if (!telefono) return res.json(null);
  const dueno = db.prepare(`SELECT * FROM duenos WHERE telefono = ?`).get(telefono.trim());
  res.json(dueno || null);
});

router.get('/:id', (req, res) => {
  const dueno = db.prepare(`SELECT * FROM duenos WHERE id = ?`).get(req.params.id);
  if (!dueno) return res.status(404).json({ error: 'Dueño no encontrado' });
  res.json(dueno);
});

router.post('/', (req, res) => {
  const { nombre, telefono, direccion } = req.body;
  if (!nombre || !telefono) {
    return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO duenos (nombre, telefono, direccion) VALUES (?, ?, ?)`
  ).run(nombre.trim(), telefono.trim(), direccion || null);
  res.status(201).json(db.prepare(`SELECT * FROM duenos WHERE id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { nombre, telefono, direccion } = req.body;
  const result = db.prepare(
    `UPDATE duenos SET nombre = ?, telefono = ?, direccion = ? WHERE id = ?`
  ).run(nombre, telefono, direccion, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Dueño no encontrado' });
  res.json(db.prepare(`SELECT * FROM duenos WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM duenos WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Dueño no encontrado' });
  res.json({ mensaje: 'Dueño eliminado correctamente' });
});

module.exports = router;
