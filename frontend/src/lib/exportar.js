import { supabase } from './supabase';

// ============================================================
//  Sacar los datos de la veterinaria en CSV.
//
//  Existe porque los Términos ya prometían que la información es suya y
//  que puede llevársela, y hasta hoy no había forma de hacerlo: la
//  pestaña "Datos y backups" solo mostraba un cartel verde que decía
//  "guardado en la nube". Prometer una copia y no dar un botón es la
//  clase de detalle que una veterinaria descubre el día que quiere irse,
//  que es justo el peor día para descubrirlo.
//
//  No se filtra por user_id en ningún lado: RLS ya lo hace. Si algún día
//  una política se rompiera, este archivo no sería el que salvaría los
//  datos de otra clínica — por eso el aislamiento vive en la base.
// ============================================================

/**
 * Lo que se puede descargar.
 *
 * Son los registros que la veterinaria creó: sus pacientes, su historia
 * clínica, su plata. NO se exportan `perfiles`, `pagos` ni
 * `planes_precios` — eso es la relación comercial con VetaApp, no el
 * trabajo de la clínica, y meterlo en el paquete solo confunde.
 *
 * `inventario` y `cobros` son de plan Avanzado. Si la cuenta está en
 * Esencial, RLS devuelve cero filas y aquí se avisa "sin registros" en
 * vez de fallar. Ojo: eso no significa que estén vacíos de verdad —
 * pueden existir filas de cuando la cuenta estaba en Avanzado, ocultas
 * por la política. Se recuperan volviendo a subir de plan.
 */
export const CONJUNTOS = [
  { tabla: 'duenos',             titulo: 'Dueños',             detalle: 'Nombre, teléfono y dirección de cada dueño.' },
  { tabla: 'mascotas',           titulo: 'Mascotas',           detalle: 'Pacientes con especie, raza, edad y peso.' },
  { tabla: 'historias_clinicas', titulo: 'Historias clínicas', detalle: 'Consultas, diagnósticos y notas.' },
  { tabla: 'vacunas',            titulo: 'Vacunas',            detalle: 'Aplicadas y próximas fechas.' },
  { tabla: 'tratamientos',       titulo: 'Tratamientos',       detalle: 'Medicamentos y planes indicados.' },
  { tabla: 'citas',              titulo: 'Citas',              detalle: 'Agenda completa, pasada y futura.' },
  { tabla: 'inventario',         titulo: 'Inventario',         detalle: 'Productos, existencias y precios.', plan: 'Avanzado' },
  { tabla: 'cobros',             titulo: 'Cobros',             detalle: 'Servicios cobrados y medios de pago.', plan: 'Avanzado' },
];

// PostgREST corta los `select` en una cantidad máxima de filas por
// petición (en Supabase el tope por defecto son 1000). Una clínica con
// 1.200 mascotas se llevaría 1.000 y no se enteraría: el archivo abre
// bien, tiene encabezados y filas, y solo le faltan pacientes. Por eso
// se pagina siempre, aunque hoy la mayoría de tablas quepan de una.
const TAMANO_PAGINA = 1000;

/**
 * Trae una tabla completa, página por página.
 *
 * Se ordena por `id` a propósito: sin un orden estable, dos `range()`
 * consecutivos pueden repetir o saltarse filas si algo cambia entre
 * medias. Un backup con filas perdidas es peor que no tener backup,
 * porque nadie lo revisa.
 */
export async function traerTabla(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order('id', { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error) throw new Error(error.message);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < TAMANO_PAGINA) break;
  }
  return filas;
}

// Excel en español interpreta el punto y coma como separador de columnas
// y la coma como separador decimal. Con comas, la veterinaria abre el
// archivo de doble clic y ve TODO amontonado en la columna A, decide que
// "el sistema exporta mal" y no vuelve a intentarlo. Google Sheets y
// pandas leen ambos, así que el punto y coma es el que menos gente rompe.
const SEP = ';';

// Excel ejecuta como fórmula cualquier celda que empiece por = + - @ (o
// por tab/retorno seguidos de esos). Si alguien escribió `=HYPERLINK(...)`
// en el nombre de una mascota, se convierte en código al abrir el CSV en
// otra máquina. Se le antepone un apóstrofo, que es lo que Excel entiende
// como "esto es texto": el dato se sigue leyendo igual y deja de correr.
const PELIGROSO = /^[=+\-@\t\r]/;

function celda(valor) {
  if (valor === null || valor === undefined) return '';

  // jsonb y arrays llegan como objetos: sin esto quedaría "[object Object]".
  let texto =
    typeof valor === 'object' ? JSON.stringify(valor) : String(valor);

  // Solo se blinda el texto. Un número no puede ser una fórmula, y
  // anteponerle apóstrofo sería peor que el problema: un descuento de
  // -500 en `cobros` entraría a Excel como texto y dejaría de sumar en
  // los totales. Un backup que no cuadra la caja no sirve de nada.
  if (typeof valor === 'string' && PELIGROSO.test(texto)) texto = `'${texto}`;

  if (texto.includes(SEP) || texto.includes('"') || /[\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Filas → texto CSV.
 *
 * Los encabezados salen de la unión de las claves de TODAS las filas, no
 * de la primera: una columna que llegue nula en el primer registro pero
 * con dato en el segundo no se puede perder.
 */
export function aCSV(filas) {
  if (!filas.length) return '';

  const columnas = [];
  const vistas = new Set();
  for (const fila of filas) {
    for (const clave of Object.keys(fila)) {
      if (!vistas.has(clave)) { vistas.add(clave); columnas.push(clave); }
    }
  }

  const lineas = [columnas.join(SEP)];
  for (const fila of filas) {
    lineas.push(columnas.map((c) => celda(fila[c])).join(SEP));
  }
  // CRLF: es lo que espera Excel y no molesta a nadie más.
  return lineas.join('\r\n');
}

/**
 * Dispara la descarga en el navegador.
 *
 * El \uFEFF del principio es la marca de orden de bytes. Sin ella Excel
 * asume la codificación del sistema y "Bogotá" se abre como "BogotÃ¡" en
 * cada tilde y cada ñ — o sea, en un archivo en español, en casi todas
 * las filas.
 */
export function descargarCSV(nombreArchivo, csv) {
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el blob se queda en memoria hasta que se recargue la página.
  URL.revokeObjectURL(url);
}

/** `mascotas-2026-09-01.csv` — la fecha va en el nombre para que dos backups no se pisen. */
export const nombreArchivo = (tabla) =>
  `vetaapp-${tabla}-${new Date().toISOString().slice(0, 10)}.csv`;

/**
 * Descarga una tabla. Devuelve cuántas filas salieron.
 *
 * Cero filas NO descarga un archivo vacío: un CSV con solo encabezados
 * parece un backup y no lo es. Mejor decirlo en pantalla.
 */
export async function exportarTabla(tabla) {
  const filas = await traerTabla(tabla);
  if (!filas.length) return 0;
  descargarCSV(nombreArchivo(tabla), aCSV(filas));
  return filas.length;
}
