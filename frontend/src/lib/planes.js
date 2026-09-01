// ============================================================
//  Qué incluye cada plan, en un solo lugar.
//
//  ---------- LA VERDAD NO ESTÁ AQUÍ ----------
//  Quien decide de verdad quién ve qué es tiene_modulo() en
//  006_avisos.sql, porque las políticas RLS la llaman. Este archivo es un
//  espejo para poder PINTAR la diferencia: menús, pantallas de "no
//  incluido" y el panel de admin. Desde la consola del navegador
//  cualquiera puede cambiar lo que dice este archivo y no consigue un
//  solo registro de más.
//
//  El espejo existía ya, pero repartido: MODULOS_POR_PLAN en
//  AuthContext.jsx y otra lista distinta escrita a mano en Landing.jsx.
//  Dos copias de la misma verdad se separan solas; ésta es la única.
//
//  ---------- SI CAMBIA UN MÓDULO DE PLAN ----------
//  Se toca tiene_modulo() PRIMERO (es lo que manda) y después este
//  archivo. Al revés se consigue una app que promete lo que la base
//  niega, que es la peor de las dos fallas: el cliente paga y no lo ve.
// ============================================================

/**
 * Los tres planes. Los `id` son los que están cableados en la base:
 * el check perfiles_plan_check (004_planes.sql:31), tiene_modulo(),
 * abrir_pago() y el `plan` guardado de cada cuenta viva.
 *
 * Que el id diga 'fichas' y en pantalla se lea 'Esencial' es a propósito
 * (009_nombres_planes.sql): renombrar el id sería una migración con
 * riesgo de dejar veterinarias fuera de su propio plan, a cambio de nada
 * que el usuario vea.
 */
export const PLANES = [
  { id: 'fichas',      nombre: 'Esencial' },
  { id: 'completo',    nombre: 'Avanzado' },
  { id: 'facturacion', nombre: 'Facturación', aunNoSeVende: true },
];

export const nombrePlan = (id) =>
  PLANES.find((p) => p.id === id)?.nombre ?? id;

/**
 * Lo que trae CUALQUIER plan, incluido el más barato.
 *
 * No está en tiene_modulo() porque allí cae en el `else true`: no son
 * módulos que se puedan comprar aparte, son la aplicación. Se listan
 * aquí para poder decirle al cliente qué recibe aunque pague lo mínimo.
 */
export const MODULOS_BASE = [
  'Mascotas y dueños',
  'Historias clínicas',
  'Citas y calendario',
  'Vacunas y control de dosis',
  'Descarga de tus datos en CSV',
];

/**
 * Los módulos que SÍ dependen del plan. Copiado de tiene_modulo():
 *
 *   inventario    → completo, facturacion
 *   caja          → completo, facturacion
 *   recordatorios → completo, facturacion
 *   facturacion   → facturacion
 *
 * `porQue` explica para qué sirve, en la lengua del cliente y no en la
 * del código: sirve tanto para el panel de admin como para responderle a
 * una veterinaria que pregunta por qué le conviene subir de plan.
 */
export const MODULOS = [
  {
    id: 'inventario',
    titulo: 'Inventario',
    porQue: 'Medicamentos, vacunas e insumos con alerta cuando algo se está acabando.',
    planes: ['completo', 'facturacion'],
  },
  {
    id: 'caja',
    titulo: 'Caja y reportes',
    porQue: 'Registrar cobros, imprimir recibos y ver cuánto entró en el mes.',
    planes: ['completo', 'facturacion'],
  },
  {
    id: 'recordatorios',
    titulo: 'Recordatorios por WhatsApp',
    porQue: 'La lista de quién debe una dosis y el mensaje listo para enviar.',
    planes: ['completo', 'facturacion'],
  },
  {
    id: 'facturacion',
    titulo: 'Facturación electrónica DIAN',
    porQue: 'Facturar ante la DIAN desde la aplicación.',
    planes: ['facturacion'],
    aunNoExiste: true,
  },
];

/** El mapa plano que consume tieneModulo() en AuthContext. */
export const MODULOS_POR_PLAN = PLANES.reduce((acc, { id }) => {
  acc[id] = MODULOS.filter((m) => m.planes.includes(id)).map((m) => m.id);
  return acc;
}, {});

/** ¿El plan `plan` incluye el módulo `modulo`? Solo para pintar. */
export const planIncluye = (plan, modulo) =>
  (MODULOS_POR_PLAN[plan] ?? []).includes(modulo);
