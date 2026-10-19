// ============================================================
// VetaApp · importador/textos.js
// El JSON que devuelve Postgres pasado a frases que se entienden.
//
// Está afuera del JSX porque son las frases que más importan de todo el
// importador —sobre todo textoConservadas, que es la que explica por qué
// "Deshacer" no borró todo— y adentro del componente no se pueden probar.
// ============================================================

/** 1 → "1 vacuna", 3 → "3 vacunas". El plural a mano porque son cuatro casos. */
const n = (cuantos, singular, plural) =>
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
    // tres `que` más —tutor_no_encontrado (013:156), mascota_no_encontrada
    // (013:252)— y en esos `valor` viene null: imprimirlo da "(null)".
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
 */
export function textoDeshecho(d) {
  const l = [];
  if (d.tutores_borrados > 0)   l.push(n(d.tutores_borrados, 'tutor', 'tutores'));
  if (d.mascotas_borradas > 0)  l.push(n(d.mascotas_borradas, 'mascota', 'mascotas'));
  if (d.tratamientos > 0)       l.push(n(d.tratamientos, 'baño o desparasitación', 'baños y desparasitaciones'));
  if (d.vacunas > 0)            l.push(n(d.vacunas, 'vacuna', 'vacunas'));
  if (d.campos_restaurados > 0) l.push(n(d.campos_restaurados, 'dato que devolví a como estaba', 'datos que devolví a como estaban'));
  return l;
}

const COSAS = [
  ['historias',    'consulta',  'consultas'],
  ['citas',        'cita',      'citas'],
  ['vacunas',      'vacuna',    'vacunas'],
  ['tratamientos', 'baño',      'baños'],
  // `cobros` es el quinto contador que 014 mira para decidir si la mascota
  // se conserva (014:87-89), y el quinto que devuelve. Sin él, una mascota
  // que se quedó SOLO porque tiene un cobro cae acá con la lista vacía y la
  // pantalla dice "tiene undefined". Los cinco de 014 van los cinco acá:
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

    // El verbo va ADELANTE, no un participio atrás ("…escritas después del
    // import"). Un participio tiene que concordar en género con la lista, y
    // la lista mezcla géneros en cuanto entra `cobro`: "1 consulta y 1
    // cobro escritas" está mal. Con el verbo delante no hay nada que
    // concordar, y la frase sigue diciendo lo único que importa: eso lo
    // escribió la clínica DESPUÉS, no el archivo.
    return `${m.nombre}: después del import le escribieron ${lista}`;
  });
}
