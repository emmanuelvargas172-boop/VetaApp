import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { celda, leerLibro, hojas, leerHoja } from './leerXlsx.js';

describe('celda', () => {
  it('un texto queda igual, sin espacios de sobra', () => {
    expect(celda({ t: 's', v: '  Ana Gómez  ' })).toBe('Ana Gómez');
  });

  it('la celda que no está es cadena vacía, no undefined', () => {
    expect(celda(undefined)).toBe('');
  });

  // El caso de la cédula. 1000000001 escrito como "1000000001.0" lo lee el
  // importador —que normaliza a solo dígitos— como 10000000010: un cero de
  // más, y una cédula que no identifica a nadie.
  it('un entero grande no sale con decimal ni en notación científica', () => {
    expect(celda({ t: 'n', v: 1000000001 })).toBe('1000000001');
  });

  // El caso del costo. 40000.0 mal escrito queda "400000": diez veces más
  // caro, en la columna de la que vive la peluquería.
  it('un costo entero sale sin decimal', () => {
    expect(celda({ t: 'n', v: 40000 })).toBe('40000');
  });

  // Un precio con centavos no hay ninguno hoy, pero puede llegar, y
  // truncarlo en silencio sería peor que dejarlo pasar: se escribe tal cual
  // y el núcleo decide.
  it('un decimal de verdad no se trunca', () => {
    expect(celda({ t: 'n', v: 40000.5 })).toBe('40000.5');
  });

  // Acá está toda la gracia de leer el .xlsx y no un CSV: el número 43307
  // con formato de fecha ES una fecha, y no hay que adivinar si 26/07 es
  // julio o febrero.
  it('un número con formato de fecha sale en ISO', () => {
    expect(celda({ t: 'n', v: 43307, z: 'dd/mm/yyyy' })).toBe('2018-07-26');
  });

  // La marca temporal del formulario. La hora importa: es la hora real a la
  // que la clínica atendió, y va a tratamientos.hora.
  // 46277 es el serial de 2026-09-12; viene de la primera fila del archivo real.
  it('una fecha con hora sale completa', () => {
    expect(celda({ t: 'n', v: 46277.42921, z: 'yyyy-mm-dd hh:mm:ss' }))
      .toMatch(/^2026-09-12 10:18:/);
  });

  it('un booleano sale como lo escribe la clínica', () => {
    expect(celda({ t: 'b', v: true })).toBe('Si');
    expect(celda({ t: 'b', v: false })).toBe('No');
  });

  // #REF! y #N/A son errores de la hoja, no datos. Escribirlos dejaría
  // "#N/A" guardado como el nombre de un perro.
  it('una celda con error de fórmula queda vacía', () => {
    expect(celda({ t: 'e', v: 0x07, w: '#DIV/0!' })).toBe('');
  });

  // Arreglo 3 (Minor): con t='n' y v=null, Number.isInteger(null) es false
  // y sin esta guarda caería al String(null) del final, produciendo la
  // cadena literal "null". Eso se guardaría como cédula o como costo.
  it('una celda numérica con v=null sale como cadena vacía, no como "null"', () => {
    expect(celda({ t: 'n', v: null })).toBe('');
  });

  // Arreglo 3 (Minor): mismo caso pero con formato de fecha. El v=null
  // antes de parse_date_code produce basura o un error de la librería.
  it('una celda de fecha con v=null sale como cadena vacía', () => {
    expect(celda({ t: 'n', v: null, z: 'dd/mm/yyyy' })).toBe('');
  });

  // Arreglo 4 (Minor): un número de solo-hora (sin parte de fecha) como
  // 0.42921 con formato 'hh:mm' pasa SSF.is_date y parse_date_code devuelve
  // d===0: señal de que no hay fecha real. Armar "1900-01-00 10:18:03"
  // sería un día que no existe. Se devuelve solo la hora.
  it('una celda de solo-hora devuelve HH:MM:SS sin fecha inventada', () => {
    expect(celda({ t: 'n', v: 0.42921, z: 'hh:mm' })).toBe('10:18:03');
  });
});

// Una hoja armada a mano: es la forma de probar los tipos sin un .xlsx
// binario en el repo (y sin usar el archivo real, que trae datos de 53
// personas de verdad).
const hojaDePrueba = () => ({
  '!ref': 'A1:C6',
  A1: { t: 's', v: 'Tutor' },
  B1: { t: 's', v: 'Mascota' },
  C1: { t: 's', v: 'Nacimiento' },

  A2: { t: 's', v: 'Ana Gómez' },
  B2: { t: 's', v: 'Max' },
  C2: { t: 'n', v: 43307, z: 'dd/mm/yyyy' },

  // Fila 3 en blanco a propósito: las hojas de Google vienen con huecos.

  A4: { t: 's', v: 'Luis Peña' },
  B4: { t: 's', v: 'Nube' },

  // Filas 5 y 6 en blanco: la cola estirada hasta la 155 que deja Google.
});

const libroDePrueba = () => ({
  SheetNames: ['Respuestas de formulario 1', 'Vacía'],
  Sheets: {
    'Respuestas de formulario 1': hojaDePrueba(),
    'Vacía': { '!ref': 'A1:A1' },
  },
});

describe('hojas', () => {
  // Es el número que la clínica va a usar para elegir hoja. Si dice 155
  // porque Google estiró el rango, elige a ciegas.
  it('cuenta las filas con datos, sin el encabezado ni los blancos', () => {
    expect(hojas(libroDePrueba())).toEqual([
      { nombre: 'Respuestas de formulario 1', filas: 2 },
      { nombre: 'Vacía', filas: 0 },
    ]);
  });
});

describe('leerHoja', () => {
  it('separa el encabezado de los datos', () => {
    const { encabezados } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(encabezados).toEqual(['Tutor', 'Mascota', 'Nacimiento']);
  });

  // El aviso dice "fila 4" y ella mira la fila 4 en Excel. Si se saltaran
  // los blancos, diría "fila 3" y no habría nada ahí: el aviso más
  // importante del importador sería el que no se puede seguir.
  it('deja el hueco de la fila en blanco para no correr la numeración', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(grilla[0]).toEqual(['Ana Gómez', 'Max', '2018-07-26']);
    expect(grilla[1]).toEqual(['', '', '']);          // fila 3 de la hoja
    expect(grilla[2]).toEqual(['Luis Peña', 'Nube', '']);
  });

  // Y la cola SÍ se corta: 150 filas vacías al final son 150 avisos de
  // "fila sin nombres" que no significan nada.
  it('corta las filas en blanco del final', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(grilla).toHaveLength(3);
  });

  it('todas las filas tienen el mismo ancho', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(new Set(grilla.map((f) => f.length))).toEqual(new Set([3]));
  });

  it('dice en español que la hoja no está', () => {
    expect(() => leerHoja(libroDePrueba(), 'No Existe'))
      .toThrow(/La hoja "No Existe" no está/);
  });

  // Arreglo 1 (Important): una hoja con '!ref' que dice A1:XFD1048576
  // (el máximo de Excel) pero con solo 3 filas de datos se lee en tiempo
  // normal. Antes iteraba el rango declarado: 17 mil millones de celdas.
  // Ahora deriva la extensión de las claves reales, así que el tamaño
  // iterado es exactamente el de los datos que existen.
  it('una hoja con !ref enorme y pocas celdas se lee correctamente', () => {
    const hojaEstirada = {
      '!ref': 'A1:XFD1048576',  // máximo de Excel — si se iterara, congela
      A1: { t: 's', v: 'Tutor' },
      B1: { t: 's', v: 'Mascota' },
      A2: { t: 's', v: 'Ana Gómez' },
      B2: { t: 's', v: 'Max' },
      A3: { t: 's', v: 'Luis Peña' },
      B3: { t: 's', v: 'Nube' },
    };
    const libro = {
      SheetNames: ['Hoja1'],
      Sheets: { Hoja1: hojaEstirada },
    };
    const { encabezados, grilla } = leerHoja(libro, 'Hoja1');
    expect(encabezados).toEqual(['Tutor', 'Mascota']);
    expect(grilla).toHaveLength(2);
    expect(grilla[0]).toEqual(['Ana Gómez', 'Max']);
    expect(grilla[1]).toEqual(['Luis Peña', 'Nube']);
  });

  // Arreglo 1 (Important): pasado el tope de filas, el error sale en
  // español con el número concreto para que la clínica sepa qué pasa.
  it('tira error en español cuando la hoja supera las 20.000 filas', () => {
    // Armar una hoja con 20.001 filas no copia celda por celda: se
    // construye dinámicamente para que el test sea rápido.
    const hojaGigante = { '!ref': 'A1:A1' };
    for (let r = 0; r < 20_001; r++) {
      hojaGigante[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: 'x' };
    }
    const libro = { SheetNames: ['Hoja1'], Sheets: { Hoja1: hojaGigante } };
    expect(() => leerHoja(libro, 'Hoja1'))
      .toThrow(/20\.001|20001|filas|más chicos/);
  });
});

describe('leerLibro', () => {
  // Esta es la prueba que importa de verdad: que `cellNF: true` traiga el
  // formato de la celda. Sin ese formato, una fecha es un número suelto y
  // vuelve el problema que este archivo existe para resolver.
  it('un .xlsx de verdad vuelve con la fecha en ISO', () => {
    const ws = XLSX.utils.aoa_to_sheet(
      // Medianoche local y no UTC: en Colombia (UTC-5) un Date.UTC se
      // convierte al día anterior y el test pasaría a fallar por el huso.
      [['Nacimiento', 'Cedula'], [new Date(2018, 6, 26), 1000000001]],
      { cellDates: true },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const { grilla } = leerHoja(leerLibro(bytes), 'Hoja1');
    expect(grilla[0]).toEqual(['2018-07-26', '1000000001']);
  });

  it('dice en español que el archivo no es un Excel', () => {
    expect(() => leerLibro(new Uint8Array([1, 2, 3, 4, 5])))
      .toThrow(/no se pudo leer|no parece un archivo de Excel/i);
  });
});
