const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'vetaapp.db'));
db.exec(`PRAGMA foreign_keys = ON`);

// -- CITAS adicionales (pasadas completadas + futuras)
const insertCita = db.prepare(`
  INSERT INTO citas (mascota_id, veterinario, fecha, hora, motivo, estado, notas)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const citas = [
  // Pasadas completadas
  [3, 'Dr. García',    '2026-03-10', '10:00', 'Revisión dental',              'completada', 'Sin caries. Limpieza recomendada en 6 meses.'],
  [6, 'Dr. Martínez',  '2026-03-25', '11:00', 'Desparasitación interna',      'completada', 'Drontal Plus administrado.'],
  [7, 'Dr. García',    '2026-04-02', '09:00', 'Vacunación anual',              'completada', 'Polivalente + rabia aplicadas.'],
  [8, 'Dr. Martínez',  '2026-04-10', '14:00', 'Control de peso y nutrición',  'completada', 'Dieta hipocalórica iniciada.'],
  [5, 'Dr. García',    '2026-04-20', '10:00', 'Retiro de puntos post-cirugía', 'completada', 'Cicatrización perfecta.'],
  [1, 'Dr. Martínez',  '2026-05-05', '10:30', 'Control otitis seguimiento',   'completada', 'Oído limpio. Alta médica.'],
  // Próximas (alrededor de hoy 2026-05-23)
  [3, 'Dr. García',    '2026-05-24', '09:00', 'Limpieza dental',              'pendiente',  null],
  [7, 'Dr. Martínez',  '2026-05-26', '10:00', 'Desparasitación externa',      'pendiente',  null],
  [2, 'Dr. García',    '2026-05-27', '11:30', 'Control displasia cadera',     'pendiente',  'Traer radiografías anteriores.'],
  [6, 'Dr. Martínez',  '2026-05-28', '15:00', 'Vacuna rabia',                 'pendiente',  null],
  [8, 'Dr. García',    '2026-05-30', '09:30', 'Control nutricional',          'pendiente',  null],
  [4, 'Dr. Martínez',  '2026-06-03', '14:00', 'Control dermatitis',           'pendiente',  null],
  [5, 'Dr. García',    '2026-06-05', '10:00', 'Revisión anual',               'pendiente',  null],
  [1, 'Dr. Martínez',  '2026-06-10', '11:00', 'Vacunación anual',             'pendiente',  null],
];

for (const c of citas) insertCita.run(...c);
console.log(`Citas insertadas: ${citas.length}`);

// -- HISTORIAS CLÍNICAS para mascotas sin historias (Michi=3, Canela=6, Max=7, Lola=8)
const insertHistoria = db.prepare(`
  INSERT INTO historias_clinicas (mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, notas, peso)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const historias = [
  // Michi (gato Persa, id=3)
  [3, '2025-11-20', 'Revisión anual',
   'Paciente sana. Peso ideal para su edad y raza.',
   'Vacuna triple felina aplicada. Desparasitación interna con Drontal.',
   'Drontal gato', 'Dr. García', null, 4.0],
  [3, '2026-02-14', 'Vómitos recurrentes (2 días)',
   'Gastroenteritis aguda leve. Sin obstrucción intestinal.',
   'Ayuno 12h. Metronidazol 25mg/kg cada 12h por 5 días. Dieta blanda 3 días.',
   'Metronidazol 25mg/kg', 'Dr. García', 'Respuesta favorable al tratamiento.', 3.9],
  [3, '2026-04-08', 'Limpieza dental preventiva',
   'Sarro moderado. Sin enfermedad periodontal.',
   'Profilaxis dental bajo sedación. Sin extracciones necesarias.',
   'Propofol (anestesia)', 'Dr. García', 'Próxima limpieza en 8 meses.', 4.2],

  // Canela (gato Siamés, id=6)
  [6, '2025-10-05', 'Revisión anual',
   'Paciente sano. Condición corporal óptima.',
   'Vacuna triple felina + rabia. Desparasitación con Drontal.',
   'Drontal gato', 'Dr. Martínez', null, 3.7],
  [6, '2026-01-30', 'Herida en pata delantera izquierda',
   'Laceración superficial de 2cm. Sin compromiso tendinoso.',
   'Limpieza con clorhexidina. Sutura simple 2 puntos. Amoxicilina 50mg/kg cada 12h por 7 días.',
   'Amoxicilina 50mg/kg', 'Dr. Martínez', 'Retiro de puntos en 10 días.', 3.8],
  [6, '2026-02-10', 'Retiro de puntos',
   'Cicatrización completa. Sin signos de infección.',
   'Alta médica.',
   null, 'Dr. Martínez', null, 3.8],
  [6, '2026-04-28', 'Desparasitación interna y externa',
   'Sin evidencia de parásitos. Buen estado general.',
   'Drontal gato. Revolution antipulgas aplicado.',
   'Drontal gato, Revolution', 'Dr. Martínez', null, 3.9],

  // Max (Beagle, id=7)
  [7, '2025-09-15', 'Revisión anual',
   'Paciente sano. Ligero sobrepeso (14.5kg ideal 13kg).',
   'Vacuna polivalente + rabia. Plan nutricional indicado.',
   null, 'Dr. García', 'Reducir raciones 15%.', 14.5],
  [7, '2025-12-20', 'Otitis externa bilateral',
   'Otitis externa bilateral por Malassezia. Cultivo positivo.',
   'Mometamax ótico 4 gotas cada 12h por 10 días. Limpieza auricular diaria.',
   'Mometamax ótico', 'Dr. García', 'Control en 2 semanas.', 14.0],
  [7, '2026-01-05', 'Control otitis',
   'Resolución completa de otitis bilateral.',
   'Alta médica. Limpieza auricular semanal preventiva.',
   null, 'Dr. García', null, 14.0],
  [7, '2026-04-02', 'Vacunación anual + desparasitación',
   'Paciente en buen estado. Peso controlado.',
   'Polivalente + rabia. Drontal Plus. Bravecto antipulgas/garrapatas.',
   'Drontal Plus, Bravecto', 'Dr. García', null, 13.5],

  // Lola (Poodle, id=8)
  [8, '2025-08-10', 'Revisión anual + peluquería médica',
   'Paciente sana. Nódulo mamario benigno detectado (monitorear).',
   'Vacuna polivalente. Biopsia diferida por ahora.',
   null, 'Dr. Martínez', 'Ultrasonido recomendado en 3 meses.', 8.2],
  [8, '2025-11-15', 'Ultrasonido abdominal y mamario',
   'Nódulo mamario 0.8cm, sin vascularización. Benigno. Sin otros hallazgos.',
   'Monitoreo cada 6 meses. Sin intervención quirúrgica por ahora.',
   null, 'Dr. Martínez', 'Control en mayo 2026.', 8.0],
  [8, '2026-02-28', 'Control de peso y nutrición',
   'Paciente con sobrepeso leve (8.5kg, ideal 7.5kg). Sin patologías.',
   'Dieta Hills Metabolic. Ejercicio diario 30 min. Control en 2 meses.',
   null, 'Dr. Martínez', null, 8.5],
  [8, '2026-04-10', 'Control nutricional',
   'Pérdida de 300g. Progreso adecuado.',
   'Continuar dieta Hills Metabolic. Control en 6 semanas.',
   null, 'Dr. Martínez', null, 8.2],
];

for (const h of historias) insertHistoria.run(...h);
console.log(`Historias insertadas: ${historias.length}`);

// -- VACUNAS para todas las mascotas
const insertVacuna = db.prepare(`
  INSERT INTO vacunas (mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario, notas)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const vacunas = [
  // Luna (1)
  [1, 'Vacuna polivalente (DA2PP)', '2026-01-10', '2027-01-10', 'Dr. Martínez', null],
  [1, 'Rabia', '2026-01-10', '2027-01-10', 'Dr. Martínez', null],
  [1, 'Bordetella (Tos de las perreras)', '2025-07-15', '2026-07-15', 'Dr. Martínez', null],
  // Simba (2)
  [2, 'Vacuna polivalente (DA2PP)', '2025-11-20', '2026-11-20', 'Dr. García', null],
  [2, 'Rabia', '2025-11-20', '2026-11-20', 'Dr. García', null],
  [2, 'Leptospirosis', '2025-11-20', '2026-11-20', 'Dr. García', null],
  // Michi (3)
  [3, 'Triple felina (FVRCP)', '2025-11-20', '2026-11-20', 'Dr. García', null],
  [3, 'Rabia felina', '2025-11-20', '2026-11-20', 'Dr. García', null],
  // Rocky (4)
  [4, 'Vacuna polivalente (DA2PP)', '2026-02-22', '2027-02-22', 'Dr. Martínez', null],
  [4, 'Rabia', '2026-02-22', '2027-02-22', 'Dr. Martínez', null],
  // Nala (5)
  [5, 'Vacuna polivalente (DA2PP)', '2026-01-18', '2027-01-18', 'Dr. García', null],
  [5, 'Rabia', '2026-01-18', '2027-01-18', 'Dr. García', null],
  [5, 'Leptospirosis', '2026-01-18', '2027-01-18', 'Dr. García', null],
  // Canela (6)
  [6, 'Triple felina (FVRCP)', '2025-10-05', '2026-10-05', 'Dr. Martínez', null],
  [6, 'Rabia felina', '2025-10-05', '2026-10-05', 'Dr. Martínez', null],
  // Max (7)
  [7, 'Vacuna polivalente (DA2PP)', '2026-04-02', '2027-04-02', 'Dr. García', null],
  [7, 'Rabia', '2026-04-02', '2027-04-02', 'Dr. García', null],
  [7, 'Bordetella', '2026-04-02', '2027-04-02', 'Dr. García', null],
  // Lola (8)
  [8, 'Vacuna polivalente (DA2PP)', '2025-08-10', '2026-08-10', 'Dr. Martínez', null],
  [8, 'Rabia', '2025-08-10', '2026-08-10', 'Dr. Martínez', null],
];

for (const v of vacunas) insertVacuna.run(...v);
console.log(`Vacunas insertadas: ${vacunas.length}`);

// -- INVENTARIO
const insertInv = db.prepare(`
  INSERT INTO inventario (nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const inventario = [
  // Medicamentos
  ['Amoxicilina 500mg',           'medicamento', 80,  20,  1200, 2500,  'tableta'],
  ['Metronidazol 250mg',          'medicamento', 60,  20,  800,  1800,  'tableta'],
  ['Meloxicam 1mg/kg oral',       'medicamento', 40,  15,  3500, 7000,  'frasco'],
  ['Apoquel 5.4mg',               'medicamento', 30,  10,  4500, 9500,  'tableta'],
  ['Tramadol 50mg',               'medicamento', 50,  15,  900,  2000,  'tableta'],
  ['Drontal Plus (perros)',        'medicamento', 45,  15,  3200, 6500,  'tableta'],
  ['Drontal gato',                'medicamento', 35,  10,  3500, 7000,  'tableta'],
  ['Bravecto 250mg (4.5-10kg)',   'medicamento', 20,  8,   32000,65000, 'pipeta'],
  ['Bravecto 500mg (10-20kg)',    'medicamento', 18,  8,   38000,75000, 'pipeta'],
  ['Revolution antipulgas gato',  'medicamento', 25,  10,  18000,36000, 'pipeta'],
  ['Otosporin ótico',             'medicamento', 15,  5,   12000,24000, 'frasco'],
  ['Mometamax ótico',             'medicamento', 12,  5,   18000,35000, 'frasco'],
  // Vacunas
  ['Vacuna DA2PP (polivalente)',   'vacuna',      30,  10,  22000,45000, 'dosis'],
  ['Vacuna antirrábica',          'vacuna',      25,  10,  8000, 18000, 'dosis'],
  ['Vacuna triple felina FVRCP',  'vacuna',      20,  8,   18000,38000, 'dosis'],
  ['Vacuna Leptospirosis',        'vacuna',      18,  8,   15000,30000, 'dosis'],
  ['Vacuna Bordetella',           'vacuna',      15,  5,   20000,40000, 'dosis'],
  // Insumos
  ['Jeringas 3ml',                'insumo',      200, 50,  300,  null,  'unidad'],
  ['Agujas 21G',                  'insumo',      200, 50,  200,  null,  'unidad'],
  ['Guantes latex M',             'insumo',      150, 50,  800,  null,  'par'],
  ['Solución salina 500ml',       'insumo',      30,  10,  4500, null,  'frasco'],
  ['Clorhexidina 2% (litro)',     'insumo',      10,  3,   12000,null,  'frasco'],
  ['Gasas estériles 10x10',       'insumo',      100, 30,  500,  null,  'unidad'],
  ['Vendaje autoadherente',       'insumo',      40,  10,  3500, null,  'rollo'],
  ['Alcohol antiséptico 500ml',   'insumo',      20,  5,   5000, null,  'frasco'],
  // Alimentos
  ['Hills Metabolic perro S',     'alimento',    15,  5,   45000,89000, 'bulto 2kg'],
  ['Royal Canin urinary gato',    'alimento',    10,  4,   38000,75000, 'bulto 1.5kg'],
  ['Purina Pro Plan adulto',      'alimento',    12,  5,   55000,110000,'bulto 3kg'],
  // Accesorios
  ['Collar isabelino S',          'accesorio',   8,   3,   8000, 18000, 'unidad'],
  ['Collar isabelino M',          'accesorio',   6,   3,   10000,22000, 'unidad'],
  ['Shampoo clorhexidina 2%',     'accesorio',   20,  5,   15000,30000, 'frasco'],
];

for (const i of inventario) insertInv.run(...i);
console.log(`Inventario insertado: ${inventario.length}`);

console.log('\nSeed completado exitosamente.');
