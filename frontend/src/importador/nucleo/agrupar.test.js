import { describe, it, expect } from 'vitest';
import { nuevoEstado } from './normalizar.js';
import { leerFilas, formatoDeFechasRoto } from './filas.js';
import { agrupar } from './agrupar.js';

// Mapeo fijo para los tests: columna 0 tutor, 1 mascota, 2 teléfono,
// 3 cédula, 4 raza, 5 nacimiento, 6 fecha del servicio, 7 última vacuna.
const MAPA = { tutor: 0, mascota: 1, telefonos: 2, cedula: 3, raza: 4,
               nacimiento: 5, ts: 6, ultima_vacuna: 7 };
const leer = (grilla, estado = nuevoEstado()) =>
  ({ estado, filas: leerFilas(estado, { grilla, mapa: MAPA, hoja: 'Hoja1' }) });

describe('leerFilas', () => {
  it('lee una fila completa', () => {
    const { filas } = leer([['Ana Gómez', 'Max', '3000000011', '1000000001', 'Poodle', '26/07/2018', '', '']]);
    expect(filas[0]).toMatchObject({
      tutor: 'Ana Gómez', mascota: 'Max', tel1: '573000000011',
      cedula: '1000000001', raza: 'Poodle', especie: 'perro', nacimiento: '2018-07-26',
    });
  });

  it('salta la fila completamente vacía sin avisar', () => {
    const { estado, filas } = leer([['', '', '', '', '', '', '', '']]);
    expect(filas).toHaveLength(0);
    expect(estado.avisos).toHaveLength(0);
  });

  // Una fila con teléfono y costo pero sin nombres es una visita que se
  // cobró. No se importa, pero NO se desaparece en silencio.
  it('descarta la fila sin nombres pero la avisa', () => {
    const { estado, filas } = leer([['', '', '3000000011', '', '', '', '', '']]);
    expect(filas).toHaveLength(0);
    expect(estado.avisos[0].texto).toContain('sin nombres');
    // 'descarte' y no 'dato': el paso 3 cuenta estos aparte para poder
    // decir "no voy a importar 3 filas" sin leer el texto del mensaje.
    expect(estado.avisos[0].clase).toBe('descarte');
  });

  it('avisa cuando la mascota nació el mismo día del registro', () => {
    const { estado } = leer([['Ana', 'Max', '', '', 'Poodle', '17/09/2026', '17/09/2026', '']]);
    expect(estado.avisos.some((a) => a.texto.includes('mismo día del registro'))).toBe(true);
  });

  // El caso "Nube": vacuna el 2026-07-14, nacimiento el 2026-09-17.
  // Imposible. Lo probado es que el nacimiento es falso.
  it('descarta el nacimiento cuando hay una vacuna anterior, no la vacuna', () => {
    const { estado, filas } = leer([['Ana', 'Nube', '', '', 'Poodle', '17/09/2026', '', '14/07/2026']]);
    expect(filas[0].nacimiento).toBeNull();
    expect(filas[0].ultima_vacuna).toBe('2026-07-14');
    expect(estado.avisos.some((a) => a.texto.startsWith('IMPOSIBLE'))).toBe(true);
  });

  // Leer las fechas dos veces duplicaría cada aviso y falsearía el
  // contador que decide si la hoja viene en otro formato.
  it('no repite el aviso de una fecha mala', () => {
    const { estado } = leer([['Ana', 'Max', '', '', 'Poodle', '31/02/2026', '', '']]);
    expect(estado.avisos.filter((a) => a.texto.includes('31/02/2026'))).toHaveLength(1);
  });
});

describe('formatoDeFechasRoto', () => {
  it('con pocas fechas no decide nada', () => {
    const e = nuevoEstado();
    e.fechasVistas = 4; e.fechasRotas = 4;
    expect(formatoDeFechasRoto(e)).toBe(false);
  });

  it('con muchas fechas y la mayoría rotas, la hoja está en otro formato', () => {
    const e = nuevoEstado();
    e.fechasVistas = 20; e.fechasRotas = 15;
    expect(formatoDeFechasRoto(e)).toBe(true);
  });
});

describe('agrupar', () => {
  it('une al mismo tutor por cédula aunque el nombre esté escrito distinto', () => {
    const { estado, filas } = leer([
      ['Ana Gómez',  'Max',  '3000000011', '1000000001', 'Poodle', '', '', ''],
      ['ana gomez',  'Luna', '3000000011', '1000000001', 'Pug',    '', '', ''],
    ]);
    const { tutores, mascotas } = agrupar(estado, filas);
    expect(tutores.size).toBe(1);
    expect(mascotas.size).toBe(2);
  });

  // Dos personas distintas con el mismo nombre y teléfonos distintos.
  // Pasó de verdad: hay dos "Teofilo Arboleda" en la base de La Huella.
  it('NO une dos tutores del mismo nombre con teléfonos distintos', () => {
    const { estado, filas } = leer([
      ['Teofilo Arboleda', 'Max',  '3000000022', '', '', '', '', ''],
      ['Teofilo Arboleda', 'Luna', '3000000033', '', '', '', '', ''],
    ]);
    expect(agrupar(estado, filas).tutores.size).toBe(2);
  });

  // Misma persona por cédula, con un número distinto en cada fila. El
  // segundo es un dato que la clínica tiene y que vale: es por donde la
  // llaman cuando el primero no contesta. Se guardaba solo el de la primera
  // fila y el otro se perdía sin aviso, teniendo `telefono2` vacío al lado.
  it('un segundo número en otra fila cae en telefono2 en vez de perderse', () => {
    const { estado, filas } = leer([
      ['Ana Gómez', 'Max',  '3000000011', '1000000001', '', '', '', ''],
      ['Ana Gómez', 'Luna', '3100000022', '1000000001', '', '', '', ''],
    ]);
    const t = [...agrupar(estado, filas).tutores.values()][0];
    expect(t.tel1).toBe('573000000011');
    expect(t.tel2).toBe('573100000022');
  });

  // El mismo número repetido en dos filas NO es un segundo número.
  it('el mismo número en dos filas no se copia a telefono2', () => {
    const { estado, filas } = leer([
      ['Ana Gómez', 'Max',  '3000000011', '1000000001', '', '', '', ''],
      ['Ana Gómez', 'Luna', '3000000011', '1000000001', '', '', '', ''],
    ]);
    const t = [...agrupar(estado, filas).tutores.values()][0];
    expect(t.tel2).toBe(null);
  });

  // Con los dos cupos llenos, un tercer número distinto sí se queda afuera:
  // `duenos` tiene dos columnas de teléfono y no una lista. Pero se dice en
  // voz alta, porque es un dato de contacto de un cliente real que la clínica
  // puede querer poner a mano.
  it('un tercer número distinto se avisa en vez de desaparecer', () => {
    const { estado, filas } = leer([
      ['Ana Gómez', 'Max',  '3000000011', '1000000001', '', '', '', ''],
      ['Ana Gómez', 'Luna', '3100000022', '1000000001', '', '', '', ''],
      ['Ana Gómez', 'Nube', '3200000033', '1000000001', '', '', '', ''],
    ]);
    const t = [...agrupar(estado, filas).tutores.values()][0];
    expect(t.tel1).toBe('573000000011');
    expect(t.tel2).toBe('573100000022');
    expect(estado.avisos.some((a) => a.texto.includes('573200000033'))).toBe(true);
  });

  it('la dirección más larga gana porque dice más del mismo lugar', () => {
    const grilla = [
      ['Ana', 'Max', '3000000011', '1000000001', '', '', '', ''],
      ['Ana', 'Max', '3000000011', '1000000001', '', '', '', ''],
    ];
    const estado = nuevoEstado();
    const filas = leerFilas(estado, { grilla, mapa: { ...MAPA, direccion: 8 }, hoja: 'Hoja1' });
    filas[0].direccion = 'Calle 10 #20-30';
    filas[1].direccion = 'Calle 10 #20-30 Barrio Prueba';
    expect(agrupar(estado, filas).tutores.values().next().value.direccion)
      .toBe('Calle 10 #20-30 Barrio Prueba');
  });

  // "Noah" y "Noah Emiliano" son dos perros. Decisión del dueño.
  it('no junta dos mascotas con nombres parecidos del mismo tutor', () => {
    const { estado, filas } = leer([
      ['Ángela', 'Noah',          '3000000011', '', '', '', '', ''],
      ['Ángela', 'Noah Emiliano', '3000000011', '', '', '', '', ''],
    ]);
    expect(agrupar(estado, filas).mascotas.size).toBe(2);
  });

  it('cada fila con fecha de servicio es un baño distinto', () => {
    const { estado, filas } = leer([
      ['Ana', 'Max', '3000000011', '', '', '', '12/09/2026', ''],
      ['Ana', 'Max', '3000000011', '', '', '', '19/09/2026', ''],
    ]);
    const banos = agrupar(estado, filas).eventos.filter((e) => e.t === 'bano');
    expect(banos).toHaveLength(2);
  });

  it('la vacuna queda con la próxima dosis un año después', () => {
    const { estado, filas } = leer([['Ana', 'Max', '3000000011', '', '', '', '', '14/07/2026']]);
    const v = agrupar(estado, filas).eventos.find((e) => e.tipo === 'vacuna');
    expect(v).toMatchObject({ nombre: 'Anual', fecha: '2026-07-14', proxima: '2027-07-14', notas: null });
  });

  // Un 29 de febrero sumándole 1 al año da un día que no existe. Es la única
  // fecha del calendario que lo hace, y el archivo piloto es de una clínica
  // que lleva años: tener una vacuna puesta un 29 de febrero es cuestión de
  // tiempo, no un caso inventado.
  //
  // Lo que se exige acá es que la fecha exista. Qué pasa después con una que
  // no existe depende del motor —V8 rueda '2025-02-29T12:00:00' a Mar 1, y la
  // especificación dice que el parseo ISO falle, así que otro motor puede dar
  // Invalid Date y dejar el badge de Historias.jsx:186-196 en "Invalid Date"
  // sin avisar nunca de la vacuna—, y esa incertidumbre es justo la razón de
  // no escribirla. La columna es `text` (001_init.sql:55), así que Postgres
  // no la ataja.
  it('un 29 de febrero no produce una próxima dosis que no existe', () => {
    const { estado, filas } = leer([['Ana', 'Max', '3000000011', '', '', '', '', '29/02/2024']]);
    const v = agrupar(estado, filas).eventos.find((e) => e.tipo === 'vacuna');
    expect(v.fecha).toBe('2024-02-29');
    expect(v.proxima).toBe('2025-03-01');
  });

  // Los años no bisiestos no se tocan: el 28 de febrero sigue cayendo en 28.
  it('el 28 de febrero sigue dando el 28 del año siguiente', () => {
    const { estado, filas } = leer([['Ana', 'Max', '3000000011', '', '', '', '', '28/02/2026']]);
    const v = agrupar(estado, filas).eventos.find((e) => e.tipo === 'vacuna');
    expect(v.proxima).toBe('2027-02-28');
  });
});
