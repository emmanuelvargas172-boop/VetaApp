// ============================================================
// VetaApp · archivos/limites.js
// Los dos números del límite, y la única función que decide si un archivo
// se puede subir.
//
// Afuera del componente por dos motivos. Uno: adentro no se puede probar
// —este vitest no tiene jsdom— y esta es la capa que decide si la clínica
// puede trabajar. Dos: de las tres capas del límite (esta, el check de la
// tabla, el límite del bucket) es la ÚNICA que puede decir algo útil. Las
// otras dos solo saben rechazar, y en inglés.
// ============================================================

/**
 * 12 MB exactos, en bytes (12 × 1048576). El MISMO número vive en otros dos
 * lados, los dos en 016_subir_limite_archivos.sql:
 *   · el `check (peso_bytes > 0 and peso_bytes <= 12582912)` de la tabla
 *   · `file_size_limit` del bucket `documentos`
 *
 * Si se separan, el que rechace primero decide, y el mensaje que ve la
 * clínica cambia según cuál sea.
 *
 * Era 5242880 (5 MB) hasta la 016. Se subió porque los escaneos reales de
 * una clínica pesan entre 5 y 7 MB: el tope viejo quedaba justo encima del
 * tamaño NORMAL y rechazaba trabajo legítimo. Un tope frena el disparate
 * —la foto del celular en color, el escaneo de 80 páginas sin comprimir—,
 * no el caso de todos los días.
 */
export const MAX_BYTES = 12582912;

/**
 * Siete por mascota. El mismo número que el trigger
 * `limite_archivos_mascota()`, hoy en 016_subir_limite_archivos.sql.
 *
 * Eran diez hasta la 016. Bajó al subir el peso, y no por ahorrar espacio
 * real —un PDF ocupa lo que pesa, no lo que permite el tope— sino por el
 * techo del peor caso: 7 × 12 MB = 84 MB por mascota, contra los 150 MB que
 * darían 10 × 15. El plan gratis de Supabase es 1 GB para TODO el proyecto,
 * y cuando se llena no falla la mascota que se pasó: dejan de subir todas
 * las clínicas, incluidas las que pagan.
 */
export const MAX_POR_MASCOTA = 7;

/**
 * "12,0". Coma decimal porque la pantalla está en español, y un solo
 * decimal porque "12,04 MB" no ayuda a decidir nada.
 */
const mb = (bytes) => (bytes / 1048576).toFixed(1).replace('.', ',');

/**
 * La frase del cupo, compartida con traducirErrorSql: tienen que decir lo mismo.
 * El lowercase 'b' en 'borrá' es lo que limites.test.js busca con toContain('borrá').
 *
 * Exportada porque la pantalla de archivos tiene que mostrar el aviso "está llena"
 * sin que la clínica tenga que elegir un archivo primero, y una segunda copia en
 * SubirArchivo.jsx (que entonces se llamaba ArchivosMascota.jsx) ya había
 * divergido en la puntuación.
 */
export const MOTIVO_CUPO =
  `Esta mascota ya tiene ${MAX_POR_MASCOTA} documentos, que es el máximo; ` +
  `borrá uno para poder subir otro.`;

/**
 * La frase del tamaño sin el dato del archivo, para cuando el error viene de Postgres.
 * Usa mb(MAX_BYTES) en vez del literal "5" para que cualquier cambio en
 * MAX_BYTES se refleje automáticamente en el mensaje y las pruebas fallen
 * si se desincroniza.
 */
const MOTIVO_PESO_SIN_DATO =
  `Ese PDF pasa de ${mb(MAX_BYTES)} MB, que es el máximo. Si lo escaneaste en color, ` +
  'volvé a escanearlo en blanco y negro.';

/**
 * ¿Se puede subir este archivo?
 *
 * @param file       lo que devolvió el <input type="file">. Se usan solo
 *                   `type` y `size`; las pruebas pasan objetos planos.
 * @param cuantosHay cuántos archivos tiene YA esa mascota.
 * @returns `{ ok: true }` o `{ ok: false, motivo }` con una frase que la
 *          pantalla muestra tal cual.
 *
 * El ORDEN de los chequeos es parte de la función, no un detalle.
 *
 * El cupo va primero: en una mascota llena, el mensaje del tamaño manda a
 * la clínica a volver a escanear el archivo más liviano, y eso no arregla
 * nada — va a quedar rechazado igual. Decirle "borrá uno" es lo único que
 * la desbloquea.
 *
 * Después el tipo, y después el tamaño: de los dos, el tipo es el error de
 * dedo (eligió la foto en vez del PDF) y el tamaño el que pide trabajo.
 */
export function revisarArchivo(file, cuantosHay) {
  if ((cuantosHay ?? 0) >= MAX_POR_MASCOTA) {
    return { ok: false, motivo: MOTIVO_CUPO };
  }

  if (!file) {
    return { ok: false, motivo: 'No elegiste ningún archivo.' };
  }

  // Lo que este chequeo atrapa: la clínica eligió una foto del celular,
  // con su nombre .jpg de verdad, y la pantalla se lo dice en vez de
  // subirla a un bucket que solo muestra PDFs.
  //
  // Lo que NO atrapa, y no se puede escribir como si lo hiciera: un .jpg
  // RENOMBRADO a .pdf. El navegador deriva `File.type` de la extensión del
  // nombre, no de los bytes, así que el renombrado llega acá diciendo
  // `application/pdf` y pasa. Validar el contenido exigiría leer los
  // primeros bytes y buscar `%PDF-`; no se hace porque no cambiaría nada:
  // el archivo lo abre el visor de la clínica, que falla solo y de forma
  // obvia.
  if (file.type !== 'application/pdf') {
    const queEs = file.type
      ? `es de tipo ${file.type}`
      : 'es de un tipo que el navegador no reconoce';
    return {
      ok: false,
      motivo: `Solo se pueden subir PDF, y este archivo ${queEs}. ` +
              `Si es una foto, guardala como PDF y volvé a intentar.`,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      motivo: 'Este archivo está vacío (0 bytes). Suele pasar cuando el ' +
              'escáner se cortó a mitad: volvé a exportarlo.',
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      // mb(MAX_BYTES) en vez del literal "5": si se cambia MAX_BYTES el
      // mensaje se actualiza solo y las pruebas de I-2 fallan si se olvida.
      motivo: `Este PDF pesa ${mb(file.size)} MB y el máximo son ${mb(MAX_BYTES)}. ` +
              `Si lo escaneaste en color, volvé a escanearlo en blanco y negro.`,
    };
  }

  return { ok: true };
}

/**
 * El error de Postgres, dicho en la misma frase que habría dicho la
 * pantalla.
 *
 * Existe porque las capas 2 y 3 pueden rechazar algo que la capa 1 dejó
 * pasar: `cuantosHay` es el conteo con el que se pintó la lista, y entre
 * eso y el insert pudo entrar otro archivo desde otra pestaña. Sin esta
 * traducción, la clínica ve `new row for relation "archivos_mascota"
 * violates ...` y llama por teléfono.
 *
 * Devuelve `null` —no una frase genérica— para lo que no conoce, así el
 * llamador muestra el mensaje crudo de Postgres. Un error nuevo tapado
 * detrás de "algo salió mal" es un error que nadie va a encontrar.
 */
export function traducirErrorSql(mensaje) {
  const m = mensaje || '';
  if (m.includes('limite_archivos_mascota')) return MOTIVO_CUPO;
  if (m.includes('archivos_mascota_peso_bytes_check')) return MOTIVO_PESO_SIN_DATO;
  if (m.includes('archivos_mascota_tipo_check')) {
    return 'Ese tipo de documento no existe. Elegí uno de la lista.';
  }
  if (m.includes('archivos_mascota_fecha_documento_iso')) {
    return 'La fecha del documento no quedó bien. Usá el calendario del campo.';
  }
  if (m.includes('archivos_mascota_ruta_key')) {
    return 'Ese archivo ya se había subido. Actualizá la página para verlo.';
  }
  return null;
}
