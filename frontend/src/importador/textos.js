// ============================================================
// VetaApp · importador/textos.js
// El JSON que devuelve Postgres pasado a frases que se entienden.
//
// Está afuera del JSX porque son las frases que más importan de todo el
// importador —sobre todo textoConservadas, que es la que explica por qué
// "Deshacer" no borró todo— y adentro del componente no se pueden probar.
// ============================================================

/**
 * 1 → "1 vacuna", 3 → "3 vacunas". El plural a mano: son pocos casos y ninguno
 * es irregular, así que una librería de i18n acá sería más código que el que
 * ahorra.
 *
 * Exportada porque el paso 3 la necesita. Ahí los contadores se pegaban con
 * el plural fijo —`${r.tutores_nuevos} tutores`— y un archivo de una fila
 * decía "1 tutores · 1 mascotas" en la pantalla que la clínica lee ANTES de
 * confirmar. Es la pantalla donde menos se puede dudar de lo que dice.
 */
export const n = (cuantos, singular, plural) =>
  `${cuantos} ${cuantos === 1 ? singular : plural}`;

/**
 * Qué quedó escrito, según Postgres.
 *
 * Los ceros NO se escriben. "0 vacunas" en la pantalla de "quedó listo" se
 * lee como un error, y no lo es: esa hoja no traía vacunas.
 */
export function textoResultado(res) {
  const l = [];
  if (res.tutores_creados > 0)      l.push(n(res.tutores_creados, 'tutor nuevo', 'tutores nuevos'));
  if (res.mascotas_creadas > 0)     l.push(n(res.mascotas_creadas, 'mascota nueva', 'mascotas nuevas'));
  if (res.tutores_completados > 0)  l.push(n(res.tutores_completados, 'tutor al que le completé datos', 'tutores a los que les completé datos'));
  if (res.mascotas_completadas > 0) l.push(n(res.mascotas_completadas, 'mascota a la que le completé datos', 'mascotas a las que les completé datos'));
  // El contador no distingue baño de desparasitación, así que con uno solo
  // no se sabe cuál de los dos fue: "1 baño y desparasitación" afirmaría
  // que fueron los dos.
  if (res.tratamientos > 0)         l.push(n(res.tratamientos, 'baño o desparasitación', 'baños y desparasitaciones'));
  if (res.vacunas > 0)              l.push(n(res.vacunas, 'vacuna', 'vacunas'));
  // Los repetidos son los que NO escribió. Van igual: son la prueba de que
  // subir el mismo archivo dos veces no duplica nada.
  if (res.repetidos > 0)            l.push(res.repetidos === 1
    ? '1 ya estaba cargado, ese no lo repetí'
    : `${res.repetidos} ya estaban cargados, esos no los repetí`);
  return l;
}

/**
 * Lo que la función dejó afuera a propósito.
 *
 * Hoy es un solo caso: dos clientes distintos con la misma cédula en el
 * archivo. El segundo entra SIN cédula en vez de abortar el import entero
 * (ver tarea 7). Si eso no se dijera, la clínica creería que la cédula
 * está cargada y la buscaría para siempre sin encontrar a nadie.
 */
export function textoOmitidos(omitidos) {
  return (omitidos ?? []).map((o) => {
    if (o.que === 'cedula_repetida') {
      return `${o.quien}: no le pude guardar la cédula ${o.valor} porque ya la tenía otro cliente. Entró sin cédula; revisá cuál de los dos es la correcta.`;
    }
    // Un `que` que esta versión de la pantalla no conoce igual se muestra
    // crudo. Esconderlo sería esconder exactamente el caso nuevo. 013 manda
    // dos `que` más —tutor_no_encontrado (013:171) y mascota_no_encontrada
    // (013:272)— y en esos `valor` viene null: imprimirlo da "(null)".
    return o.valor ? `${o.quien}: ${o.que} (${o.valor})` : `${o.quien}: ${o.que}`;
  });
}

/**
 * Qué borró el deshacer.
 *
 * Mismo criterio que textoResultado: los ceros no se escriben y el singular
 * se dice en singular. Estaba suelto adentro del JSX con los números
 * crudos, y ahí decía "Borré 0 tutores, 0 mascotas, 0 baños y 0 vacunas"
 * cuando el deshacer conservaba todo — el caso que más confunde, porque el
 * deshacer sí funcionó y el texto se lee como si hubiera fallado.
 *
 * `campos_restaurados` NO entra en esta lista y tiene que seguir afuera: los
 * dos llamadores la leen detrás de un "Borré", y restaurar un dato es lo
 * contrario de borrarlo. Con el contador adentro, una importación que solo
 * completó campos imprime "Borré 2 datos que devolví a como estaban", que
 * además es el único elemento de la lista en ese caso. Va aparte, en
 * textoRestaurados.
 */
export function textoDeshecho(d) {
  const l = [];
  if (d.tutores_borrados > 0)   l.push(n(d.tutores_borrados, 'tutor', 'tutores'));
  if (d.mascotas_borradas > 0)  l.push(n(d.mascotas_borradas, 'mascota', 'mascotas'));
  if (d.tratamientos > 0)       l.push(n(d.tratamientos, 'baño o desparasitación', 'baños y desparasitaciones'));
  if (d.vacunas > 0)            l.push(n(d.vacunas, 'vacuna', 'vacunas'));
  return l;
}

/**
 * Qué datos devolvió a como estaban. Frase entera, no un pedazo de lista.
 *
 * Es la otra mitad del deshacer y necesita su propio verbo: lo que el import
 * había COMPLETADO —un teléfono que estaba vacío y quedó lleno— no se borra al
 * deshacer, se devuelve al valor que tenía antes.
 *
 * Devuelve '' cuando no hubo ninguno, así el llamador no tiene que mirar el
 * número.
 *
 * El `?? 0` y el `?.` son guardas, no el caso normal: 014 guarda
 * `campos_restaurados` en `resumen.deshecho` igual que lo devuelve, así que el
 * historial lo lee bien aunque la fila se haya deshecho hace meses. Cubren dos
 * cosas que igual pasan: un `deshecho` que no existe (la fila nunca se
 * deshizo), y una fila deshecha antes de que la función guardara el contador.
 * En los dos, no saber el número es motivo para callarse; sin el guarda la
 * frase saldría igual, diciendo "Devolví undefined datos a como estaban".
 */
export function textoRestaurados(d) {
  const c = d?.campos_restaurados ?? 0;
  if (c === 0) return '';
  // Las dos palabras concuerdan o ninguna: "1 datos a como estaban" y
  // "1 dato a como estaban" están los dos mal.
  return c === 1
    ? 'Devolví 1 dato a como estaba.'
    : `Devolví ${c} datos a como estaban.`;
}

/**
 * Qué está por escribir, según la predicción del paso 3.
 *
 * Es el ÚNICO lugar del paso 4 donde se usa la predicción y no la respuesta
 * de Postgres, y está bien: la frase habla de lo que va a hacer, no de lo
 * que quedó. En cuanto hay un resultado, la pantalla lo tira y muestra lo
 * que volvió (ver textoResultado).
 *
 * Los ceros no se escriben, por lo mismo que en textoResultado y por un
 * motivo más fuerte acá: el segundo archivo de la misma clínica trae cero
 * tutores nuevos y cero mascotas nuevas con 74 baños adentro, y decir
 * "escribiendo 0 y 0" mientras escribe 74 es falso.
 *
 * `tutores_a_completar` y `mascotas_a_completar` cuentan TUTORES y MASCOTAS,
 * no campos: plan.js:615-617 los saca del largo de `completar_tutores` y
 * `completar_mascotas`, que se acumulan una entrada por id del existente. Acá
 * decían "2 datos de tutores", y dos tutores con tres campos en blanco cada
 * uno son seis datos, no dos. El paso 3 ya lo dice bien ("Ya existen: 2
 * tutores"), así que además se contradecían entre pantallas.
 */
export function textoVaAEscribir(r) {
  const l = [];
  if (r.tutores_nuevos > 0)       l.push(n(r.tutores_nuevos, 'tutor', 'tutores'));
  if (r.mascotas_nuevas > 0)      l.push(n(r.mascotas_nuevas, 'mascota', 'mascotas'));
  if (r.tutores_a_completar > 0)  l.push(n(r.tutores_a_completar, 'tutor al que le completo datos', 'tutores a los que les completo datos'));
  if (r.mascotas_a_completar > 0) l.push(n(r.mascotas_a_completar, 'mascota a la que le completo datos', 'mascotas a las que les completo datos'));
  if (r.tratamientos > 0)         l.push(n(r.tratamientos, 'baño o desparasitación', 'baños y desparasitaciones'));
  if (r.vacunas > 0)              l.push(n(r.vacunas, 'vacuna', 'vacunas'));
  return l;
}

const COSAS = [
  ['historias',    'consulta',  'consultas'],
  ['citas',        'cita',      'citas'],
  ['vacunas',      'vacuna',    'vacunas'],
  ['tratamientos', 'baño',      'baños'],
  // `cobros` es el quinto contador que 014 mira para decidir si la mascota
  // se conserva (014:116-122), y el quinto que devuelve (014:130-133). Sin
  // él, una mascota que se quedó SOLO por un cobro cae acá con la lista
  // vacía y la pantalla dice "tiene undefined". Los cinco de 014 van acá:
  // si alguna vez se agrega un sexto allá, el `if` de abajo lo avisa.
  ['cobros',       'cobro',     'cobros'],
];

/**
 * Por qué estas mascotas NO se borraron al deshacer.
 *
 * La frase más difícil de la app, y tiene que decir tres cosas en una
 * línea: qué no borró, por qué, y —sin decirlo— que eso es lo correcto.
 *
 * Es por la cascada: `historias_clinicas.mascota_id` y `citas.mascota_id`
 * son `on delete cascade`, así que borrar la mascota que entró por el
 * archivo se llevaría las seis consultas que la veterinaria escribió
 * después. Deshacer un import no puede borrar trabajo clínico. Por eso la
 * mascota se queda, y su tutor también.
 */
export function textoConservadas(conservadas) {
  return (conservadas ?? []).map((m) => {
    const partes = COSAS
      .filter(([k]) => (m[k] ?? 0) > 0)
      .map(([k, s, p]) => n(m[k], s, p));

    if (partes.length === 0) {
      // Pasa si 014 empieza a mirar un sexto contador y acá no se agrega.
      // Esconder la mascota sería lo peor de las tres opciones: NO se
      // borró, y la clínica tiene que saberlo aunque no se le pueda decir
      // por qué. Mismo criterio que el `que` desconocido de textoOmitidos.
      return `${m.nombre}: no la borré, tiene algo escrito después del import`;
    }

    // "a, b y c". El "y" solo si hay más de una: "tiene 3 citas y escritas"
    // es lo que sale si se concatena sin mirar.
    const lista = partes.length > 1
      ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
      : partes[0];

    // Dos cosas, y las dos son a propósito.
    //
    // El verbo va ADELANTE, no un participio atrás ("…escritas después del
    // import"). Un participio tiene que concordar en género con la lista, y
    // la lista mezcla géneros en cuanto entra `cobro`: "1 consulta y 1
    // cobro escritas" está mal. Con el verbo delante no hay nada que
    // concordar.
    //
    // Y el verbo es impersonal —"le escribieron"— y no "la clínica le
    // escribió". El paso 1 de 014 borra solo los eventos de ESTA
    // importación, así que un segundo archivo que le agregó baños a una
    // mascota del primero también la conserva, y eso no lo escribió la
    // clínica a mano: lo escribió otro import. Lo único que se puede
    // afirmar de los cinco contadores es que no vino en este archivo.
    return `${m.nombre}: después del import le escribieron ${lista}`;
  });
}
