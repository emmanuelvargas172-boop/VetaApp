const express = require('express');
const router = express.Router();
const db = require('../database/db');

// IMPORTANT: specific routes BEFORE /:id to avoid collisions

router.get('/alertas', (req, res) => {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM inventario WHERE cantidad <= cantidad_minima`
  ).get();
  res.json({ count: row.count });
});

router.get('/buscar', (req, res) => {
  const q = req.query.q || '';
  const productos = db.prepare(
    `SELECT id, nombre, cantidad, unidad FROM inventario WHERE nombre LIKE ? ORDER BY nombre LIMIT 8`
  ).all(`%${q}%`);
  res.json(productos);
});

router.get('/', (req, res) => {
  const productos = db.prepare(`SELECT * FROM inventario ORDER BY nombre`).all();
  res.json(productos);
});

router.post('/', (req, res) => {
  const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
  if (!nombre || !categoria || cantidad == null || cantidad_minima == null || !unidad) {
    return res.status(400).json({ error: 'Nombre, categoría, unidad, cantidad y cantidad mínima son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO inventario (nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nombre, categoria, parseInt(cantidad), parseInt(cantidad_minima), precio_compra ?? null, precio_venta ?? null, unidad);
  res.status(201).json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
  const result = db.prepare(
    `UPDATE inventario SET nombre=?, categoria=?, cantidad=?, cantidad_minima=?, precio_compra=?, precio_venta=?, unidad=? WHERE id=?`
  ).run(nombre, categoria, parseInt(cantidad), parseInt(cantidad_minima), precio_compra ?? null, precio_venta ?? null, unidad, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM inventario WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ mensaje: 'Producto eliminado correctamente' });
});

router.post('/:id/ajustar', (req, res) => {
  const { delta } = req.body;
  if (delta == null) return res.status(400).json({ error: 'delta es requerido' });
  const result = db.prepare(
    `UPDATE inventario SET cantidad = cantidad + ? WHERE id = ?`
  ).run(parseInt(delta), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(req.params.id));
});

module.exports = router;
