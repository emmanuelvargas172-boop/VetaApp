import { describe, it, expect } from 'vitest';
import { nuevoEstado } from './normalizar.js';
import { nombresSeParecen, indexar, emparejarTutor, armarPlan } from './plan.js';

const HOY = new Date(2026, 9, 15); // 15/10/2026, fijo para que la edad no cambie

// Un tutor y una mascota del archivo, con lo mínimo. `clave` es lo que
// devuelve agrupar(): la mascota señala a su tutor por esa clave.
const delArchivo = (over = {}) => ({
  tutores: new Map([['t1', {
    clave: 't1', nombre: 'Ana Gómez', cedula: null, direccion: null,
    tel1: '573000000011', tel2: null, origen: ['Hoja1:2'], ...over.tutor,
  }]]),
  mascotas: new Map([['m1', {
    clave: 'm1', tutor: 't1', nombre: 'Max', especie: 'perro',
    raza: 'Poodle', nacimiento: '2018-07-26', origen: ['Hoja1:2'], ...over.mascota,
  }]]),
  eventos: over.eventos ?? [],
});

const vacia = { duenos: [], mascotas: [], tratamientos: [], vacunas: [] };
const sinDecidir = { dudas: {}, especies: {} };

describe('nombresSeParecen', () => {
  it('"Eulalia Ruth Trujillo" y "Ana Araque" son parecidos', () => {
    expect(nombresSeParecen('Eulalia Ruth Trujillo', 'Ana Araque')).toBe(true);
  });

  it('las tildes y las mayúsculas no cuentan', () => {
    expect(nombresSeParecen('Teofilo Quintanilla', 'Anselmo Zambrano')).toBe(true);
  });

  it('"Ana Araque" y "Pedro Gómez" no se parecen en nada', () => {
    expect(nombresSeParecen('Ana Araque', 'Pedro Gómez')).toBe(false);
  });

  // "de", "la", "y" están en medio mundo. Si contaran, cualquier par de
  // nombres se parecería y la duda de la cédula mal tecleada nunca saltaría.
  it('las palabras de dos letras o menos no alcanzan', () => {
    expect(nombresSeParecen('Maria de la Cruz', 'Pedro de la Torre')).toBe(false);
  });

  // El apellido de familia es compartido por definición. Con una sola
  // coincidencia y dos palabras a cada lado, "Pedro Gomez" y "Ana Gomez"
  // parecerían la misma persona y se unirían sin preguntar.
  it('"Pedro Gomez" y "Ana Gomez" no se parecen: apellido solo no alcanza', () => {
    expect(nombresSeParecen('Pedro Gomez', 'Ana Gomez')).toBe(false);
  });
});

describe('emparejarTutor', () => {
  it('misma cédula, nombre parecido: es la misma persona', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 7, nombre: 'Eulalia Ruth Trujillo', telefono: '573000000022', cedula: '1000000001' }] });
    const r = emparejarTutor(idx, { nombre: 'Ana Araque', cedula: '1000000001', tel1: '573000000000' });
    expect(r).toMatchObject({ certeza: 'misma', existente: { id: 7 } });
  });

  // No es un parecido, es un error: o la cédula está mal tecleada o es de
  // otra persona. Unirlos metería el historial de un animal en la ficha de
  // alguien que no es su dueño.
  it('misma cédula, nombre completamente distinto: pregunta', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 7, nombre: 'Eulalia Ruth Trujillo', telefono: '573000000022', cedula: '1000000001' }] });
    const r = emparejarTutor(idx, { nombre: 'Pedro Castaño', cedula: '1000000001', tel1: null });
    expect(r).toMatchObject({ certeza: 'duda', motivo: 'cedula_otro_nombre' });
  });

  it('mismo nombre y mismo teléfono, sin cédulas: es la misma', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Ana Gómez', telefono: '573000000011', cedula: null }] });
    const r = emparejarTutor(idx, { nombre: 'ana gomez', cedula: null, tel1: '573000000011' });
    expect(r).toMatchObject({ certeza: 'misma', existente: { id: 9 } });
  });

  // El caso real de la base de La Huella: dos "Teofilo Arboleda" que son dos
  // personas distintas (Araque y Casimiro Carvajalino).
  it('mismo nombre con teléfono distinto: pregunta', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Teofilo Arboleda', telefono: '573000000022', cedula: null }] });
    const r = emparejarTutor(idx, { nombre: 'Teofilo Arboleda', cedula: null, tel1: '573000000033' });
    expect(r).toMatchObject({ certeza: 'duda', motivo: 'nombre_tel_distinto' });
  });

  // La misma cédula con dos personas de distinto nombre de la misma familia
  // (padre e hija, hermanos): el apellido compartido no alcanza para unirlos.
  // Con dos palabras a cada lado se exigen dos coincidencias; el apellido
  // solo es una. Resultado: pregunta, no unión silenciosa.
  it('misma cédula, apellido compartido pero primer nombre distinto: pregunta', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 7, nombre: 'Ana Gomez', telefono: '573000000011', cedula: '1000000001' }] });
    const r = emparejarTutor(idx, { nombre: 'Pedro Gomez', cedula: '1000000001', tel1: null });
    expect(r).toMatchObject({ certeza: 'duda', motivo: 'cedula_otro_nombre' });
  });

  it('nadie parecido: es alguien nuevo', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Otra Persona', telefono: '573100000000', cedula: null }] });
    expect(emparejarTutor(idx, { nombre: 'Ana Gómez', cedula: null, tel1: '573000000011' }))
      .toMatchObject({ certeza: 'nueva', existente: null });
  });

  it('una cuenta vacía: todos son nuevos', () => {
    expect(emparejarTutor(indexar(vacia), { nombre: 'Ana', cedula: '1', tel1: '2' }))
      .toMatchObject({ certeza: 'nueva' });
  });
});

describe('armarPlan · una cuenta vacía', () => {
  it('crea el tutor y la mascota con la edad calculada', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), vacia, sinDecidir, HOY);

    expect(p.envio.crear_tutores).toEqual([{
      ref: 't1', nombre: 'Ana Gómez', telefono: '573000000011',
      telefono2: null, cedula: null, direccion: null,
    }]);
    expect(p.envio.crear_mascotas).toEqual([{
      ref: 'm1', tutor_ref: 't1', tutor_id: null, nombre: 'Max',
      especie: 'perro', raza: 'Poodle', fecha_nacimiento: '2018-07-26',
      edad_anios: 8, edad_meses: 2,
    }]);
    expect(p.resumen).toMatchObject({ tutores_nuevos: 1, mascotas_nuevas: 1, dudas: 0 });
  });

  // duenos.telefono es NOT NULL. La base real tiene una fila sin ningún
  // número usable, y esa persona entra igual: con el botón de WhatsApp
  // apagado, no afuera de la base.
  it('un tutor sin teléfono entra con cadena vacía, nunca con null', () => {
    const a = delArchivo({ tutor: { tel1: null, tel2: null } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_tutores[0].telefono).toBe('');
  });

  // Sin fecha de nacimiento la edad NO se inventa: queda 0, que es lo que
  // ya hace la app para las mascotas viejas, y se corrige a mano.
  it('sin fecha de nacimiento la edad queda en 0', () => {
    const a = delArchivo({ mascota: { nacimiento: null } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_mascotas[0]).toMatchObject({
      fecha_nacimiento: null, edad_anios: 0, edad_meses: 0,
    });
  });
});

describe('armarPlan · la especie que no se reconoció', () => {
  // mascotas.especie es NOT NULL. El script de terminal se detiene y
  // obliga a decidir; en el navegador eso no sirve, pasa a ser una
  // pregunta del paso 3.
  it('pregunta por la raza desconocida y no manda la mascota', () => {
    const a = delArchivo({ mascota: { especie: null, raza: 'Criollo' } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);

    expect(p.especies).toEqual([{ clave: 'criollo', raza: 'Criollo', cuantas: 1, mascotas: ['Max'] }]);
    expect(p.envio.crear_mascotas).toHaveLength(0);
    // El tutor sí: no tiene nada que ver con la raza de su perro.
    expect(p.envio.crear_tutores).toHaveLength(1);
  });

  it('con la especie resuelta, la mascota entra y la raza se guarda tal cual', () => {
    const a = delArchivo({ mascota: { especie: null, raza: 'Criollo' } });
    const p = armarPlan(nuevoEstado(), a, vacia, { dudas: {}, especies: { criollo: 'gato' } }, HOY);

    expect(p.especies).toHaveLength(0);
    expect(p.envio.crear_mascotas[0]).toMatchObject({ especie: 'gato', raza: 'Criollo' });
  });
});

describe('armarPlan · completar sin pisar', () => {
  const yaExiste = {
    ...vacia,
    duenos: [{ id: 7, nombre: 'Ana Gómez', telefono: '573999999999',
               telefono2: null, cedula: null, direccion: 'La que ya tenía' }],
    mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: null,
                 fecha_nacimiento: null, edad_anios: 0, edad_meses: 0 }],
  };

  it('completa la cédula vacía y deja la dirección que ya estaba', () => {
    const a = delArchivo({
      tutor: { cedula: '1000000001', direccion: 'LA DEL ARCHIVO', tel1: '573999999999' },
    });
    const p = armarPlan(nuevoEstado(), a, yaExiste, sinDecidir, HOY);

    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.completar_tutores).toEqual([
      { id: 7, campos: { cedula: '1000000001' } },
    ]);
  });

  // duenos.telefono es NOT NULL: nunca está vacío, así que completarlo es
  // imposible por definición. Si el archivo trae otro número no lo cambia
  // — y lo dice, porque callarlo dejaría a la clínica creyendo que el
  // número nuevo entró.
  //
  // NOTA: el fixture usa cédula para asegurar el match; si usáramos solo
  // nombre con tel distinto emparejarTutor devuelve 'duda' y completarTutor
  // nunca corre. La cédula es el único camino para matchear con tel distinto
  // y llegar al código que avisa. Desvío del brief documentado en task-9-report.
  it('no cambia el teléfono y lo avisa', () => {
    const e = nuevoEstado();
    // Matched vía cédula: mismo nombre, misma cédula, pero teléfono distinto.
    const conCedula = { ...vacia, duenos: [
      { id: 7, nombre: 'Ana Gómez', telefono: '573999999999',
        telefono2: null, cedula: '1000000001', direccion: null }] };
    const a = delArchivo({ tutor: { cedula: '1000000001', tel1: '573000000011' } });
    const p = armarPlan(e, a, conCedula, sinDecidir, HOY);

    expect(JSON.stringify(p.envio.completar_tutores)).not.toContain('telefono"');
    expect(e.avisos.some((x) => x.texto.includes('Dejo el que ya estaba'))).toBe(true);
  });

  it('completa raza y nacimiento de la mascota que ya existe, con la edad', () => {
    const p = armarPlan(nuevoEstado(), delArchivo({ tutor: { tel1: '573999999999' } }),
                        yaExiste, sinDecidir, HOY);

    expect(p.envio.crear_mascotas).toHaveLength(0);
    expect(p.envio.completar_mascotas).toEqual([{
      id: 70,
      campos: { raza: 'Poodle', fecha_nacimiento: '2018-07-26',
                edad_anios: 8, edad_meses: 2 },
    }]);
  });

  it('una edad ya escrita a mano no se pisa', () => {
    const conEdad = { ...yaExiste, mascotas: [
      { ...yaExiste.mascotas[0], edad_anios: 5, edad_meses: 3 }] };
    const p = armarPlan(nuevoEstado(), delArchivo({ tutor: { tel1: '573999999999' } }),
                        conEdad, sinDecidir, HOY);

    const campos = p.envio.completar_mascotas[0].campos;
    expect(campos).not.toHaveProperty('edad_anios');
    expect(campos.fecha_nacimiento).toBe('2018-07-26');
  });

  // Un tutor creado por una importación anterior sin número disponible tiene
  // telefono = ''. Si el archivo nuevo trae el número, no se puede escribir
  // (013_aplicar_importacion.sql:165 no acepta 'telefono' en la lista blanca
  // y caería toda la importación). Se avisa para que lo pongan a mano.
  it('tutor con telefono vacío: avisa el número que trae el archivo y no lo agrega a completar', () => {
    const conTelVacio = { ...vacia, duenos: [
      { id: 7, nombre: 'Ana Gómez', telefono: '',
        telefono2: null, cedula: '1000000001', direccion: null }] };
    const a = delArchivo({ tutor: { cedula: '1000000001', tel1: '573000000011' } });
    const e = nuevoEstado();
    const p = armarPlan(e, a, conTelVacio, sinDecidir, HOY);

    // El aviso menciona el número que trae el archivo.
    expect(e.avisos.some((x) => x.texto.includes('573000000011'))).toBe(true);
    // No agrega 'telefono' a completar_tutores (viola la lista blanca de Postgres).
    expect(JSON.stringify(p.envio.completar_tutores)).not.toContain('"telefono"');
  });

  it('nada que completar es completar_tutores vacío, no un objeto sin campos', () => {
    const lleno = { ...vacia, duenos: [{ id: 7, nombre: 'Ana Gómez',
      telefono: '573000000011', telefono2: '573000000001',
      cedula: '1000000001', direccion: 'Ya' }] };
    const a = delArchivo({ tutor: { cedula: '1000000001' } });
    const p = armarPlan(nuevoEstado(), a, lleno, sinDecidir, HOY);

    expect(p.envio.completar_tutores).toHaveLength(0);
    expect(p.resumen.tutores_a_completar).toBe(0);
  });
});

describe('armarPlan · los dudosos', () => {
  const dosAnas = { ...vacia, duenos: [
    { id: 9, nombre: 'Ana Gómez', telefono: '573000000022', cedula: null,
      telefono2: null, direccion: null }] };

  it('devuelve la duda y no manda nada de ese tutor hasta que la contesten', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY);

    expect(p.dudas).toHaveLength(1);
    expect(p.dudas[0]).toMatchObject({
      clase: 'tutor', motivo: 'nombre_tel_distinto',
      existente: { id: 9, telefono: '573000000022' },
    });
    expect(p.dudas[0].archivo).toMatchObject({ nombre: 'Ana Gómez', tel1: '573000000011' });
    // La mascota tampoco: no se sabe de quién es.
    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.crear_mascotas).toHaveLength(0);
    expect(p.resumen.dudas).toBe(1);
  });

  it('"distinta" crea una segunda ficha', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas,
      { dudas: { [armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY).dudas[0].id]: 'distinta' },
        especies: {} }, HOY);

    expect(p.dudas).toHaveLength(0);
    expect(p.envio.crear_tutores).toHaveLength(1);
    expect(p.envio.crear_mascotas[0].tutor_ref).toBe('t1');
  });

  it('"misma" la une a la que ya existe', () => {
    const id = armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY).dudas[0].id;
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas,
      { dudas: { [id]: 'misma' }, especies: {} }, HOY);

    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.crear_mascotas[0]).toMatchObject({ tutor_id: 9, tutor_ref: null });
  });
});

describe('armarPlan · mascotas dentro del mismo tutor', () => {
  // Lo que el dueño decidió cuando se le preguntó: la app no adivina que
  // uno es el apodo del otro, y está bien que no lo haga.
  it('"Noah" y "Noah Emiliano" son dos mascotas', () => {
    const a = delArchivo();
    a.mascotas = new Map([
      ['m1', { clave: 'm1', tutor: 't1', nombre: 'Noah', especie: 'perro', raza: null, nacimiento: null, origen: [] }],
      ['m2', { clave: 'm2', tutor: 't1', nombre: 'Noah Emiliano', especie: 'perro', raza: null, nacimiento: null, origen: [] }],
    ]);
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_mascotas.map((m) => m.nombre)).toEqual(['Noah', 'Noah Emiliano']);
  });

  it('el mismo nombre en otro tutor es otra mascota', () => {
    const otra = { ...vacia,
      duenos: [{ id: 7, nombre: 'Otro Señor', telefono: '573111111111', cedula: null,
                 telefono2: null, direccion: null }],
      mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: null,
                   fecha_nacimiento: null, edad_anios: 0, edad_meses: 0 }] };
    const p = armarPlan(nuevoEstado(), delArchivo(), otra, sinDecidir, HOY);
    expect(p.envio.crear_mascotas).toHaveLength(1);
    expect(p.envio.completar_mascotas).toHaveLength(0);
  });
});

describe('armarPlan · subir dos veces el mismo archivo', () => {
  const unBano = [{ tipo: 'tratamiento', mascota: 'm1', t: 'bano',
                    fecha: '2026-09-12', hora: '10:18', notas: 'Baño completo' }];
  const unaVacuna = [{ tipo: 'vacuna', mascota: 'm1', nombre: 'Anual',
                       fecha: '2026-07-14', proxima: '2027-07-14', notas: 'Según el tutor' }];

  it('la primera vez los eventos entran', () => {
    const a = delArchivo({ eventos: [...unBano, ...unaVacuna] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(1);
    expect(p.envio.vacunas).toHaveLength(1);
    expect(p.envio.tratamientos[0]).toMatchObject({
      mascota_ref: 'm1', mascota_id: null, tipo: 'bano', fecha: '2026-09-12', hora: '10:18',
    });
  });

  // Sin esto, el mismo archivo dos veces deja 148 baños donde hubo 74:
  // historial duplicado e informe de caja con el doble de servicios.
  it('la segunda vez no entra nada: 0 para crear y 0 para completar', () => {
    const yaTodo = {
      duenos: [{ id: 7, nombre: 'Ana Gómez', telefono: '573000000011',
                 telefono2: null, cedula: null, direccion: null }],
      mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: 'Poodle',
                   fecha_nacimiento: '2018-07-26', edad_anios: 8, edad_meses: 2 }],
      tratamientos: [{ mascota_id: 70, tipo: 'bano', fecha: '2026-09-12' }],
      vacunas: [{ mascota_id: 70, nombre: 'Anual', fecha_aplicacion: '2026-07-14' }],
    };
    const a = delArchivo({ eventos: [...unBano, ...unaVacuna] });
    const p = armarPlan(nuevoEstado(), a, yaTodo, sinDecidir, HOY);

    expect(p.resumen).toMatchObject({
      tutores_nuevos: 0, tutores_a_completar: 0,
      mascotas_nuevas: 0, mascotas_a_completar: 0,
      tratamientos: 0, vacunas: 0, eventos_repetidos: 2,
    });
  });

  // Costo conocido y aceptado: si bañaron al mismo perro dos veces el mismo
  // día, el segundo se pierde. Es rarísimo y se arregla a mano en diez
  // segundos; el caso contrario es frecuente y es un desastre para limpiar.
  it('dos baños del mismo día en el mismo archivo son uno', () => {
    const a = delArchivo({ eventos: [
      ...unBano,
      { tipo: 'tratamiento', mascota: 'm1', t: 'bano', fecha: '2026-09-12', hora: '15:00', notas: 'Otro' },
    ] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(1);
    expect(p.resumen.eventos_repetidos).toBe(1);
  });

  // A una mascota se le pueden aplicar dos vacunas distintas el mismo día.
  it('dos vacunas distintas el mismo día son dos', () => {
    const a = delArchivo({ eventos: [
      { tipo: 'vacuna', mascota: 'm1', nombre: 'Anual', fecha: '2026-07-14', proxima: null, notas: null },
      { tipo: 'vacuna', mascota: 'm1', nombre: 'Tos de las perreras', fecha: '2026-07-14', proxima: null, notas: null },
    ] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.vacunas).toHaveLength(2);
  });

  // Un evento de una mascota que quedó colgada de una duda no puede ir: no
  // se sabe a qué mascota pegarlo.
  it('el evento de una mascota sin resolver no se manda', () => {
    const dosAnas = { ...vacia, duenos: [{ id: 9, nombre: 'Ana Gómez',
      telefono: '573000000022', cedula: null, telefono2: null, direccion: null }] };
    const a = delArchivo({ eventos: unBano });
    const p = armarPlan(nuevoEstado(), a, dosAnas, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(0);
  });
});

describe('armarPlan · misma persona con dos claves en el archivo (hallazgo 4)', () => {
  // La misma persona escrita con cédula en unas filas y sin cédula en otras
  // sale de agrupar() con dos claves de tutor: una `c:<cédula>` y otra
  // `n:<nombre>|<tel>`. Las dos pueden resolver al mismo destino en la base.
  // Si no se colapsa por destino, el mismo perro se crea dos veces, sus
  // baños se escriben dos veces y el paso 3 muestra el doble de tutores
  // para completar.
  //
  // Fixture: tutorXconCedula (`c:1000000001`) y tutorXsinCedula (`n:...`)
  // resuelven al mismo existente id=7. La mascota `Max` aparece en ambas claves.

  const existenteCon7 = {
    ...vacia,
    duenos: [{ id: 7, nombre: 'Ana Gómez', telefono: '573000000011',
               telefono2: null, cedula: '1000000001', direccion: null }],
  };

  // Agrupado con dos claves para la misma persona: una con cédula (como
  // viene de filas que la traen) y una sin (como viene de filas que no la
  // traen). El perro Max aparece en las dos.
  const agrupadoDosClavesNuevoPerro = {
    tutores: new Map([
      ['c:1000000001', {
        clave: 'c:1000000001', nombre: 'Ana Gómez', cedula: '1000000001',
        tel1: '573000000011', tel2: null, direccion: null, origen: ['Hoja1:2'],
      }],
      ['n:ana gomez|573000000011', {
        clave: 'n:ana gomez|573000000011', nombre: 'Ana Gómez', cedula: null,
        tel1: '573000000011', tel2: null, direccion: null, origen: ['Hoja1:5'],
      }],
    ]),
    mascotas: new Map([
      ['c:1000000001|m:max', {
        clave: 'c:1000000001|m:max', tutor: 'c:1000000001', nombre: 'Max',
        especie: 'perro', raza: null, nacimiento: null, origen: ['Hoja1:2'],
      }],
      ['n:ana gomez|573000000011|m:max', {
        clave: 'n:ana gomez|573000000011|m:max', tutor: 'n:ana gomez|573000000011',
        nombre: 'Max', especie: 'perro', raza: null, nacimiento: null, origen: ['Hoja1:5'],
      }],
    ]),
    eventos: [
      { tipo: 'tratamiento', mascota: 'c:1000000001|m:max',
        t: 'bano', fecha: '2026-09-12', hora: '10:00', notas: null },
      { tipo: 'tratamiento', mascota: 'n:ana gomez|573000000011|m:max',
        t: 'bano', fecha: '2026-09-12', hora: '10:00', notas: null },
    ],
  };

  // Agrupado igual pero el tutor no existe en la base (perro nuevo para tutor nuevo).
  const agrupadoDosClavesConTutor = {
    ...agrupadoDosClavesNuevoPerro,
    // Misma estructura pero los tutores apuntan a la base existenteCon7 por cédula.
  };

  // Agrupado con dos claves y la mascota existente, cada una trayendo un
  // campo distinto para completar.
  const existenteCon7yMax = {
    ...existenteCon7,
    mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: null,
                 fecha_nacimiento: null, edad_anios: 0, edad_meses: 0 }],
  };
  const agrupadoDosClavesCompletarTutor = {
    tutores: new Map([
      ['c:1000000001', {
        clave: 'c:1000000001', nombre: 'Ana Gómez', cedula: '1000000001',
        tel1: '573000000011', tel2: null, direccion: 'Calle 5', origen: ['Hoja1:2'],
      }],
      ['n:ana gomez|573000000011', {
        clave: 'n:ana gomez|573000000011', nombre: 'Ana Gómez', cedula: null,
        tel1: '573000000011', tel2: null, direccion: null, origen: ['Hoja1:5'],
      }],
    ]),
    mascotas: new Map(),
    eventos: [],
  };
  const agrupadoDosClavesCompletarMascota = {
    tutores: new Map([
      ['c:1000000001', {
        clave: 'c:1000000001', nombre: 'Ana Gómez', cedula: '1000000001',
        tel1: '573000000011', tel2: null, direccion: null, origen: ['Hoja1:2'],
      }],
      ['n:ana gomez|573000000011', {
        clave: 'n:ana gomez|573000000011', nombre: 'Ana Gómez', cedula: null,
        tel1: '573000000011', tel2: null, direccion: null, origen: ['Hoja1:5'],
      }],
    ]),
    mascotas: new Map([
      ['c:1000000001|m:max', {
        clave: 'c:1000000001|m:max', tutor: 'c:1000000001', nombre: 'Max',
        especie: 'perro', raza: 'Poodle', nacimiento: null, origen: ['Hoja1:2'],
      }],
      ['n:ana gomez|573000000011|m:max', {
        clave: 'n:ana gomez|573000000011|m:max', tutor: 'n:ana gomez|573000000011',
        nombre: 'Max', especie: 'perro', raza: null, nacimiento: '2018-07-26',
        origen: ['Hoja1:5'],
      }],
    ]),
    eventos: [],
  };

  // Test 1: dos claves del mismo tutor existente con el mismo perro nuevo → 1 mascota.
  // Escenario: el tutor ya existe en la base (id=7), el archivo lo trae con cédula
  // en unas filas y sin cédula en otras → dos claves en agrupadoDosClavesNuevoPerro.
  // Las dos resuelven a id=7, y el mismo Max no debe crearse dos veces.
  it('misma persona existente con dos claves y el mismo perro: solo se crea una mascota', () => {
    const p = armarPlan(nuevoEstado(), agrupadoDosClavesNuevoPerro, existenteCon7, sinDecidir, HOY);
    expect(p.envio.crear_mascotas).toHaveLength(1);
    expect(p.envio.crear_mascotas[0].nombre).toBe('Max');
  });

  // Test 2: el baño del mismo Max desde las dos claves → una sola entrada en tratamientos.
  it('misma persona existente con dos claves: el mismo baño del mismo día se escribe una vez', () => {
    const p = armarPlan(nuevoEstado(), agrupadoDosClavesNuevoPerro, existenteCon7, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(1);
  });

  // Test 3: dos claves del mismo tutor existente, cada una trayendo un campo
  // distinto → completar_tutores con una sola entrada que tiene los dos campos
  it('misma persona existente con dos claves: una sola entrada en completar_tutores con los dos campos', () => {
    // c:1000000001 trae dirección; n:... no trae nada nuevo → 1 entrada, campos: { direccion }
    const p = armarPlan(nuevoEstado(), agrupadoDosClavesCompletarTutor, existenteCon7, sinDecidir, HOY);
    expect(p.envio.completar_tutores).toHaveLength(1);
    expect(p.envio.completar_tutores[0].id).toBe(7);
    expect(p.envio.completar_tutores[0].campos).toHaveProperty('direccion');
  });
});

describe('armarPlan · validación de tipo de tratamiento (requisito A)', () => {
  // tratamientos.tipo tiene un check en 001_init.sql:78:
  //   check (tipo in ('vacunacion','desparasitacion','bano','consulta'))
  // Un tipo fuera de lista no se manda y se avisa: un dato malo cuesta un
  // registro, no el archivo completo.
  it('un tipo de tratamiento desconocido no se manda y genera un aviso', () => {
    const evInvalido = [{ tipo: 'tratamiento', mascota: 'm1', t: 'spa',
                          fecha: '2026-09-12', hora: '10:00', notas: null }];
    const a = delArchivo({ eventos: evInvalido });
    const e = nuevoEstado();
    const p = armarPlan(e, a, vacia, sinDecidir, HOY);

    expect(p.envio.tratamientos).toHaveLength(0);
    expect(e.avisos.some((x) => x.texto.includes('spa'))).toBe(true);
  });

  it('un tipo válido sí entra', () => {
    const evValido = [{ tipo: 'tratamiento', mascota: 'm1', t: 'desparasitacion',
                        fecha: '2026-09-12', hora: null, notas: null }];
    const a = delArchivo({ eventos: evValido });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);

    expect(p.envio.tratamientos).toHaveLength(1);
    expect(p.envio.tratamientos[0].tipo).toBe('desparasitacion');
  });
});
