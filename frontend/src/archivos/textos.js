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
 *    `Historias.jsx:195` ya parchea eso pegándole `'T12:00:00'`; acá el
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
