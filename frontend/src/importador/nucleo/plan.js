// ============================================================
// VetaApp · importador/nucleo/plan.js
// Lo que trae el archivo + lo que la cuenta ya tiene → qué hacer.
//
// ---------- LA REGLA QUE ORDENA TODO ----------
// Equivocarse duplicando se arregla; equivocarse uniendo, no.
//
// Unir a dos clientes que no son el mismo deja una sola ficha con el
// historial de dos animales adentro: dos pesos, dos fechas de vacuna, dos
// tratamientos. Eso no se desarma — hay que borrar y reescribir a mano. Al
// revés, dos fichas repetidas se juntan en un minuto.
//
// Por eso solo se une cuando no hay nada que dudar, y cuando hay algo que
// dudar se pregunta con "son dos personas distintas" ya marcado.
//
// ---------- ES PURA, Y SE CORRE DOS VECES ----------
// Una con `decisiones` vacío, para saber qué preguntar. Otra con las
// respuestas, para armar el envío. No son dos caminos: es la misma función,
// así que lo que la clínica vio en el paso 3 y lo que se escribe en el paso
// 4 no se pueden separar.
// ============================================================

import { sinTildes, aviso } from './normalizar.js';
import { edadDesde } from '../../utils/edad.js';

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

// Los tipos válidos para tratamientos.tipo (001_init.sql:78):
//   check (tipo in ('vacunacion','desparasitacion','bano','consulta'))
// Se mantienen acá para que el día que alguien agregue un tipo en
// agrupar.js o un mapeo nuevo, el valor inválido no viaje hasta Postgres
// y tire un check constraint que la clínica no puede entender ni accionar.
const TIPOS_TRATAMIENTO_VALIDOS = new Set(['vacunacion', 'desparasitacion', 'bano', 'consulta']);

/**
 * Las palabras de un nombre que sirven para comparar.
 *
 * Se descartan las de dos letras o menos: "de", "la", "y" están en medio
 * mundo, y si contaran cualquier par de nombres se parecería — la duda de
 * la cédula mal tecleada nunca saltaría.
 */
const palabras = (nombre) => sinTildes(nombre).split(' ').filter((p) => p.length >= 3);

/**
 * Si dos nombres pueden ser de la misma persona.
 *
 * Una palabra compartida alcanza, y a propósito: esto NO se usa para
 * emparejar. Se usa solo cuando la cédula ya dijo que son el mismo, para
 * distinguir "Eulalia Ruth Trujillo" / "Ana Araque" —el mismo cliente escrito
 * de dos formas— de "Ana Araque" / "Pedro Castaño", que con la misma cédula
 * es una cédula mal tecleada y hay que preguntar.
 */
export function nombresSeParecen(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return false;
  return pa.some((p) => pb.includes(p));
}

/**
 * Lo que la cuenta ya tiene, en mapas para no recorrer listas por cada fila.
 *
 * Un archivo de 300 filas contra 300 clientes son 90.000 comparaciones si se
 * hace a lo bruto, en el hilo que dibuja la pantalla.
 */
export function indexar(existentes) {
  const porCedula = new Map();
  const porNombre = new Map();

  for (const d of existentes.duenos ?? []) {
    if (!vacio(d.cedula)) porCedula.set(String(d.cedula), d);
    const k = sinTildes(d.nombre);
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(d);
  }

  // Las mascotas se emparejan DENTRO de un tutor, nunca entre tutores: hay
  // nueve "Max" en una base de 300 y son nueve perros distintos.
  const mascotasPorDueno = new Map();
  for (const m of existentes.mascotas ?? []) {
    if (!mascotasPorDueno.has(m.dueno_id)) mascotasPorDueno.set(m.dueno_id, new Map());
    mascotasPorDueno.get(m.dueno_id).set(sinTildes(m.nombre), m);
  }

  // Los eventos no tienen nada que los identifique, así que la identidad se
  // construye: mascota + tipo + fecha. Sin esto, el mismo archivo dos veces
  // deja 148 baños donde hubo 74.
  const eventos = new Set();
  for (const t of existentes.tratamientos ?? []) {
    eventos.add(`t|${t.mascota_id}|${t.tipo}|${t.fecha}`);
  }
  for (const v of existentes.vacunas ?? []) {
    eventos.add(`v|${v.mascota_id}|${sinTildes(v.nombre)}|${v.fecha_aplicacion}`);
  }

  return { porCedula, porNombre, mascotasPorDueno, eventos };
}

/**
 * Un tutor del archivo contra la base. Tres respuestas: `misma`, `nueva`,
 * `duda`. Solo `duda` llega a la pantalla.
 */
export function emparejarTutor(idx, tutor) {
  // 1. Misma cédula. Dos personas no comparten cédula.
  if (!vacio(tutor.cedula) && idx.porCedula.has(String(tutor.cedula))) {
    const d = idx.porCedula.get(String(tutor.cedula));
    if (nombresSeParecen(d.nombre, tutor.nombre)) {
      return { certeza: 'misma', existente: d, motivo: 'cedula' };
    }
    // Esto no es un parecido, es un error: o la cédula está mal tecleada o
    // es de otra persona. Unirlos metería el historial de un animal en la
    // ficha de alguien que no es su dueño.
    return { certeza: 'duda', existente: d, motivo: 'cedula_otro_nombre' };
  }

  const candidatos = idx.porNombre.get(sinTildes(tutor.nombre)) ?? [];
  if (!candidatos.length) return { certeza: 'nueva', existente: null, motivo: null };

  // 2. Mismo nombre + mismo teléfono, y la cédula no se contradice.
  //
  // "No se contradice" y no "ninguno tiene": el caso más común del
  //  importador es la clínica que tiene a alguien sin cédula y el archivo
  //  que la trae. Con la regla estricta eso sería una pregunta obvia por
  //  cada cliente. Si el que existe tiene OTRA cédula sí se pregunta: dos
  //  personas con el mismo nombre que comparten teléfono son una familia.
  const mismoTel = candidatos.find((d) =>
    !vacio(d.telefono) && !vacio(tutor.tel1) && String(d.telefono) === String(tutor.tel1)
    && (vacio(d.cedula) || vacio(tutor.cedula) || String(d.cedula) === String(tutor.cedula)));
  if (mismoTel) return { certeza: 'misma', existente: mismoTel, motivo: 'nombre_y_telefono' };

  // 3. Mismo nombre, teléfono distinto. El caso real de la base de La
  //    Huella: dos "Teofilo Arboleda" que son Araque y Casimiro Carvajalino.
  return { certeza: 'duda', existente: candidatos[0], motivo: 'nombre_tel_distinto' };
}

/** 'Hoja1:35' → { hoja: 'Hoja1', fila: 35 }, para que el aviso apunte a algo. */
const ctxDe = (origen) => {
  const uno = String((origen ?? [])[0] ?? '');
  const corte = uno.lastIndexOf(':');
  if (corte < 0) return { hoja: uno, fila: 0 };
  return { hoja: uno.slice(0, corte), fila: Number(uno.slice(corte + 1)) || 0 };
};

/**
 * Los campos de `duenos` que este archivo puede completar.
 *
 * `telefono` NO está: es NOT NULL, siempre tiene algo, así que completarlo
 * es imposible por definición. Cuando el archivo trae otro número se avisa
 * y no se cambia — callarlo dejaría a la clínica creyendo que el número
 * nuevo entró, y el recordatorio por WhatsApp saldría al viejo.
 */
const completarTutor = (estado, existente, tutor) => {
  const campos = {};
  if (vacio(existente.cedula)    && !vacio(tutor.cedula))    campos.cedula    = tutor.cedula;
  if (vacio(existente.direccion) && !vacio(tutor.direccion)) campos.direccion = tutor.direccion;
  if (vacio(existente.telefono2) && !vacio(tutor.tel2))      campos.telefono2 = tutor.tel2;

  if (!vacio(tutor.tel1) && !vacio(existente.telefono)
      && String(tutor.tel1) !== String(existente.telefono)) {
    aviso(estado, ctxDe(tutor.origen),
      `${existente.nombre} ya tiene el teléfono ${existente.telefono}. ` +
      `El archivo trae ${tutor.tel1}. Dejo el que ya estaba.`);
  }

  return campos;
};

/**
 * Los campos de `mascotas` que este archivo puede completar.
 *
 * `especie` NO está, aunque el spec la liste: es NOT NULL, una mascota que
 * ya existe siempre tiene especie, no hay vacío que llenar. Mismo
 * razonamiento que `duenos.telefono`.
 *
 * `edad_anios`/`edad_meses` solo se tocan si el archivo trae fecha de
 * nacimiento —ahí la edad deja de ser un dato tecleado y pasa a ser una
 * resta— y solo si están en 0, que es lo que deja un registro al que nunca
 * le pusieron la edad. Una edad escrita a mano no se pisa.
 */
const completarMascota = (existente, masc, hoy) => {
  const campos = {};
  if (vacio(existente.raza) && !vacio(masc.raza)) campos.raza = masc.raza;

  if (vacio(existente.fecha_nacimiento) && !vacio(masc.nacimiento)) {
    campos.fecha_nacimiento = masc.nacimiento;
    const edad = edadDesde(masc.nacimiento, hoy);
    if (edad && !(existente.edad_anios || existente.edad_meses)) {
      campos.edad_anios = edad.anios;
      campos.edad_meses = edad.meses;
    }
  }

  return campos;
};

/**
 * El plan completo.
 *
 * @param {object} estado      el de nuevoEstado(); acá se le agregan avisos
 * @param {object} agrupado    { tutores: Map, mascotas: Map, eventos: [] } de agrupar()
 * @param {object} existentes  { duenos, mascotas, tratamientos, vacunas } de la base
 * @param {object} decisiones  { dudas: {}, especies: {} } lo que contestó el paso 3
 * @param {Date}   hoy         entra por parámetro para que la edad sea probable
 */
export function armarPlan(estado, agrupado, existentes, decisiones = {}, hoy = new Date()) {
  const idx = indexar(existentes);
  const respuestas = decisiones.dudas ?? {};
  const especiesDecididas = decisiones.especies ?? {};

  const envio = {
    importacion_id: null,
    crear_tutores: [], completar_tutores: [],
    crear_mascotas: [], completar_mascotas: [],
    tratamientos: [], vacunas: [],
  };
  const dudas = [];
  const especies = new Map();

  // clave del tutor en el archivo → { id } si ya existe, { ref } si es
  // nuevo, o nada si quedó colgado de una duda sin contestar.
  const destinoTutor = new Map();
  const mascotasDe = new Map();
  for (const m of agrupado.mascotas.values()) {
    if (!mascotasDe.has(m.tutor)) mascotasDe.set(m.tutor, []);
    mascotasDe.get(m.tutor).push(m.nombre);
  }

  // ---------- TUTORES ----------
  for (const tutor of agrupado.tutores.values()) {
    const m = emparejarTutor(idx, tutor);
    let certeza = m.certeza;

    if (certeza === 'duda') {
      const id = `tutor:${tutor.clave}`;
      const respuesta = respuestas[id];

      if (!respuesta) {
        dudas.push({
          id,
          clase: 'tutor',
          motivo: m.motivo,
          archivo: {
            nombre: tutor.nombre, tel1: tutor.tel1, cedula: tutor.cedula,
            direccion: tutor.direccion, mascotas: mascotasDe.get(tutor.clave) ?? [],
          },
          existente: {
            id: m.existente.id, nombre: m.existente.nombre,
            telefono: m.existente.telefono, cedula: m.existente.cedula,
          },
        });
        // Y no se decide nada de este tutor. Ni él ni sus mascotas ni sus
        // eventos entran al envío hasta que la pregunta esté contestada.
        continue;
      }

      certeza = respuesta === 'misma' ? 'misma' : 'nueva';
    }

    if (certeza === 'misma') {
      const campos = completarTutor(estado, m.existente, tutor);
      // Un objeto sin campos adentro haría que el paso 3 diga "1 tutor
      // para completar" y después no complete nada.
      if (Object.keys(campos).length) {
        envio.completar_tutores.push({ id: m.existente.id, campos });
      }
      destinoTutor.set(tutor.clave, { id: m.existente.id });
    } else {
      envio.crear_tutores.push({
        ref: tutor.clave,
        nombre: tutor.nombre,
        // NOT NULL. La base real tiene una fila sin ningún número usable, y
        // esa persona entra igual: con el botón de WhatsApp apagado, no
        // afuera de la base.
        telefono: tutor.tel1 ?? '',
        telefono2: vacio(tutor.tel2) ? null : tutor.tel2,
        cedula: vacio(tutor.cedula) ? null : tutor.cedula,
        direccion: vacio(tutor.direccion) ? null : tutor.direccion,
      });
      destinoTutor.set(tutor.clave, { ref: tutor.clave });
    }
  }

  // ---------- MASCOTAS ----------
  const destinoMascota = new Map();

  for (const masc of agrupado.mascotas.values()) {
    const tut = destinoTutor.get(masc.tutor);
    if (!tut) continue; // su tutor quedó en una duda sin contestar

    // mascotas.especie es NOT NULL y acá no se adivina. El script de
    // terminal se detiene y obliga a decidir; en el navegador es una
    // pregunta del paso 3.
    const especie = masc.especie ?? especiesDecididas[sinTildes(masc.raza ?? '')] ?? null;
    if (!especie) {
      const k = sinTildes(masc.raza ?? '');
      // `clave: k` viaja en el grupo y no se recalcula en la pantalla: es
      // la misma llave con la que `decisiones.especies` va a volver.
      if (!especies.has(k)) especies.set(k, { clave: k, raza: masc.raza ?? '', cuantas: 0, mascotas: [] });
      const g = especies.get(k);
      g.cuantas += 1;
      g.mascotas.push(masc.nombre);
      continue;
    }

    // Solo dentro de ese tutor, y solo si el tutor ya existía.
    const yaEsta = tut.id
      ? idx.mascotasPorDueno.get(tut.id)?.get(sinTildes(masc.nombre))
      : null;

    if (yaEsta) {
      const campos = completarMascota(yaEsta, masc, hoy);
      if (Object.keys(campos).length) {
        envio.completar_mascotas.push({ id: yaEsta.id, campos });
      }
      destinoMascota.set(masc.clave, { id: yaEsta.id });
    } else {
      const edad = masc.nacimiento ? edadDesde(masc.nacimiento, hoy) : null;
      envio.crear_mascotas.push({
        ref: masc.clave,
        tutor_ref: tut.ref ?? null,
        tutor_id: tut.id ?? null,
        nombre: masc.nombre,
        especie,
        raza: vacio(masc.raza) ? null : masc.raza,
        fecha_nacimiento: vacio(masc.nacimiento) ? null : masc.nacimiento,
        // Sin fecha la edad NO se inventa: queda 0, que es lo que ya tienen
        // las mascotas viejas de la app, y se corrige a mano.
        edad_anios: edad?.anios ?? 0,
        edad_meses: edad?.meses ?? 0,
      });
      destinoMascota.set(masc.clave, { ref: masc.clave });
    }
  }

  // ---------- EVENTOS ----------
  // La misma clave se usa contra lo que hay en la base Y contra lo que ya
  // se agregó en esta corrida: dos baños del mismo día en el mismo archivo
  // también son uno.
  let repetidos = 0;

  for (const ev of agrupado.eventos) {
    const dest = destinoMascota.get(ev.mascota);
    if (!dest) continue; // mascota colgada de una duda o de una especie sin resolver

    const quien = dest.id ?? `ref:${dest.ref}`;
    const clave = ev.tipo === 'vacuna'
      // Con el nombre adentro: a una mascota se le pueden aplicar dos
      // vacunas distintas el mismo día.
      ? `v|${quien}|${sinTildes(ev.nombre)}|${ev.fecha}`
      : `t|${quien}|${ev.t}|${ev.fecha}`;

    if (idx.eventos.has(clave)) {
      repetidos += 1;
      continue;
    }
    idx.eventos.add(clave);

    if (ev.tipo === 'vacuna') {
      envio.vacunas.push({
        mascota_ref: dest.ref ?? null,
        mascota_id: dest.id ?? null,
        nombre: ev.nombre,
        fecha_aplicacion: ev.fecha,
        proxima_dosis: vacio(ev.proxima) ? null : ev.proxima,
        notas: vacio(ev.notas) ? null : ev.notas,
      });
    } else {
      // Guarda antes de empujar: tratamientos.tipo tiene un check en
      // 001_init.sql:78 que tira excepción con cualquier valor fuera de
      // ('vacunacion','desparasitacion','bano','consulta'). Hoy agrupar.js
      // solo produce 'bano' y 'desparasitacion', pero el día que alguien
      // agregue un tipo nuevo el valor inválido viajaría hasta Postgres y
      // caería el import entero con un mensaje que la clínica no puede
      // entender ni accionar. Un dato malo cuesta un registro, no el archivo.
      if (!TIPOS_TRATAMIENTO_VALIDOS.has(ev.t)) {
        aviso(estado, ctxDe(/* no hay origen en ev */ []),
          `Tipo de tratamiento desconocido: "${ev.t}". No se importa este evento.`);
        continue;
      }
      envio.tratamientos.push({
        mascota_ref: dest.ref ?? null,
        mascota_id: dest.id ?? null,
        tipo: ev.t,
        fecha: ev.fecha,
        hora: vacio(ev.hora) ? null : ev.hora,
        notas: vacio(ev.notas) ? null : ev.notas,
      });
    }
  }

  // Los números salen de contar el envío, no de estimar aparte. Si se
  // calcularan por su cuenta, el día que una rama cambie el paso 3 mostraría
  // una cosa y el paso 4 haría otra.
  return {
    envio,
    dudas,
    especies: [...especies.values()],
    resumen: {
      tutores_nuevos:         envio.crear_tutores.length,
      tutores_a_completar:    envio.completar_tutores.length,
      mascotas_nuevas:        envio.crear_mascotas.length,
      mascotas_a_completar:   envio.completar_mascotas.length,
      tratamientos:           envio.tratamientos.length,
      vacunas:                envio.vacunas.length,
      eventos_repetidos:      repetidos,
      dudas:                  dudas.length,
      especies_sin_resolver:  especies.size,
    },
  };
}
