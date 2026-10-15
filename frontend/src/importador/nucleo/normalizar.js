// ============================================================
// VetaApp · importador/nucleo/normalizar.js
// Lo que hay que hacerle a una celda antes de que sea un dato.
//
// Cada función existe por un valor concreto que ya apareció en la hoja de
// una clínica real. Ninguna adivina: lo que no entiende lo manda a los
// avisos, que la clínica ve en el paso 3 antes de confirmar.
//
// El estado va por parámetro y no en variables del módulo porque esto
// corre en el navegador. Allá el módulo NO se muere entre una importación
// y la siguiente: con estado global, el segundo archivo arrancaría con
// los avisos del primero adentro y los contadores inflados.
// ============================================================

import { normalizarTelefonoCO } from '../../utils/whatsapp.js';

export function nuevoEstado() {
  return {
    avisos: [],
    fechasVistas: 0,
    fechasRotas: 0,
    razasDesconocidas: new Set(),
    sinRaza: 0,
  };
}

// `clase` separa dos cosas que la pantalla NO puede mostrar juntas:
// 'descarte' es una fila que no va a entrar, y 'dato' es algo raro de una
// fila que sí entra. En el paso 3 la primera va bajo "No voy a importar"
// y la segunda bajo los avisos. Si fueran la misma lista, la pantalla
// tendría que adivinar por el texto del mensaje cuál es cuál, y el día que
// alguien reescriba un mensaje el contador de filas perdidas se cae en
// silencio.
export const aviso = (estado, ctx, texto, clase = 'dato') =>
  estado.avisos.push({ fila: ctx.fila, hoja: ctx.hoja, texto, clase });

export const sinTildes = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// "12/09/2026 10:18:09", "07-07-2026", "22--04-2026" (doble guion, dato
// real), "1/06/2021" y "2018-07-26" → ISO o null.
export function fechaISO(estado, valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  estado.fechasVistas++;
  const malo = (texto) => { estado.fechasRotas++; aviso(estado, ctx, texto); return null; };

  const soloFecha = s.split(/\s+/)[0].replace(/[-.]+/g, '/').replace(/\/{2,}/g, '/');
  const partes = soloFecha.split('/').filter(Boolean);
  if (partes.length !== 3) return malo(`fecha ilegible en ${ctx.campo}: "${s}"`);

  // Cuál número es el año no se adivina: si el primero tiene cuatro cifras
  // solo puede ser el año, y si no, es el día (d/m/Y, que es como escribe
  // Google Forms en es-CO).
  let d, m, a;
  if (partes[0].length === 4) [a, m, d] = partes.map((p) => parseInt(p, 10));
  else                        [d, m, a] = partes.map((p) => parseInt(p, 10));
  if (a < 100) a += 2000;

  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 1990 && a <= 2100)) {
    return malo(`fecha fuera de rango en ${ctx.campo}: "${s}"`);
  }
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Verifica que el día exista de verdad: "31/02/2026" pasa los rangos.
  const prueba = new Date(a, m - 1, d);
  if (prueba.getMonth() !== m - 1 || prueba.getDate() !== d) {
    return malo(`fecha que no existe en ${ctx.campo}: "${s}"`);
  }
  return iso;
}

// Hora de la marca temporal, para `tratamientos.hora`. Es dato real: a esa
// hora se llenó el formulario.
export function horaDe(valor) {
  const m = String(valor ?? '').match(/\b(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// "40000", "$60.000", "88.000", "88.000 sí 72" → entero en pesos.
// Los puntos son separadores de miles, no decimales: en las hojas vistas
// no hay un solo precio con centavos y todos los valores con punto son de
// 5 ó 6 cifras ("35.000", "110.000").
export function pesos(estado, valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const token = s.split(/\s+/)[0];
  const n = parseInt(token.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) {
    aviso(estado, ctx, `costo ilegible: "${s}"`);
    return null;
  }
  // Lo que sobró después del primer token es texto que alguien escribió a
  // mano. No se pierde: queda en los avisos y en las notas del tratamiento.
  if (s !== token) aviso(estado, ctx, `costo con texto extra: "${s}" → se tomó ${n}`);
  if (n < 1000) aviso(estado, ctx, `costo sospechosamente bajo: "${s}" → ${n}`);
  return n;
}

// "3000000200-3000000201", "3000000202 - 3000000203", "" → [tel1, tel2].
// Valida con la MISMA función que usa la app para armar el enlace de
// WhatsApp, así no hay dos ideas de qué es un número válido.
export function telefonos(estado, valor, ctx) {
  const crudos = String(valor ?? '')
    .split(/[-/;,]| y | Y |\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const buenos = [];
  for (const c of crudos) {
    const n = normalizarTelefonoCO(c);
    if (n) { if (!buenos.includes(n)) buenos.push(n); }
    else aviso(estado, ctx, `teléfono que WhatsApp no acepta: "${c}"`);
  }
  if (!buenos.length && String(valor ?? '').trim()) {
    aviso(estado, ctx, `ningún teléfono usable en "${valor}"`);
  }
  return [buenos[0] ?? null, buenos[1] ?? null];
}

// "Clasico" / "Clásico" → una sola forma, con tilde, que es como se
// escribe. Sin esto la clínica vería dos servicios distintos.
export function tipoBano(valor) {
  const t = sinTildes(valor);
  if (!t) return null;
  if (t.startsWith('clasico'))  return 'Clásico';
  if (t.startsWith('hydra'))    return 'Hydra';
  if (t.startsWith('medicado')) return 'Medicado';
  return String(valor).trim(); // forma nueva: se respeta tal cual
}

// Cuántos campos útiles trae una fila. Es el criterio para decidir cuál
// gana cuando la misma mascota aparece dos veces.
export const riqueza = (r) => [
  r.cedula, r.tutor, r.direccion, r.tel1, r.tel2, r.mascota, r.raza,
  r.nacimiento, r.tipo_bano, r.costo, r.observaciones, r.ultima_vacuna, r.ultima_desp,
].filter((x) => x !== null && x !== '' && x !== undefined).length;
