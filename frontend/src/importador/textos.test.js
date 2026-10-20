import { describe, it, expect } from 'vitest';
import { textoResultado, textoOmitidos, textoConservadas, textoDeshecho, textoVaAEscribir, textoRestaurados, n } from './textos.js';

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

  // Las dos cadenas más largas del módulo, y las únicas que ningún test
  // miraba: un typo acá salía a producción callado.
  it('cuenta los que ya estaban y a los que les completó datos', () => {
    const lineas = textoResultado({
      tutores_creados: 0, tutores_completados: 4,
      mascotas_creadas: 0, mascotas_completadas: 7,
      tratamientos: 0, vacunas: 0, repetidos: 0, omitidos: [],
    });
    expect(lineas).toEqual([
      '4 tutores a los que les completé datos',
      '7 mascotas a las que les completé datos',
    ]);
  });

  it('el singular de los completados tampoco dice "1 tutores"', () => {
    const lineas = textoResultado({
      tutores_creados: 0, tutores_completados: 1,
      mascotas_creadas: 0, mascotas_completadas: 1,
      tratamientos: 0, vacunas: 0, repetidos: 0, omitidos: [],
    });
    expect(lineas).toEqual([
      '1 tutor al que le completé datos',
      '1 mascota a la que le completé datos',
    ]);
  });
});

describe('textoOmitidos', () => {
  // La cédula repetida es el único dato que la función deja afuera a
  // propósito. Si no se dice, la clínica cree que entró y busca por esa
  // cédula para siempre sin encontrar a nadie.
  // Los valores son inventados, y tienen que seguir siéndolo. Ver el commit
  // 888a8ce: los datos reales de clientes del piloto ya se filtraron a los
  // tests de este módulo tres veces, y esta cédula fue la cuarta.
  it('dice de quién no pudo guardar la cédula y por qué', () => {
    const lineas = textoOmitidos([
      { que: 'cedula_repetida', quien: 'Ana Gómez', valor: '1000000001' },
    ]);
    expect(lineas[0]).toContain('Ana Gómez');
    expect(lineas[0]).toContain('1000000001');
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

  it('un caso que no conoce pero con valor lo muestra entre paréntesis', () => {
    const lineas = textoOmitidos([
      { que: 'algo_nuevo', quien: 'Ana Gómez', valor: 'x' },
    ]);
    expect(lineas[0]).toBe('Ana Gómez: algo_nuevo (x)');
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
  });

  // La lista se lee detrás de un "Borré", y restaurar un dato es lo
  // contrario de borrarlo. Un import que solo completó campos imprimía
  // "Borré 2 datos que devolví a como estaban", con eso como único elemento.
  it('no mete los datos restaurados en la lista de lo borrado', () => {
    expect(textoDeshecho({
      tutores_borrados: 0, mascotas_borradas: 0,
      tratamientos: 0, vacunas: 0, campos_restaurados: 2,
    })).toEqual([]);
  });
});

describe('textoRestaurados', () => {
  it('dice cuántos datos devolvió', () => {
    expect(textoRestaurados({ campos_restaurados: 3 })).toBe('Devolví 3 datos a como estaban.');
  });

  it('el singular concuerda en las dos palabras', () => {
    expect(textoRestaurados({ campos_restaurados: 1 })).toBe('Devolví 1 dato a como estaba.');
  });

  // Los tres casos en que el número no se sabe: cero de verdad, un objeto
  // sin la llave (una fila deshecha antes de que 014 la guardara) y un
  // `deshecho` que no existe porque la fila nunca se deshizo. No saber el
  // número es motivo para callarse, no para escribir "undefined".
  it('sin el contador no dice nada', () => {
    expect(textoRestaurados({ campos_restaurados: 0 })).toBe('');
    expect(textoRestaurados({})).toBe('');
    expect(textoRestaurados(null)).toBe('');
  });

  // El caso del reload, con el objeto tal cual queda en `resumen.deshecho`
  // (014:171-175) — sin `estado`, que vive en su propia columna. Es el que
  // falla si alguien vuelve a sacar `campos_restaurados` del jsonb que se
  // guarda: la pantalla de historial pasaría a decir "de este archivo no
  // quedaba nada en la base" de una importación cuyos datos sí se revirtieron.
  it('lee el contador del objeto guardado, no solo del que devuelve la llamada', () => {
    const guardado = {
      mascotas_borradas: 0, tutores_borrados: 0,
      tratamientos: 0, vacunas: 0,
      campos_restaurados: 2, conservadas: [],
    };
    expect(textoRestaurados(guardado)).toBe('Devolví 2 datos a como estaban.');
  });
});

describe('textoVaAEscribir', () => {
  it('dice lo que va a escribir', () => {
    const lineas = textoVaAEscribir({
      tutores_nuevos: 53, mascotas_nuevas: 54,
      tutores_a_completar: 0, mascotas_a_completar: 0,
      tratamientos: 74, vacunas: 13,
    });
    expect(lineas).toContain('53 tutores');
    expect(lineas).toContain('54 mascotas');
    expect(lineas).toContain('74 baños y desparasitaciones');
    expect(lineas).toContain('13 vacunas');
  });

  // El caso del segundo archivo de la misma clínica: los mismos clientes
  // con baños nuevos. Decir "escribiendo 0 tutores y 0 mascotas" mientras
  // escribe 74 baños es falso, y paso3Revisar SÍ deja confirmar acá.
  it('un archivo que solo trae eventos no dice "0 tutores y 0 mascotas"', () => {
    const lineas = textoVaAEscribir({
      tutores_nuevos: 0, mascotas_nuevas: 0,
      tutores_a_completar: 0, mascotas_a_completar: 0,
      tratamientos: 74, vacunas: 0,
    });
    expect(lineas).toEqual(['74 baños y desparasitaciones']);
  });

  it('el singular no dice "1 tutores"', () => {
    const lineas = textoVaAEscribir({
      tutores_nuevos: 1, mascotas_nuevas: 1,
      tutores_a_completar: 1, mascotas_a_completar: 1,
      tratamientos: 1, vacunas: 1,
    });
    expect(lineas).toContain('1 tutor');
    expect(lineas).toContain('1 mascota');
    // "tutor al que le completo datos" y no "dato de tutor": el contador
    // cuenta tutores, no campos (plan.js:504-506 usa el largo de
    // `completar_tutores`, una entrada por id del existente). Dos tutores con
    // tres campos en blanco cada uno son seis datos, y la pantalla decía dos.
    expect(lineas).toContain('1 tutor al que le completo datos');
    expect(lineas).toContain('1 mascota a la que le completo datos');
    expect(lineas).toContain('1 baño o desparasitación');
    expect(lineas).toContain('1 vacuna');
  });
});

// `n` se exporta solo porque el paso 3 la necesita, y se testea acá porque
// ese es el defecto que ningún test agarraba: paso3Revisar.jsx pegaba el
// plural a mano —`${r.tutores_nuevos} tutores`— y un archivo de una sola fila
// decía "1 tutores · 1 mascotas" en la pantalla que la clínica lee ANTES de
// confirmar. Los números del piloto (53 y 54) no lo podían agarrar.
describe('n', () => {
  it('uno va en singular y el resto en plural', () => {
    expect(n(1, 'tutor', 'tutores')).toBe('1 tutor');
    expect(n(2, 'tutor', 'tutores')).toBe('2 tutores');
  });

  // El cero no es singular. Sale en el paso 3, en la fila "Ya existen", que
  // se muestra si CUALQUIERA de los dos contadores es > 0: un archivo que
  // solo le completa datos a mascotas pasa 0 en el de tutores.
  it('el cero va en plural', () => {
    expect(n(0, 'mascota', 'mascotas')).toBe('0 mascotas');
  });
});
