import { describe, it, expect } from 'vitest';
import { textoResultado, textoOmitidos, textoConservadas, textoDeshecho } from './textos.js';

describe('textoResultado', () => {
  it('cuenta lo que devolvió Postgres', () => {
    const lineas = textoResultado({
      tutores_creados: 53, tutores_completados: 0,
      mascotas_creadas: 54, mascotas_completadas: 0,
      tratamientos: 74, vacunas: 13, repetidos: 0, omitidos: [],
    });
    expect(lineas).toContain('53 tutores nuevos');
    expect(lineas).toContain('54 mascotas nuevas');
    expect(lineas).toContain('74 baños y desparasitaciones');
    expect(lineas).toContain('13 vacunas');
  });

  // Un cero no se escribe. "0 vacunas" en la pantalla de "quedó listo"
  // se lee como un error, y no lo es: esa hoja no traía vacunas.
  it('no escribe las líneas en cero', () => {
    const lineas = textoResultado({
      tutores_creados: 2, tutores_completados: 0,
      mascotas_creadas: 0, mascotas_completadas: 0,
      tratamientos: 0, vacunas: 0, repetidos: 0, omitidos: [],
    });
    expect(lineas).toEqual(['2 tutores nuevos']);
  });

  it('dice los repetidos, que son los que NO escribió', () => {
    const lineas = textoResultado({
      tutores_creados: 0, tutores_completados: 0,
      mascotas_creadas: 0, mascotas_completadas: 0,
      tratamientos: 0, vacunas: 0, repetidos: 74, omitidos: [],
    });
    expect(lineas).toContain('74 ya estaban cargados, esos no los repetí');
  });

  it('el singular no dice "1 tutores"', () => {
    const lineas = textoResultado({
      tutores_creados: 1, tutores_completados: 0,
      mascotas_creadas: 1, mascotas_completadas: 0,
      tratamientos: 1, vacunas: 1, repetidos: 1, omitidos: [],
    });
    expect(lineas).toContain('1 tutor nuevo');
    expect(lineas).toContain('1 mascota nueva');
    expect(lineas).toContain('1 vacuna');
    // Defecto B del addendum: el brief pasaba el número crudo para
    // tratamientos y repetidos, así que el singular salía mal.
    expect(lineas).toContain('1 baño o desparasitación');
    expect(lineas).toContain('1 ya estaba cargado, ese no lo repetí');
  });
});

describe('textoOmitidos', () => {
  // La cédula repetida es el único dato que la función deja afuera a
  // propósito. Si no se dice, la clínica cree que entró y busca por esa
  // cédula para siempre sin encontrar a nadie.
  it('dice de quién no pudo guardar la cédula y por qué', () => {
    const lineas = textoOmitidos([
      { que: 'cedula_repetida', quien: 'Ana Gómez', valor: '1000000200' },
    ]);
    expect(lineas[0]).toContain('Ana Gómez');
    expect(lineas[0]).toContain('1000000200');
    expect(lineas[0]).toContain('ya la tenía otro cliente');
  });

  it('sin omitidos no dice nada', () => {
    expect(textoOmitidos([])).toEqual([]);
    expect(textoOmitidos(undefined)).toEqual([]);
  });

  // 013 manda tres `que` más que este archivo no conoce, y en ellos `valor`
  // viene null. Imprimirlo daría "41: tutor_no_encontrado (null)".
  it('un caso que no conoce se muestra crudo, sin un "(null)" pegado', () => {
    const lineas = textoOmitidos([
      { que: 'tutor_no_encontrado', quien: '41', valor: null },
    ]);
    expect(lineas[0]).toBe('41: tutor_no_encontrado');
  });
});

describe('textoConservadas', () => {
  // La frase más difícil de la app. Tiene que decir tres cosas: qué no
  // borró, por qué, y que eso es lo correcto.
  it('dice la mascota, cuántas cosas tiene y qué son', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Killer', historias: 6, citas: 2, vacunas: 0, tratamientos: 0, cobros: 0 },
    ]);
    expect(lineas[0]).toBe('Killer: después del import le escribieron 6 consultas y 2 citas');
  });

  it('nombra cada cosa en singular cuando hay una sola', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Luna', historias: 1, citas: 0, vacunas: 1, tratamientos: 0, cobros: 0 },
    ]);
    expect(lineas[0]).toBe('Luna: después del import le escribieron 1 consulta y 1 vacuna');
  });

  it('una sola cosa no lleva "y"', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Max', historias: 0, citas: 3, vacunas: 0, tratamientos: 0, cobros: 0 },
    ]);
    expect(lineas[0]).toBe('Max: después del import le escribieron 3 citas');
  });

  it('tres cosas van con comas y una "y" al final', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Toby', historias: 2, citas: 1, vacunas: 0, tratamientos: 4, cobros: 0 },
    ]);
    expect(lineas[0]).toBe('Toby: después del import le escribieron 2 consultas, 1 cita y 4 baños');
  });

  // 014:87-89 cuenta cobros para decidir si la conserva, y 014:97-100 lo
  // devuelve. Una mascota que se quedó SOLO por un cobro tiene que salir
  // nombrada, no como "undefined".
  it('cuenta los cobros, que son el quinto contador de 014', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Nube', historias: 0, citas: 0, vacunas: 0, tratamientos: 0, cobros: 1 },
    ]);
    expect(lineas[0]).toBe('Nube: después del import le escribieron 1 cobro');
  });

  // El día que 014 mire un sexto contador, la mascota igual aparece.
  it('una mascota conservada por algo que no sabe nombrar igual aparece', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Rocky', historias: 0, citas: 0, vacunas: 0, tratamientos: 0, cobros: 0 },
    ]);
    expect(lineas[0]).toBe('Rocky: no la borré, tiene algo escrito después del import');
  });

  it('sin conservadas no dice nada', () => {
    expect(textoConservadas([])).toEqual([]);
    expect(textoConservadas(undefined)).toEqual([]);
  });
});

describe('textoDeshecho', () => {
  it('cuenta lo que borró', () => {
    const lineas = textoDeshecho({
      tutores_borrados: 53, mascotas_borradas: 54,
      tratamientos: 74, vacunas: 13, campos_restaurados: 0,
    });
    expect(lineas).toContain('53 tutores');
    expect(lineas).toContain('54 mascotas');
    expect(lineas).toContain('74 baños y desparasitaciones');
    expect(lineas).toContain('13 vacunas');
  });

  // El caso que más confunde: el deshacer funcionó y no borró nada porque
  // todo tenía trabajo clínico encima. "Borré 0 tutores, 0 mascotas" se lee
  // como que falló.
  it('un deshacer que no borró nada no escribe una lista de ceros', () => {
    expect(textoDeshecho({
      tutores_borrados: 0, mascotas_borradas: 0,
      tratamientos: 0, vacunas: 0, campos_restaurados: 0,
    })).toEqual([]);
  });

  it('el singular no dice "1 mascotas"', () => {
    const lineas = textoDeshecho({
      tutores_borrados: 1, mascotas_borradas: 1,
      tratamientos: 1, vacunas: 1, campos_restaurados: 1,
    });
    expect(lineas).toContain('1 tutor');
    expect(lineas).toContain('1 mascota');
    expect(lineas).toContain('1 baño o desparasitación');
    expect(lineas).toContain('1 vacuna');
    expect(lineas).toContain('1 dato que devolví a como estaba');
  });
});
