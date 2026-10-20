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
import { normalizarTelefonoCO } from '../../utils/whatsapp.js';

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Si dos teléfonos son el mismo número.
 *
 * Normalizados y no como texto, porque los dos lados vienen en formatos
 * distintos y acá se comparaba crudo:
 *  - `tutor.tel1` sale del archivo por telefonos() → normalizarTelefonoCO, que
 *    devuelve con indicativo: '310 483 5862' → '573000000202'.
 *  - `duenos.telefono` es lo que alguien tecleó en la ficha. parseDuenoBody
 *    (api/axios.js:132) le hace un trim() y nada más, así que en la base vive
 *    '310 483 5862' tal cual.
 *
 * Son el mismo número y el === decía que no. Costaba dos cosas, las dos sobre
 * clientes reales: el camino 2 de emparejarTutor no se disparaba nunca para un
 * cliente creado a mano —caía en 'duda', y el paso 3 trae "es otra persona"
 * premarcado, así que contestar rápido duplicaba la ficha—; y completarTutor
 * avisaba "ya tiene el teléfono 3000000202, el archivo trae 573000000202",
 * que es un aviso falso por cliente encima de la lista donde viven los avisos
 * que sí importan.
 *
 * Los tests no lo veían porque todos los fixtures ponen el teléfono del
 * existente ya normalizado, que es la forma que escribe el propio importador.
 * El caso que faltaba es la fila que no escribió el importador.
 *
 * Un fijo de 7 u 8 dígitos normaliza a null y esto devuelve false. No es una
 * regresión: tutor.tel1 pasó por la misma función, así que un fijo nunca llega
 * acá —llega vacío— y la comparación no corre.
 */
const telIgual = (a, b) => {
  const na = normalizarTelefonoCO(a);
  const nb = normalizarTelefonoCO(b);
  return !!na && !!nb && na === nb;
};

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
 * Esto NO se usa para emparejar. Se usa solo cuando la cédula ya dijo que
 * son el mismo, para distinguir "Eulalia Ruth Trujillo" / "Ana Araque" —el
 * mismo cliente escrito de dos formas— de "Pedro Gómez" / "Ana Gómez" —el
 * papá y la hija, no una misma persona con el nombre mal tecleado—.
 *
 * Regla: si los dos nombres traen 2 o más palabras significativas se exigen
 * 2 palabras compartidas; si alguno trae solo una, alcanza con una.
 * Una sola coincidencia cuando los dos tienen varias palabras casi siempre
 * es el apellido de familia —"Pedro Gómez" y "Ana Gómez" comparten "Gomez"
 * pero son personas distintas—. Pedir dos deja pasar "Eulalia Ruth Trujillo" /
 * "Ana Araque" y manda a la familia al paso 3, que es donde la clínica
 * puede decidir.
 */
export function nombresSeParecen(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return false;
  const comunes = pa.filter((p) => pb.includes(p)).length;
  // Una sola palabra compartida alcanza únicamente cuando uno de los dos
  // nombres no tiene más que ofrecer. Con dos palabras a cada lado, una
  // coincidencia sola es casi siempre el apellido de familia: "Pedro
  // Gómez" y "Ana Gómez" con la misma cédula son el papá y la hija, no
  // un nombre escrito de dos formas. Pedir dos deja pasar "Teofilo Arboleda
  // Araque" / "Ana Araque" —el mismo cliente— y manda a la familia al
  // paso 3, que es donde la clínica puede decidir.
  const exigidas = (pa.length >= 2 && pb.length >= 2) ? 2 : 1;
  return comunes >= exigidas;
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
    telIgual(d.telefono, tutor.tel1)
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
 * `telefono` queda afuera de los campos que se pueden completar porque la
 * función de Postgres (013_aplicar_importacion.sql:184) solo acepta
 * ('cedula','direccion','telefono2') y tiraría excepción si `telefono`
 * llegara en la lista blanca, cayendo la importación entera.
 *
 * Aun así `telefono` puede estar vacío: este mismo módulo escribe
 * `telefono: tutor.tel1 ?? ''` cuando no hay número disponible, así que
 * una importación anterior pudo dejar tutores con `telefono = ''`. Por eso
 * hay dos avisos distintos:
 *  - El número que no coincide: el registro ya tiene uno y el archivo trae
 *    otro distinto. Se avisa y se deja el que ya estaba.
 *  - El número que falta: el registro tiene '' y el archivo trae uno. No se
 *    puede escribir desde acá, hay que actualizarlo a mano en la ficha.
 */
const completarTutor = (estado, existente, tutor) => {
  const campos = {};
  if (vacio(existente.cedula)    && !vacio(tutor.cedula))    campos.cedula    = tutor.cedula;
  if (vacio(existente.direccion) && !vacio(tutor.direccion)) campos.direccion = tutor.direccion;
  if (vacio(existente.telefono2) && !vacio(tutor.tel2))      campos.telefono2 = tutor.tel2;

  if (!vacio(tutor.tel1) && vacio(existente.telefono)) {
    aviso(estado, ctxDe(tutor.origen),
      `${existente.nombre} está guardado sin teléfono y el archivo trae ` +
      `${tutor.tel1}. No lo escribo desde acá: hay que ponerlo a mano en ` +
      `la ficha del cliente.`);
  } else if (!vacio(tutor.tel1) && !vacio(existente.telefono)
      && !telIgual(tutor.tel1, existente.telefono)) {
    aviso(estado, ctxDe(tutor.origen),
      `${existente.nombre} ya tiene el teléfono ${existente.telefono}. ` +
      `El archivo trae ${tutor.tel1}. Dejo el que ya estaba.`);
  }

  return campos;
};

/**
 * Los campos de `mascotas` que este archivo puede completar.
 *
 * `especie` NO está, aunque el spec la liste, y queda afuera por decisión y
 * no por imposibilidad —acá decía que una mascota que ya existe "siempre
 * tiene especie, no hay vacío que llenar", y es falso: la columna es NOT NULL
 * pero nada le impide estar en ''. Queda afuera porque el import nunca la
 * deja así (crear_mascotas la escribe sin coalesce, así que una mascota sin
 * especie resuelta ni entra) y completarla después sería adivinar perro o
 * gato sobre una ficha que ya existe, que es justo lo que clasificar() existe
 * para no hacer: la especie decide la dosis.
 *
 * Mismo razonamiento que `duenos.telefono`, y la versión de verdad de los dos
 * está en 013_aplicar_importacion.sql, en las listas blancas.
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
  // (a) Map para acumular completar_tutores por id del existente: la misma
  // persona con dos claves en el archivo no debe producir dos entradas.
  const completarTutoresMap = new Map();
  // (a2) Identidad del tutor NUEVO dentro del archivo, independiente de si la
  // fila traía cédula.
  //
  // El dedup (a) de acá abajo acumula por id del existente, y el (b) de
  // mascotas por destino resuelto. Los dos cubren al tutor que YA EXISTE y
  // ninguno cubría al nuevo: agrupar() da `c:<cédula>` o `n:<nombre>|<tel>`
  // según lo que trajera la fila (agrupar.js:13-14), así que la misma persona
  // puede llegar con dos claves, y si las dos son nuevas el destino de cada
  // una es su propia clave —`ref:c:109…` y `ref:n:ana gomez|57310…`— y no
  // colapsan. Resultado: la persona creada dos veces, su perro creado dos
  // veces (uno colgado de cada ficha) y el mismo baño escrito dos veces,
  // porque el dedup de eventos usa el destino y el de 013 usa mascota_id.
  //
  // Es el escenario del piloto, no uno hipotético: base vacía, formulario
  // donde la cédula es opcional, y gente con varias visitas. Quien puso la
  // cédula en una visita y la dejó en blanco en otra entraba dos veces en la
  // PRIMERA importación.
  //
  // Exige tel1. Sin teléfono, dos personas distintas con el mismo nombre se
  // colapsarían en una sola ficha, y unir mal es lo único que este módulo no
  // se permite (ver la regla del encabezado). Con nombre Y teléfono iguales la
  // decisión ya está tomada en dos lugares más del importador: es la propia
  // clave de respaldo de agrupar() y es el camino 2 de emparejarTutor.
  const nuevosPorIdentidad = new Map();
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
      // (a) Acumular completar_tutores por id del existente, no por clave del
      // archivo: la misma persona escrita con cédula en una hoja y sin cédula
      // en otra sale de agrupar() con dos claves distintas. Si se empujara por
      // clave, el paso 3 contaría "2 tutores para completar" cuando es uno, y
      // los campos de cada fila se ignorarían mutuamente. Fusionar los campos
      // deja los dos: la hoja que trae la dirección y la que trae la cédula.
      if (Object.keys(campos).length) {
        if (completarTutoresMap.has(m.existente.id)) {
          Object.assign(completarTutoresMap.get(m.existente.id).campos, campos);
        } else {
          const entrada = { id: m.existente.id, campos };
          completarTutoresMap.set(m.existente.id, entrada);
        }
      }
      destinoTutor.set(tutor.clave, { id: m.existente.id });
    } else {
      const ident = vacio(tutor.tel1) ? null : `${sinTildes(tutor.nombre)}|${tutor.tel1}`;
      const yaNuevo = ident ? nuevosPorIdentidad.get(ident) : null;

      if (yaNuevo) {
        // Campo por campo y solo donde falte, igual que agrupar(): la clave
        // que se descarta puede ser justo la que traía la cédula, y elegir una
        // fila entera perdería el dato de la otra.
        if (!yaNuevo.cedula    && !vacio(tutor.cedula))    yaNuevo.cedula    = tutor.cedula;
        if (!yaNuevo.telefono2 && !vacio(tutor.tel2))      yaNuevo.telefono2 = tutor.tel2;
        if (!yaNuevo.direccion && !vacio(tutor.direccion)) yaNuevo.direccion = tutor.direccion;
        // Las dos claves apuntan al MISMO ref. Con eso el dedup (b) de
        // mascotas y el de eventos ya funcionan sin tocar nada más.
        destinoTutor.set(tutor.clave, { ref: yaNuevo.ref });
      } else {
        const entrada = {
          ref: tutor.clave,
          nombre: tutor.nombre,
          // NOT NULL. La base real tiene una fila sin ningún número usable, y
          // esa persona entra igual: con el botón de WhatsApp apagado, no
          // afuera de la base.
          telefono: tutor.tel1 ?? '',
          telefono2: vacio(tutor.tel2) ? null : tutor.tel2,
          cedula: vacio(tutor.cedula) ? null : tutor.cedula,
          direccion: vacio(tutor.direccion) ? null : tutor.direccion,
        };
        envio.crear_tutores.push(entrada);
        // Se guarda la referencia al mismo objeto que está en el array, no una
        // copia: los campos que complete una clave posterior tienen que salir
        // en el envío.
        if (ident) nuevosPorIdentidad.set(ident, entrada);
        destinoTutor.set(tutor.clave, { ref: tutor.clave });
      }
    }
  }

  // Volcar el Map de completar_tutores al array del envío.
  for (const entrada of completarTutoresMap.values()) {
    envio.completar_tutores.push(entrada);
  }

  // ---------- MASCOTAS ----------
  const destinoMascota = new Map();
  // (b) Dedup de mascotas nuevas por destino resuelto del tutor + nombre
  // normalizado. Sin esto, la misma persona escrita con cédula en unas filas
  // y sin cédula en otras sale con dos claves de tutor → dos claves de mascota
  // → dos entradas en crear_mascotas para el mismo perro. 013 no tiene dedup
  // en crear_mascotas ni índice único, así que el perro se crearía dos veces
  // y todos sus eventos se escribirían dos veces.
  //
  // "Destino resuelto" es la parte que hace el trabajo, y sola no alcanzaba:
  // el destino de un tutor NUEVO es su propia clave de archivo, así que dos
  // claves de la misma persona daban dos destinos y este Map no colapsaba
  // nada. Lo que las junta es (a2), que hace que las dos claves compartan el
  // `ref`. Este comentario decía que (b) cubría el caso y cubría solo la mitad
  // —la del tutor que ya existía—, que es justo la mitad que los tests tenían.
  //
  // Guarda la entrada misma y no su `ref`: volver a buscarla con
  // crear_mascotas.find() sería recorrer el array entero por cada mascota
  // repetida —O(n²) en el hilo que dibuja la pantalla— y el tope del lector
  // son 20.000 filas.
  const nuevasPorDestino = new Map(); // claveDestino → entrada de crear_mascotas

  // (c) Igual que (a) para completar_mascotas: misma persona con dos claves
  // daría dos entradas con el mismo id y el paso 3 contaría el doble.
  const completarMascotasMap = new Map(); // id del existente → entrada

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
      // (c) Acumular por id igual que completar_tutores.
      if (Object.keys(campos).length) {
        if (completarMascotasMap.has(yaEsta.id)) {
          Object.assign(completarMascotasMap.get(yaEsta.id).campos, campos);
        } else {
          completarMascotasMap.set(yaEsta.id, { id: yaEsta.id, campos });
        }
      }
      destinoMascota.set(masc.clave, { id: yaEsta.id });
    } else {
      // (b) La clave es el destino resuelto, no masc.clave: la misma persona
      // escrita con cédula en una hoja y sin cédula en otra sale de agrupar()
      // con dos claves de tutor y por lo tanto dos de mascota. Si se empuja
      // por clave de archivo, el mismo perro se crea dos veces —013 no
      // deduplica crear_mascotas ni hay índice único que lo haga— y sus
      // eventos se escriben dos veces, porque el dedup de eventos usa el ref.
      const duenoDestino = tut.id ? `id:${tut.id}` : `ref:${tut.ref}`;
      const claveDestino = `${duenoDestino}|${sinTildes(masc.nombre)}`;

      if (nuevasPorDestino.has(claveDestino)) {
        // Ya hay una entrada para este perro: no se crea otra, pero sí se
        // enriquece campo por campo (solo donde falte valor), por el mismo
        // criterio que usa agrupar() al fusionar filas del mismo tutor.
        const entrada = nuevasPorDestino.get(claveDestino);
        if (!entrada.raza && !vacio(masc.raza)) entrada.raza = masc.raza;
        if (!entrada.fecha_nacimiento && !vacio(masc.nacimiento)) {
          entrada.fecha_nacimiento = masc.nacimiento;
          const edad = edadDesde(masc.nacimiento, hoy);
          if (edad && !(entrada.edad_anios || entrada.edad_meses)) {
            entrada.edad_anios = edad.anios;
            entrada.edad_meses = edad.meses;
          }
        }
        destinoMascota.set(masc.clave, { ref: entrada.ref });
      } else {
        const edad = masc.nacimiento ? edadDesde(masc.nacimiento, hoy) : null;
        const entrada = {
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
        };
        envio.crear_mascotas.push(entrada);
        nuevasPorDestino.set(claveDestino, entrada);
        destinoMascota.set(masc.clave, { ref: masc.clave });
      }
    }
  }

  // Volcar el Map de completar_mascotas al array del envío.
  for (const entrada of completarMascotasMap.values()) {
    envio.completar_mascotas.push(entrada);
  }

  // ---------- EVENTOS ----------
  // La misma clave se usa contra lo que hay en la base Y contra lo que ya
  // se agregó en esta corrida: dos baños del mismo día en el mismo archivo
  // también son uno.
  let repetidos = 0;

  for (const ev of agrupado.eventos) {
    const dest = destinoMascota.get(ev.mascota);
    if (!dest) continue; // mascota colgada de una duda o de una especie sin resolver

    // Guarda de tipo inválido ANTES de calcular la clave y de registrarla en
    // el dedup. Solo aplica a tratamientos; las vacunas no tienen check de tipo.
    // Si la guarda fuera después de idx.eventos.add(), un tipo inválido dejaría
    // su clave marcada como vista: si más adelante llegara un evento válido con
    // la misma identidad (misma mascota, mismo tipo, misma fecha), el dedup lo
    // contaría como repetido aunque nunca se haya importado.
    // tratamientos.tipo tiene un check en 001_init.sql:78:
    //   check (tipo in ('vacunacion','desparasitacion','bano','consulta'))
    // Un dato malo cuesta un registro, no el archivo.
    if (ev.tipo !== 'vacuna' && !TIPOS_TRATAMIENTO_VALIDOS.has(ev.t)) {
      aviso(estado, ctxDe(agrupado.mascotas.get(ev.mascota)?.origen),
        `Tipo de tratamiento desconocido: "${ev.t}". No se importa este evento.`);
      continue;
    }

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
