// ============================================================
//  Cómo se llama y dónde se contacta VetaApp.
//
//  Todo lo que el cliente lee sobre "quiénes somos" sale de aquí:
//  el pie de la landing, la política de privacidad, los términos y el
//  botón de WhatsApp de las pantallas de bloqueo.
//
//  ---------- POR QUÉ EXISTE ESTE ARCHIVO ----------
//  El correo estaba escrito a mano en Landing.jsx y otra vez en
//  Legal.jsx, y el número de WhatsApp vivía en dos sitios a la vez: un
//  literal en Landing.jsx y la variable VITE_SOPORTE_WHATSAPP que usan
//  PantallaBloqueo, ModuloNoIncluido y Pago. Dos copias de un dato de
//  contacto es cómo se termina con una veterinaria escribiendo a un
//  número viejo.
//
//  El día que haya dominio propio se cambian las constantes de abajo y
//  no hay que buscar nada por el proyecto.
// ============================================================

export const MARCA = 'VetaApp';

/**
 * El dominio real, el que sale en la barra del navegador.
 *
 * Hoy es el subdominio gratuito de Cloudflare y lleva el nombre de la
 * cuenta adentro. Se cambia comprando un dominio y conectándolo al
 * Worker (conectarlo no cuesta aparte; solo el dominio).
 *
 * Ojo: esto también tiene que coincidir con el secreto APP_URL de las
 * Edge Functions, que es el que autoriza el CORS del cobro y a dónde
 * vuelve el cliente desde el checkout. Si se cambia aquí y allá no, el
 * pago deja de funcionar.
 */
export const DOMINIO = 'vetaapp.veta-co.workers.dev';
export const URL_APP = `https://${DOMINIO}`;

/**
 * El correo que se publica.
 *
 * Ya no es el Gmail personal. Se cambió solo cuando el buzón existía de
 * verdad, no antes: la política de privacidad nombra esta dirección como
 * el canal para ejercer los derechos de la Ley 1581 de 2012, así que un
 * correo que rebota no es un detalle estético, es una promesa incumplida
 * por escrito.
 *
 * El prefijo es `hola` a propósito. El día que haya dominio propio pasa a
 * ser `hola@vetaapp.co` y la veterinaria no nota el cambio; con un
 * prefijo raro habría que reeducar a quien ya lo tenía guardado.
 */
export const EMAIL_CONTACTO = 'hola.vetaapp@gmail.com';

/**
 * WhatsApp de soporte. Solo dígitos, con indicativo, como lo exige wa.me.
 *
 * Sale de VITE_SOPORTE_WHATSAPP para poder cambiarlo sin tocar código;
 * el literal es el respaldo para que la landing nunca quede con un
 * enlace roto si falta el .env en algún build.
 */
const CRUDO = import.meta.env.VITE_SOPORTE_WHATSAPP || '573162906253';
export const WHATSAPP = CRUDO.replace(/\D/g, '');

/** El mismo número, como lo lee una persona. */
export const WHATSAPP_VISIBLE = WHATSAPP.startsWith('57')
  ? `+57 ${WHATSAPP.slice(2, 5)} ${WHATSAPP.slice(5, 8)} ${WHATSAPP.slice(8)}`
  : `+${WHATSAPP}`;

/** Enlace a WhatsApp, con mensaje opcional ya escrito. */
export const linkWhatsApp = (mensaje) =>
  `https://wa.me/${WHATSAPP}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
