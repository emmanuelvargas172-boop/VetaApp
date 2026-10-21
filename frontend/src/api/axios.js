// Adaptador: expone la MISMA interfaz que axios (get/post/put/patch/delete → { data })
// pero por dentro habla con Supabase. Las páginas no cambian.
// RLS + `user_id default auth.uid()` aíslan los datos por veterinaria automáticamente:
// no hace falta pasar user_id en inserts ni filtrar por él en selects.
import { supabase } from '../lib/supabase';
import { edadDesde } from '../utils/edad';
import { revisarArchivo, traducirErrorSql } from '../archivos/limites.js';

// ---------- helpers ----------

const iso = (d) => d.toISOString().slice(0, 10);
const hoy = () => iso(new Date());
const masDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// Error con forma tipo axios para que las páginas muestren el mensaje real
// vía `err.response.data.error` en vez de un genérico.
function apiError(message) {
  const e = new Error(message || 'Error desconocido');
  e.response = { data: { error: message || 'Error desconocido' } };
  return e;
}

function unwrap({ data, error }) {
  if (error) throw apiError(error.message);
  return data;
}

async function count(table, build) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count: c, error } = await q;
  if (error) throw new Error(error.message);
  return c || 0;
}

// ---------- avisos enviados (migración 006) ----------
// Cuántos días se considera que un dueño "ya fue avisado". Pasado ese
// plazo la vacuna vuelve a la lista: si no contestó en una semana, toca
// insistir.
const VENTANA_AVISO_DIAS = 7;

// La vista `avisos_ultimo` puede no existir todavía si el frontend se
// despliega antes de correr la migración 006. En ese caso se devuelve
// vacío: la página funciona como antes en vez de romperse entera.
async function ultimoAvisoPorVacuna(ids) {
  const mapa = new Map();
  if (!ids || ids.length === 0) return mapa;
  const { data, error } = await supabase
    .from('avisos_ultimo').select('vacuna_id, enviado_at').in('vacuna_id', ids);
  if (error) {
    console.warn('[avisos] sin historial de recordatorios:', error.message);
    return mapa;
  }
  for (const a of data || []) mapa.set(a.vacuna_id, a.enviado_at);
  return mapa;
}

// Ids de vacunas con aviso dentro de la ventana. Set para filtrar barato.
async function avisosRecientes(ids) {
  const corte = new Date();
  corte.setDate(corte.getDate() - VENTANA_AVISO_DIAS);
  const mapa = await ultimoAvisoPorVacuna(ids);
  const recientes = new Set();
  for (const [id, enviado] of mapa) {
    if (new Date(enviado) >= corte) recientes.add(id);
  }
  return recientes;
}

// Aplana la relación anidada de dueño sobre la mascota
function flattenMascota(m) {
  if (!m) return m;
  const d = m.duenos || {};
  const { duenos, ...rest } = m;
  return {
    ...rest,
    dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null, dueno_direccion: d.direccion ?? null,
    // Migración 011. Van acá y no solo en /duenos porque ModalMascota edita
    // la mascota y su dueño en el mismo formulario: si no viajan con la
    // mascota, al abrir "editar" los dos campos salen vacíos y guardar los
    // borra.
    dueno_cedula: d.cedula ?? null, dueno_telefono2: d.telefono2 ?? null,
  };
}

const SEL_MASCOTA = '*, duenos(nombre,telefono,direccion,cedula,telefono2)';

// cita → mascota(nombre,especie) + dueño(nombre,telefono)
function flattenCita(c) {
  const m = c.mascotas || {};
  const d = m.duenos || {};
  const { mascotas, ...rest } = c;
  return { ...rest, mascota_nombre: m.nombre ?? null, especie: m.especie ?? null, dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null };
}
const SEL_CITA = '*, mascotas(nombre,especie,duenos(nombre,telefono))';

// tratamiento / recordatorio → datos de mascota + dueño
function flattenTratamiento(t) {
  const m = t.mascotas || {};
  const d = m.duenos || {};
  const { mascotas, ...rest } = t;
  return {
    ...rest,
    mascota_nombre: m.nombre ?? null, especie: m.especie ?? null, raza: m.raza ?? null,
    edad_anios: m.edad_anios ?? null, edad_meses: m.edad_meses ?? null, mascota_peso: m.peso ?? null,
    dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null, dueno_direccion: d.direccion ?? null,
  };
}
const SEL_TRATAMIENTO = '*, mascotas(nombre,especie,raza,edad_anios,edad_meses,peso,duenos(nombre,telefono,direccion))';

async function subirFoto(file) {
  const { data: { user } } = await supabase.auth.getUser();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/mascota_${Date.now()}.${ext}`;
  const up = await supabase.storage.from('mascotas').upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  return supabase.storage.from('mascotas').getPublicUrl(path).data.publicUrl;
}

/**
 * Sube el PDF al bucket y devuelve la ruta del objeto.
 *
 * Tres diferencias con `subirFoto`, de arriba, y las tres son a propósito:
 *
 *  1. `upsert: false`. Con `true` —lo que usa subirFoto— una ruta repetida
 *     SOBREESCRIBE el objeto en silencio. Acá la ruta lleva un aleatorio,
 *     así que una repetición significa que algo está mal, y quiero el
 *     error, no el archivo de otro reemplazado.
 *
 *  2. La ruta lleva timestamp Y un aleatorio. `subirFoto` usa solo
 *     `Date.now()` y tiene el hueco de que dos subidas en el mismo
 *     milisegundo chocan. Acá la clínica selecciona ocho escaneos de una,
 *     así que el caso no es teórico.
 *
 *  3. Devuelve la RUTA, no una URL. `subirFoto` termina en
 *     `getPublicUrl`, que en un bucket privado devuelve una URL que no
 *     abre nada. Un PDF clínico se abre con URL firmada pedida en el
 *     clic (ver GET /archivos/:id/url).
 *
 * El `mascota_id` va en la ruta aunque la tabla ya lo tenga en una
 * columna: es lo que permite que el barrido de huérfanos y cualquier
 * inspección manual del bucket digan de qué paciente es cada objeto sin
 * cruzar con la base.
 */
async function subirDocumento(file, mascotaId) {
  const { data: { user } } = await supabase.auth.getUser();
  const unico = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ruta = `${user.id}/${mascotaId}/${unico}.pdf`;

  const up = await supabase.storage.from('documentos').upload(ruta, file, {
    upsert: false,
    // El tipo se fija a 'application/pdf' en vez de usar file.type porque en
    // este camino ya pasó por revisarArchivo (limites.js), que validó que el
    // tipo sea application/pdf. Cambiar esto por file.type no cerraría nada:
    // el navegador deriva File.type de la extensión del nombre, así que un
    // .exe renombrado a .pdf reporta application/pdf de todas formas.
    // Lo que sí protege contra una subida que no pasa por este código —alguien
    // que llame supabase.storage.upload directo con F12— es el allowed_mime_types
    // del bucket, que se fija en el `insert into storage.buckets` del bucket
    // 'documentos', en 015_archivos_mascota.sql.
    contentType: 'application/pdf',
  });
  if (up.error) throw apiError(up.error.message);

  return ruta;
}

// Campos que acepta la tabla `duenos`, y nada más. Lo que no esté acá se
// descarta: antes se desestructuraba a mano en POST y en PUT por separado,
// y cuando la migración 011 agregó cedula y telefono2 los dos sitios los
// botaban en silencio — el formulario los mandaba, la base no los veía y
// no había error en ninguna parte.
// Solo se incluye la llave que venga en el body, no las cinco siempre. Es
// la diferencia entre "poné la dirección en vacío" y "no te estoy hablando
// de la dirección": si se devolvieran las cinco, un PUT que solo corrige el
// teléfono le borraría la cédula al tutor sin que nadie lo pidiera.
function parseDuenoBody(body = {}) {
  const t = (v) => (typeof v === 'string' ? v.trim() : v);
  const out = {};
  if ('nombre'    in body) out.nombre    = t(body.nombre);
  if ('telefono'  in body) out.telefono  = t(body.telefono);
  if ('direccion' in body) out.direccion = t(body.direccion) || null;
  // Solo dígitos: el índice único de 011 compara el texto tal cual, así que
  // "1.000.000.004" y "1000000004" serían dos tutores distintos para la
  // base aunque sean la misma persona.
  if ('cedula'    in body) out.cedula    = String(body.cedula ?? '').replace(/\D/g, '') || null;
  if ('telefono2' in body) {
    // Un segundo teléfono igual al primero no es un segundo teléfono. Pasa
    // cuando alguien copia y pega la celda del formulario.
    const tel2 = String(body.telefono2 ?? '').trim();
    out.telefono2 = tel2 && tel2 !== t(body.telefono) ? tel2 : null;
  }
  return out;
}

// Convierte FormData de ModalMascota a objeto + sube foto si viene archivo
async function parseMascotaBody(body, fotoActual = null) {
  const isFD = typeof FormData !== 'undefined' && body instanceof FormData;
  const g = (k) => (isFD ? body.get(k) : body[k]);
  let foto = fotoActual;
  const file = isFD ? body.get('foto') : body.foto;
  if (file && typeof file === 'object' && file.size > 0 && file.name) {
    foto = await subirFoto(file);
  }
  const num = (v, f = null) => (v === '' || v == null ? f : Number(v));

  // Migración 011. Cuando hay fecha de nacimiento, la edad se DERIVA de
  // ella y se ignora lo que venga en los dos campos de edad. Si no se
  // hiciera, quedarían dos verdades en la misma fila: la fecha diciendo
  // una edad y las columnas diciendo otra, y nadie sabría cuál creer.
  // Las columnas se siguen guardando —no se vuelven null— porque las lee
  // media app (Mascotas, Historias, Calendario) y porque las mascotas
  // viejas solo tienen eso.
  const nacimiento = String(g('fecha_nacimiento') ?? '').trim() || null;
  const derivada = nacimiento ? edadDesde(nacimiento) : null;

  return {
    nombre: g('nombre'),
    especie: g('especie'),
    raza: g('raza') || null,
    // `edadDesde` devuelve null si la fecha es imposible o está en el
    // futuro. En ese caso se respeta lo escrito a mano en vez de poner 0.
    edad_anios: derivada ? derivada.anios : num(g('edad_anios'), 0),
    edad_meses: derivada ? derivada.meses : num(g('edad_meses'), 0),
    fecha_nacimiento: nacimiento,
    peso: num(g('peso'), null),
    dueno_id: num(g('dueno_id'), null),
    foto,
  };
}

// bounds lunes..domingo de la semana que contiene dateStr (ISO week)
function boundsSemana(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 dom .. 6 sab
  const diffLun = day === 0 ? -6 : 1 - day;
  const lun = new Date(d); lun.setDate(d.getDate() + diffLun);
  const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
  return [iso(lun), iso(dom)];
}

// ---------- endpoints ----------
// Cada handler recibe ({ id, sub, params, body }) y devuelve la data cruda.

const routes = [
  // ===== MASCOTAS =====
  { m: 'GET', re: /^\/mascotas$/, fn: async () => {
    const rows = unwrap(await supabase.from('mascotas').select(SEL_MASCOTA).order('nombre', { ascending: true }));
    return rows.map(flattenMascota);
  }},
  { m: 'GET', re: /^\/mascotas\/buscar$/, fn: async ({ params }) => {
    const q = params?.q;
    if (!q) return [];
    const rows = unwrap(await supabase.from('mascotas').select(SEL_MASCOTA).ilike('nombre', `%${q}%`).order('nombre'));
    return rows.map(flattenMascota);
  }},
  { m: 'GET', re: /^\/mascotas\/(\d+)$/, fn: async ({ id }) => {
    const row = unwrap(await supabase.from('mascotas').select(SEL_MASCOTA).eq('id', id).single());
    return flattenMascota(row);
  }},
  { m: 'POST', re: /^\/mascotas$/, fn: async ({ body }) => {
    const datos = await parseMascotaBody(body);
    const row = unwrap(await supabase.from('mascotas').insert(datos).select(SEL_MASCOTA).single());
    return flattenMascota(row);
  }},
  { m: 'PUT', re: /^\/mascotas\/(\d+)$/, fn: async ({ id, body }) => {
    const actual = unwrap(await supabase.from('mascotas').select('foto').eq('id', id).single());
    const datos = await parseMascotaBody(body, actual?.foto ?? null);
    const row = unwrap(await supabase.from('mascotas').update(datos).eq('id', id).select(SEL_MASCOTA).single());
    return flattenMascota(row);
  }},
  { m: 'DELETE', re: /^\/mascotas\/(\d+)$/, fn: async ({ id }) => {
    // `archivos_mascota.mascota_id` es `on delete cascade`, así que
    // Postgres se lleva las FILAS solo. Los OBJETOS del bucket no: Storage
    // no tiene ninguna llave foránea contra `mascotas`, y nunca se borran
    // por SQL —un `delete from storage.objects` deja el archivo en el
    // disco, y desde 2026-03-05 un trigger lo rechaza. Hay que pedírselo a
    // la Storage API, acá, antes.
    const archivos = unwrap(await supabase
      .from('archivos_mascota').select('ruta').eq('mascota_id', id));

    if (archivos.length > 0) {
      // Una sola llamada con todas las rutas, no una por archivo: diez
      // viajes para borrar una mascota es medio segundo de nada.
      const borrado = await supabase.storage
        .from('documentos').remove(archivos.map((a) => a.ruta));

      // ASIMETRÍA A PROPÓSITO, y es lo contrario de DELETE /archivos/:id.
      //
      // Allá el `.remove()` que falla aborta todo, porque el objetivo era
      // borrar ESE archivo y no se logró.
      //
      // Acá lo que se mandó borrar es la MASCOTA. Dejarla viva porque
      // Storage tuvo un hipo le deja a la clínica una mascota que no se
      // puede borrar y ninguna explicación de por qué. El huérfano, en
      // cambio, no se ve, no le miente a nadie, y el barrido lo encuentra.
      // Se falla hacia el huérfano.
      if (borrado.error) {
        console.warn(
          `[api] la mascota ${id} se borró pero quedaron ${archivos.length} objetos huérfanos:`,
          borrado.error.message
        );
      } else {
        // `.remove()` devuelve éxito aunque no haya borrado todos los objetos
        // de la lista: los que no estaban en Storage —o los que la política
        // negó— simplemente no aparecen en `data`. No hay error. Se avisa
        // cuántos se quedaron para que el barrido los encuentre.
        const borrados = (borrado.data || []).length;
        if (borrados < archivos.length) {
          console.warn(
            `[api] mascota ${id}: se pidió borrar ${archivos.length} objetos, Storage confirmó ${borrados}`
          );
        }
      }
    }

    unwrap(await supabase.from('mascotas').delete().eq('id', id));
    return { mensaje: 'Mascota eliminada correctamente' };
  }},

  // ===== ARCHIVOS DE MASCOTA =====
  // Documentos clínicos en PDF. La tabla y el bucket son de
  // 015_archivos_mascota.sql.
  { m: 'GET', re: /^\/archivos\/mascota\/(\d+)$/, fn: async ({ id }) =>
    unwrap(await supabase
      .from('archivos_mascota')
      .select('*')
      .eq('mascota_id', id)
      .order('created_at', { ascending: false })) },

  { m: 'POST', re: /^\/archivos$/, fn: async ({ body }) => {
    // `parseMascotaBody` ya estableció el patrón: un getter `g` que sabe si
    // el body es FormData o un objeto plano, y lee el campo correcto en cada
    // caso. Sin él, `body?.cuantos_hay` y los demás campos siempre son
    // `undefined` cuando el llamador manda FormData — body.get() no es lo
    // mismo que body.campo.
    const isFD = typeof FormData !== 'undefined' && body instanceof FormData;
    const g = (k) => (isFD ? body.get(k) : body?.[k]);

    const file = g('archivo');

    // `cuantos_hay` ausente no es lo mismo que cero: cero archivos existentes
    // es un estado válido del sistema; campo no enviado indica un llamador
    // que no conoce la interfaz. Se valida igual que `mascota_id` y `tipo`.
    const cuantosRaw = g('cuantos_hay');
    if (cuantosRaw == null || cuantosRaw === '') throw apiError('Falta indicar cuántos archivos tiene la mascota');
    // Y un valor que no es número tampoco sirve: `Number('abc')` da NaN, y
    // `NaN >= MAX_POR_MASCOTA` es false, así que el cupo se apagaría igual
    // que si el campo no hubiera llegado. Un FormData manda strings siempre,
    // de ahí que se convierta antes de mirarlo.
    const cuantosHay = Number(cuantosRaw);
    if (!Number.isFinite(cuantosHay) || cuantosHay < 0) throw apiError('No se pudo leer cuántos archivos tiene la mascota');

    // El chequeo del frontend corre ACÁ y no solo en el componente, para
    // que ninguna pantalla futura pueda saltárselo. Es la capa que da el
    // mensaje útil; las otras dos (el check de la tabla y el límite del
    // bucket) solo rechazan.
    const veredicto = revisarArchivo(file, cuantosHay);
    if (!veredicto.ok) throw apiError(veredicto.motivo);

    const mascotaIdRaw = g('mascota_id');
    if (!mascotaIdRaw) throw apiError('Falta decir de qué mascota es el archivo');
    // Se coerciona a número aquí y no en el insert: si el valor no es un
    // entero válido, Postgres lo rechaza con un error de tipo crudo en inglés.
    // Fallando aquí se da un mensaje claro antes de tocar el bucket.
    const mascotaId = Number(mascotaIdRaw);
    if (!Number.isFinite(mascotaId) || mascotaId <= 0) throw apiError('El identificador de mascota no es válido');

    if (!g('tipo')) throw apiError('Falta elegir qué tipo de documento es');

    // PRIMERO el bucket, DESPUÉS la fila. El orden es la decisión central
    // de todo esto.
    //
    // Al revés —fila primero— una subida que falla a mitad deja una fila
    // que dice "acá hay un examen de sangre" apuntando a un objeto que no
    // existe: la lista lo muestra, la clínica lo clickea, y no abre nada.
    // Nadie puede distinguir eso de un bug.
    //
    // En este orden lo que queda si algo falla es un objeto sin fila: no se
    // ve en ninguna pantalla, no le miente a nadie, y el barrido de huérfanos
    // lo encuentra. Se falla hacia el huérfano. Excepción no contemplada: si
    // el insert se confirma pero la respuesta se pierde (timeout, corte de
    // red), `unwrap` lanza, el catch borra el objeto, y la fila queda apuntando
    // a nada — exactamente el estado que este orden intenta evitar. Es un
    // caso de borde, no el flujo normal; el trade-off sigue valiendo.
    const ruta = await subirDocumento(file, mascotaId);

    try {
      return unwrap(await supabase.from('archivos_mascota').insert({
        mascota_id:      mascotaId,
        ruta,
        nombre:          file.name,
        tipo:            g('tipo'),
        descripcion:     g('descripcion') || null,
        fecha_documento: g('fecha_documento') || null,
        peso_bytes:      file.size,
      }).select('*').single());
    } catch (err) {
      // El insert falló: el objeto que se acaba de subir no tiene dueño.
      // Se borra acá mismo en vez de dejárselo al barrido, porque el
      // barrido lo corre el dueño de VetaApp a mano y esto pasa en el
      // segundo.
      //
      // Si el `.remove()` también falla no se dice nada a la clínica: su
      // problema es el insert, y es el que se le va a mostrar. El huérfano
      // queda para el barrido, que es exactamente para lo que existe.
      //
      // `.remove()` puede devolver éxito con `data` vacío si el objeto ya
      // no existía o si la política lo negó sin error. Se avisa en consola
      // para que el barrido lo encuentre; no se lanza nada extra.
      const limpieza = await supabase.storage.from('documentos').remove([ruta]);
      if (limpieza.error) {
        console.warn('[api] quedó un objeto huérfano en documentos:', ruta, limpieza.error.message);
      } else if (!limpieza.data || limpieza.data.length === 0) {
        console.warn('[api] rollback sin confirmación de borrado — posible huérfano en documentos:', ruta);
      }

      // El trigger y los checks de 015 levantan nombres secos. Acá se
      // vuelven la misma frase que habría dicho la pantalla.
      const frase = traducirErrorSql(err?.response?.data?.error || err?.message);
      throw frase ? apiError(frase) : err;
    }
  }},

  // La URL firmada se pide EN EL CLIC y vive 300 segundos.
  //
  // No se guarda en una columna, y no es una sutileza: una URL firmada
  // guardada es una llave con fecha de vencimiento en un campo de texto.
  // Vencida, la fila sigue ahí y el botón abre un error. Y mientras no
  // está vencida, cualquiera que la vea entra sin sesión.
  //
  // 300 s porque el único uso es abrir el PDF en otra pestaña, ahora. Más
  // tiempo es una llave de más duración por nada; menos, y un PDF de 5 MB
  // en el internet de una clínica en Girón no termina de bajar.
  { m: 'GET', re: /^\/archivos\/(\d+)\/url$/, fn: async ({ id }) => {
    const fila = unwrap(await supabase
      .from('archivos_mascota').select('ruta').eq('id', id).single());

    const { data, error } = await supabase.storage
      .from('documentos').createSignedUrl(fila.ruta, 300);
    if (error) throw apiError(error.message);

    return { url: data.signedUrl };
  }},

  { m: 'DELETE', re: /^\/archivos\/(\d+)$/, fn: async ({ id }) => {
    const fila = unwrap(await supabase
      .from('archivos_mascota').select('ruta').eq('id', id).single());

    // PRIMERO el objeto, DESPUÉS la fila: el mismo criterio que la subida,
    // leído al revés. Si se borrara la fila primero y el objeto fallara,
    // el archivo quedaría pagándose para siempre sin que nada lo nombre.
    //
    // Y si el objeto se borra pero la fila no, la clínica ve un archivo
    // que no abre — malo, pero visible, y se arregla volviendo a darle
    // "Borrar". Es el modo de falla que se puede reintentar.
    //
    // Asimetría de `.remove()`: devuelve `{ error: null }` aunque no haya
    // borrado nada. Storage contesta con la lista de objetos que sí borró, y
    // el que no estaba —o el que la política negó— simplemente no aparece en
    // `data`, sin error. Así que `borrado.error` atrapa fallas de red y de
    // autenticación, no el "borré cero objetos".
    //
    // Cuando pasa eso la fila SE BORRA IGUAL, y es a propósito: desde el
    // cliente no hay forma de distinguir "el objeto ya no estaba" (el caso
    // normal si el barrido pasó antes) de "la política lo negó" (no
    // alcanzable para un archivo propio, porque las cuatro políticas del
    // bucket gatean por el primer segmento de la ruta, que es el uid del
    // que llama). Frenar acá dejaría a la clínica con una fila que no puede
    // sacar nunca de la ficha, que es peor que un huérfano. Se avisa en
    // consola para que el huérfano quede nombrado en alguna parte.
    const borrado = await supabase.storage.from('documentos').remove([fila.ruta]);
    if (borrado.error) throw apiError(borrado.error.message);
    if (!borrado.data || borrado.data.length === 0) {
      console.warn('[api] DELETE /archivos: Storage reportó éxito sin borrar el objeto — posible huérfano:', fila.ruta);
    }

    unwrap(await supabase.from('archivos_mascota').delete().eq('id', id));
    return { mensaje: 'Archivo eliminado' };
  }},

  // ===== DUEÑOS =====
  { m: 'GET', re: /^\/duenos\/buscar$/, fn: async ({ params }) => {
    const tel = params?.telefono;
    if (!tel) return null;
    const row = unwrap(await supabase.from('duenos').select('*').eq('telefono', String(tel).trim()).maybeSingle());
    return row || null;
  }},
  { m: 'GET', re: /^\/duenos$/, fn: async () => unwrap(await supabase.from('duenos').select('*').order('nombre')) },
  { m: 'GET', re: /^\/duenos\/(\d+)$/, fn: async ({ id }) => unwrap(await supabase.from('duenos').select('*').eq('id', id).single()) },
  { m: 'POST', re: /^\/duenos$/, fn: async ({ body }) => {
    return unwrap(await supabase.from('duenos').insert(parseDuenoBody(body)).select('*').single());
  }},
  { m: 'PUT', re: /^\/duenos\/(\d+)$/, fn: async ({ id, body }) => {
    return unwrap(await supabase.from('duenos').update(parseDuenoBody(body)).eq('id', id).select('*').single());
  }},
  { m: 'DELETE', re: /^\/duenos\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('duenos').delete().eq('id', id));
    return { mensaje: 'Dueño eliminado correctamente' };
  }},

  // ===== DASHBOARD =====
  // Todo lo que devuelve sale de la base. Si una clínica no tiene datos, el
  // dashboard muestra ceros: es preferible a inventar cifras bonitas.
  { m: 'GET', re: /^\/dashboard$/, fn: async () => {
    const h = hoy();
    const [lunes, domingo] = boundsSemana(h);
    // Instante real del 1 del mes en hora local; created_at es timestamptz y
    // comparar contra un texto sin zona corre la frontera 5 horas en Colombia.
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const [citasHoy, atendidosHoy, citasAyer, totalMascotas, mascotasNuevasMes, vacunasProximas, vacunasUrgentes, vacunasSemana] = await Promise.all([
      count('citas', (q) => q.eq('fecha', h)),
      count('citas', (q) => q.eq('fecha', h).eq('estado', 'atendida')),
      count('citas', (q) => q.eq('fecha', masDias(-1))),
      count('mascotas'),
      count('mascotas', (q) => q.gte('created_at', inicioMes)),
      count('vacunas', (q) => q.gte('proxima_dosis', h).lte('proxima_dosis', masDias(30))),
      count('vacunas', (q) => q.gte('proxima_dosis', h).lte('proxima_dosis', masDias(3))),
      count('vacunas', (q) => q.gte('proxima_dosis', masDias(4)).lte('proxima_dosis', masDias(7))),
    ]);

    const [citasDelDiaRaw, citasSemanaRaw, mascotasEspecie] = await Promise.all([
      supabase.from('citas').select('*, mascotas(nombre,especie)').eq('fecha', h).neq('estado', 'cancelada').order('hora', { ascending: true }),
      supabase.from('citas').select('fecha').gte('fecha', lunes).lte('fecha', domingo).neq('estado', 'cancelada'),
      supabase.from('mascotas').select('especie'),
    ]).then((rs) => rs.map(unwrap));

    const citasDelDia = citasDelDiaRaw.map((c) => {
      const m = c.mascotas || {}; const { mascotas, ...r } = c;
      return { ...r, mascota_nombre: m.nombre ?? null, especie: m.especie ?? null };
    });

    // Lunes..domingo de la semana en curso, contando citas reales por día.
    const idxDia = (fecha) => { const d = new Date(`${fecha}T00:00:00`).getDay(); return d === 0 ? 6 : d - 1; };
    const semana = [0, 0, 0, 0, 0, 0, 0];
    for (const c of citasSemanaRaw) semana[idxDia(c.fecha)] += 1;

    // Se agrupa por el texto crudo; normalizar y elegir color es cosa de la UI.
    const porEspecie = new Map();
    for (const m of mascotasEspecie) {
      const k = (m.especie || '').trim() || 'otro';
      porEspecie.set(k, (porEspecie.get(k) || 0) + 1);
    }
    const especies = [...porEspecie].map(([especie, total]) => ({ especie, total })).sort((a, b) => b.total - a.total);

    return {
      citasHoy, atendidosHoy, citasAyer, totalMascotas, mascotasNuevasMes,
      vacunasProximas, vacunasUrgentes, vacunasSemana,
      citasDelDia, semana, semanaHoy: idxDia(h), especies,
    };
  }},

  // ===== CITAS =====
  { m: 'GET', re: /^\/citas$/, fn: async ({ params = {} }) => {
    let q = supabase.from('citas').select(SEL_CITA);
    if (params.fecha) q = q.eq('fecha', params.fecha);
    else if (params.semana) { const [a, b] = boundsSemana(params.semana); q = q.gte('fecha', a).lte('fecha', b); }
    if (params.estado) q = q.eq('estado', params.estado);
    const rows = unwrap(await q.order('fecha', { ascending: true }).order('hora', { ascending: true }));
    return rows.map(flattenCita);
  }},
  { m: 'GET', re: /^\/citas\/(\d+)$/, fn: async ({ id }) => flattenCita(unwrap(await supabase.from('citas').select(SEL_CITA).eq('id', id).single())) },
  { m: 'POST', re: /^\/citas$/, fn: async ({ body }) => {
    const { mascota_id, veterinario, fecha, hora, motivo, notas } = body;
    const row = unwrap(await supabase.from('citas').insert({ mascota_id, veterinario, fecha, hora, motivo, notas: notas || null }).select(SEL_CITA).single());
    return flattenCita(row);
  }},
  { m: 'PUT', re: /^\/citas\/(\d+)$/, fn: async ({ id, body }) => {
    const { mascota_id, veterinario, fecha, hora, motivo, estado, notas } = body;
    const row = unwrap(await supabase.from('citas').update({ mascota_id, veterinario, fecha, hora, motivo, estado, notas }).eq('id', id).select(SEL_CITA).single());
    return flattenCita(row);
  }},
  { m: 'PATCH', re: /^\/citas\/(\d+)\/estado$/, fn: async ({ id, body }) => {
    const row = unwrap(await supabase.from('citas').update({ estado: body.estado }).eq('id', id).select(SEL_CITA).single());
    return flattenCita(row);
  }},
  { m: 'DELETE', re: /^\/citas\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('citas').delete().eq('id', id));
    return { mensaje: 'Cita eliminada correctamente' };
  }},

  // ===== TRATAMIENTOS (calendario) =====
  { m: 'GET', re: /^\/tratamientos\/proximos$/, fn: async ({ params = {} }) => {
    const dias = Math.min(parseInt(params.dias) || 30, 365);
    let q = supabase.from('tratamientos').select(SEL_TRATAMIENTO).gte('fecha', hoy()).lte('fecha', masDias(dias));
    if (params.tipo) q = q.eq('tipo', params.tipo);
    return unwrap(await q.order('fecha', { ascending: true }).order('hora', { ascending: true })).map(flattenTratamiento);
  }},
  { m: 'GET', re: /^\/tratamientos$/, fn: async ({ params = {} }) => {
    let q = supabase.from('tratamientos').select(SEL_TRATAMIENTO);
    if (params.mes) q = q.like('fecha', `${params.mes}%`);
    if (params.tipo) q = q.eq('tipo', params.tipo);
    return unwrap(await q.order('fecha', { ascending: true }).order('hora', { ascending: true })).map(flattenTratamiento);
  }},
  { m: 'POST', re: /^\/tratamientos$/, fn: async ({ body }) => {
    const { mascota_id, tipo, fecha, hora, notas } = body;
    const row = unwrap(await supabase.from('tratamientos').insert({ mascota_id, tipo, fecha, hora: hora || null, notas: notas || null }).select(SEL_TRATAMIENTO).single());
    return flattenTratamiento(row);
  }},
  { m: 'DELETE', re: /^\/tratamientos\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('tratamientos').delete().eq('id', id));
    return { mensaje: 'Tratamiento eliminado' };
  }},

  // ===== RECORDATORIOS (derivado de vacunas) =====
  // Contador del badge del menú: vacunas urgentes (hoy y los próximos 7
  // días) a las que NO se les ha avisado en esa misma ventana. Si el badge
  // contara también las ya avisadas, seguiría en rojo para siempre y la
  // veterinaria aprendería a ignorarlo.
  { m: 'GET', re: /^\/recordatorios\/pendientes$/, fn: async () => {
    const urgentes = unwrap(await supabase.from('vacunas').select('id')
      .gte('proxima_dosis', hoy()).lte('proxima_dosis', masDias(7)));
    if (urgentes.length === 0) return { urgentes: 0 };
    const avisados = await avisosRecientes(urgentes.map((v) => v.id));
    return { urgentes: urgentes.filter((v) => !avisados.has(v.id)).length };
  }},
  { m: 'GET', re: /^\/recordatorios\/vacunas$/, fn: async ({ params = {} }) => {
    const dias = parseInt(params.dias) || 30;
    const rows = unwrap(await supabase.from('vacunas')
      .select('*, mascotas(nombre,especie,raza,duenos(nombre,telefono))')
      .gte('proxima_dosis', hoy()).lte('proxima_dosis', masDias(dias))
      .order('proxima_dosis', { ascending: true }));
    const avisos = await ultimoAvisoPorVacuna(rows.map((v) => v.id));
    return rows.map((v) => {
      const m = v.mascotas || {}; const d = m.duenos || {}; const { mascotas, ...r } = v;
      return { ...r, mascota_nombre: m.nombre ?? null, especie: m.especie ?? null, raza: m.raza ?? null,
               dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null,
               avisado_at: avisos.get(v.id) ?? null };
    });
  }},
  // Registro de un aviso ya enviado. Lo llama la página DESPUÉS de abrir
  // WhatsApp: no envía nada, solo deja constancia de que se escribió.
  // Copia nombre y teléfono porque la vacuna puede borrarse después.
  { m: 'POST', re: /^\/recordatorios\/avisos$/, fn: async ({ body }) => {
    const { vacuna_id, mascota_nombre, dueno_nombre, telefono, mensaje } = body || {};
    return unwrap(await supabase.from('avisos').insert({
      vacuna_id: vacuna_id ?? null,
      mascota_nombre: mascota_nombre || null,
      dueno_nombre: dueno_nombre || null,
      telefono: telefono || null,
      mensaje: mensaje || null,
    }).select('*').single());
  }},
  { m: 'GET', re: /^\/recordatorios\/avisos$/, fn: async ({ params = {} }) => {
    const dias = parseInt(params.dias) || 30;
    const desde = new Date(); desde.setDate(desde.getDate() - dias);
    return unwrap(await supabase.from('avisos').select('*')
      .gte('enviado_at', desde.toISOString())
      .order('enviado_at', { ascending: false }));
  }},

  // ===== HISTORIAS CLÍNICAS =====
  { m: 'GET', re: /^\/historias\/mascota\/(\d+)$/, fn: async ({ id }) =>
    unwrap(await supabase.from('historias_clinicas').select('*').eq('mascota_id', id).order('fecha', { ascending: false })) },
  { m: 'POST', re: /^\/historias$/, fn: async ({ body }) => {
    const { mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas, medicamentos_ids } = body;
    let ids = [];
    try { ids = JSON.parse(medicamentos_ids || '[]'); } catch { throw new Error('medicamentos_ids debe ser un JSON válido'); }
    const historia = unwrap(await supabase.from('historias_clinicas').insert({
      mascota_id, fecha, motivo, diagnostico: diagnostico || null, tratamiento: tratamiento || null,
      medicamentos: medicamentos || null, veterinario: veterinario || null, peso: peso ?? null,
      notas: notas || null, medicamentos_ids: medicamentos_ids || null,
    }).select('*').single());
    const warnings = [];
    for (const pid of ids) {
      if (!Number.isInteger(pid)) continue;
      const prod = unwrap(await supabase.from('inventario').select('nombre,cantidad').eq('id', pid).maybeSingle());
      if (!prod) continue;
      const nueva = (prod.cantidad ?? 0) - 1;
      await supabase.from('inventario').update({ cantidad: nueva }).eq('id', pid);
      if (nueva <= 0) warnings.push(`${prod.nombre} quedó sin stock`);
    }
    return { ...historia, warnings };
  }},
  { m: 'PUT', re: /^\/historias\/(\d+)$/, fn: async ({ id, body }) => {
    const { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas, medicamentos_ids } = body;
    return unwrap(await supabase.from('historias_clinicas').update({
      fecha: fecha || null, motivo: motivo || null, diagnostico: diagnostico || null, tratamiento: tratamiento || null,
      medicamentos: medicamentos || null, veterinario: veterinario || null, peso: peso ?? null,
      notas: notas || null, medicamentos_ids: medicamentos_ids || null,
    }).eq('id', id).select('*').single());
  }},
  { m: 'DELETE', re: /^\/historias\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('historias_clinicas').delete().eq('id', id));
    return { mensaje: 'Historia eliminada correctamente' };
  }},

  // ===== VACUNAS =====
  { m: 'GET', re: /^\/historias\/vacunas\/mascota\/(\d+)$/, fn: async ({ id }) =>
    unwrap(await supabase.from('vacunas').select('*').eq('mascota_id', id).order('fecha_aplicacion', { ascending: false })) },
  { m: 'POST', re: /^\/historias\/vacunas$/, fn: async ({ body }) => {
    const { mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario, notas } = body;
    return unwrap(await supabase.from('vacunas').insert({ mascota_id, nombre, fecha_aplicacion, proxima_dosis: proxima_dosis || null, veterinario: veterinario || null, notas: notas || null }).select('*').single());
  }},
  { m: 'DELETE', re: /^\/historias\/vacunas\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('vacunas').delete().eq('id', id));
    return { mensaje: 'Vacuna eliminada correctamente' };
  }},

  // ===== INVENTARIO =====
  { m: 'GET', re: /^\/inventario\/alertas$/, fn: async () => {
    const rows = unwrap(await supabase.from('inventario').select('cantidad,cantidad_minima'));
    return { count: rows.filter((r) => (r.cantidad ?? 0) <= (r.cantidad_minima ?? 0)).length };
  }},
  { m: 'GET', re: /^\/inventario\/buscar$/, fn: async ({ params = {} }) => {
    const q = params.q ?? '';
    return unwrap(await supabase.from('inventario').select('id,nombre,cantidad,unidad').ilike('nombre', `%${q}%`).order('nombre').limit(8));
  }},
  { m: 'GET', re: /^\/inventario$/, fn: async () => unwrap(await supabase.from('inventario').select('*').order('nombre')) },
  { m: 'POST', re: /^\/inventario$/, fn: async ({ body }) => {
    const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = body;
    return unwrap(await supabase.from('inventario').insert({ nombre, categoria, cantidad: parseInt(cantidad, 10), cantidad_minima: parseInt(cantidad_minima, 10), precio_compra: precio_compra ?? null, precio_venta: precio_venta ?? null, unidad }).select('*').single());
  }},
  { m: 'PUT', re: /^\/inventario\/(\d+)$/, fn: async ({ id, body }) => {
    const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = body;
    return unwrap(await supabase.from('inventario').update({ nombre, categoria, cantidad: parseInt(cantidad, 10), cantidad_minima: parseInt(cantidad_minima, 10), precio_compra: precio_compra ?? null, precio_venta: precio_venta ?? null, unidad }).eq('id', id).select('*').single());
  }},
  { m: 'POST', re: /^\/inventario\/(\d+)\/ajustar$/, fn: async ({ id, body }) => {
    const prod = unwrap(await supabase.from('inventario').select('cantidad').eq('id', id).single());
    const nueva = (prod.cantidad ?? 0) + parseInt(body.delta, 10);
    return unwrap(await supabase.from('inventario').update({ cantidad: nueva }).eq('id', id).select('*').single());
  }},
  { m: 'DELETE', re: /^\/inventario\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('inventario').delete().eq('id', id));
    return { mensaje: 'Producto eliminado correctamente' };
  }},

  // ===== CAJA (cobros / recibos de control interno) =====
  // Rango por días completos: `hasta` incluye ese día hasta las 23:59.
  // El desfase -05:00 es obligatorio: sin él Postgres lee la fecha como UTC
  // y los cobros de 7 p.m. a medianoche caen en el día siguiente.
  { m: 'GET', re: /^\/cobros$/, fn: async ({ params }) => {
    let q = supabase.from('cobros').select('*').order('fecha', { ascending: false });
    if (params.desde) q = q.gte('fecha', `${params.desde}T00:00:00-05:00`);
    if (params.hasta) q = q.lte('fecha', `${params.hasta}T23:59:59.999-05:00`);
    if (params.limit) q = q.limit(Number(params.limit));
    return unwrap(await q);
  }},
  { m: 'GET', re: /^\/cobros\/(\d+)$/, fn: async ({ id }) =>
    unwrap(await supabase.from('cobros').select('*').eq('id', id).single()) },
  { m: 'POST', re: /^\/cobros$/, fn: async ({ body }) => {
    const servicios = Array.isArray(body.servicios) ? body.servicios : [];
    if (!servicios.length) throw apiError('Agrega al menos un servicio');
    if (!body.mascota_id) throw apiError('Selecciona una mascota');

    // Copia del nombre al momento del cobro: el recibo debe seguir siendo
    // legible aunque después borren la mascota.
    const mascota = flattenMascota(
      unwrap(await supabase.from('mascotas').select(SEL_MASCOTA).eq('id', body.mascota_id).single())
    );

    // El total se recalcula aquí; se ignora el que mande el formulario.
    const subtotal = servicios.reduce((a, s) => a + (Number(s.precio) || 0), 0);
    const descuento = Math.min(Math.max(Number(body.descuento) || 0, 0), 100);
    const total = Math.round(subtotal * (1 - descuento / 100));

    return unwrap(await supabase.from('cobros').insert({
      mascota_id: mascota.id,
      mascota_nombre: mascota.nombre,
      dueno_nombre: mascota.dueno_nombre,
      servicios, subtotal, descuento, total,
      metodo_pago: body.metodo_pago || 'efectivo',
    }).select('*').single());
  }},
  { m: 'DELETE', re: /^\/cobros\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('cobros').delete().eq('id', id));
    return { mensaje: 'Cobro anulado' };
  }},

  // ===== ADMIN (solo rol = 'admin'; la BD valida es_admin() en cada RPC) =====
  { m: 'GET', re: /^\/admin\/veterinarias$/, fn: async () =>
    unwrap(await supabase.rpc('admin_listar_veterinarias')) },
  { m: 'PATCH', re: /^\/admin\/veterinarias\/([0-9a-fA-F-]{36})\/estado$/, fn: async ({ id, body }) =>
    unwrap(await supabase.rpc('admin_set_estado', { p_id: id, p_estado: body.estado })) },
  { m: 'PATCH', re: /^\/admin\/veterinarias\/([0-9a-fA-F-]{36})\/notas$/, fn: async ({ id, body }) =>
    unwrap(await supabase.rpc('admin_set_notas', { p_id: id, p_notas: body.notas ?? '' })) },
  { m: 'PATCH', re: /^\/admin\/veterinarias\/([0-9a-fA-F-]{36})\/plan$/, fn: async ({ id, body }) =>
    unwrap(await supabase.rpc('admin_set_plan', { p_id: id, p_plan: body.plan })) },
  { m: 'PATCH', re: /^\/admin\/veterinarias\/([0-9a-fA-F-]{36})\/prueba$/, fn: async ({ id, body }) =>
    unwrap(await supabase.rpc('admin_extender_prueba', { p_id: id, p_dias: body.dias })) },

  // ===== CONFIGURACIÓN (ajustes: 1 fila por usuario) =====
  { m: 'GET', re: /^\/configuracion$/, fn: async () => {
    const row = unwrap(await supabase.from('configuracion').select('*').maybeSingle());
    return row || null;
  }},
  { m: 'PUT', re: /^\/configuracion$/, fn: async ({ body }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...body, user_id: user.id, updated_at: new Date().toISOString() };
    return unwrap(await supabase.from('configuracion').upsert(payload, { onConflict: 'user_id' }).select('*').single());
  }},
  { m: 'POST', re: /^\/configuracion\/foto$/, fn: async ({ body }) => {
    const file = (typeof FormData !== 'undefined' && body instanceof FormData) ? body.get('foto') : body?.foto;
    if (!file || !file.name) throw apiError('No se recibió ningún archivo');
    const url = await subirFoto(file);
    return { url };
  }},
];

// ---------- dispatcher ----------

function splitUrl(url) {
  const [path, qs] = url.split('?');
  const params = {};
  if (qs) for (const [k, v] of new URLSearchParams(qs)) params[k] = v;
  return { path: path.replace(/\/+$/, '') || '/', inlineParams: params };
}

async function dispatch(method, url, body, config) {
  const { path, inlineParams } = splitUrl(url);
  const params = { ...inlineParams, ...(config?.params || {}) };
  for (const r of routes) {
    if (r.m !== method) continue;
    const match = path.match(r.re);
    if (!match) continue;
    const id = match[1];
    try {
      const data = await r.fn({ id, params, body });
      return { data };
    } catch (err) {
      console.error(`[api] ${method} ${path} falló:`, err);
      throw err.response ? err : apiError(err.message);
    }
  }
  throw apiError(`Ruta no soportada: ${method} ${path}`);
}

const api = {
  get: (url, config) => dispatch('GET', url, undefined, config),
  post: (url, body, config) => dispatch('POST', url, body, config),
  put: (url, body, config) => dispatch('PUT', url, body, config),
  patch: (url, body, config) => dispatch('PATCH', url, body, config),
  delete: (url, config) => dispatch('DELETE', url, undefined, config),
};

export default api;
