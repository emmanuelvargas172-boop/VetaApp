const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../../vetaapp.db'));

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS duenos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    direccion TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS mascotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    especie TEXT NOT NULL,
    raza TEXT,
    edad_anios INTEGER DEFAULT 0,
    edad_meses INTEGER DEFAULT 0,
    peso REAL,
    foto TEXT,
    dueno_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (dueno_id) REFERENCES duenos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS historias_clinicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mascota_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    motivo TEXT NOT NULL,
    diagnostico TEXT,
    tratamiento TEXT,
    medicamentos TEXT,
    veterinario TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS vacunas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mascota_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    fecha_aplicacion TEXT NOT NULL,
    proxima_dosis TEXT,
    veterinario TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mascota_id INTEGER NOT NULL,
    veterinario TEXT NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    motivo TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE
  );
`);

// Agregar campo peso a historias_clinicas si no existe
try { db.exec(`ALTER TABLE historias_clinicas ADD COLUMN peso REAL`); } catch (_) {}

module.exports = db;
