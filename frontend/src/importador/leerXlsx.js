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
      // Arreglo 3 (Minor): si v es null o undefined, parse_date_code falla
      // o devuelve basura. En un archivo bien formado SheetJS no produce
      // esto, pero el archivo viene de afuera: mejor cadena vacía que
      // "null" guardado como cédula o como costo.
      if (c.v == null) return '';

      const d = XLSX.SSF.parse_date_code(c.v);
      if (!d) return '';

      // Arreglo 4 (Minor): parse_date_code devuelve d === 0 cuando el
      // número no tiene parte de fecha (es solo una hora, como 0.42921 con
      // formato 'hh:mm'). En ese caso armar "1900-01-00 HH:MM:SS" sería
      // una fecha que no existe en ningún calendario. El día 0 es la señal
      // de que el dato es puramente horario: se devuelve solo la hora.
      if (d.d === 0) return `${dos(d.H)}:${dos(d.M)}:${dos(d.S)}`;

      const fecha = `${d.y}-${dos(d.m)}-${dos(d.d)}`;
      if (!d.H && !d.M && !d.S) return fecha;
      return `${fecha} ${dos(d.H)}:${dos(d.M)}:${dos(d.S)}`;
    }

    // Arreglo 3 (Minor): null con tipo 'n' y sin formato de fecha cae acá.
    // String(null) produce la cadena literal "null", que se guardaría como
    // cédula o costo. Con == se atrapa también undefined por si cambia la
    // librería.
    if (c.v == null) return '';

    // toFixed(0) para que el entero salga con todos sus dígitos y sin coma
    // decimal, que es lo que espera el replace(/\D/g,'') de filas.js:65:
    // "1000000004.0" ahí se vuelve 10000000040, un cero de más en una cédula.
    //
    // El `>= 1e21` no es paranoia de más: acá decía que toFixed(0) protegía de
    // la notación científica, y NO protege. toFixed está especificado para
    // devolver ToString(x) cuando x >= 10^21, así que (1e21).toFixed(0) da
    // "1e+21" igual que String(1e21) —verificado— y "1e+21" sin los no-dígitos
    // es "121". El comentario viejo le decía al próximo lector que ese borde
    // estaba cubierto cuando seguía abierto; ahora se ataja a mano.
    //
    // Arriba de 2^53 el valor ya lo perdió SheetJS y no hay nada que hacer
    // desde este lado: BigInt() de un entero así devuelve lo que llegó, no lo
    // que había en la celda.
    if (Number.isInteger(c.v)) {
      return Math.abs(c.v) >= 1e21 ? BigInt(c.v).toString() : c.v.toFixed(0);
    }

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
  // XLSX.read 0.20.3 no lanza con datos inválidos: los parsea produciendo
  // un libro con una hoja "Sheet1" que tiene los bytes como texto en A1.
  // Eso pasa la pantalla de elegir hoja y llega al mapeo de columnas con
  // una fila de basura. Verificamos la firma antes de parsear para cortar
  // ese camino en la entrada.
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

/**
 * La extensión real de la hoja: filas y columnas derivadas de las celdas
 * que efectivamente existen, no del '!ref' que el archivo declara.
 *
 * '!ref' es una afirmación — una hoja hostil o una hoja de Google estirada
 * puede declarar 'A1:XFD1048576' (17 mil millones de iteraciones) con solo
 * tres filas de datos. Recorriendo las claves reales del objeto se obtiene
 * la extensión verdadera: las celdas son el hecho, '!ref' es solo la
 * afirmación. Esto además es más correcto que confiar en '!ref': si el
 * rango declarado fuera más chico que las celdas reales, se perderían
 * filas en silencio.
 *
 * Después de derivar la extensión real se aplica un tope: el importador no
 * está diseñado para archivos de ese tamaño y es mejor un mensaje claro
 * que una pestaña congelada.
 *
 * @returns {{ maxR: number, maxC: number }}
 *   maxR: índice de la última fila con dato (−1 si la hoja está vacía).
 *   maxC: índice de la última columna con dato (−1 si la hoja está vacía).
 */
const extensionReal = (hoja) => {
  let maxR = -1;
  let maxC = -1;

  for (const k of Object.keys(hoja)) {
    // Las claves de metadatos empiezan con '!'; solo las claves de celda
    // tienen la forma "A1", "B2", etc.
    if (k.startsWith('!')) continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  if (maxR < 0) return { maxR, maxC };  // hoja vacía, sin tope que aplicar

  const filas = maxR + 1;
  const celdas = filas * (maxC + 1);

  // 20.000 filas × columnas ilimitadas, o 500.000 celdas totales: topes
  // generosos a propósito (el archivo real tiene 54 × 15 = 810). El
  // importador no soporta archivos de ese tamaño por otros motivos de
  // diseño; un mensaje claro es mejor que una pestaña muerta.
  if (filas > 20_000) {
    throw new Error(
      `El archivo tiene ${filas.toLocaleString('es-CO')} filas. ` +
      'El importador acepta hasta 20.000. Partilo en archivos más chicos.',
    );
  }
  if (celdas > 500_000) {
    throw new Error(
      `El archivo tiene ${celdas.toLocaleString('es-CO')} celdas ` +
      `(${filas.toLocaleString('es-CO')} filas × ${(maxC + 1).toLocaleString('es-CO')} columnas). ` +
      'El importador acepta hasta 500.000. Partilo en archivos más chicos.',
    );
  }

  return { maxR, maxC };
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
  const { maxR, maxC } = extensionReal(hoja);
  if (maxR < 0) return [];  // hoja sin celdas

  const filas = [];
  for (let r = 0; r <= maxR; r++) {
    const fila = [];
    for (let c = 0; c <= maxC; c++) {
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
 *
 * TIRA si CUALQUIER hoja del libro pasa el tope de extensionReal, incluso
 * cuando la hoja que la clínica quería importar es chica. Quien llame a
 * esto tiene que envolverlo y mostrar el mensaje: sin eso la pantalla de
 * elegir hoja queda en blanco y no dice por qué.
 *
 * Es a propósito, y es la menos mala de tres. Reportar la hoja grande como
 * "0 filas" la dejaría apagada y las otras elegibles, pero le mentiría a la
 * clínica sobre una hoja que sí tiene datos, y acá el dato que miente en
 * silencio es lo que más caro sale. Devolver un campo nuevo tipo
 * `demasiado_grande` cambia la interfaz que consume la pantalla de elegir
 * hoja. Tirar con el mensaje que ya dice "partilo en archivos más chicos"
 * es accionable: borra esa hoja en Google Sheets y vuelve a bajar el
 * archivo. (Revisión 2026-10-17)
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
