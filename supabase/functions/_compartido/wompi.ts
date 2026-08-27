// ============================================================
//  Lo que ambas funciones necesitan saber de Wompi.
//
//  Wompi usa DOS secretos distintos y es fácil confundirlos, así que
//  aquí quedan separados a propósito:
//
//    · integrity secret → firma lo que MANDAMOS (el monto del checkout).
//      Sin él, cualquiera edita la URL y paga $1.000 por el plan de
//      $99.000.
//    · events secret    → verifica lo que RECIBIMOS (el webhook).
//      Sin él, cualquiera nos hace un POST diciendo "aprobado" y se
//      activa el plan gratis.
//
//  Ninguno de los dos puede pisar el navegador. Por eso esto vive en
//  una Edge Function y no en React.
// ============================================================

/** SHA256 en hex. Deno trae Web Crypto, no hace falta dependencia. */
export async function sha256(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compara dos hashes sin filtrar por cuánto tardó.
 *
 * Un `a === b` normal corta en el primer byte distinto, y ese tiempo se
 * puede medir: con suficientes intentos se adivina el checksum byte por
 * byte. Aquí siempre se recorre todo.
 */
export function igualdadConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * Firma de integridad del Web Checkout.
 *   SHA256(referencia + montoEnCentavos + moneda + [expiracion] + secreto)
 * La expiración solo entra si se manda el parámetro expiration-time.
 */
export function firmaIntegridad(
  referencia: string,
  centavos: number | bigint,
  moneda: string,
  secreto: string,
  expiracion?: string,
): Promise<string> {
  return sha256(`${referencia}${centavos}${moneda}${expiracion ?? ''}${secreto}`);
}

/**
 * Saca un valor de un objeto siguiendo una ruta con puntos
 * ("transaction.status" → obj.transaction.status).
 *
 * Wompi manda en signature.properties las rutas que entraron en el
 * checksum, y la documentación avisa que esa lista PUEDE CAMBIAR según
 * el evento. Por eso se resuelve dinámicamente en vez de asumir que
 * siempre son id/status/amount_in_cents: si Wompi agrega un campo y
 * nosotros lo tenemos quemado, todos los webhooks empiezan a fallar la
 * verificación y nadie puede pagar.
 */
export function porRuta(obj: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>(
    (acc, parte) => (acc == null ? undefined : (acc as Record<string, unknown>)[parte]),
    obj,
  );
}

/**
 * ¿El evento viene de verdad de Wompi?
 *
 * checksum = SHA256(valores de signature.properties + timestamp + eventsSecret)
 *
 * Esta es la ÚNICA autenticación del webhook. Wompi no manda un JWT
 * nuestro, así que el endpoint es público: si esta función devuelve
 * false, no se toca la base de datos.
 */
export async function eventoEsAutentico(
  evento: {
    data?: unknown;
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  },
  eventsSecret: string,
): Promise<boolean> {
  const props = evento?.signature?.properties;
  const checksum = evento?.signature?.checksum;
  if (!Array.isArray(props) || props.length === 0 || !checksum) return false;
  if (evento.timestamp == null) return false;

  let concatenado = '';
  for (const ruta of props) {
    const valor = porRuta(evento.data, ruta);
    // Un campo firmado que llega vacío es señal de que el cuerpo no es
    // el que Wompi firmó. Mejor rechazar que concatenar "undefined".
    if (valor === undefined || valor === null) return false;
    concatenado += String(valor);
  }
  concatenado += String(evento.timestamp) + eventsSecret;

  return igualdadConstante(await sha256(concatenado), String(checksum).toLowerCase());
}

/** Estados que Wompi puede mandar, traducidos a los de la tabla `pagos`. */
export function estadoParaLaBase(estadoWompi: string): 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | null {
  switch (estadoWompi) {
    case 'APPROVED': return 'APPROVED';
    case 'DECLINED': return 'DECLINED';
    case 'VOIDED':   return 'VOIDED';
    case 'ERROR':    return 'ERROR';
    // PENDING no se guarda: la fila ya nació en 'PENDIENTE' y la tabla
    // no acepta 'PENDING' (perfiles_pagos_estado_check). Escribirlo
    // reventaría la transacción y Wompi reintentaría para siempre.
    default: return null;
  }
}
