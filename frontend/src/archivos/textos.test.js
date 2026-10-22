import { describe, it, expect } from 'vitest';
import { ETIQUETA_TIPO, TIPOS, textoArchivo, fechaLegible, fmtBytes, preguntaBorrado } from './textos.js';

// Las seis llaves del `check (tipo in (...))` de 015_archivos_mascota.sql,
// copiadas a mano. Si alguien agrega un tipo a la migración y no acá, esta
// lista queda corta y las dos pruebas de abajo lo avisan — que es
// exactamente lo que tienen que hacer.
const LLAVES_DE_LA_MIGRACION = [
  'chequeo', 'examenes', 'imagenes', 'cirugia', 'historia_anterior', 'otro',
];

describe('ETIQUETA_TIPO', () => {
  it('tiene etiqueta para cada una de las seis llaves de la migración', () => {
    for (const k of LLAVES_DE_LA_MIGRACION) {
      expect(ETIQUETA_TIPO[k], `falta la etiqueta de ${k}`).toBeTruthy();
    }
  });

  // Al revés también: una etiqueta de un tipo que la base rechaza es un
  // ítem del dropdown que falla al guardar.
  it('no tiene etiquetas de más', () => {
    expect(Object.keys(ETIQUETA_TIPO).sort()).toEqual([...LLAVES_DE_LA_MIGRACION].sort());
  });

  it('TIPOS trae los seis, en orden, para el dropdown', () => {
    expect(TIPOS.map((t) => t.valor)).toEqual(LLAVES_DE_LA_MIGRACION);
    expect(TIPOS.every((t) => t.etiqueta === ETIQUETA_TIPO[t.valor])).toBe(true);
  });
});

describe('fechaLegible', () => {
  it('escribe el día sin cero adelante y el mes en palabra', () => {
    expect(fechaLegible('2023-04-18')).toBe('18 abr 2023');
    expect(fechaLegible('2023-04-01')).toBe('1 abr 2023');
  });

  // El 1 de un mes en zona -05:00 es el caso que `toLocaleDateString`
  // corre un día para atrás. Esta función no construye un Date, así que no
  // puede pasarle.
  it('no corre el día en enero', () => {
    expect(fechaLegible('2024-01-01')).toBe('1 ene 2024');
    expect(fechaLegible('2024-12-31')).toBe('31 dic 2024');
  });

  it('devuelve vacío sin reventar cuando no hay fecha', () => {
    expect(fechaLegible(null)).toBe('');
    expect(fechaLegible('')).toBe('');
  });

  it('devuelve el texto crudo si no es ISO', () => {
    expect(fechaLegible('18/04/2023')).toBe('18/04/2023');
  });
});

describe('fmtBytes', () => {
  it('escribe KB, MB y GB según el tamaño', () => {
    expect(fmtBytes(0)).toBe('0 KB');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(1048576)).toBe('1,0 MB');
    expect(fmtBytes(2516582)).toBe('2,4 MB');
    // El plan gratis de Supabase es 1 GB: la columna del Admin llega acá.
    expect(fmtBytes(1073741824)).toBe('1,00 GB');
  });

  it('no dice "undefined KB" cuando no hay dato', () => {
    expect(fmtBytes(null)).toBe('0 KB');
    expect(fmtBytes(undefined)).toBe('0 KB');
  });
});

describe('textoArchivo', () => {
  it('junta tipo, fecha y descripción con separador', () => {
    const t = textoArchivo({
      tipo: 'examenes', fecha_documento: '2023-04-18', descripcion: 'Hemograma',
    });
    expect(t).toBe('Exámenes de laboratorio · 18 abr 2023 · Hemograma');
  });

  it('con fecha y sin descripción no deja el separador colgando', () => {
    const t = textoArchivo({ tipo: 'cirugia', fecha_documento: '2023-04-18', descripcion: null });
    expect(t).toBe('Cirugía · 18 abr 2023');
  });

  // La subida más rápida posible: archivo, tipo, y listo.
  it('sin fecha y sin descripción deja solo el tipo', () => {
    expect(textoArchivo({ tipo: 'otro' })).toBe('Otro');
  });

  it('con descripción y sin fecha salta la fecha', () => {
    expect(textoArchivo({ tipo: 'chequeo', descripcion: 'Control anual' }))
      .toBe('Chequeo general · Control anual');
  });

  // Mismo criterio que textoOmitidos del importador: un tipo que esta
  // versión de la pantalla no conoce se muestra crudo. Esconderlo sería
  // esconder justo el caso nuevo.
  it('muestra crudo un tipo que no conoce', () => {
    expect(textoArchivo({ tipo: 'radiografia' })).toBe('radiografia');
  });

  it('con argumento null devuelve vacío', () => {
    expect(textoArchivo(null)).toBe('');
  });
});

describe('preguntaBorrado', () => {
  // El nombre del archivo tiene que estar en la pregunta: la lista puede
  // tener diez PDF con nombres parecidos y el modal es lo único que dice
  // cuál de ellos va a desaparecer.
  it('nombra el archivo y avisa que no se deshace', () => {
    const p = preguntaBorrado({ nombre: 'hemograma.pdf' });
    expect(p.titulo).toBe('¿Borrar este archivo?');
    expect(p.mensaje).toContain('hemograma.pdf');
    expect(p.mensaje).toContain('no se puede deshacer');
  });

  // El tipo entra cuando se conoce: un "Exámenes de laboratorio" de más en
  // la pregunta es la diferencia entre borrar el correcto y borrar el de
  // al lado cuando los dos se llaman `escaneo.pdf`.
  it('agrega el tipo en palabras cuando lo conoce', () => {
    expect(preguntaBorrado({ nombre: 'a.pdf', tipo: 'cirugia' }).mensaje)
      .toContain('Cirugía');
  });

  it('con un tipo que no conoce no inventa etiqueta', () => {
    const m = preguntaBorrado({ nombre: 'a.pdf', tipo: 'radiografia' }).mensaje;
    expect(m).toContain('radiografia');
    expect(m).toContain('a.pdf');
  });

  // Una fila sin nombre no puede dejar la pregunta en «¿Borrar ""?»: eso
  // se lee como un error de la app y nadie sabe qué está aceptando.
  it('sin nombre dice "este archivo" en vez de comillas vacías', () => {
    const m = preguntaBorrado({ nombre: null }).mensaje;
    expect(m).not.toContain('""');
    expect(m).toContain('este archivo');
  });

  it('con argumento null no revienta', () => {
    expect(preguntaBorrado(null).mensaje).toContain('este archivo');
  });
});
