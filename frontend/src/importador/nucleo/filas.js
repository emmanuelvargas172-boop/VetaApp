// ============================================================
// VetaApp · importador/nucleo/filas.js
// Una fila de la grilla → una fila con los datos ya limpios.
//
// Las cuatro fechas se leen UNA vez por fila y se reusan. Leerlas dos
// veces repetiría cada aviso y falsearía el contador que decide si la
// hoja entera viene en un formato que no reconocemos.
// ============================================================

import { aviso, fechaISO, horaDe, pesos, telefonos, tipoBano, clasificar } from './normalizar.js';

const siNo = (v) => /^s[ií]$/i.test(String(v ?? '').trim());

export function leerFilas(estado, { grilla, mapa, hoja }) {
  const salida = [];

  grilla.forEach((c, i) => {
    const nFila = i + 2; // +1 por el encabezado, +1 porque las hojas cuentan desde 1
    const get = (clave) => (mapa[clave] === undefined ? '' : String(c[mapa[clave]] ?? '').trim());
    const ctx = { fila: nFila, hoja };

    // La condición mira la fila ENTERA y no solo tutor+mascota, porque
    // una fila con teléfono y costo pero sin nombres sí es un problema:
    // es una visita que se cobró y que se iba a perder sin que nadie lo
    // supiera.
    if (c.every((x) => !String(x ?? '').trim())) return;

    const tutor = get('tutor');
    const mascota = get('mascota');
    if (!tutor || !mascota) {
      aviso(estado, ctx, `fila con datos pero sin nombres (tutor="${tutor}", mascota="${mascota}") → NO se importa, hay que mirarla en la hoja`, 'descarte');
      return;
    }

    const [tel1, tel2] = telefonos(estado, get('telefonos'), ctx);
    const nacimiento   = fechaISO(estado, get('nacimiento'),    { ...ctx, campo: 'fecha nacimiento' });
    const ts           = fechaISO(estado, get('ts'),            { ...ctx, campo: 'fecha del servicio' });
    const ultimaVacuna = fechaISO(estado, get('ultima_vacuna'), { ...ctx, campo: 'última vacuna' });
    const ultimaDesp   = fechaISO(estado, get('ultima_desp'),   { ...ctx, campo: 'última desparasitación' });

    if (nacimiento && ts && nacimiento === ts) {
      aviso(estado, ctx, `"${mascota}" nació el mismo día del registro (${ts}) — ¿es un recién nacido o se copió la fecha de hoy?`);
    }

    // Se descarta la FECHA, no el evento: lo que está probado es que el
    // nacimiento es falso. Sin fecha la mascota entra con edad 0 y un
    // campo vacío que la clínica puede llenar; con la fecha falsa entra
    // con "Recién nacida" en la ficha de un perro adulto, que se lee
    // como un dato cierto y de ahí sale una dosis.
    let nacimientoUsable = nacimiento;
    for (const [cual, f] of [['la última vacuna', ultimaVacuna], ['la última desparasitación', ultimaDesp]]) {
      // Comparar las ISO como texto alcanza: YYYY-MM-DD ordena igual
      // alfabéticamente que cronológicamente.
      if (nacimiento && f && f < nacimiento) {
        aviso(estado, ctx, `IMPOSIBLE: "${mascota}" tiene ${cual} el ${f}, anterior a su nacimiento (${nacimiento}) → la fecha de nacimiento está mal, se importa SIN ella`);
        nacimientoUsable = null;
      }
    }

    const { especie, raza } = clasificar(estado, get('raza'));
    const costoCrudo = get('costo');

    salida.push({
      nFila, hoja,
      cedula: get('cedula').replace(/\D/g, '') || null,
      tutor, direccion: get('direccion') || null, tel1, tel2,
      mascota, especie, raza,
      nacimiento: nacimientoUsable,
      ts, hora: horaDe(get('ts')),
      tipo_bano: tipoBano(get('tipo_bano')),
      costo: pesos(estado, costoCrudo, ctx), costoCrudo,
      observaciones: get('observaciones') || null,
      extra_vacuna: siNo(get('extra_vacuna')),
      extra_tos: siNo(get('extra_tos')),
      ultima_vacuna: ultimaVacuna,
      ultima_desp: ultimaDesp,
    });
  });

  return salida;
}

// Diez fechas malas sueltas son filas sucias. Quince de veinte es otra
// cosa: la hoja está en un formato que no reconocemos, y seguir dejaría
// un import entero sin una sola fecha.
export const formatoDeFechasRoto = (estado) =>
  estado.fechasVistas >= 10 && estado.fechasRotas > estado.fechasVistas / 2;
