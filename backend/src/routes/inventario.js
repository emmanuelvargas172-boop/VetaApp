const express = require('express');
const router = express.Router();
const db = require('../database/db');

// IMPORTANT: specific routes BEFORE /:id to avoid collisions

router.get('/alertas', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM inventario WHERE cantidad <= cantidad_minima`
    ).get();
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

router.get('/buscar', (req, res) => {
  try {
    const q = req.query.q ?? '';
    const productos = db.prepare(
      `SELECT id, nombre, cantidad, unidad FROM inventario WHERE nombre LIKE ? ORDER BY nombre LIMIT 8`
    ).all(`%${q}%`);
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar productos' });
  }
});

router.get('/', (req, res) => {
  try {
    const productos = db.prepare(`SELECT * FROM inventario ORDER BY nombre`).all();
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

router.post('/', (req, res) => {
  try {
    const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
    if (!nombre || !categoria || cantidad == null || cantidad_minima == null || !unidad) {
      return res.status(400).json({ error: 'Nombre, categoría, unidad, cantidad y cantidad mínima son requeridos' });
    }
    const result = db.prepare(
      `INSERT INTO inventario (nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(nombre, categoria, parseInt(cantidad, 10), parseInt(cantidad_minima, 10), precio_compra ?? null, precio_venta ?? null, unidad);
    res.status(201).json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
    if (!nombre || !categoria || cantidad == null || cantidad_minima == null || !unidad) {
      return res.status(400).json({ error: 'Nombre, categoría, unidad, cantidad y cantidad mínima son requeridos' });
    }
    const result = db.prepare(
      `UPDATE inventario SET nombre=?, categoria=?, cantidad=?, cantidad_minima=?, precio_compra=?, precio_venta=?, unidad=? WHERE id=?`
    ).run(nombre, categoria, parseInt(cantidad, 10), parseInt(cantidad_minima, 10), precio_compra ?? null, precio_venta ?? null, unidad, parseInt(req.params.id, 10));
    if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(parseInt(req.params.id, 10)));
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(`DELETE FROM inventario WHERE id = ?`).run(parseInt(req.params.id, 10));
    if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

router.post('/:id/ajustar', (req, res) => {
  try {
    const { delta } = req.body;
    if (delta == null || !Number.isInteger(Number(delta))) {
      return res.status(400).json({ error: 'delta debe ser un número entero' });
    }
    const result = db.prepare(
      `UPDATE inventario SET cantidad = cantidad + ? WHERE id = ?`
    ).run(parseInt(delta, 10), parseInt(req.params.id, 10));
    if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(parseInt(req.params.id, 10)));
  } catch (err) {
    res.status(500).json({ error: 'Error al ajustar cantidad' });
  }
});

module.exports = router;
