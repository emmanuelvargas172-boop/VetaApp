const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/vacunas', (req, res) => {
  const dias = parseInt(req.query.dias) || 30;
  const recordatorios = db.prepare(
    `SELECT v.*, m.nombre as mascota_nombre, m.especie, m.raza,
            d.nombre as dueno_nombre, d.telefono as dueno_telefono
     FROM vacunas v
     JOIN mascotas m ON v.mascota_id = m.id
     JOIN duenos d ON m.dueno_id = d.id
     WHERE v.proxima_dosis BETWEEN date('now') AND date('now', '+' || ? || ' days')
     ORDER BY v.proxima_dosis ASC`
  ).all(dias);
  res.json(recordatorios);
});

module.exports = router;
