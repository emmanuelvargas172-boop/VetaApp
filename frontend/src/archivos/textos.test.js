import { describe, it, expect } from 'vitest';
import {
  ETIQUETA_TIPO, TIPOS, textoArchivo, fechaLegible, fmtBytes,
  preguntaBorrado, agruparPorTipo,
} from './textos.js';

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

describe('agruparPorTipo', () => {
  const a = (id, tipo) => ({ id, tipo, nombre: `${id}.pdf` });

  it('devuelve los grupos en el orden de TIPOS, no en el de llegada', () => {
    // Llegan al revés del orden del dropdown a propósito.
    const g = agruparPorTipo([a(1, 'otro'), a(2, 'chequeo'), a(3, 'cirugia')]);
    expect(g.map((x) => x.valor)).toEqual(['chequeo', 'cirugia', 'otro']);
  });

  it('junta en un solo grupo todos los del mismo tipo', () => {
    const g = agruparPorTipo([a(1, 'chequeo'), a(2, 'examenes'), a(3, 'chequeo')]);
    expect(g).toHaveLength(2);
    expect(g[0].archivos.map((x) => x.id)).toEqual([1, 3]);
  });

  it('no pinta grupos vacíos', () => {
    const g = agruparPorTipo([a(1, 'cirugia')]);
    expect(g).toHaveLength(1);
    expect(g[0].valor).toBe('cirugia');
  });

  it('pone la etiqueta en palabras de cada grupo', () => {
    const g = agruparPorTipo([a(1, 'historia_anterior')]);
    expect(g[0].etiqueta).toBe('Historia de otra clínica');
  });

  // Dentro del grupo se respeta el orden en que vino la lista: el padre la
  // trae ordenada por created_at desc desde la ruta GET /archivos/mascota.
  // Reordenar acá rompería ese orden sin que nadie lo pidiera.
  it('no reordena los archivos dentro de un grupo', () => {
    const g = agruparPorTipo([a(9, 'chequeo'), a(4, 'chequeo'), a(7, 'chequeo')]);
    expect(g[0].archivos.map((x) => x.id)).toEqual([9, 4, 7]);
  });

  // Mismo criterio que textoArchivo: un tipo que esta versión no conoce se
  // muestra crudo y va al final. Esconderlo sería esconder justo el caso
  // nuevo, y el archivo desaparecería de la pantalla sin dejar de existir.
  it('manda al final, con la llave cruda, un tipo que no conoce', () => {
    const g = agruparPorTipo([a(1, 'radiografia'), a(2, 'chequeo')]);
    expect(g.map((x) => x.valor)).toEqual(['chequeo', 'radiografia']);
    expect(g[1].etiqueta).toBe('radiografia');
  });

  // Una fila sin tipo no puede desaparecer de la pantalla. El check de 015
  // lo impide por la app, pero una fila puede haber entrado por el SQL
  // Editor.
  it('no pierde un archivo sin tipo', () => {
    const g = agruparPorTipo([{ id: 1, nombre: 'x.pdf' }]);
    expect(g.flatMap((x) => x.archivos)).toHaveLength(1);
  });

  it('con lista vacía devuelve lista vacía', () => {
    expect(agruparPorTipo([])).toEqual([]);
    expect(agruparPorTipo(null)).toEqual([]);
  });

  // Lo que se pinta tiene que ser exactamente lo que llegó: ni uno de menos
  // (un PDF que el cliente no ve es un PDF que cree perdido) ni uno de más.
  it('no pierde ni duplica ningún archivo', () => {
    const lista = [a(1, 'chequeo'), a(2, 'otro'), a(3, 'chequeo'), a(4, 'raro'), a(5, 'cirugia')];
    const ids = agruparPorTipo(lista).flatMap((g) => g.archivos.map((x) => x.id));
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
