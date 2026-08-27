// ============================================================
//  pago-webhook — recibe la confirmación de Wompi y activa el plan
//
//  Este endpoint es PÚBLICO: Wompi no puede mandar un token nuestro.
//  Su única autenticación es el checksum del evento, firmado con el
//  events secret. Si el checksum no cuadra, no se toca la base.
//
//  Y aun cuando cuadre, no se le cree nada más:
//    · el monto se compara contra el que se firmó al abrir el pago
//    · el plan y los meses salen de la fila guardada, no del mensaje
//    · reintentos del mismo evento no regalan meses (idempotente por
//      referencia, ver registrar_pago_aprobado en 007_pagos.sql)
//
//  Devolver siempre 200 cuando el evento es legítimo, aunque no haya
//  nada que hacer: si se devuelve error, Wompi reintenta durante días.
//  El 401 se reserva para lo que NO viene de Wompi.
//
//  Desplegar (el --no-verify-jwt es obligatorio: Supabase exige JWT por
//  defecto y Wompi no manda ninguno, así que sin esto todos los webhooks
//  rebotan con 401 antes de llegar al código):
//    supabase functions deploy pago-webhook --no-verify-jwt
//
//  Secretos:
//    WOMPI_EVENTS_SECRET   el que verifica lo que recibimos.
//
//  La URL resultante va en el panel de Wompi, en "URL de eventos":
//    https://<ref>.supabase.co/functions/v1/pago-webhook
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { eventoEsAutentico, estadoParaLaBase } from '../_compartido/wompi.ts';

const ok = (detalle: string) =>
  new Response(JSON.stringify({ ok: true, detalle }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 });
  }

  const EVENTS_SECRET = Deno.env.get('WOMPI_EVENTS_SECRET');
  if (!EVENTS_SECRET) {
    // Sin secreto no se puede verificar nada. Rechazar es lo correcto:
    // aceptar "por si acaso" sería justo el agujero que este endpoint
    // existe para tapar.
    console.error('[pago-webhook] falta WOMPI_EVENTS_SECRET');
    return new Response('No configurado', { status: 503 });
  }

  let evento: Record<string, unknown>;
  try {
    evento = await req.json();
  } catch {
    return new Response('Cuerpo inválido', { status: 400 });
  }

  // ---------- ¿viene de Wompi? ----------
  if (!(await eventoEsAutentico(evento as never, EVENTS_SECRET))) {
    console.warn('[pago-webhook] checksum inválido, evento descartado');
    return new Response('Firma inválida', { status: 401 });
  }

  if (evento.event !== 'transaction.updated') {
    return ok(`evento ignorado: ${String(evento.event)}`);
  }

  const tx = (evento.data as { transaction?: Record<string, unknown> })?.transaction;
  if (!tx?.reference) return ok('evento sin referencia');

  const estado = estadoParaLaBase(String(tx.status ?? ''));
  if (estado === null) {
    // PENDING y cualquier estado nuevo que Wompi invente: la fila ya
    // está en 'PENDIENTE', no hay nada que cambiar. 200 para que no
    // reintente.
    return ok(`estado sin efecto: ${String(tx.status)}`);
  }

  // ---------- aplicar ----------
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('registrar_pago_aprobado', {
    p_referencia: String(tx.reference),
    p_estado: estado,
    p_transaccion_id: tx.id ? String(tx.id) : null,
    p_monto_centavos: tx.amount_in_cents != null ? Number(tx.amount_in_cents) : null,
    p_metodo: tx.payment_method_type ? String(tx.payment_method_type) : null,
    p_payload: evento,
  });

  if (error) {
    // Acá sí conviene el 500: fue un fallo nuestro (base caída, por
    // ejemplo) y queremos que Wompi reintente.
    console.error('[pago-webhook] registrar_pago_aprobado falló:', error.message);
    return new Response('Error al registrar', { status: 500 });
  }

  // data es el texto que devuelve la función: activado / ya_aplicado /
  // monto_no_coincide / no_aprobado / desconocida. Se registra porque es
  // la única traza de por qué una cuenta quedó (o no) activa.
  console.log(`[pago-webhook] ${tx.reference} → ${data}`);
  return ok(String(data));
});
