// ============================================================
// VetaApp · importador/nucleo/mapear.js
// Qué columna del archivo es qué campo.
//
// La versión anterior reconocía los encabezados EXACTOS de una hoja
// ("nombre y apellidos del tutor"). Servía para esa clínica y para
// ninguna otra: la de al lado escribe "Propietario".
//
// Esto no tiene que acertar siempre. La clínica corrige el mapeo en el
// paso 2 antes de seguir. Tiene que acertar lo obvio y, sobre todo, NO
// inventar: una columna que no reconoce se queda fuera, no se mete al
// campo más parecido.
// ============================================================

import { sinTildes } from './normalizar.js';

// Las pistas van de la más específica a la más general. El orden no
// decide por sí solo —gana la que calza mejor, ver `puntaje`— pero deja
// claro cuál es el encabezado "de verdad" de cada campo.
export const CAMPOS = [
  { clave: 'tutor', etiqueta: 'Nombre del dueño', requerido: true,
    pistas: ['nombre y apellidos del tutor', 'nombre del tutor', 'nombre del cliente',
             'nombre del propietario', 'propietario', 'responsable', 'tutor', 'dueno', 'cliente'] },

  { clave: 'mascota', etiqueta: 'Nombre de la mascota', requerido: true,
    pistas: ['nombre completo de la mascota', 'nombre de la mascota', 'nombre del paciente',
             'nombre mascota', 'mascota', 'paciente', 'animal'] },

  { clave: 'cedula', etiqueta: 'Cédula',
    pistas: ['numero de documento', 'identificacion', 'documento', 'cedula', 'nit', 'cc'] },

  { clave: 'telefonos', etiqueta: 'Teléfono',
    pistas: ['contacto telefonos', 'numero de contacto', 'telefono', 'celular',
             'whatsapp', 'movil', 'contacto'] },

  { clave: 'direccion', etiqueta: 'Dirección',
    pistas: ['direccion y barrio', 'direccion', 'residencia', 'barrio'] },

  { clave: 'raza', etiqueta: 'Raza',
    pistas: ['raza o especie', 'raza', 'especie'] },

  { clave: 'nacimiento', etiqueta: 'Fecha de nacimiento',
    pistas: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'fecha de nac'] },

  { clave: 'ts', etiqueta: 'Fecha del servicio',
    pistas: ['marca temporal', 'fecha del servicio', 'fecha de atencion', 'fecha de ingreso', 'fecha'] },

  { clave: 'tipo_bano', etiqueta: 'Tipo de servicio',
    pistas: ['tipo de bano', 'tipo bano', 'tipo de servicio', 'servicio'] },

  { clave: 'costo', etiqueta: 'Costo',
    pistas: ['costo final del servicio', 'valor del servicio', 'costo', 'valor', 'precio', 'total'] },

  { clave: 'observaciones', etiqueta: 'Observaciones',
    pistas: ['otras observaciones', 'observaciones', 'observacion', 'comentario', 'nota'] },

  { clave: 'extra_vacuna', etiqueta: 'Contrató vacuna anual',
    pistas: ['extra [vacunas anual]', 'extra vacunas anual', 'vacuna anual'] },

  { clave: 'extra_tos', etiqueta: 'Contrató tos de las perreras',
    pistas: ['extra [tos de las perreras]', 'extra tos de las perreras', 'tos de las perreras'] },

  { clave: 'ultima_vacuna', etiqueta: 'Última vacuna',
    pistas: ['ultima vacuna', 'fecha ultima vacuna', 'vacuna'] },

  { clave: 'ultima_desp', etiqueta: 'Última desparasitación',
    pistas: ['ultima desparasitacion', 'fecha ultima desparasitacion', 'desparasitacion'] },
];

// Qué tan bien calza una pista con un encabezado. Devuelve `null` si no
// calza. El segundo número es el largo de la pista: entre dos pistas que
// calzan, gana la más específica. Eso es lo que evita que "Fecha
// nacimiento" se vaya a la fecha del servicio por la pista 'fecha'.
function puntaje(encabezado, pista) {
  if (encabezado === pista)            return [3, pista.length];
  if (encabezado.startsWith(pista))    return [2, pista.length];
  if (encabezado.includes(pista))      return [1, pista.length];
  return null;
}

export function mapearEncabezados(encabezados) {
  const limpios = encabezados.map(sinTildes);

  // Todas las combinaciones posibles, ordenadas de la que mejor calza a
  // la que peor. Se resuelve globalmente y no columna por columna: si se
  // decidiera en orden de aparición, la primera columna se quedaría con
  // un campo que le calza apenas y se lo robaría a otra que le calza
  // exacto.
  const candidatos = [];
  limpios.forEach((h, i) => {
    if (!h) return;
    for (const campo of CAMPOS) {
      let mejor = null;
      for (const pista of campo.pistas) {
        const p = puntaje(h, pista);
        if (p && (!mejor || p[0] > mejor[0] || (p[0] === mejor[0] && p[1] > mejor[1]))) mejor = p;
      }
      if (mejor) candidatos.push({ col: i, clave: campo.clave, nivel: mejor[0], largo: mejor[1] });
    }
  });

  candidatos.sort((a, b) => b.nivel - a.nivel || b.largo - a.largo || a.col - b.col);

  const mapa = {};
  const columnasUsadas = new Set();
  for (const c of candidatos) {
    if (mapa[c.clave] !== undefined || columnasUsadas.has(c.col)) continue;
    mapa[c.clave] = c.col;
    columnasUsadas.add(c.col);
  }
  return mapa;
}

export function faltanRequeridos(mapa) {
  return CAMPOS.filter((c) => c.requerido && mapa[c.clave] === undefined).map((c) => c.etiqueta);
}
