// ============================================================
// VetaApp · importador/leerXlsx.js
// Un .xlsx que subió la clínica → una grilla de texto para el núcleo.
//
// ---------- POR QUÉ NO SE LEE UN CSV ----------
// Es el mismo argumento de importar/xlsx-a-csv.py, acá en el navegador:
// el .xlsx guarda los TIPOS de cada celda y el CSV los pierde. Con los
// tipos a la vista, tres datos que en un CSV serían una adivinanza quedan
// resueltos de entrada — y los tres fallan en silencio si se adivina mal:
// la cédula con un cero de más, el costo diez veces más caro, y las
// fechas en d/m/Y o m/d/Y según el idioma de la cuenta de Google.
//
// ---------- LO QUE NO HACE ----------
// No valida nada del contenido. Esto entrega texto; quién es tutor y qué
// fecha es válida lo decide nucleo/. Esa separación es la que va a dejar
// enchufar el lector de PDF más adelante sin tocar ni el emparejado ni la
// vista previa.
// ============================================================

import * as XLSX from 'xlsx';

const dos = (n) => String(n).padStart(2, '0');

/**
 * Una celda de SheetJS al texto que va al núcleo, sin inventar ni perder.
 */
export function celda(c) {
  if (!c || c.t === 'z') return '';

  // #REF!, #N/A, #DIV/0!: son errores de la hoja, no datos. Escribirlos
  // dejaría "#N/A" guardado como el nombre de un perro.
  if (c.t === 'e') return '';

  if (c.t === 'b') return c.v ? 'Si' : 'No';

  // Ya viene como Date si alguien llamó a XLSX.read con cellDates. Acá no
  // se usa (ver leerLibro), pero una celda así no puede caer al String()
  // del final: saldría "Thu Jul 26 2018 00:00:00 GMT-0500".
  if (c.t === 'd' && c.v instanceof Date) {
    const d = c.v;
    const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    if (!d.getHours() && !d.getMinutes() && !d.getSeconds()) return fecha;
    return `${fecha} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
  }

  if (c.t === 'n') {
    // Acá está toda la gracia. En Excel una fecha es un número, y lo único
    // que la distingue de un precio es el FORMATO de la celda (c.z, que
    // llega porque leerLibro pide cellNF). SSF.parse_date_code lo convierte
    // sin pasar por Date, así que no hay huso horario que corra un día.
    if (c.z && XLSX.SSF.is_date(c.z)) {
      const d = XLSX.SSF.parse_date_code(c.v);
      if (!d) return '';
      const fecha = `${d.y}-${dos(d.m)}-${dos(d.d)}`;
      if (!d.H && !d.M && !d.S) return fecha;
      return `${fecha} ${dos(d.H)}:${dos(d.M)}:${dos(d.S)}`;
    }

    // toFixed(0) y no String(): String(1e21) devuelve "1e+21". Ninguna
    // cédula llega a eso, pero el día que una celda traiga un número
    // enorme, "1e+21" normalizado a dígitos es basura silenciosa.
    if (Number.isInteger(c.v)) return c.v.toFixed(0);

    // Un precio con centavos no hay ninguno hoy, pero puede llegar, y
    // truncarlo en silencio sería peor: se escribe tal cual y el núcleo
    // decide qué hacer con él.
    return String(c.v);
  }

  return String(c.v ?? '').trim();
}

/**
 * Los bytes del archivo → el libro de SheetJS.
 * @param {ArrayBuffer|Uint8Array} bytes
 */
export function leerLibro(bytes) {
  // XLSX.read 0.20.3 no lanza con datos inválidos: los parsea silenciosamente
  // como un libro vacío. Verificamos la firma antes de parsear.
  // .xlsx es un ZIP (PK\x03\x04 = 50 4B 03 04).
  // .xls es OLE2 (D0 CF 11 E0). Ambas son reconocidas como Excel válido.
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const esXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  const esXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
  if (!esXlsx && !esXls) {
    throw new Error(
      'Ese archivo no parece un archivo de Excel. Si lo tenés en Google Sheets, ' +
      'usá Archivo → Descargar → Microsoft Excel (.xlsx).',
    );
  }
  try {
    return XLSX.read(bytes, {
      type: 'array',
      // Las fechas se quedan como número + formato. cellDates las
      // convertiría a Date usando el huso del navegador, y en Colombia
      // (UTC-5) eso corre un día para atrás en algunos casos. El número
      // crudo no tiene huso.
      cellDates: false,
      // Sin esto no llega c.z, y sin c.z una fecha es un número suelto:
      // vuelve exactamente el problema que este archivo existe para
      // resolver.
      cellNF: true,
      // No hace falta el texto ya formateado y en archivos grandes es
      // memoria de más.
      cellText: false,
    });
  } catch (e) {
    // Lo que ve la clínica, no el stack de SheetJS.
    throw new Error(
      'Ese archivo no parece un archivo de Excel. Si lo tenés en Google Sheets, ' +
      'usá Archivo → Descargar → Microsoft Excel (.xlsx).',
    );
  }
}

/** La última columna que tiene algo en toda la hoja. */
const ancho = (hoja) => {
  const ref = hoja?.['!ref'];
  if (!ref) return 0;
  return XLSX.utils.decode_range(ref).e.c + 1;
};

/**
 * Todas las filas de la hoja como texto, cortando la cola en blanco.
 *
 * Se recorre desde la fila 1 y la columna A SIEMPRE, aunque el rango de la
 * hoja empiece más adelante: así el índice de la fila que se devuelve es el
 * número de fila que la clínica ve en Excel, que es el que va a buscar
 * cuando un aviso le diga "fila 35".
 */
const todasLasFilas = (hoja) => {
  const ref = hoja?.['!ref'];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  const cols = ancho(hoja);

  const filas = [];
  for (let r = 0; r <= rango.e.r; r++) {
    const fila = [];
    for (let c = 0; c < cols; c++) {
      fila.push(celda(hoja[XLSX.utils.encode_cell({ r, c })]));
    }
    filas.push(fila);
  }

  // La cola sí se corta. Las hojas de Google vienen estiradas con filas en
  // blanco hasta la 155: dejarlas serían 150 avisos de "fila sin nombres"
  // que no significan nada y que esconden los que sí.
  while (filas.length && filas[filas.length - 1].every((x) => x === '')) filas.pop();

  return filas;
};

/**
 * Las hojas del archivo, con cuántas filas con datos tiene cada una.
 *
 * El número es para que la clínica elija hoja sabiendo. Si dijera 155
 * porque Google estiró el rango, elegiría a ciegas.
 */
export function hojas(libro) {
  return libro.SheetNames.map((nombre) => {
    const conDatos = todasLasFilas(libro.Sheets[nombre])
      .filter((f) => f.some((x) => x !== '')).length;
    // -1 por el encabezado. Una hoja de una sola fila es solo encabezado:
    // 0 filas con datos, no -1.
    return { nombre, filas: Math.max(0, conDatos - 1) };
  });
}

/**
 * Una hoja → encabezados + grilla.
 *
 * `grilla[i]` es la fila `i + 2` de la hoja: el encabezado es la 1, y las
 * filas en blanco del medio SE CONSERVAN. Saltarlas correría la numeración
 * y los avisos apuntarían a filas equivocadas — el aviso más importante
 * del importador ("fila 35: la vacuna es anterior al nacimiento") sería el
 * que no se puede seguir. El núcleo ya sabe saltar la fila vacía sin
 * avisar.
 */
export function leerHoja(libro, nombre) {
  const hoja = libro.Sheets?.[nombre];
  if (!hoja) {
    throw new Error(`La hoja "${nombre}" no está en el archivo.`);
  }

  const [encabezados = [], ...grilla] = todasLasFilas(hoja);
  return { encabezados, grilla };
}
