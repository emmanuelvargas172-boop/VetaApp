// Módulo Caja: formato de dinero, catálogo de servicios y métodos de pago.
// Nunca usar la palabra "factura" en textos de interfaz: son recibos de
// control interno, no documentos fiscales.

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

export const fmtCOP = (n) => copFmt.format(Number(n) || 0);

// Precios de arranque. Se pueden editar en el formulario antes de cobrar,
// así que cada clínica ajusta sin tocar código.
export const SERVICIOS = [
  { id: 'consulta',       nombre: 'Consulta general',   precio: 35000 },
  { id: 'vacuna',         nombre: 'Vacuna',             precio: 25000 },
  { id: 'desparasitacion', nombre: 'Desparasitación',   precio: 20000 },
  { id: 'cirugia',        nombre: 'Cirugía',            precio: 150000 },
  { id: 'bano',           nombre: 'Baño y peluquería',  precio: 40000 },
];

export const METODOS_PAGO = [
  { id: 'efectivo',      label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'nequi',         label: 'Nequi' },
  { id: 'tarjeta',       label: 'Tarjeta' },
];

export const labelMetodo = (id) =>
  METODOS_PAGO.find((m) => m.id === id)?.label || id;

export const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

export const fmtFechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

// Fecha local en formato YYYY-MM-DD. No usar toISOString(): convierte a UTC
// y en Colombia (UTC-5) devuelve el día anterior antes de las 7 p.m.
export const isoLocal = (d = new Date()) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const sumar = (cobros) => cobros.reduce((a, c) => a + (Number(c.total) || 0), 0);
