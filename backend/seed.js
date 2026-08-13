const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'vetaapp.db'));

db.exec(`PRAGMA foreign_keys = OFF`);

// Limpiar tablas en orden correcto
db.exec(`DELETE FROM tratamientos`);
db.exec(`DELETE FROM vacunas`);
db.exec(`DELETE FROM citas`);
db.exec(`DELETE FROM historias_clinicas`);
db.exec(`DELETE FROM mascotas`);
db.exec(`DELETE FROM duenos`);
try { db.exec(`DELETE FROM sqlite_sequence`); } catch (_) {}

db.exec(`PRAGMA foreign_keys = ON`);

// ── Dueños ──────────────────────────────────────────────────────────────────
const iDueno = db.prepare(`INSERT INTO duenos (nombre, telefono, direccion) VALUES (?, ?, ?)`);

const d1 = iDueno.run('María Fernanda Gómez', '3012847563', 'Cabecera del Llano').lastInsertRowid;
const d2 = iDueno.run('Carlos Andrés Rueda',  '3156789234', 'Lagos del Cacique').lastInsertRowid;
const d3 = iDueno.run('Valentina Suárez',      '3187654321', 'El Jardín').lastInsertRowid;
const d4 = iDueno.run('Andrés Felipe Torres',  '3209876543', 'Provenza').lastInsertRowid;
const d5 = iDueno.run('Juliana Morales',        '3143217890', 'Cabecera').lastInsertRowid;
const d6 = iDueno.run('Santiago Pérez',         '3167890123', 'Cañaveral').lastInsertRowid;
const d7 = iDueno.run('Daniela Castro',         '3194567890', 'Álamos').lastInsertRowid;
const d8 = iDueno.run('Ricardo Vargas',         '3221345678', 'Mutis').lastInsertRowid;

// ── Mascotas ─────────────────────────────────────────────────────────────────
const iMascota = db.prepare(
  `INSERT INTO mascotas (nombre, especie, raza, edad_anios, edad_meses, peso, dueno_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const m1 = iMascota.run('Luna',   'perro', 'Golden Retriever', 4, 0, 28.0, d1).lastInsertRowid;
const m2 = iMascota.run('Simba',  'perro', 'Pastor Alemán',    6, 0, 35.0, d2).lastInsertRowid;
const m3 = iMascota.run('Michi',  'gato',  'Persa',            3, 0,  4.2, d3).lastInsertRowid;
const m4 = iMascota.run('Rocky',  'perro', 'Bulldog Francés',  2, 0, 12.0, d4).lastInsertRowid;
const m5 = iMascota.run('Nala',   'perro', 'Labrador',         5, 0, 30.0, d5).lastInsertRowid;
const m6 = iMascota.run('Canela', 'gato',  'Siamés',           2, 0,  3.8, d6).lastInsertRowid;
const m7 = iMascota.run('Max',    'perro', 'Beagle',           3, 0, 14.0, d7).lastInsertRowid;
const m8 = iMascota.run('Lola',   'perro', 'Poodle',           7, 0,  8.0, d8).lastInsertRowid;

// ── Historias Clínicas ───────────────────────────────────────────────────────
const iHC = db.prepare(
  `INSERT INTO historias_clinicas (mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

// Luna
iHC.run(m1, '2026-01-10', 'Revisión anual',
  'Paciente sana. Sin alteraciones detectadas.',
  'Vacuna polivalente aplicada. Control en 1 año.',
  null, 'Dr. Martínez', 28.0);

iHC.run(m1, '2026-03-15', 'Otitis leve oído derecho',
  'Otitis externa leve unilateral. Sin perforación de tímpano.',
  'Limpieza auricular con solución salina. Otosporin 5 gotas cada 12h por 7 días.',
  'Otosporin ótico', 'Dr. Martínez', 28.5);

// Simba
iHC.run(m2, '2026-02-05', 'Displasia leve de cadera',
  'Displasia leve bilateral de cadera confirmada por radiografía.',
  'Meloxicam 1mg/kg cada 24h por 30 días. Reposo relativo. Control en 45 días.',
  'Meloxicam 1mg/kg', 'Dr. García', 35.0);

iHC.run(m2, '2026-03-20', 'Control displasia de cadera',
  'Mejoría notable. Reducción del dolor e inflamación articular.',
  'Continuar Meloxicam mismo esquema. Fisioterapia recomendada 2 veces por semana.',
  'Meloxicam 1mg/kg', 'Dr. García', 35.0);

// Rocky
iHC.run(m4, '2026-02-22', 'Dermatitis alérgica',
  'Dermatitis alérgica moderada en abdomen y extremidades anteriores.',
  'Apoquel 5.4mg cada 24h por 30 días. Baño medicado semanal con shampoo clorhexidina 2%.',
  'Apoquel 5.4mg', 'Dr. Martínez', 12.0);

iHC.run(m4, '2026-04-01', 'Control dermatitis alérgica',
  'Respuesta positiva al tratamiento. Reducción significativa del prurito y eritema.',
  'Continuar Apoquel 5.4mg cada 24h por 15 días más. Mantener baños medicados semanales.',
  'Apoquel 5.4mg', 'Dr. Martínez', 12.2);

// Nala
iHC.run(m5, '2026-01-18', 'Esterilización (ovariohisterectomía)',
  'Cirugía de esterilización electiva sin complicaciones. Recuperación anestésica normal.',
  'Amoxicilina 500mg cada 12h por 5 días. Tramadol 50mg cada 8h por 3 días. Reposo absoluto 15 días. Retiro de puntos en 10 días.',
  'Amoxicilina 500mg, Tramadol 50mg', 'Dr. García', 30.0);

// ── Vacunas ──────────────────────────────────────────────────────────────────
const iVacuna = db.prepare(
  `INSERT INTO vacunas (mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario) VALUES (?, ?, ?, ?, ?)`
);

// Luna
iVacuna.run(m1, 'Rabia',       '2025-06-10', '2026-06-10', 'Dr. Martínez');
iVacuna.run(m1, 'Polivalente', '2026-01-10', '2027-01-10', 'Dr. Martínez');

// Simba
iVacuna.run(m2, 'Rabia',       '2025-05-15', '2026-05-15', 'Dr. García');
iVacuna.run(m2, 'Polivalente', '2026-02-05', '2027-02-05', 'Dr. García');

// Rocky
iVacuna.run(m4, 'Rabia',      '2025-07-22', '2026-07-22', 'Dr. Martínez');
iVacuna.run(m4, 'Bordetella', '2026-02-01', '2026-05-01', 'Dr. Martínez');

// Nala
iVacuna.run(m5, 'Rabia',       '2025-08-18', '2026-08-18', 'Dr. García');
iVacuna.run(m5, 'Polivalente', '2026-01-18', '2027-01-18', 'Dr. García');

// Max
iVacuna.run(m7, 'Rabia',       '2025-05-05', '2026-05-05', 'Dr. Martínez');
iVacuna.run(m7, 'Polivalente', '2025-05-05', '2026-05-05', 'Dr. Martínez');

// Michi
iVacuna.run(m3, 'Triple Felina', '2025-05-12', '2026-05-12', 'Dr. García');
iVacuna.run(m3, 'Rabia',         '2025-05-12', '2026-05-12', 'Dr. García');

// ── Citas ────────────────────────────────────────────────────────────────────
const iCita = db.prepare(
  `INSERT INTO citas (mascota_id, veterinario, fecha, hora, motivo, estado) VALUES (?, ?, ?, ?, ?, ?)`
);

iCita.run(m1, 'Dr. Martínez', '2026-04-29', '10:00', 'Control otitis',            'pendiente');
iCita.run(m4, 'Dr. Martínez', '2026-04-29', '15:00', 'Baño medicado',             'pendiente');
iCita.run(m2, 'Dr. García',   '2026-04-30', '09:00', 'Control displasia de cadera','pendiente');
iCita.run(m3, 'Dr. García',   '2026-05-01', '11:00', 'Vacunación anual',           'pendiente');

// ── Tratamientos ─────────────────────────────────────────────────────────────
const iTrat = db.prepare(
  `INSERT INTO tratamientos (mascota_id, tipo, fecha, hora, notas) VALUES (?, ?, ?, ?, ?)`
);

iTrat.run(m1, 'bano',            '2026-05-05', '10:00', 'Baño y corte completo');
iTrat.run(m8, 'bano',            '2026-05-06', '14:00', 'Peluquería completa');
iTrat.run(m4, 'bano',            '2026-05-07', '15:00', 'Baño medicado con clorhexidina 2%');
iTrat.run(m7, 'desparasitacion', '2026-05-08', '09:00', null);
iTrat.run(m2, 'consulta',        '2026-05-10', '10:00', null);
iTrat.run(m6, 'desparasitacion', '2026-05-12', '11:00', null);
iTrat.run(m5, 'consulta',        '2026-05-15', '09:00', null);

console.log('');
console.log('✅ Datos de demo cargados exitosamente');
console.log('   → 8 dueños');
console.log('   → 8 mascotas');
console.log('   → 7 historias clínicas');
console.log('   → 12 vacunas');
console.log('   → 4 citas');
console.log('   → 7 tratamientos de calendario');
console.log('');
