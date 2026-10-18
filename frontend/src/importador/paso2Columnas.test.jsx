import { describe, it, expect } from 'vitest';
import { columnasConEjemplo } from './paso2Columnas.jsx';

// Los encabezados de la hoja de La Huella, recortados.
//
// El espacio al final de 'Nombre y apellidos del Tutor ' es entrada hostil
// a propósito y NO lo que llega en producción: `celda()` ya recorta cada
// celda de texto (leerXlsx.js:90), así que hoy un encabezado nunca llega
// con espacios. Está acá para que `columnasConEjemplo` no dependa de ese
// recorte de arriba — el día que se lea un PDF o un Google Sheet por API,
// el lector nuevo puede no recortar nada, y el encabezado es lo que la
// clínica compara contra su Excel para corregir el mapeo.
//
// Los valores son inventados —ver el commit 888a8ce: los datos reales de
// clientes no van a los tests.
const ENCABEZADOS = [
  'Marca temporal',
  'Nombre y apellidos del Tutor ',
  'Cedula',
  'Contacto telefonos (2)',
  'Nombre de la mascota',
  'Raza',
  'Otras observaciones',
];

const GRILLA = [
  ['2026-09-12 10:18:00', 'Ana Gómez',   '1000000001', '3000000011 - 3000000044', 'Max',  'Poodle',  ''],
  ['2026-09-13 09:02:00', 'Marta Rueda', '',           '3000000022',              'Luna', 'Criollo', 'Muy nerviosa'],
];

describe('columnasConEjemplo', () => {
  it('trae una entrada por columna del archivo, en el orden del archivo', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, {});
    expect(cols).toHaveLength(7);
    expect(cols.map((c) => c.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cols[1].encabezado).toBe('Nombre y apellidos del Tutor ');
  });

  it('marca cada columna con el campo al que la mandó el mapa', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, { tutor: 1, cedula: 2 });
    expect(cols[1].clave).toBe('tutor');
    expect(cols[2].clave).toBe('cedula');
  });

  // "Columna 7" no le dice nada a nadie. El ejemplo es lo que hace que la
  // clínica pueda corregir el mapeo sin abrir el Excel al lado.
  it('el ejemplo es el primer valor con datos, no el de la primera fila', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, {});
    // La observación está vacía en la fila 1 y llena en la 2.
    expect(cols[6].ejemplo).toBe('Muy nerviosa');
  });

  it('una columna vacía de punta a punta queda sin ejemplo, no con "undefined"', () => {
    const cols = columnasConEjemplo(['Vacía'], [[''], ['']], {});
    expect(cols[0].ejemplo).toBe('');
  });

  // Dos claves apuntando a la misma columna no debería pasar
  // —mapearEncabezados no repite índices y `asignar` libera el campo
  // anterior— pero si pasara, la columna se muestra con UNA etiqueta y no
  // con dos pegadas ni en blanco: la fila tiene que seguir siendo
  // corregible a mano.
  it('si dos campos apuntan a la misma columna, la muestra con el primero', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, { tutor: 1, mascota: 1 });
    expect(cols[1].clave).toBe('tutor');
    // Y la columna que de verdad es la mascota queda sin campo, que es lo
    // que hace visible el problema en la pantalla.
    expect(cols[4].clave).toBe(null);
  });

  it('un encabezado en blanco se muestra como "Columna N" y no vacío', () => {
    const cols = columnasConEjemplo(['', 'Raza'], [['Max', 'Poodle']], {});
    expect(cols[0].encabezado).toBe('Columna 1');
  });
});
