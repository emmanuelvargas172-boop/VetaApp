// Edad calculada a partir de la fecha de nacimiento (migración 011).
//
// Por qué existe: `mascotas.edad_anios` / `edad_meses` guardan la edad del
// día en que alguien la escribió, y nada registra cuál fue ese día. Un año
// después están mal y no hay forma de saber cuáles. Con la fecha de
// nacimiento la edad se deriva y nunca se desactualiza.
//
// Las dos columnas de edad siguen existiendo: hay mascotas viejas que solo
// tienen la edad escrita a mano y nunca van a tener fecha de nacimiento.
// La fecha, cuando está, es la que manda.

// null cuando no hay con qué calcular, para que la UI pueda mostrar lo que
// haya escrito a mano en vez de un "0 años" que parece un dato.
//
// `hoy` entra por parámetro para poder probarlo sin depender del reloj.
export function edadDesde(fechaISO, hoy = new Date()) {
  const s = String(fechaISO || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [a, m, d] = s.split('-').map(Number);
  // Hora local a propósito: acá no hay zona horaria de por medio, y
  // `new Date('2021-06-01')` sí la tiene — se interpreta como UTC y en
  // Colombia retrocede al 31 de mayo.
  const nac = new Date(a, m - 1, d);

  // Rechaza fechas que no existen. El check de la migración solo verifica
  // la forma: "2026-02-31" pasa el regex y Postgres lo guarda como texto,
  // pero el Date se desborda a marzo.
  if (nac.getFullYear() !== a || nac.getMonth() !== m - 1 || nac.getDate() !== d) return null;

  const ref = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (nac > ref) return null; // nacimiento en el futuro: es un error de digitación

  let anios = ref.getFullYear() - a;
  let meses = ref.getMonth() - (m - 1);
  // Todavía no se cumple el mes: el día del mes de referencia es anterior.
  if (ref.getDate() < d) meses -= 1;
  if (meses < 0) { anios -= 1; meses += 12; }

  return { anios, meses };
}

// Texto para mostrar. Se escribe completo ("3 años, 2 meses") y no
// abreviado ("3a 2m") porque donde se usa es un campo de formulario en
// modo lectura, no una celda de tabla apretada.
export function textoEdad(edad) {
  if (!edad) return '';
  const { anios, meses } = edad;
  if (anios === 0 && meses === 0) return 'Recién nacida';
  const partes = [];
  if (anios) partes.push(`${anios} año${anios !== 1 ? 's' : ''}`);
  if (meses) partes.push(`${meses} mes${meses !== 1 ? 'es' : ''}`);
  return partes.join(', ');
}
