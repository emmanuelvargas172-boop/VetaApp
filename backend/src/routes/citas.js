const express = require('express');
const router = express.Router();
const db = require('../database/db');

const query = `
  SELECT c.*, m.nombre as mascota_nombre, m.especie, d.nombre as dueno_nombre, d.telefono as dueno_telefono
  FROM citas c
  JOIN mascotas m ON c.mascota_id = m.id
  JOIN duenos d ON m.dueno_id = d.id
`;

router.get('/', (req, res) => {
  const { fecha, estado, semana } = req.query;
  let sql = query;
  const params = [];

  if (fecha) {
    sql += ` WHERE c.fecha = ?`;
    params.push(fecha);
  } else if (semana) {
    sql += ` WHERE c.fecha BETWEEN date(?, 'weekday 1', '-7 days') AND date(?, 'weekday 0')`;
    params.push(semana, semana);
  }

  if (estado) {
    sql += params.length ? ` AND c.estado = ?` : ` WHERE c.estado = ?`;
    params.push(estado);
  }

  sql += ` ORDER BY c.fecha ASC, c.hora ASC`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const cita = db.prepare(`${query} WHERE c.id = ?`).get(req.params.id);
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(cita);
});

router.post('/', (req, res) => {
  const { mascota_id, veterinario, fecha, hora, motivo, notas } = req.body;
  if (!mascota_id || !veterinario || !fecha || !hora || !motivo) {
    return res.status(400).json({ error: 'Todos los campos principales son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO citas (mascota_id, veterinario, fecha, hora, motivo, notas) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(mascota_id, veterinario, fecha, hora, motivo, notas || null);
  res.status(201).json(db.prepare(`${query} WHERE c.id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { mascota_id, veterinario, fecha, hora, motivo, estado, notas } = req.body;
  const result = db.prepare(
    `UPDATE citas SET mascota_id=?, veterinario=?, fecha=?, hora=?, motivo=?, estado=?, notas=? WHERE id=?`
  ).run(mascota_id, veterinario, fecha, hora, motivo, estado, notas, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(db.prepare(`${query} WHERE c.id = ?`).get(req.params.id));
});

router.patch('/:id/estado', (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  db.prepare(`UPDATE citas SET estado = ? WHERE id = ?`).run(estado, req.params.id);
  res.json(db.prepare(`${query} WHERE c.id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM citas WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json({ mensaje: 'Cita eliminada correctamente' });
});

module.exports = router;
