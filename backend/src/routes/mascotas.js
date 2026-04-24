const express = require('express');
const router = express.Router();
const db = require('../database/db');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    cb(null, `mascota_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const query = `
  SELECT m.*, d.nombre as dueno_nombre, d.telefono as dueno_telefono, d.direccion as dueno_direccion
  FROM mascotas m
  JOIN duenos d ON m.dueno_id = d.id
`;

router.get('/', (req, res) => {
  const mascotas = db.prepare(`${query} ORDER BY m.nombre ASC`).all();
  res.json(mascotas);
});

router.get('/buscar', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const termino = `%${q}%`;
  const mascotas = db.prepare(
    `${query} WHERE m.nombre LIKE ? OR d.nombre LIKE ? ORDER BY m.nombre ASC`
  ).all(termino, termino);
  res.json(mascotas);
});

router.get('/:id', (req, res) => {
  const mascota = db.prepare(`${query} WHERE m.id = ?`).get(req.params.id);
  if (!mascota) return res.status(404).json({ error: 'Mascota no encontrada' });
  res.json(mascota);
});

router.post('/', upload.single('foto'), (req, res) => {
  const { nombre, especie, raza, edad_anios, edad_meses, peso, dueno_id } = req.body;
  if (!nombre || !especie || !dueno_id) {
    return res.status(400).json({ error: 'Nombre, especie y dueño son requeridos' });
  }
  const foto = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare(
    `INSERT INTO mascotas (nombre, especie, raza, edad_anios, edad_meses, peso, foto, dueno_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(nombre, especie, raza || null, edad_anios || 0, edad_meses || 0, peso || null, foto, dueno_id);
  const nueva = db.prepare(`${query} WHERE m.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

router.put('/:id', upload.single('foto'), (req, res) => {
  const { nombre, especie, raza, edad_anios, edad_meses, peso, dueno_id } = req.body;
  const mascotaActual = db.prepare(`SELECT * FROM mascotas WHERE id = ?`).get(req.params.id);
  if (!mascotaActual) return res.status(404).json({ error: 'Mascota no encontrada' });
  const foto = req.file ? `/uploads/${req.file.filename}` : mascotaActual.foto;
  db.prepare(
    `UPDATE mascotas SET nombre=?, especie=?, raza=?, edad_anios=?, edad_meses=?, peso=?, foto=?, dueno_id=? WHERE id=?`
  ).run(nombre, especie, raza || null, edad_anios || 0, edad_meses || 0, peso || null, foto, dueno_id, req.params.id);
  res.json(db.prepare(`${query} WHERE m.id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM mascotas WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
  res.json({ mensaje: 'Mascota eliminada correctamente' });
});

module.exports = router;
