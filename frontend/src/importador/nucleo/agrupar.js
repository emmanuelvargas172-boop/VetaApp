// ============================================================
// VetaApp · importador/nucleo/agrupar.js
// Filas repetidas → un tutor, sus mascotas y sus eventos.
//
// Tutor: por cédula, que es la llave que la clínica misma usa. Sin
// cédula se cae al nombre sin tildes MÁS el primer teléfono, no al
// nombre solo: en una base real hay dos "Teofilo Arboleda" que son dos
// personas distintas.
// ============================================================

import { aviso, sinTildes } from './normalizar.js';

export const claveTutor = (r) =>
  (r.cedula ? `c:${r.cedula}` : `n:${sinTildes(r.tutor)}|${r.tel1 ?? ''}`);

// Dentro del tutor, por nombre sin tildes. "Ángel" y "angel " son la
// misma; "Max" de dos tutores distintos son dos mascotas.
export const claveMascota = (r) => `${claveTutor(r)}|m:${sinTildes(r.mascota)}`;

export function agrupar(estado, filas) {
  const tutores = new Map();
  const mascotas = new Map();
  const eventos = [];

  for (const r of filas) {
    const kt = claveTutor(r), km = claveMascota(r);
    const ctx = { fila: r.nFila, hoja: r.hoja };

    // Gana el registro con más datos, PERO campo por campo: reemplazar
    // la fila entera es como se pierde la dirección larga de una hoja al
    // llegar la corta de otra.
    const prev = tutores.get(kt);
    if (!prev) {
      tutores.set(kt, {
        clave: kt, cedula: r.cedula, nombre: r.tutor, direccion: r.direccion,
        tel1: r.tel1, tel2: r.tel2, origen: [`${r.hoja}:${r.nFila}`],
      });
    } else {
      if (sinTildes(prev.nombre) !== sinTildes(r.tutor)) {
        const queda = prev.nombre.length >= r.tutor.length ? prev.nombre : r.tutor;
        aviso(estado, ctx, `misma cédula ${r.cedula} con dos nombres: "${prev.nombre}" y "${r.tutor}" → quedó "${queda}"`);
        if (r.tutor.length > prev.nombre.length) prev.nombre = r.tutor;
      }
      // "Calle 10 #20-30 Barrio Prueba" dice más que "Calle 11 #20-30 Barrio Prueba" y
      // es el mismo lugar.
      if (r.direccion && (!prev.direccion || r.direccion.length > prev.direccion.length)) prev.direccion = r.direccion;
      // Los dos cupos de `duenos` se llenan con TODOS los números distintos
      // que traigan las filas de esta persona, no solo con los de la primera.
      //
      // Antes era `if (!prev.tel1 …)` y `if (!prev.tel2 …)` mirando solo la
      // fila de origen: con el primer cupo ya lleno, un número distinto en una
      // fila posterior se perdía en silencio teniendo `telefono2` vacío al
      // lado. Es el número por el que la clínica llama cuando el primero no
      // contesta, y el formulario lo anotó porque alguien lo dio.
      //
      // La comparación es de texto crudo y alcanza: los dos lados salieron de
      // telefonos() → normalizarTelefonoCO (normalizar.js:103-116), así que
      // acá todos vienen en la misma forma '57XXXXXXXXXX'.
      for (const t of [r.tel1, r.tel2]) {
        if (!t) continue;
        if (t === prev.tel1 || t === prev.tel2) continue;
        if (!prev.tel1)      prev.tel1 = t;
        else if (!prev.tel2) prev.tel2 = t;
        // Tercer número distinto: `duenos` tiene dos columnas y no una lista,
        // así que éste no entra. Se dice en voz alta igual —es un contacto de
        // un cliente real— para que la clínica decida si lo pone a mano.
        else aviso(estado, ctx, `${prev.nombre} tiene más de dos teléfonos: ${t} se queda afuera (quedaron ${prev.tel1} y ${prev.tel2})`);
      }
      if (!prev.cedula && r.cedula) prev.cedula = r.cedula;
      prev.origen.push(`${r.hoja}:${r.nFila}`);
    }

    const pm = mascotas.get(km);
    if (!pm) {
      mascotas.set(km, {
        clave: km, tutor: kt, nombre: r.mascota.trim(), especie: r.especie,
        raza: r.raza, nacimiento: r.nacimiento, origen: [`${r.hoja}:${r.nFila}`],
      });
    } else {
      if (!pm.raza && r.raza) pm.raza = r.raza;
      if (!pm.especie && r.especie) pm.especie = r.especie;
      if (!pm.nacimiento && r.nacimiento) pm.nacimiento = r.nacimiento;
      if (pm.nacimiento && r.nacimiento && pm.nacimiento !== r.nacimiento) {
        aviso(estado, ctx, `"${r.mascota}" tiene dos fechas de nacimiento: ${pm.nacimiento} y ${r.nacimiento} → quedó ${pm.nacimiento}`);
      }
      pm.origen.push(`${r.hoja}:${r.nFila}`);
    }

    // Un baño por fila: cada fila del formulario ES una visita, con su
    // fecha y su precio. Si la misma mascota vino dos veces, son dos.
    // La presencia de la fecha sola ya identifica la visita: exigir
    // tipo_bano o costo dejaría fuera visitas que sí ocurrieron.
    if (r.ts) {
      const extras = [r.extra_vacuna ? 'vacuna anual' : null,
                      r.extra_tos ? 'tos de las perreras' : null].filter(Boolean);
      const notas = [
        r.tipo_bano ? `Baño ${r.tipo_bano}` : null,
        r.costo ? `Costo ${r.costo.toLocaleString('es-CO')}` : null,
        r.costoCrudo && r.costo && r.costoCrudo.split(/\s+/)[0] !== r.costoCrudo
          ? `Anotado en la hoja: "${r.costoCrudo}"` : null,
        r.observaciones,
        extras.length ? `Extras: ${extras.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
      eventos.push({ tipo: 'tratamiento', mascota: km, t: 'bano', fecha: r.ts, hora: r.hora, notas });
    }

    if (r.ultima_desp) {
      eventos.push({ tipo: 'tratamiento', mascota: km, t: 'desparasitacion',
                     fecha: r.ultima_desp, hora: null,
                     notas: 'Última desparasitación según el formulario de ingreso' });
    }

    // Solo con fecha. "Vacunas anual = Si" dice que contrató el
    // servicio, NO que se la aplicaron: crear una vacuna con eso sería
    // inventarle un antecedente clínico a un animal.
    if (r.ultima_vacuna) {
      const [a, m, d] = r.ultima_vacuna.split('-').map(Number);
      // El año se suma con Date.UTC y no pegando `a + 1` al mes y al día,
      // porque hay una fecha del calendario a la que eso le da un día que no
      // existe: un 29 de febrero sumándole 1 al año da 2025-02-29.
      //
      // Lo único que se puede afirmar de un día inexistente es que no existe.
      // Qué pasa después depende del motor: V8 rueda '2025-02-29T12:00:00' a
      // Mar 1 —verificado—, pero la especificación dice que el parseo ISO
      // falle, así que otro motor puede devolver Invalid Date. Ahí el badge de
      // Historias.jsx:186-196 cae en la última rama y la clínica lee "Invalid
      // Date" en la ficha, y lo peor es lo que NO pasa: esa vacuna no entra en
      // ninguna de las ventanas de días, así que el recordatorio no sale nunca
      // y el animal se queda sin refuerzo sin que nadie se entere.
      //
      // Postgres no lo ataja: proxima_dosis es `text` (001_init.sql:55).
      //
      // Date.UTC con mes 1 y día 29 de un año no bisiesto rueda a marzo por
      // definición, y es la respuesta correcta para un refuerzo anual: un día
      // tarde no tiene consecuencia clínica, y una fecha inválida sí. UTC y no
      // hora local para que el `toISOString` no se corra de día por el huso.
      const prox = new Date(Date.UTC(a + 1, m - 1, d)).toISOString().slice(0, 10);
      // nombre: 'Anual' porque la columna "última vacuna" solo trae la
      // fecha. vacunas.nombre es NOT NULL en Postgres, así que algo tiene
      // que ir; 'Anual' es lo que la clínica registra para la polivalente
      // anual, que es el 95 % de los casos reales.
      // notas: null — la fila del formulario no lleva texto anotado, así
      // que no se inventa un campo que no existe. null en JSON serializa
      // correctamente para Postgres, undefined quedaría ausente.
      eventos.push({ tipo: 'vacuna', mascota: km, nombre: 'Anual', fecha: r.ultima_vacuna, proxima: prox, notas: null });
    }
  }

  return { tutores, mascotas, eventos };
}
