// ============================================================
// VetaApp · archivos/textos.js
// Una fila de `archivos_mascota` pasada a la línea que la clínica lee.
//
// Separado de limites.js porque son dos preguntas distintas: una decide
// si algo se puede subir, este redacta. Y afuera del JSX por lo de
// siempre: adentro del componente no se puede probar.
// ============================================================

/**
 * Las seis llaves del `check (tipo in (...))` de
 * 015_archivos_mascota.sql, cada una con la palabra que ve la clínica.
 *
 * Las llaves van sin tildes porque son valores de base de datos; las
 * etiquetas van con tildes porque son español. Que la etiqueta viva acá y
 * no en la migración es lo que permite cambiar "Exámenes de laboratorio"
 * por otra cosa sin tocar una migración que ya corrió en producción.
 *
 * Si se agrega un tipo al check de `015`, se agrega acá: textos.test.js
 * compara las dos listas en los dos sentidos y falla si se separan.
 */
export const ETIQUETA_TIPO = {
  chequeo:           'Chequeo general',
  examenes:          'Exámenes de laboratorio',
  imagenes:          'Imágenes (rayos X, ecografía)',
  cirugia:           'Cirugía',
  historia_anterior: 'Historia de otra clínica',
  otro:              'Otro',
};

/**
 * Los seis, en el orden del dropdown. Congelado para que ninguna pantalla
 * lo reordene por accidente y dos clínicas vean listas distintas.
 *
 * El orden no es alfabético: arriba van los dos que más se suben (chequeo
 * y exámenes) y abajo 'Otro', que es el que se elige cuando ninguno
 * aplica. Un 'Otro' en la mitad de la lista se elige por pereza.
 */
export const TIPOS = Object.freeze(
  ['chequeo', 'examenes', 'imagenes', 'cirugia', 'historia_anterior', 'otro']
    .map((valor) => Object.freeze({ valor, etiqueta: ETIQUETA_TIPO[valor] }))
);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * '2023-04-18' → '18 abr 2023'.
 *
 * A mano, con una expresión regular, y NO con `toLocaleDateString`. Dos
 * motivos, los dos reales en este proyecto:
 *
 *  · `new Date('2023-04-18')` es medianoche UTC, que en Colombia (-05:00)
 *    es el 17 a las 19:00. La fecha se muestra un día antes.
 *    `badgeProxDosis` (Historias.jsx) ya parchea eso pegándole `'T12:00:00'`; acá el
 *    problema no existe porque nunca se construye un Date.
 *
 *  · `toLocaleDateString('es-CO', …)` depende del ICU del motor, y la
 *    misma llamada devuelve 'abr' o 'abr.' según la versión de node. Una
 *    prueba que compara la cadena exacta se vuelve frágil por algo que no
 *    es el código.
 *
 * Lo que no sea ISO se devuelve crudo: si una fila tiene algo raro, que se
 * vea. El check de `015` hace que no pueda pasar por la app, pero una fila
 * puede haber entrado por el SQL Editor.
 */
export function fechaLegible(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Bytes a algo que se lee de un vistazo.
 *
 * Tres ramas y no dos: la columna "Espacio" del panel de Admin suma TODO
 * lo de una clínica, y el plan gratis de Supabase es 1 GB. Sin la rama de
 * GB, una clínica a punto de llenar la cuenta se lee como "1024,0 MB", que
 * es el número que menos alarma de todos.
 *
 * Nada de bytes sueltos: abajo de 1 KB la respuesta útil igual es "0 KB".
 * Un PDF de 400 bytes no existe.
 */
export function fmtBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2).replace('.', ',')} GB`;
  if (b >= 1048576)    return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(b / 1024)} KB`;
}

/**
 * La línea de abajo de cada archivo en la lista: qué es, de cuándo, y lo
 * que la clínica haya querido anotar.
 *
 * El nombre del archivo NO entra: va arriba, en negrita, como título. Acá
 * repetirlo sería la misma información dos veces en dos renglones
 * seguidos.
 *
 * Los pedazos vacíos se caen antes del `join`, así que nunca sale un
 * ' · ' colgando — el caso más común de todos, porque fecha y descripción
 * son opcionales y la subida rápida no pone ninguna de las dos.
 *
 * Un `tipo` que esta versión no conoce se muestra crudo, con el mismo
 * criterio que `textoOmitidos` del importador: esconderlo sería esconder
 * exactamente el caso nuevo.
 */
export function textoArchivo(a) {
  return [
    ETIQUETA_TIPO[a?.tipo] ?? a?.tipo ?? '',
    fechaLegible(a?.fecha_documento),
    a?.descripcion || '',
  ].filter(Boolean).join(' · ');
}

/**
 * El título y el mensaje del modal que pregunta antes de borrar.
 *
 * Vive acá y no adentro del componente por lo mismo que todo lo demás de
 * este archivo: adentro del JSX no se puede probar, y este texto es lo
 * único que la clínica lee antes de borrar un documento clínico que no se
 * recupera.
 *
 * Tres decisiones, todas por el mismo motivo —que se entienda QUÉ se está
 * borrando antes de aceptar:
 *
 *  · El NOMBRE del archivo va siempre. Una mascota puede tener diez PDF y
 *    el escáner los nombra a todos `escaneo.pdf`.
 *  · El TIPO entra cuando hay: entre dos `escaneo.pdf`, "Cirugía" es lo
 *    que distingue cuál se va. Un tipo que esta versión no conoce se
 *    muestra crudo, mismo criterio que `textoArchivo`.
 *  · Sin nombre se dice "este archivo", no `""`. Una pregunta con comillas
 *    vacías se lee como un error de la app, y nadie sabe qué está
 *    aceptando.
 */
/**
 * La lista plana de archivos, partida en las secciones que se pintan en el
 * panel derecho: `[{ valor, etiqueta, archivos }]`.
 *
 * Pura y acá y no adentro del componente por lo de siempre: sin jsdom en
 * este proyecto, lo que vive en el JSX no se puede probar. Y esta función
 * decide QUÉ ARCHIVOS SE VEN — un error acá no rompe la pantalla, hace
 * desaparecer documentos clínicos que siguen existiendo en la base, que es
 * peor porque nadie lo nota.
 *
 * Tres reglas, cada una por un motivo concreto:
 *
 *  · EL ORDEN ES EL DE `TIPOS`, no el de llegada ni el alfabético. Es el
 *    mismo orden del dropdown de subida, así que la clínica encuentra la
 *    sección donde la dejó. Si fuera el orden de llegada, las secciones se
 *    reacomodarían solas cada vez que se sube algo.
 *
 *  · LOS GRUPOS VACÍOS NO SALEN. Seis encabezados fijos con cinco vacíos
 *    es una pantalla donde hay que buscar el único que tiene algo.
 *
 *  · UN TIPO DESCONOCIDO VA AL FINAL, con su llave cruda como etiqueta.
 *    Mismo criterio que `textoArchivo`. El `check` de 015 impide que entre
 *    por la app, pero una fila puede haber entrado por el SQL Editor, y
 *    descartarla la borraría de la pantalla sin borrarla de la base: el
 *    cliente la daría por perdida teniéndola.
 *
 * Una fila sin `tipo` cae en el grupo `''`, que también se pinta. Suena
 * feo y es a propósito: feo y visible es mejor que prolijo y desaparecido.
 */
export function agruparPorTipo(archivos) {
  const lista = Array.isArray(archivos) ? archivos : [];

  // Un Map y no un objeto: el Map conserva el orden de inserción, que es
  // lo que hace que los tipos desconocidos queden al final sin ordenarlos
  // aparte. Se siembra con los seis conocidos en el orden del dropdown y
  // al final se tiran los que quedaron vacíos.
  const grupos = new Map(TIPOS.map((t) => [t.valor, []]));

  for (const a of lista) {
    const k = a?.tipo ?? '';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a);
  }

  return [...grupos]
    .filter(([, archivos]) => archivos.length > 0)
    .map(([valor, archivos]) => ({
      valor,
      etiqueta: ETIQUETA_TIPO[valor] ?? valor,
      archivos,
    }));
}

export function preguntaBorrado(a) {
  const nombre = a?.nombre ? `"${a.nombre}"` : 'este archivo';
  const tipo = a?.tipo ? ` (${ETIQUETA_TIPO[a.tipo] ?? a.tipo})` : '';
  return {
    titulo: '¿Borrar este archivo?',
    mensaje: `Se va a borrar ${nombre}${tipo}. Esto no se puede deshacer.`,
  };
}
