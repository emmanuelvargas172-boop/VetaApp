// ============================================================
//  huerfanos.ts — qué objeto del bucket no tiene fila que lo nombre
//
//  Sin una sola API de Deno a propósito, igual que wompi.ts: así la parte
//  que DECIDE QUÉ SE BORRA se prueba con node, sin desplegar y sin llaves
//  (ver huerfanos.prueba.mjs).
//
//  Es la función más peligrosa del proyecto. Lo que devuelve se borra, y
//  de Storage no se recupera. Por eso toda duda se resuelve para el mismo
//  lado: si no se entiende algo, NO es huérfano.
// ============================================================

/** Lo que devuelve `storage.list()` de cada entrada, de lo que acá se usa. */
export type ObjetoStorage = {
  name: string;
  // I5: la librería declara `created_at: string | null` con el comentario
  // "null for folders". `string | undefined` es TS2322 bajo strict.
  created_at?: string | null;
  /** `list()` devuelve las carpetas con `id: null`. */
  id?: string | null;
};

/**
 * El valor guardado en la base, pasado a ruta dentro del bucket.
 *
 * Existe porque las dos columnas que esta función compara guardan cosas
 * distintas:
 *
 *   · `archivos_mascota.ruta` guarda la ruta pelada —
 *     `{user_id}/{mascota_id}/{ts}-{rand}.pdf`.
 *   · `mascotas.foto` guarda una URL COMPLETA, porque `subirFoto`
 *     (api/axios.js:116) termina en `getPublicUrl`.
 *
 * Sin esta conversión, ninguna URL coincidiría con ningún `name` de
 * Storage y el barrido concluiría que TODAS las fotos de TODAS las
 * clínicas son huérfanas: todas las fotos de pacientes de todas las
 * clínicas que pagan, sin posibilidad de restaurarlas.
 *
 * Lo que no se entiende devuelve `null`, y el llamador descarta los nulls.
 * Un valor raro en la columna —alguien pegó un link de Drive— tiene que
 * dar "no sé", nunca una ruta a borrar.
 */
export function rutaDesdeValor(valor: string | null | undefined): string | null {
  if (!valor) return null;

  // Ruta pelada: no tiene esquema.
  if (!valor.startsWith('http')) return valor;

  // URL de Supabase Storage, pública o firmada:
  //   .../storage/v1/object/public/{bucket}/{ruta}
  //   .../storage/v1/object/sign/{bucket}/{ruta}?token=...
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)$/.exec(valor);
  if (!m) return null;

  // I1: `getPublicUrl` aplica `encodeURI` a la URL completa, pero
  // `storage.list()` devuelve el `name` crudo. Sin decodificar, un
  // archivo con un espacio o carácter no-ASCII en el nombre
  // (`ecografia.jpg (2)`) quedaría con `%20` en la ruta extraída y
  // no coincidiría con el `name` —se vería huérfano y se borraría.
  // El `try/catch` es por si algún valor corrupto no se puede decodificar;
  // en ese caso se devuelve null, que significa "no sé" y protege el archivo.
  try {
    return decodeURIComponent(m[1].split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * Los objetos del bucket que ninguna fila nombra, y que son lo bastante
 * viejos para que eso signifique algo.
 *
 * @param objetos       lo que devolvió `list()`, ya aplanado.
 * @param conocidas     las rutas que la base dice que existen. Puede traer
 *                      nulls; se descartan.
 * @param ahora         el momento de referencia. Se pasa en vez de llamar
 *                      a `new Date()` adentro para que la prueba pueda
 *                      fijarlo.
 * @param minutosGracia cuántos minutos tiene que tener un objeto para que
 *                      "no tiene fila" cuente como huérfano.
 *
 * LA VENTANA DE GRACIA ES LO QUE HACE QUE ESTO SE PUEDA CORRER SIN MIEDO.
 * El orden de la subida es bucket primero, fila después (ver POST
 * /archivos): entre las dos operaciones hay un rato —milisegundos en una
 * oficina, minutos con el internet de una clínica en Girón— en que el
 * objeto existe y la fila no. Sin gracia, el barrido borra el PDF que la
 * veterinaria está subiendo justo ahora, y en la pantalla la subida falla
 * sin un motivo que nadie pueda explicar.
 *
 * Un objeto SIN `created_at` se respeta, no se borra: no se puede saber si
 * está dentro de la ventana, y ante la duda no se borra.
 */
export function rutasHuerfanas(
  objetos: ObjetoStorage[],
  conocidas: (string | null | undefined)[],
  ahora: Date,
  minutosGracia: number,
): string[] {
  const vivas = new Set(
    conocidas.map(rutaDesdeValor).filter((r): r is string => !!r),
  );

  const corte = ahora.getTime() - minutosGracia * 60000;

  return objetos
    .filter((o) => {
      // Las carpetas vienen con `id: null`. No son archivos.
      // M1: `== null` cubre tanto `null` como `undefined`, por si la
      // librería alguna vez omite la clave en vez de mandarla en null.
      if (o.id == null) return false;
      if (!o.name) return false;
      // M5: el Dashboard crea un objeto `.emptyFolderPlaceholder` al
      // "crear carpeta" (comportamiento del Dashboard, no verificado
      // contra este repo). Ninguna fila lo nombra, así que el barrido lo
      // lanzaría como huérfano y metería ruido en el reporte que hay que
      // revisar a ojo. Borrarlo no rompe nada, pero el reporte de una
      // función que borra archivos tiene que ser legible. Se filtra acá
      // —en `huerfanos.ts` y no en `index.ts`— porque "qué cuenta como
      // huérfano" es la pregunta que este archivo contesta, y ahí se
      // puede probar.
      if (o.name.endsWith('.emptyFolderPlaceholder')) return false;
      if (!o.created_at) return false;

      const nacio = new Date(o.created_at).getTime();
      // Una fecha que no se puede leer cae del lado de "no se borra".
      if (Number.isNaN(nacio)) return false;
      // `>=` y no `>`: el que está justo en el borde se respeta. La duda
      // siempre para el mismo lado.
      if (nacio >= corte) return false;

      return !vivas.has(o.name);
    })
    .map((o) => o.name);
}
