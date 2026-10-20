// ============================================================
// VetaApp · importador/escribir.js
// Lo único de todo el importador que habla con la base.
//
// ---------- POR QUÉ EL REGISTRO SE ABRE ANTES ----------
// La fila de `importaciones` se crea en una llamada aparte, ANTES de
// escribir nada. Si se creara adentro de aplicar_importacion, una llamada
// que revienta se lleva el registro con ella: no quedaría ni rastro de que
// alguien intentó importar algo, y un import que nadie registró no se puede
// ni diagnosticar ni limpiar.
//
// Así, si el wifi se corta entre abrir y aplicar, queda una fila en
// 'en_curso' con cero filas colgadas. Eso se puede mirar y entender.
//
// ---------- NO HAY REINTENTO AUTOMÁTICO CIEGO ----------
// `aplicar_importacion` es una sola transacción: si revienta, no quedó nada
// escrito. El peligro es el otro caso: la llamada llegó y Postgres la
// commiteó, y lo que se perdió fue la respuesta (wifi, portátil cerrado,
// túnel caído). Para el navegador eso es indistinguible de un fallo.
//
// Si el usuario reintenta y reenviamos el mismo plan, los tutores y mascotas
// se duplican: el plan se calculó contra la foto de ANTES de escribir, y la
// función no deduplica crear_tutores ni crear_mascotas. Por eso yaEscribio()
// cuenta filas por importacion_id antes de reenviar, y aplicar() frena si
// ya hay algo.
// ============================================================

import { supabase } from '../lib/supabase.js';

// Solo lo que sirve para emparejar Y para decidir qué está vacío. Nada más:
// `foto` son kilobytes por mascota, y una base de 300 clientes se baja
// entera cada vez que alguien abre el importador.
const COLS_DUENOS   = 'id, nombre, telefono, telefono2, cedula, direccion';
const COLS_MASCOTAS = 'id, dueno_id, nombre, raza, fecha_nacimiento, edad_anios, edad_meses';
const COLS_TRATAM   = 'mascota_id, tipo, fecha';
const COLS_VACUNAS  = 'mascota_id, nombre, fecha_aplicacion';

const reventar = (error, que) => {
  if (!error) return;
  // El mensaje crudo de Postgres no le dice nada a nadie en el mostrador.
  throw new Error(`${que}: ${error.message}`);
};

/**
 * Lo que la cuenta ya tiene. RLS filtra por user_id solo: no hace falta
 * ningún where acá, y no se pone uno a propósito — sería un segundo lugar
 * donde se puede equivocar el aislamiento entre clínicas.
 */
export async function traerExistentes() {
  const [d, m, t, v] = await Promise.all([
    supabase.from('duenos').select(COLS_DUENOS),
    supabase.from('mascotas').select(COLS_MASCOTAS),
    supabase.from('tratamientos').select(COLS_TRATAM),
    supabase.from('vacunas').select(COLS_VACUNAS),
  ]);

  reventar(d.error, 'No se pudieron leer los clientes que ya tenés');
  reventar(m.error, 'No se pudieron leer las mascotas que ya tenés');
  reventar(t.error, 'No se pudo leer el historial de tratamientos');
  reventar(v.error, 'No se pudo leer el historial de vacunas');

  return {
    duenos: d.data ?? [],
    mascotas: m.data ?? [],
    tratamientos: t.data ?? [],
    vacunas: v.data ?? [],
  };
}

/**
 * Abre el registro. Queda en 'en_curso' por el default de la tabla.
 *
 * `mapeo` se guarda acá y no al final: sirve para que el día que suba el
 * mismo archivo actualizado la app le proponga el mapeo de la vez pasada en
 * vez de hacerla elegir de nuevo. Si el import falla, el mapeo igual queda
 * — y es justo cuando más sirve, porque va a volver a intentar.
 */
export async function abrirImportacion({ archivo, hoja, mapeo }) {
  // `estado` no se manda: el default de la tabla es 'en_curso'. Repetirlo
  // acá sería un segundo lugar donde se puede desincronizar.
  const { data, error } = await supabase
    .from('importaciones')
    .insert({ archivo, hoja: hoja ?? null, mapeo: mapeo ?? {} })
    .select('id')
    .single();

  reventar(error, 'No se pudo abrir el registro de la importación');
  return data.id;
}

/**
 * Si esta importación ya escribió algo en la base.
 *
 * Es la única evidencia que tiene el navegador de que la llamada anterior
 * llegó. `aplicar_importacion` es una transacción: si reventó no quedó
 * nada. Pero si commiteó y lo que se perdió fue la respuesta —wifi, portátil
 * cerrado, túnel caído— para acá es igual a un fallo, y reenviar el mismo
 * plan duplica la base entera: el plan se calculó contra la foto de antes
 * de escribir, y 013 no deduplica crear_tutores ni crear_mascotas.
 *
 * Cuenta las CUATRO tablas que llevan `importacion_id` (012:50), y no solo
 * `duenos` y `mascotas`. Dos razones encadenadas:
 *
 *  - Un archivo que solo le agrega mascotas a clientes que ya existían
 *    escribe 0 dueños y N mascotas. Contar solo dueños diría "no escribió
 *    nada" y duplicaría cada mascota.
 *  - Y un archivo cuyos tutores Y mascotas ya existen —el segundo archivo de
 *    la misma clínica, el que trae las visitas del mes— escribe 0 dueños, 0
 *    mascotas y N tratamientos. Con dos tablas, una importación con 74 baños
 *    adentro se reportaba como "no escribió nada": marcarFallida la cerraba
 *    en 'fallido' contradiciendo sus propias filas, y el reintento pasaba el
 *    tapón. No duplicaba —013 deduplica eventos por mascota+tipo+fecha— pero
 *    el estado de la fila mentía sobre su contenido.
 *
 * Con las cuatro, ese caso ya no ocurre, y el botón de Deshacer de la fila
 * 'fallido' NO se apoya en él: se apoya en lo que queda después —la carrera
 * del recuento contra el commit, y el recuento que falla por la misma
 * conexión caída—. El argumento completo vive en `sePuedeDeshacer`.
 *
 * Las cuatro tienen `id` (001_init.sql:50, :75) y las cuatro van con
 * `head: true`, así que esto son cuatro conteos y cero filas bajadas.
 */
export async function yaEscribio(importacionId) {
  const cuenta = (tabla) => supabase.from(tabla)
    .select('id', { count: 'exact', head: true })
    .eq('importacion_id', importacionId);

  const [d, m, t, v] = await Promise.all([
    cuenta('duenos'), cuenta('mascotas'), cuenta('tratamientos'), cuenta('vacunas'),
  ]);

  reventar(d.error, 'No se pudo verificar si la importación ya había escrito');
  reventar(m.error, 'No se pudo verificar si la importación ya había escrito');
  reventar(t.error, 'No se pudo verificar si la importación ya había escrito');
  reventar(v.error, 'No se pudo verificar si la importación ya había escrito');

  return {
    duenos: d.count ?? 0, mascotas: m.count ?? 0,
    tratamientos: t.count ?? 0, vacunas: v.count ?? 0,
  };
}

/** Si alguno de los cuatro contadores de `yaEscribio` trae algo. */
const escribioAlgo = (ya) => !!(ya.duenos || ya.mascotas || ya.tratamientos || ya.vacunas);

/**
 * El paso 4. Una llamada, una transacción: o entra todo o no entra nada.
 */
export async function aplicar(importacionId, envio, resumen) {
  // Primero el tapón del reintento: ver yaEscribio(). Va antes de guardar
  // el resumen porque si la llamada anterior ya entró, esta fila no se
  // toca más.
  const ya = await yaEscribio(importacionId);
  if (escribioAlgo(ya)) {
    throw new Error(
      `La importación ${importacionId} ya entró: tiene ${ya.duenos} ` +
      `clientes, ${ya.mascotas} mascotas y ${ya.tratamientos + ya.vacunas} ` +
      'eventos colgados. No la vuelvo a mandar para no duplicarte la base. ' +
      'Mirá el historial de importaciones; si quedó a medias, deshacela ' +
      'desde ahí y volvé a subir el archivo.',
    );
  }

  // El resumen va ANTES de escribir. Es lo que la clínica vio en el paso 3,
  // y si la escritura falla el porqué tiene que quedar igual: seis meses
  // después poder leer por qué "Nube" quedó sin fecha de nacimiento es la
  // diferencia entre entenderlo y pensar que la app se la comió.
  const guardado = await supabase
    .from('importaciones')
    .update({ resumen: resumen ?? {} })
    .eq('id', importacionId);
  reventar(guardado.error, 'No se pudo guardar el resumen de la importación');

  const { data, error } = await supabase.rpc('aplicar_importacion', {
    plan: { ...envio, importacion_id: importacionId },
  });

  if (error) {
    // Acá NO se puede afirmar "no entró nada", y eso es lo que decía.
    //
    // El fallo de transporte y el de Postgres llegan por el mismo `error`:
    // supabase-js no los distingue. El caso peligroso es el que describe la
    // cabecera de este archivo —Postgres commiteó y lo que se perdió fue la
    // respuesta—, y ahí "no entró nada: podés volver a intentar" era falso
    // palabra por palabra, y era además la frase que empujaba al segundo
    // intento. Tercera aparición de la misma clase de defecto en esta rama.
    //
    // Entonces se le pregunta a la base antes de hablar. Si el conteo también
    // falla, `ya` queda en null y se usa el mensaje prudente: no se cambia
    // una afirmación falsa por otra.
    const ya = await yaEscribio(importacionId).catch(() => null);
    if (ya && escribioAlgo(ya)) {
      throw new Error(
        `Se perdió la respuesta de la importación ${importacionId}, pero SÍ ` +
        `entró: quedaron escritos ${ya.duenos} clientes, ${ya.mascotas} ` +
        `mascotas y ${ya.tratamientos + ya.vacunas} eventos. NO vuelvas a ` +
        'subir el archivo. Mirá el historial de importaciones, y si quedó a ' +
        'medias deshacela desde ahí.',
      );
    }
    throw new Error(
      `No se pudo escribir la importación ${importacionId}: ${error.message}. ` +
      'Si fue un corte de conexión puede que igual haya entrado: antes de ' +
      'volver a subir el archivo, mirá el historial de importaciones.',
    );
  }

  return data;
}

/**
 * Cierra el registro de una que falló.
 *
 * NO tira nunca. Si tirara, taparía el error de verdad que la pantalla
 * tiene que mostrar — y el import ya falló: que el registro quede en
 * 'en_curso' es menos grave que no saber por qué falló.
 *
 * **Pasale siempre el `resumen`.** El `update` de Supabase reemplaza la
 * columna jsonb entera, no la mezcla, así que llamarla sin el tercer
 * argumento borra el resumen que `aplicar` guardó antes de intentar — y ése
 * es justo el dato que sirve cuando algo falla: qué se le mostró a quien
 * confirmó. No se puede recuperar acá sin leer la fila primero, y eso sería
 * una llamada más sobre una conexión que ya demostró estar fallando.
 */
export async function marcarFallida(importacionId, mensaje, resumen = {}) {
  try {
    // Si la importación de verdad entró, esto NO se marca como fallida.
    // El caso es la respuesta perdida: Postgres commiteó —y dejó la clave
    // 'escrito' adentro de `resumen` con los contadores reales— pero el
    // navegador no recibió la respuesta y para él fue un fallo. Escribir
    // 'fallido' acá pondría el registro en un estado que contradice las
    // filas que sí están colgadas, y el update plano borraría 'escrito' de
    // paso. Mejor dejar la fila como la dejó Postgres: el tapón de
    // `aplicar` ya frena el reintento y el historial muestra lo que entró.
    const ya = await yaEscribio(importacionId);
    if (escribioAlgo(ya)) {
      console.warn(
        `[importador] la importación ${importacionId} sí escribió ` +
        `(${ya.duenos} clientes, ${ya.mascotas} mascotas, ` +
        `${ya.tratamientos + ya.vacunas} eventos): no la marco como fallida. ` +
        'Se perdió la respuesta, no la escritura.',
      );
      return;
    }

    const { error } = await supabase
      .from('importaciones')
      .update({
        estado: 'fallido',
        // El resumen del paso 3 viaja de nuevo y se funde con el error.
        // Escribir solo `{ error }` pisaría el jsonb que `aplicar` guardó
        // antes de intentar, y ése es justo el dato que sirve cuando algo
        // falla: qué se le mostró a quien confirmó. `update` reemplaza la
        // columna entera, no la mezcla, así que la mezcla se hace acá —
        // leer la fila primero sería una llamada más sobre una conexión
        // que ya demostró estar fallando.
        resumen: { ...resumen, error: String(mensaje ?? 'sin detalle') },
        cerrado_en: new Date().toISOString(),
      })
      .eq('id', importacionId);
    if (error) console.warn('[importador] no se pudo marcar como fallida:', error.message);
  } catch (e) {
    console.warn('[importador] no se pudo marcar como fallida:', e?.message);
  }
}

/** El historial, lo más nuevo arriba. */
export async function listarImportaciones() {
  const { data, error } = await supabase
    .from('importaciones')
    .select('id, archivo, hoja, estado, resumen, creado_en, cerrado_en')
    .order('creado_en', { ascending: false });

  reventar(error, 'No se pudo leer el historial de importaciones');
  return data ?? [];
}

/**
 * Una sola importación, para la pantalla de detalle del historial.
 *
 * Existe para que ninguna pantalla tenga que hablarle a Supabase por su
 * cuenta: este archivo es el único lugar del importador que conoce nombres
 * de tablas y de columnas, y si una pantalla los repite se vuelven dos
 * lugares que se pueden desincronizar. Filtrar `listarImportaciones()` sería
 * bajar el historial entero para mostrar una fila.
 *
 * Trae `anteriores`, que la lista no trae: es lo que el import pisó al
 * completar, y en el detalle sirve para poder decir qué se va a devolver si
 * se deshace.
 */
export async function obtenerImportacion(importacionId) {
  const { data, error } = await supabase
    .from('importaciones')
    .select('id, archivo, hoja, estado, mapeo, resumen, anteriores, creado_en, cerrado_en')
    .eq('id', importacionId)
    .single();

  reventar(error, 'No se pudo leer la importación');
  return data;
}

/**
 * Deshacer. Toda la lógica —qué se borra y qué no— está en Postgres, que es
 * el único lugar donde se puede mirar si una mascota tiene algo encima
 * adentro de la misma transacción en la que se decide borrarla.
 */
export async function deshacer(importacionId) {
  const { data, error } = await supabase.rpc('deshacer_importacion', {
    p_importacion: importacionId,
  });
  // El mensaje de la función ya está en español y explica el caso ("ya se
  // deshizo"), así que pasa tal cual en vez de envolverlo en otro.
  if (error) throw new Error(error.message);
  return data;
}
