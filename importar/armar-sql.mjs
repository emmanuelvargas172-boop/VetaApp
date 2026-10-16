// ============================================================
// VetaApp · importar/armar-sql.mjs
// Convierte el CSV de una clínica en SQL para el SQL Editor de Supabase.
//
// ---------- POR QUÉ ASÍ Y NO ESCRIBIENDO DIRECTO ----------
// Para insertar filas con el user_id de OTRA cuenta hay que saltarse el RLS
// de 001_init.sql (`auth.uid() = user_id`), y eso solo lo puede hacer la
// llave de servicio o el SQL Editor. La llave de servicio no está en este
// repo y no tiene por qué estar. Así que el script no toca la base: escribe
// un .sql que se lee antes de correrlo. Una base de clientes ajena no se
// modifica con un script que nadie alcanzó a leer.
//
// ---------- CÓMO SE USA ----------
//   node importar/armar-sql.mjs importar/respuestas.csv
//
// Escribe dos archivos al lado del CSV:
//   · datos_<cuenta>.sql  → se pega en Supabase → SQL Editor
//   · revisar.md          → qué decidió, qué unió y qué rechazó
//
// Si encuentra una raza que no sabe de qué especie es, SE DETIENE. En una
// app veterinaria la especie decide dosis; adivinarla no es una opción.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { edadDesde } from '../frontend/src/utils/edad.js';
import { nuevoEstado, sinTildes } from '../frontend/src/importador/nucleo/normalizar.js';
import { mapearEncabezados, faltanRequeridos } from '../frontend/src/importador/nucleo/mapear.js';
import { leerFilas, formatoDeFechasRoto } from '../frontend/src/importador/nucleo/filas.js';
import { agrupar } from '../frontend/src/importador/nucleo/agrupar.js';

// La cuenta dueña de los datos. Nunca se escribe el uuid: el SQL lo busca
// por email en auth.users, así no hay que copiarlo a mano de un tablero.
//
// Se pasa por `--cuenta=` y no se deja fija en el código porque la misma
// base se carga en dos lados: la cuenta de la clínica y una de pruebas
// donde mirarla antes. Con la constante fija eso se hace editando el
// script entre corrida y corrida, que es como se termina mandando los
// datos de una clínica a la cuenta de otra.
const argCuenta = process.argv.find((a) => a.startsWith('--cuenta='));
const CUENTA = argCuenta ? argCuenta.slice('--cuenta='.length).trim().toLowerCase() : '';
if (!CUENTA || !CUENTA.includes('@')) {
  console.error('Falta a qué cuenta van los datos.\n');
  console.error('  node importar/armar-sql.mjs --cuenta=correo@ejemplo.com archivo.csv\n');
  console.error('El correo tiene que ser el de una cuenta ya registrada en la app.');
  process.exit(1);
}

// Fecha de referencia para calcular la edad desde el nacimiento. Fija a
// propósito: si se corriera el script dos veces en meses distintos, las
// edades saldrían distintas y nadie sabría cuál quedó. Va escrita también
// en el SQL generado, así queda dicho a qué día corresponde la edad.
const HOY = new Date(2026, 9, 15); // 15/10/2026


// ---------- 1. CSV ----------
// Parser propio en vez de una dependencia: las direcciones traen comas
// ("Calle 45 #12-30, Bucaramanga") y las celdas de Google vienen entre
// comillas con comillas dobladas por dentro. Es lo único que hay que
// soportar y son 25 líneas.
function leerCSV(texto) {
  const filas = [];
  let fila = [], celda = '', enComillas = false;
  // El BOM que mete Google Sheets se pega al primer encabezado y después
  // "Marca temporal" no coincide con nada.
  const s = texto.replace(/^\uFEFF/, '');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (enComillas) {
      if (c === '"') {
        if (s[i + 1] === '"') { celda += '"'; i++; }   // comilla escapada
        else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === ',') { fila.push(celda); celda = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; continue; }
    celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// Todo el estado de esta corrida en un objeto. En la terminal daría igual
// una variable suelta, pero el núcleo es el mismo que corre en el
// navegador, donde el módulo no se muere entre una importación y otra.
const estado = nuevoEstado();
const avisos = estado.avisos;   // el bloque de revisar.md ya lo usa así


// ---------- 2. LECTURA ----------
const archivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!archivos.length) {
  console.error('Uso: node importar/armar-sql.mjs --cuenta=correo@ejemplo.com <archivo.csv> [otro.csv ...]');
  process.exit(1);
}

const todas = [];
for (const archivo of archivos) {
  const hoja = basename(archivo);
  const [encabezados, ...grilla] = leerCSV(readFileSync(archivo, 'utf8'));
  const mapa = mapearEncabezados(encabezados);

  // Sin tutor o sin mascota no hay nada que hacer: cada fila perdería su
  // dueño o su animal y el import entero quedaría vacío sin decirle nada
  // al operador. Se detiene acá, con nombre de la hoja, las columnas que
  // faltaron y los encabezados que SÍ se leyeron, para que la corrección
  // sea renombrar la columna en la hoja y volver a exportar.
  const faltan = faltanRequeridos(mapa);
  if (faltan.length) {
    console.error(`${hoja}: no encontré las columnas ${faltan.join(', ')}.`);
    console.error(`  Encabezados leídos: ${encabezados.join(' | ')}`);
    process.exit(1);
  }

  todas.push(...leerFilas(estado, { grilla, mapa, hoja }));
}

// En la terminal el que decide es Emmanuel, no una pantalla: si el
// núcleo no sabe la especie, el script se detiene en vez de meter un
// gato como perro.
if (estado.razasDesconocidas.size || estado.sinRaza) {
  console.error('\nNo sé si esto es perro o gato:\n');
  if (estado.razasDesconocidas.size) {
    for (const r of [...estado.razasDesconocidas].sort()) console.error(`  · ${r}`);
    console.error('\nAgregá cada raza a RAZAS_PERRO o RAZAS_GATO en');
    console.error('frontend/src/importador/nucleo/normalizar.js y volvé a correr esto.');
  }
  // Para filas sin raza no hay nada que agregar al diccionario: la especie
  // tiene que venir de la hoja. El operador escribe la raza en el CSV y
  // vuelve a correr.
  if (estado.sinRaza) {
    console.error(`\n  · ${estado.sinRaza} fila(s) sin raza anotada`);
    console.error('\nEsa(s) fila(s) no tienen raza escrita en la hoja. Abrí el CSV,');
    console.error('completá la columna de raza y volvé a correr esto.');
  }
  process.exit(1);
}

if (formatoDeFechasRoto(estado)) {
  console.error(`\nDe ${estado.fechasVistas} fechas no pude leer ${estado.fechasRotas}. Eso no son filas sucias:`);
  console.error('la hoja está en un formato de fecha que no reconozco. Ejemplos:\n');
  for (const a of avisos.filter((x) => x.texto.startsWith('fecha')).slice(0, 5)) {
    console.error(`  · fila ${a.fila}: ${a.texto}`);
  }
  console.error('\nEn Sheets: seleccionar las columnas de fecha → Formato → Número → Fecha,');
  console.error('volver a exportar el CSV y correr esto otra vez.');
  process.exit(1);
}

const { tutores, mascotas, eventos } = agrupar(estado, todas);


// ---------- 3. SQL ----------
// `q` manda la cadena vacía a `null` a propósito: en las columnas opcionales
// (direccion, raza, cedula, fecha_nacimiento) un '' es un dato falso — se
// lee como "está en blanco" donde la verdad es "no se sabe". Y en
// `cedula` además importa: el índice único de 011 trata '' como un valor,
// así que dos tutores sin cédula chocarían entre sí.
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

// `qNoNulo` existe para `duenos.telefono`, que es NOT NULL en 001_init.sql.
// Hay filas sin ningún número y '' es lo único que no miente. Con `q` saldría
// `null` y el insert violaría el NOT NULL, que dentro de un `do $$` aborta el
// bloque COMPLETO: se perdería el import entero de 54 clientes por un tutor
// que no dejó celular.
const qNoNulo = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

const L = [];
L.push(`-- ============================================================`);
L.push(`-- Datos importados para ${CUENTA}`);
L.push(`-- Generado por importar/armar-sql.mjs el ${new Date().toISOString().slice(0, 10)}`);
L.push(`-- Fuente: ${archivos.map((a) => basename(a)).join(', ')}`);
L.push(`--`);
L.push(`-- ${tutores.size} tutores · ${mascotas.size} mascotas · ${eventos.filter((e) => e.tipo === 'tratamiento').length} tratamientos · ${eventos.filter((e) => e.tipo === 'vacuna').length} vacunas`);
L.push(`--`);
L.push(`-- Requiere la migración 011_ficha_completa.sql corrida antes.`);
L.push(`--`);
L.push(`-- Es repetible: cada insert busca primero si la fila ya existe, así que`);
L.push(`-- correrlo dos veces no duplica nada. No borra ni modifica nada que ya`);
L.push(`-- esté en la cuenta.`);
L.push(`--`);
L.push(`-- Las edades están calculadas al ${HOY.getDate()}/${HOY.getMonth() + 1}/${HOY.getFullYear()}.`);
L.push(`-- Donde hay fecha de nacimiento no importa: la app recalcula desde ella.`);
L.push(`--`);
L.push(`-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query`);
L.push(`-- ============================================================`);
L.push(``);
L.push(`do $$`);
L.push(`declare`);
L.push(`  v_user    uuid;`);
L.push(`  v_dueno   bigint;`);
L.push(`  v_mascota bigint;`);
L.push(`  n_duenos  int := 0;`);
L.push(`  n_mascotas int := 0;`);
L.push(`  n_eventos int := 0;`);
L.push(`begin`);
L.push(`  select id into v_user from auth.users where lower(email) = ${q(CUENTA)};`);
L.push(`  if v_user is null then`);
L.push(`    raise exception 'No existe la cuenta % en auth.users. Que se registre primero en la app.', ${q(CUENTA)};`);
L.push(`  end if;`);
L.push(``);
L.push(`  -- Si falta la migración 011 esto para acá, con un mensaje que se`);
L.push(`  -- entiende, en vez de reventar 200 líneas más abajo.`);
L.push(`  if not exists (select 1 from information_schema.columns`);
L.push(`                  where table_schema='public' and table_name='duenos' and column_name='cedula') then`);
L.push(`    raise exception 'Falta correr 011_ficha_completa.sql antes de este archivo.';`);
L.push(`  end if;`);

// Un bloque por tutor, con sus mascotas y los eventos de cada una dentro.
// Agrupar así (y no tres listas sueltas) es lo que hace legible el archivo:
// se puede revisar cliente por cliente antes de correrlo.
for (const t of tutores.values()) {
  const misMascotas = [...mascotas.values()].filter((m) => m.tutor === t.clave);
  L.push(``);
  L.push(`  -- ---------- ${t.nombre}${t.cedula ? ` · cédula ${t.cedula}` : ' · sin cédula'} (${t.origen.join(', ')}) ----------`);

  // Búsqueda antes de insertar, en vez de `on conflict`: sin cédula no hay
  // índice único que inferir, y así los dos caminos se leen igual.
  if (t.cedula) {
    L.push(`  select id into v_dueno from public.duenos where user_id = v_user and cedula = ${q(t.cedula)};`);
  } else {
    L.push(`  select id into v_dueno from public.duenos where user_id = v_user and nombre = ${q(t.nombre)} and telefono = ${qNoNulo(t.tel1)};`);
  }
  L.push(`  if v_dueno is null then`);
  L.push(`    insert into public.duenos (user_id, nombre, telefono, telefono2, direccion, cedula)`);
  // `telefono` va con qNoNulo porque es NOT NULL y hay filas sin ningún
  // número. No se inventa un celular para que el insert pase.
  L.push(`    values (v_user, ${q(t.nombre)}, ${qNoNulo(t.tel1)}, ${q(t.tel2)}, ${q(t.direccion)}, ${q(t.cedula)})`);
  L.push(`    returning id into v_dueno;`);
  L.push(`    n_duenos := n_duenos + 1;`);
  L.push(`  end if;`);

  for (const m of misMascotas) {
    const ed = m.nacimiento ? edadDesde(m.nacimiento, HOY) : null;
    L.push(``);
    L.push(`  -- ${m.nombre} · ${m.especie}${m.raza ? ` · ${m.raza}` : ''}${m.nacimiento ? ` · nac. ${m.nacimiento}` : ''}`);
    L.push(`  select id into v_mascota from public.mascotas`);
    L.push(`   where user_id = v_user and dueno_id = v_dueno and nombre = ${q(m.nombre)};`);
    L.push(`  if v_mascota is null then`);
    L.push(`    insert into public.mascotas (user_id, nombre, especie, raza, fecha_nacimiento, edad_anios, edad_meses, dueno_id)`);
    L.push(`    values (v_user, ${q(m.nombre)}, ${q(m.especie)}, ${q(m.raza)}, ${q(m.nacimiento)}, ${ed ? ed.anios : 0}, ${ed ? ed.meses : 0}, v_dueno)`);
    L.push(`    returning id into v_mascota;`);
    L.push(`    n_mascotas := n_mascotas + 1;`);
    L.push(`  end if;`);

    for (const e of eventos.filter((x) => x.mascota === m.clave)) {
      if (e.tipo === 'tratamiento') {
        L.push(`  if not exists (select 1 from public.tratamientos`);
        L.push(`                  where user_id = v_user and mascota_id = v_mascota and tipo = ${q(e.t)} and fecha = ${q(e.fecha)}) then`);
        L.push(`    insert into public.tratamientos (user_id, mascota_id, tipo, fecha, hora, notas)`);
        L.push(`    values (v_user, v_mascota, ${q(e.t)}, ${q(e.fecha)}, ${q(e.hora)}, ${q(e.notas)});`);
        L.push(`    n_eventos := n_eventos + 1;`);
        L.push(`  end if;`);
      } else {
        L.push(`  if not exists (select 1 from public.vacunas`);
        L.push(`                  where user_id = v_user and mascota_id = v_mascota and fecha_aplicacion = ${q(e.fecha)}) then`);
        L.push(`    insert into public.vacunas (user_id, mascota_id, nombre, fecha_aplicacion, proxima_dosis, notas)`);
        L.push(`    values (v_user, v_mascota, 'Anual', ${q(e.fecha)}, ${q(e.proxima)},`);
        L.push(`            'Fecha que reportó el tutor en el formulario de ingreso. La próxima dosis es un año después, estimada.');`);
        L.push(`    n_eventos := n_eventos + 1;`);
        L.push(`  end if;`);
      }
    }
  }
}

L.push(``);
L.push(`  raise notice 'Insertados: % tutores, % mascotas, % eventos', n_duenos, n_mascotas, n_eventos;`);
L.push(`end $$;`);
L.push(``);
L.push(`-- Comprobación. Debe dar los números del encabezado de este archivo`);
L.push(`-- (o más, si la cuenta ya tenía datos propios de antes).`);
L.push(`select`);
L.push(`  (select count(*) from public.duenos       d where d.user_id = u.id) as tutores,`);
L.push(`  (select count(*) from public.mascotas     m where m.user_id = u.id) as mascotas,`);
L.push(`  (select count(*) from public.tratamientos t where t.user_id = u.id) as tratamientos,`);
L.push(`  (select count(*) from public.vacunas      v where v.user_id = u.id) as vacunas`);
L.push(`from auth.users u where lower(u.email) = ${q(CUENTA)};`);

const dir = dirname(archivos[0]);
const salidaSQL = join(dir, `datos_${CUENTA.split('@')[0].replace(/\W/g, '_')}.sql`);
writeFileSync(salidaSQL, L.join('\n') + '\n', 'utf8');


// ---------- 4. REVISAR.MD ----------
// Todo lo que el script decidió por su cuenta. Se lee ANTES de correr el
// SQL: es la única forma de saber qué unió y qué botó sin volver a leer
// las 54 filas a mano.
const R = [];
R.push(`# Qué hay que revisar del import`);
R.push(``);
R.push(`Generado el ${new Date().toISOString().slice(0, 10)} desde ${archivos.map((a) => basename(a)).join(', ')}.`);
R.push(``);
R.push(`## Resumen`);
R.push(``);
R.push(`| | |`);
R.push(`|---|---|`);
R.push(`| Filas leídas con datos | ${todas.length} |`);
R.push(`| Tutores después de unir | ${tutores.size} |`);
R.push(`| Mascotas después de unir | ${mascotas.size} |`);
R.push(`| Baños y desparasitaciones | ${eventos.filter((e) => e.tipo === 'tratamiento').length} |`);
R.push(`| Vacunas | ${eventos.filter((e) => e.tipo === 'vacuna').length} |`);
R.push(`| Cosas que decidí yo | ${avisos.length} |`);
R.push(``);

const sinTel = [...tutores.values()].filter((t) => !t.tel1);
if (sinTel.length) {
  R.push(`## Tutores sin teléfono usable (${sinTel.length})`);
  R.push(``);
  R.push(`Entran a la base, pero el botón de WhatsApp les queda apagado. Si la`);
  R.push(`clínica tiene el número en otra parte, se les agrega a mano después.`);
  R.push(``);
  for (const t of sinTel) R.push(`- **${t.nombre}** (${t.origen.join(', ')})`);
  R.push(``);
}

const conDos = [...tutores.values()].filter((t) => t.tel2);
if (conDos.length) {
  R.push(`## Tutores con dos teléfonos (${conDos.length})`);
  R.push(``);
  R.push(`El primero es el que usa el recordatorio de WhatsApp.`);
  R.push(``);
  for (const t of conDos) R.push(`- **${t.nombre}** → ${t.tel1} / ${t.tel2}`);
  R.push(``);
}

// Mismo nombre, dos fichas. Pasa cuando no hay cédula y el teléfono cambia
// entre una fila y otra: el script NO los une porque en esta base hay dos
// "Teofilo Arboleda" que son dos personas distintas, y unirlas mezclaría las
// mascotas de una con las de la otra. Pero la clínica tiene que verlo: es la
// única que sabe si son dos clientas o una que cambió de número.
const porNombre = new Map();
for (const t of tutores.values()) {
  const k = sinTildes(t.nombre);
  if (!porNombre.has(k)) porNombre.set(k, []);
  porNombre.get(k).push(t);
}
const repetidos = [...porNombre.values()].filter((g) => g.length > 1);
if (repetidos.length) {
  R.push(`## Mismo nombre en dos fichas (${repetidos.length}) — HAY QUE DECIDIR`);
  R.push(``);
  R.push(`Quedaron separadas porque no tienen cédula y el teléfono no coincide.`);
  R.push(`Si son la misma persona, se unen desde la app después del import. Si`);
  R.push(`son dos clientas distintas, así está bien y no hay nada que hacer.`);
  R.push(``);
  for (const g of repetidos) {
    R.push(`- **${g[0].nombre}**`);
    for (const t of g) {
      const ms = [...mascotas.values()].filter((m) => m.tutor === t.clave).map((m) => m.nombre).join(', ');
      R.push(`  - tel ${t.tel1 ?? '(ninguno)'} · ${t.direccion ?? 'sin dirección'} · mascotas: ${ms || '(ninguna)'} · ${t.origen.join(', ')}`);
    }
  }
  R.push(``);
}

const varias = [...tutores.values()]
  .map((t) => ({ t, ms: [...mascotas.values()].filter((m) => m.tutor === t.clave) }))
  .filter((x) => x.ms.length > 1);
if (varias.length) {
  R.push(`## Tutores con más de una mascota (${varias.length})`);
  R.push(``);
  for (const { t, ms } of varias) R.push(`- **${t.nombre}** → ${ms.map((m) => m.nombre).join(', ')}`);
  R.push(``);
}

const sinNac = [...mascotas.values()].filter((m) => !m.nacimiento);
if (sinNac.length) {
  R.push(`## Mascotas sin fecha de nacimiento (${sinNac.length})`);
  R.push(``);
  R.push(`Quedan con edad 0 porque no hay de dónde sacarla. Es lo que dice la`);
  R.push(`hoja; inventar una edad sería peor. Se corrigen desde la app cuando`);
  R.push(`el tutor vuelva.`);
  R.push(``);
  for (const m of sinNac) R.push(`- ${m.nombre}${m.raza ? ` (${m.raza})` : ''} — ${m.origen.join(', ')}`);
  R.push(``);
}

if (avisos.length) {
  R.push(`## Decisiones y datos sucios (${avisos.length})`);
  R.push(``);
  R.push(`| Hoja | Fila | Qué pasó |`);
  R.push(`|---|---|---|`);
  for (const a of avisos) R.push(`| ${a.hoja} | ${a.fila} | ${a.texto.replace(/\|/g, '\\|')} |`);
  R.push(``);
}

R.push(`## Lo que este import NO hace`);
R.push(``);
R.push(`- No crea vacunas donde la hoja solo dice \`Extra [Vacunas anual] = Si\`.`);
R.push(`  Eso dice que contrató el servicio, no que se la aplicaron.`);
R.push(`- No toca ni borra nada que la cuenta ya tenga.`);
R.push(`- No importa la columna \`Marca temporal\` como fecha de registro del`);
R.push(`  cliente: se usa como fecha del baño, que es lo que era.`);
R.push(``);

writeFileSync(join(dir, 'revisar.md'), R.join('\n') + '\n', 'utf8');

console.log(`\n  ${todas.length} filas leídas`);
console.log(`  ${tutores.size} tutores · ${mascotas.size} mascotas · ${eventos.length} eventos`);
console.log(`  ${avisos.length} cosas para revisar\n`);
console.log(`  SQL     → ${salidaSQL}`);
console.log(`  Revisar → ${join(dir, 'revisar.md')}\n`);
