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
import { normalizarTelefonoCO } from '../frontend/src/utils/whatsapp.js';
import { edadDesde } from '../frontend/src/utils/edad.js';

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

const sinTildes = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Los encabezados reales traen espacios al final, tildes, paréntesis,
// corchetes y dos de ellos están cortados ("Última vacuna (si no recuerda
// dejar en blanco)"). Se reconocen por cómo empiezan, no por igualdad.
const COLUMNAS = [
  ['ts',             (h) => h.startsWith('marca temporal')],
  ['cedula',         (h) => h === 'cedula' || h === 'cédula'],
  ['tutor',          (h) => h.startsWith('nombre y apellidos del tutor')],
  ['direccion',      (h) => h.startsWith('direccion y barrio')],
  ['telefonos',      (h) => h.startsWith('contacto telefonos')],
  ['mascota',        (h) => h.startsWith('nombre completo de la mascota')],
  ['raza',           (h) => h === 'raza'],
  ['nacimiento',     (h) => h.startsWith('fecha nacimiento')],
  ['tipo_bano',      (h) => h.startsWith('tipo bano') || h.startsWith('tipo bano')],
  ['costo',          (h) => h.startsWith('costo final del servicio')],
  ['observaciones',  (h) => h.startsWith('otras observaciones')],
  ['extra_vacuna',   (h) => h.startsWith('extra [vacunas anual]') || h.startsWith('extra vacunas anual')],
  ['extra_tos',      (h) => h.startsWith('extra [tos de las perreras]') || h.startsWith('extra tos de las perreras')],
  ['ultima_vacuna',  (h) => h.startsWith('ultima vacuna')],
  ['ultima_desp',    (h) => h.startsWith('ultima desparasitacion')],
];

function mapearEncabezados(encabezados) {
  const mapa = {};
  encabezados.forEach((raw, i) => {
    const h = sinTildes(raw);
    for (const [clave, prueba] of COLUMNAS) {
      if (mapa[clave] === undefined && prueba(h)) { mapa[clave] = i; return; }
    }
  });
  return mapa;
}


// ---------- 2. NORMALIZACIONES ----------
// Cada una existe por un valor concreto que ya está en la hoja. Ninguna
// adivina: lo que no entiende lo manda a revisar.md.

const avisos = [];
const aviso = (fila, hoja, texto) => avisos.push({ fila, hoja, texto });

// "12/09/2026 10:18:09", "07-07-2026", "22--04-2026" (doble guion, dato
// real), "1/06/2021" → ISO o null.
//
// El orden es día/mes/año, no mes/día: la hoja tiene "26/07/2018",
// "27/12/2025" y "22/12/2023", donde el primer número pasa de 12 y solo
// puede ser el día. Google Forms en es-CO escribe así.
//
// También acepta YYYY-MM-DD. Google exporta en el formato que tenga la hoja,
// y eso depende del idioma de la cuenta: la MISMA hoja puede salir
// "26/07/2018" o "2018-07-26". Sin esto, una exportación en ISO deja un
// import sin una sola fecha — sin baños, sin vacunas y sin edades — y nadie
// se da cuenta hasta que la clínica abre Recordatorios y lo ve vacío.
let fechasVistas = 0, fechasRotas = 0;

function fechaISO(valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  fechasVistas++;
  const malo = (texto) => { fechasRotas++; aviso(ctx.fila, ctx.hoja, texto); return null; };

  const soloFecha = s.split(/\s+/)[0].replace(/[-.]+/g, '/').replace(/\/{2,}/g, '/');
  const partes = soloFecha.split('/').filter(Boolean);
  if (partes.length !== 3) return malo(`fecha ilegible en ${ctx.campo}: "${s}"`);

  // Cuál número es el año no se adivina: si el primero tiene cuatro cifras
  // solo puede ser el año, y si no, es el día (d/m/Y, que es como escribe
  // Google Forms en es-CO).
  let d, m, a;
  if (partes[0].length === 4) [a, m, d] = partes.map((p) => parseInt(p, 10));
  else                        [d, m, a] = partes.map((p) => parseInt(p, 10));
  if (a < 100) a += 2000;

  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 1990 && a <= 2100)) {
    return malo(`fecha fuera de rango en ${ctx.campo}: "${s}"`);
  }
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Verifica que el día exista de verdad: "31/02/2026" pasa los rangos.
  const prueba = new Date(a, m - 1, d);
  if (prueba.getMonth() !== m - 1 || prueba.getDate() !== d) {
    return malo(`fecha que no existe en ${ctx.campo}: "${s}"`);
  }
  return iso;
}

// Hora de la marca temporal, para `tratamientos.hora`. Es dato real: a esa
// hora se llenó el formulario.
function horaDe(valor) {
  const m = String(valor ?? '').match(/\b(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// "40000", "$60.000", "88.000", "88.000 sí 72" → entero en pesos.
// Los puntos son separadores de miles, no decimales: en la hoja no hay un
// solo precio con centavos y todos los valores con punto son de 5 ó 6
// cifras ("35.000", "110.000").
function pesos(valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const token = s.split(/\s+/)[0];
  const n = parseInt(token.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) { aviso(ctx.fila, ctx.hoja, `costo ilegible: "${s}"`); return null; }
  // Lo que sobró después del primer token es texto que alguien escribió a
  // mano y que este script no entiende. No se pierde: queda en revisar.md
  // y también en las notas del tratamiento.
  if (s !== token) aviso(ctx.fila, ctx.hoja, `costo con texto extra: "${s}" → se tomó ${n}`);
  if (n < 1000) aviso(ctx.fila, ctx.hoja, `costo sospechosamente bajo: "${s}" → ${n}`);
  return n;
}

// "3000000200-3000000201", "3000000202 - 3000000203", "" → [tel1, tel2]
// Los separa y valida cada uno con la MISMA función que usa la app para
// armar el enlace de WhatsApp, así no hay dos ideas de qué es un número
// válido.
function telefonos(valor, ctx) {
  const crudos = String(valor ?? '').split(/[-/;,]| y | Y |\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const buenos = [];
  for (const c of crudos) {
    const n = normalizarTelefonoCO(c);
    if (n) { if (!buenos.includes(n)) buenos.push(n); }
    else aviso(ctx.fila, ctx.hoja, `teléfono que WhatsApp no acepta: "${c}"`);
  }
  if (!buenos.length && String(valor ?? '').trim()) {
    aviso(ctx.fila, ctx.hoja, `ningún teléfono usable en "${valor}"`);
  }
  return [buenos[0] ?? null, buenos[1] ?? null];
}

// "Clasico" / "Clásico" → una sola forma, con tilde, que es como se
// escribe. Sin esto la clínica vería dos servicios distintos.
function tipoBano(valor) {
  const t = sinTildes(valor);
  if (!t) return null;
  if (t.startsWith('clasico')) return 'Clásico';
  if (t.startsWith('hydra'))   return 'Hydra';
  if (t.startsWith('medicado')) return 'Medicado';
  return String(valor).trim(); // forma nueva: se respeta tal cual
}

// Razas que sabemos que son de perro. Las de la hoja más las comunes en
// Colombia. Lo que no esté acá detiene el script: en una app veterinaria
// la especie decide la dosis, y "no sé" es mejor que "perro, seguramente".
const RAZAS_PERRO = new Set([
  'mestizo', 'mestiza', 'criollo', 'criolla', 'shitzu', 'shih tzu', 'schnauzer',
  'tequel', 'teckel', 'salchicha', 'pug', 'pinscher', 'poodle', 'french poodle',
  'cocker', 'westhly', 'west highland', 'golden', 'golden retriever', 'yorkie',
  'yorkshire', 'pomerania', 'pomeranian', 'husky', 'labrador', 'beagle',
  'bulldog', 'chihuahua', 'maltes', 'bichon', 'boxer', 'pastor aleman',
  'pastor', 'border collie', 'dalmata', 'rottweiler', 'pitbull', 'pit bull',
  'basset', 'san bernardo', 'gran danes', 'doberman', 'akita', 'chow chow',
]);
const RAZAS_GATO = new Set([
  'persa', 'siames', 'angora', 'criollo gato', 'mestizo gato', 'bengali',
  'maine coon', 'esfinge', 'sphynx',
]);

// Algunas celdas de "Raza" traen la ESPECIE y no la raza: la fila 52 dice
// "Gato". No es un dato malo — dice lo más importante — pero "Gato" no es
// una raza, y guardarlo como tal dejaría la ficha con "Raza: Gato". Se lee
// como especie y la raza queda vacía, que es la verdad: no la dijeron.
const ESPECIE_ESCRITA = {
  gato: 'gato', gata: 'gato', felino: 'gato', felina: 'gato',
  perro: 'perro', perra: 'perro', canino: 'perro', canina: 'perro',
};

// Devuelve las dos cosas juntas porque se deciden juntas: qué especie es y
// qué queda escrito en `raza`. Separarlas fue lo que hizo falta acá.
function clasificar(razaCruda, desconocidas) {
  const r = sinTildes(razaCruda);
  const raza = String(razaCruda ?? '').trim() || null;
  if (!r) return { especie: 'perro', raza: null }; // sin raza: la hoja entera es de una peluquería canina
  if (ESPECIE_ESCRITA[r]) return { especie: ESPECIE_ESCRITA[r], raza: null };
  for (const p of RAZAS_PERRO) if (r.startsWith(p) || p.startsWith(r)) return { especie: 'perro', raza };
  for (const g of RAZAS_GATO) if (r.startsWith(g) || g.startsWith(r)) return { especie: 'gato', raza };
  desconocidas.add(raza);
  return { especie: null, raza };
}

// Cuenta cuántos campos útiles trae una fila. Es el criterio para decidir
// cuál gana cuando la misma mascota aparece dos veces.
const riqueza = (r) => [r.cedula, r.tutor, r.direccion, r.tel1, r.tel2, r.mascota,
  r.raza, r.nacimiento, r.tipo_bano, r.costo, r.observaciones,
  r.ultima_vacuna, r.ultima_desp].filter((x) => x !== null && x !== '' && x !== undefined).length;


// ---------- 3. LECTURA ----------
const archivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!archivos.length) {
  console.error('Uso: node importar/armar-sql.mjs --cuenta=correo@ejemplo.com <archivo.csv> [otro.csv ...]');
  process.exit(1);
}

const razasDesconocidas = new Set();
const filas = [];

for (const ruta of archivos) {
  const hoja = basename(ruta);
  const crudas = leerCSV(readFileSync(ruta, 'utf8'));
  if (!crudas.length) { console.error(`${hoja}: vacío`); continue; }

  const mapa = mapearEncabezados(crudas[0]);
  const faltan = ['tutor', 'mascota'].filter((k) => mapa[k] === undefined);
  if (faltan.length) {
    console.error(`${hoja}: no encontré las columnas ${faltan.join(', ')}.`);
    console.error(`  Encabezados leídos: ${crudas[0].join(' | ')}`);
    process.exit(1);
  }

  for (let i = 1; i < crudas.length; i++) {
    const c = crudas[i];
    const get = (k) => (mapa[k] === undefined ? '' : String(c[mapa[k]] ?? '').trim());
    const nFila = i + 1; // como se ve en Sheets, con el encabezado siendo la 1
    const ctx = { fila: nFila, hoja, campo: '' };

    const tutor = get('tutor');
    const mascota = get('mascota');

    // Fila de relleno: la hoja "Copia" llega hasta la 155 y solo las
    // primeras tienen datos. Vacía DE VERDAD — ni una celda — no es un
    // error y no se reporta.
    //
    // La condición mira la fila entera y no solo tutor+mascota, porque una
    // fila con teléfono y costo pero sin nombres sí es un problema: es una
    // visita que se cobró y que se iba a perder sin que nadie lo supiera.
    if (c.every((x) => !String(x ?? '').trim())) continue;
    if (!tutor || !mascota) {
      aviso(nFila, hoja, `fila con datos pero sin nombres (tutor="${tutor}", mascota="${mascota}") → NO se importa, hay que mirarla en la hoja`);
      continue;
    }

    const [tel1, tel2] = telefonos(get('telefonos'), ctx);
    // Las cuatro fechas se leen UNA vez acá y se reusan abajo. Leerlas dos
    // veces repetiría cada aviso y falsearía el contador que decide si la
    // hoja viene en otro formato.
    const nacimiento    = fechaISO(get('nacimiento'),    { ...ctx, campo: 'fecha nacimiento' });
    const ts            = fechaISO(get('ts'),            { ...ctx, campo: 'marca temporal' });
    const ultimaVacuna  = fechaISO(get('ultima_vacuna'), { ...ctx, campo: 'última vacuna' });
    const ultimaDesp    = fechaISO(get('ultima_desp'),   { ...ctx, campo: 'última desparasitación' });

    // Nacimiento igual al día en que se llenó el formulario: puede ser un
    // recién nacido, pero casi siempre es que escribieron la fecha de hoy
    // en la casilla equivocada. Se importa y se avisa.
    if (nacimiento && ts && nacimiento === ts) {
      aviso(nFila, hoja, `"${mascota}" nació el mismo día del registro (${ts}) — ¿es un recién nacido o se copió la fecha de hoy?`);
    }

    // Vacuna o desparasitación ANTES de nacer. Acá no hay duda que valga:
    // a un animal no se le aplica nada el año anterior a su nacimiento, así
    // que la fecha de nacimiento está mal. Vale la pena separarlo del aviso
    // de arriba porque aquel es una sospecha y este es una prueba — y
    // porque la edad es dato clínico: la ficha diría "Recién nacida" para
    // un perro adulto, y de ahí sale una dosis.
    // Se descarta la fecha, no el evento: lo que está probado es que el
    // nacimiento es falso. Sin fecha la mascota entra con edad 0 y un campo
    // vacío que la clínica puede llenar; con la fecha falsa entraría con
    // "Recién nacida" en la ficha de un perro adulto, que se lee como un
    // dato cierto y de ahí sale una dosis.
    let nacimientoUsable = nacimiento;
    for (const [cual, f] of [['la última vacuna', ultimaVacuna], ['la última desparasitación', ultimaDesp]]) {
      // Comparar las ISO como texto alcanza: YYYY-MM-DD ordena igual
      // alfabéticamente que cronológicamente.
      if (nacimiento && f && f < nacimiento) {
        aviso(nFila, hoja, `IMPOSIBLE: "${mascota}" tiene ${cual} el ${f}, anterior a su nacimiento (${nacimiento}) → la fecha de nacimiento está mal, se importa SIN ella`);
        nacimientoUsable = null;
      }
    }

    const { especie, raza } = clasificar(get('raza'), razasDesconocidas);

    filas.push({
      hoja, nFila,
      cedula: get('cedula').replace(/\D/g, '') || null,
      tutor, direccion: get('direccion') || null, tel1, tel2,
      mascota,
      raza,
      nacimiento: nacimientoUsable,
      ts, hora: horaDe(get('ts')),
      tipo_bano: tipoBano(get('tipo_bano')),
      costo: pesos(get('costo'), ctx),
      observaciones: get('observaciones') || null,
      extra_vacuna: sinTildes(get('extra_vacuna')) === 'si',
      extra_tos: sinTildes(get('extra_tos')) === 'si',
      ultima_vacuna: ultimaVacuna,
      ultima_desp: ultimaDesp,
      especie,
      costoCrudo: get('costo'),
    });
  }
}

if (razasDesconocidas.size) {
  console.error('\nNo sé de qué especie son estas razas, y no las voy a adivinar:\n');
  for (const r of [...razasDesconocidas].sort()) console.error(`  · ${r}`);
  console.error('\nAgregalas a RAZAS_PERRO o RAZAS_GATO en este script y volvé a correrlo.');
  process.exit(1);
}

if (!filas.length) { console.error('No quedó ninguna fila para importar.'); process.exit(1); }

// Si casi ninguna fecha se pudo leer, el problema no son las filas sueltas:
// es que la hoja salió en un formato que este script no reconoce. Seguir
// dejaría un import mudo — clientes sin edad, sin baños y sin vacunas — y los
// avisos se perderían entre 54 líneas de revisar.md. Mejor detenerse.
if (fechasVistas >= 10 && fechasRotas > fechasVistas / 2) {
  console.error(`\nDe ${fechasVistas} fechas no pude leer ${fechasRotas}. Eso no son filas sucias:`);
  console.error('la hoja está en un formato de fecha que no reconozco. Ejemplos:\n');
  for (const a of avisos.filter((x) => x.texto.startsWith('fecha')).slice(0, 5)) {
    console.error(`  · fila ${a.fila}: ${a.texto}`);
  }
  console.error('\nEn Sheets: seleccionar las columnas de fecha → Formato → Número → Fecha,');
  console.error('volver a exportar el CSV y correr esto otra vez.');
  process.exit(1);
}


// ---------- 4. DEDUPLICACIÓN ----------
// Tutor: por cédula, que es la llave que la clínica misma usa. Sin cédula
// se cae al nombre sin tildes más el primer teléfono — no al nombre solo,
// porque en esta base hay dos "Teofilo Arboleda" distintas.
const claveTutor = (r) => (r.cedula ? `c:${r.cedula}` : `n:${sinTildes(r.tutor)}|${r.tel1 ?? ''}`);
// Mascota: dentro del tutor, por nombre sin tildes. "Ángel" y "angel " son
// la misma; "Max" de dos tutores distintos son dos mascotas.
const claveMascota = (r) => `${claveTutor(r)}|m:${sinTildes(r.mascota)}`;

const tutores = new Map();   // clave → datos del tutor
const mascotas = new Map();  // clave → datos de la mascota
const eventos = [];          // baños, vacunas y desparasitaciones

for (const r of filas) {
  const kt = claveTutor(r), km = claveMascota(r);

  // Tutor: gana el registro con más datos. Si el que ya estaba tiene algo
  // que el nuevo no, se conserva campo por campo — no se reemplaza la fila
  // entera, que es como se pierde la dirección larga de una hoja al
  // llegar la corta de la otra.
  const prev = tutores.get(kt);
  if (!prev) {
    tutores.set(kt, { clave: kt, cedula: r.cedula, nombre: r.tutor, direccion: r.direccion, tel1: r.tel1, tel2: r.tel2, origen: [`${r.hoja}:${r.nFila}`] });
  } else {
    if (sinTildes(prev.nombre) !== sinTildes(r.tutor)) {
      aviso(r.nFila, r.hoja, `misma cédula ${r.cedula} con dos nombres: "${prev.nombre}" y "${r.tutor}" → quedó "${prev.nombre.length >= r.tutor.length ? prev.nombre : r.tutor}"`);
      if (r.tutor.length > prev.nombre.length) prev.nombre = r.tutor;
    }
    // El dato más largo gana para la dirección: "Sector 5 mz C #25-43
    // Calle 11 #20-30 Barrio Prueba" dice más que "Calle 11 #20-30 Barrio Prueba", y es el mismo lugar.
    if (r.direccion && (!prev.direccion || r.direccion.length > prev.direccion.length)) prev.direccion = r.direccion;
    if (!prev.tel1 && r.tel1) prev.tel1 = r.tel1;
    if (!prev.tel2 && r.tel2 && r.tel2 !== prev.tel1) prev.tel2 = r.tel2;
    if (!prev.cedula && r.cedula) prev.cedula = r.cedula;
    prev.origen.push(`${r.hoja}:${r.nFila}`);
  }

  const pm = mascotas.get(km);
  if (!pm) {
    mascotas.set(km, { clave: km, tutor: kt, nombre: r.mascota.trim(), especie: r.especie, raza: r.raza, nacimiento: r.nacimiento, origen: [`${r.hoja}:${r.nFila}`] });
  } else {
    if (!pm.raza && r.raza) pm.raza = r.raza;
    if (!pm.nacimiento && r.nacimiento) pm.nacimiento = r.nacimiento;
    if (pm.nacimiento && r.nacimiento && pm.nacimiento !== r.nacimiento) {
      aviso(r.nFila, r.hoja, `"${r.mascota}" tiene dos fechas de nacimiento: ${pm.nacimiento} y ${r.nacimiento} → quedó ${pm.nacimiento}`);
    }
    pm.origen.push(`${r.hoja}:${r.nFila}`);
  }

  // Un baño por fila: cada fila del formulario ES una visita, con su fecha
  // y su precio. Si la misma mascota vino dos veces, son dos baños.
  if (r.ts && (r.tipo_bano || r.costo)) {
    const notas = [
      r.tipo_bano ? `Baño ${r.tipo_bano}` : null,
      r.costo ? `Costo ${r.costo.toLocaleString('es-CO')}` : null,
      r.costoCrudo && r.costo && r.costoCrudo.split(/\s+/)[0] !== r.costoCrudo ? `Anotado en la hoja: "${r.costoCrudo}"` : null,
      r.observaciones,
      [r.extra_vacuna ? 'vacuna anual' : null, r.extra_tos ? 'tos de las perreras' : null].filter(Boolean).length
        ? `Extras: ${[r.extra_vacuna ? 'vacuna anual' : null, r.extra_tos ? 'tos de las perreras' : null].filter(Boolean).join(', ')}`
        : null,
    ].filter(Boolean).join(' · ');
    eventos.push({ tipo: 'tratamiento', mascota: km, t: 'bano', fecha: r.ts, hora: r.hora, notas });
  }

  // Desparasitación: solo cuando hay fecha real.
  if (r.ultima_desp) {
    eventos.push({ tipo: 'tratamiento', mascota: km, t: 'desparasitacion', fecha: r.ultima_desp, hora: null, notas: 'Última desparasitación según el formulario de ingreso' });
  }

  // Vacuna: solo con fecha. "Extra [Vacunas anual] = Si" dice que contrató
  // el servicio, NO que se la aplicaron — crear una vacuna con eso sería
  // inventarle un antecedente clínico a un animal.
  if (r.ultima_vacuna) {
    const [a, m, d] = r.ultima_vacuna.split('-').map(Number);
    const prox = `${a + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    eventos.push({ tipo: 'vacuna', mascota: km, fecha: r.ultima_vacuna, proxima: prox });
  }
}


// ---------- 5. SQL ----------
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


// ---------- 6. REVISAR.MD ----------
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
R.push(`| Filas leídas con datos | ${filas.length} |`);
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

console.log(`\n  ${filas.length} filas leídas`);
console.log(`  ${tutores.size} tutores · ${mascotas.size} mascotas · ${eventos.length} eventos`);
console.log(`  ${avisos.length} cosas para revisar\n`);
console.log(`  SQL     → ${salidaSQL}`);
console.log(`  Revisar → ${join(dir, 'revisar.md')}\n`);
