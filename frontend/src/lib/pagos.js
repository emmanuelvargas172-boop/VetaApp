import { supabase } from './supabase';

// ============================================================
//  El lado del navegador del cobro.
//
//  Acá NO se calcula ningún monto ni se firma nada. El frontend pide un
//  plan y recibe un link ya firmado por la Edge Function pago-iniciar.
//  Todo lo que se pudiera calcular aquí, cualquiera lo puede cambiar
//  con F12 — por eso el precio vive en planes_precios y la firma en el
//  servidor.
// ============================================================

/** $99.000 a partir de 9900000 centavos. */
export const enPesos = (centavos) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(centavos || 0) / 100);

/**
 * Los planes que hoy se pueden comprar.
 *
 * Salen de la base y no de una constante del frontend para que subir un
 * precio no obligue a reconstruir y desplegar la app. `activo = false`
 * (hoy, Facturación) no llega: no se puede cobrar un módulo que todavía
 * no existe.
 */
export async function planesALaVenta() {
  const { data, error } = await supabase
    .from('planes_precios')
    .select('plan, precio_centavos, nombre_visible')
    .eq('activo', true)
    .order('precio_centavos', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Pide el link del checkout.
 *
 * Devuelve la URL de Wompi ya firmada. El navegador solo manda qué plan
 * y cuántos meses; el user_id sale del token, no del cuerpo.
 */
export async function iniciarPago(plan, meses = 1) {
  const { data, error } = await supabase.functions.invoke('pago-iniciar', {
    body: { plan, meses },
  });

  if (error) {
    // functions.invoke tira TRES errores distintos y solo uno trae cuerpo.
    // Verificado en @supabase/functions-js/dist/module/FunctionsClient.js:
    //
    //   línea 264  .catch(fetchError => throw new FunctionsFetchError(...))
    //              → context = el error de fetch pelado, NO una Response.
    //   línea 271  if (!response.ok) throw new FunctionsHttpError(response)
    //              → context SÍ es una Response, se le puede pedir .json().
    //
    // Antes esto solo contemplaba el segundo. Cuando la función no está
    // desplegada, el navegador no recibe respuesta con CORS y el fetch
    // falla, así que caía al `error.message` crudo y la veterinaria veía
    // "Failed to send a request to the Edge Function" — en inglés y sin
    // ninguna pista de qué hacer.
    if (error.name === 'FunctionsFetchError') {
      throw new Error(
        'No pudimos conectarnos con el servicio de pagos. Revisa tu internet ' +
        'e inténtalo de nuevo; si sigue igual, escríbenos por WhatsApp y te ' +
        'activamos el plan a mano.',
      );
    }

    // Http y Relay sí pueden traer un cuerpo JSON que la función escribió
    // a propósito (por ejemplo el 503 "El cobro en línea no está
    // configurado todavía"). Ese texto es mejor que cualquier genérico.
    let detalle = error.message;
    try {
      const cuerpo = await error.context?.json?.();
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch {
      /* la respuesta no era JSON: se queda el mensaje genérico */
    }
    throw new Error(detalle);
  }

  if (!data?.url) throw new Error('No se recibió el link de pago');
  return data;
}

/**
 * El último intento de pago de esta cuenta.
 *
 * La política de `pagos` deja leer solo las filas propias (007_pagos.sql),
 * así que esto es seguro tal cual. Lo usa la página de resultado para
 * saber si el webhook ya llegó.
 */
export async function ultimoPago() {
  const { data, error } = await supabase
    .from('pagos')
    .select('referencia, plan, meses, monto_centavos, estado, transaccion_id, creado_at')
    .order('creado_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
