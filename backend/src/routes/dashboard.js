const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];

  const citasHoy = db.prepare(
    `SELECT COUNT(*) as total FROM citas WHERE fecha = ?`
  ).get(hoy);

  const atendidosHoy = db.prepare(
    `SELECT COUNT(*) as total FROM citas WHERE fecha = ? AND estado = 'atendida'`
  ).get(hoy);

  const totalMascotas = db.prepare(
    `SELECT COUNT(*) as total FROM mascotas`
  ).get();

  const vacunasProximas = db.prepare(
    `SELECT COUNT(*) as total FROM vacunas
     WHERE proxima_dosis BETWEEN date('now') AND date('now', '+30 days')`
  ).get();

  const vacunasUrgentes = db.prepare(
    `SELECT COUNT(*) as total FROM vacunas
     WHERE proxima_dosis BETWEEN date('now') AND date('now', '+3 days')`
  ).get();

  const vacunasSemana = db.prepare(
    `SELECT COUNT(*) as total FROM vacunas
     WHERE proxima_dosis BETWEEN date('now', '+4 days') AND date('now', '+7 days')`
  ).get();

  const citasDelDia = db.prepare(
    `SELECT c.*, m.nombre as mascota_nombre, m.especie
     FROM citas c
     JOIN mascotas m ON c.mascota_id = m.id
     WHERE c.fecha = ? AND c.estado != 'cancelada'
     ORDER BY c.hora ASC`
  ).all(hoy);

  res.json({
    citasHoy: citasHoy.total,
    atendidosHoy: atendidosHoy.total,
    totalMascotas: totalMascotas.total,
    vacunasProximas: vacunasProximas.total,
    vacunasUrgentes: vacunasUrgentes.total,
    vacunasSemana: vacunasSemana.total,
    citasDelDia
  });
});

module.exports = router;
