// ============================================================
//  pago-iniciar — abre un pago y devuelve el link del checkout
//
//  El navegador dice QUÉ PLAN quiere y por CUÁNTOS MESES. Nada más.
//  El precio lo pone la base de datos (planes_precios) y la firma la
//  pone esta función con el integrity secret.
//
//  Es la parte que no puede vivir en React: si el frontend calculara el
//  monto o firmara, el secreto estaría en el bundle y cualquiera pagaría
//  $1.000 por el plan de $99.000. Ese es todo el motivo por el que
//  VetaApp pasa de ser puro estático a tener servidor.
//
//  Desplegar:
//    supabase functions deploy pago-iniciar
//  Secretos que necesita (supabase secrets set ...):
//    WOMPI_PUBLIC_KEY        pub_prod_... o pub_test_... (no es secreto,
//                            pero se guarda aquí para no tener que
//                            reconstruir el frontend al cambiar de
//                            sandbox a producción)
//    WOMPI_INTEGRITY_SECRET  el que firma el monto. NUNCA al frontend.
//    APP_URL                 https://vetaapp.emmanuelvargas172.workers.dev
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { firmaIntegridad } from '../_compartido/wompi.ts';

const CHECKOUT = 'https://checkout.wompi.co/p/';
const MONEDA = 'COP';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const PUBLIC_KEY = Deno.env.get('WOMPI_PUBLIC_KEY');
  const INTEGRITY = Deno.env.get('WOMPI_INTEGRITY_SECRET');
  const APP_URL = Deno.env.get('APP_URL');

  // Sin llaves no se inventa nada: se dice claro que el cobro no está
  // configurado todavía. Así la función se puede desplegar antes de
  // tener la cuenta de comercio sin que el botón mienta.
  if (!PUBLIC_KEY || !INTEGRITY || !APP_URL) {
    return responder({ error: 'El cobro en línea no está configurado todavía.' }, 503);
  }

  // ---------- ¿quién pide? ----------
  // Se valida el token del usuario contra Supabase, no se confía en
  // ningún user_id que venga en el cuerpo. Si se confiara, cualquiera
  // abriría pagos a nombre de otro.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return responder({ error: 'Falta la sesión' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data: sesion, error: errSesion } = await comoUsuario.auth.getUser();
  if (errSesion || !sesion?.user) return responder({ error: 'Sesión inválida' }, 401);
  const usuario = sesion.user;

  // ---------- ¿qué pide? ----------
  let cuerpo: { plan?: string; meses?: number };
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: 'Cuerpo inválido' }, 400);
  }

  const plan = String(cuerpo.plan ?? '');
  const meses = Number.isInteger(cuerpo.meses) ? Number(cuerpo.meses) : 1;

  // Se valida acá además de en la base para dar un error legible; la
  // base vuelve a validar igual porque es la que manda.
  if (!['fichas', 'completo', 'facturacion'].includes(plan)) {
    return responder({ error: 'Plan inválido' }, 400);
  }
  if (meses < 1 || meses > 24) {
    return responder({ error: 'Meses fuera de rango' }, 400);
  }

  // ---------- abrir el pago ----------
  // service_role porque abrir_pago() está revocada para authenticated
  // (ver 007_pagos.sql): el cliente no puede crear filas en `pagos` ni
  // decidir montos, ni siquiera llamando a la función directamente.
  const comoServidor = createClient(url, service);
  const { data, error } = await comoServidor.rpc('abrir_pago', {
    p_user_id: usuario.id,
    p_plan: plan,
    p_meses: meses,
  });

  if (error) {
    console.error('[pago-iniciar] abrir_pago falló:', error.message);
    // El mensaje de la base es legible a propósito ("El plan X no está
    // a la venta todavía"), así que se pasa tal cual.
    return responder({ error: error.message }, 400);
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.referencia) {
    return responder({ error: 'No se pudo abrir el pago' }, 500);
  }

  const centavos = Number(fila.monto_centavos);
  const referencia = String(fila.referencia);

  // ---------- firmar y armar el link ----------
  const firma = await firmaIntegridad(referencia, centavos, MONEDA, INTEGRITY);

  const params = new URLSearchParams({
    'public-key': PUBLIC_KEY,
    currency: MONEDA,
    'amount-in-cents': String(centavos),
    reference: referencia,
    'signature:integrity': firma,
    'redirect-url': `${APP_URL}/app/pago`,
    'customer-data:email': usuario.email ?? '',
  });

  return responder({
    url: `${CHECKOUT}?${params.toString()}`,
    referencia,
    monto_centavos: centavos,
    plan: fila.plan,
    meses: fila.meses,
  });
});
