const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Historias clínicas
router.get('/mascota/:mascotaId', (req, res) => {
  const historias = db.prepare(
    `SELECT * FROM historias_clinicas WHERE mascota_id = ? ORDER BY fecha DESC`
  ).all(req.params.mascotaId);
  res.json(historias);
});

router.post('/', (req, res) => {
  const { mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, notas } = req.body;
  if (!mascota_id || !fecha || !motivo) {
    return res.status(400).json({ error: 'Mascota, fecha y motivo son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO historias_clinicas (mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(mascota_id, fecha, motivo, diagnostico || null, tratamiento || null, medicamentos || null, veterinario || null, notas || null);
  res.status(201).json(db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, notas } = req.body;
  const result = db.prepare(
    `UPDATE historias_clinicas SET fecha=?, motivo=?, diagnostico=?, tratamiento=?, medicamentos=?, veterinario=?, notas=? WHERE id=?`
  ).run(fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, notas, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Historia no encontrada' });
  res.json(db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM historias_clinicas WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Historia no encontrada' });
  res.json({ mensaje: 'Historia eliminada correctamente' });
});

// Vacunas
router.get('/vacunas/mascota/:mascotaId', (req, res) => {
  const vacunas = db.prepare(
    `SELECT * FROM vacunas WHERE mascota_id = ? ORDER BY fecha_aplicacion DESC`
  ).all(req.params.mascotaId);
  res.json(vacunas);
});

router.post('/vacunas', (req, res) => {
  const { mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario, notas } = req.body;
  if (!mascota_id || !nombre || !fecha_aplicacion) {
    return res.status(400).json({ error: 'Mascota, nombre de vacuna y fecha son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO vacunas (mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario, notas)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(mascota_id, nombre, fecha_aplicacion, proxima_dosis || null, veterinario || null, notas || null);
  res.status(201).json(db.prepare(`SELECT * FROM vacunas WHERE id = ?`).get(result.lastInsertRowid));
});

router.delete('/vacunas/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM vacunas WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Vacuna no encontrada' });
  res.json({ mensaje: 'Vacuna eliminada correctamente' });
});

module.exports = router;
