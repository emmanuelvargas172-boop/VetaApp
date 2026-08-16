// Adaptador: expone la MISMA interfaz que axios (get/post/put/patch/delete → { data })
// pero por dentro habla con Supabase. Las páginas no cambian.
// RLS + `user_id default auth.uid()` aíslan los datos por veterinaria automáticamente:
// no hace falta pasar user_id en inserts ni filtrar por él en selects.
import { supabase } from '../lib/supabase';

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

// Aplana la relación anidada de dueño sobre la mascota
function flattenMascota(m) {
  if (!m) return m;
  const d = m.duenos || {};
  const { duenos, ...rest } = m;
  return { ...rest, dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null, dueno_direccion: d.direccion ?? null };
}

const SEL_MASCOTA = '*, duenos(nombre,telefono,direccion)';

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
  return {
    nombre: g('nombre'),
    especie: g('especie'),
    raza: g('raza') || null,
    edad_anios: num(g('edad_anios'), 0),
    edad_meses: num(g('edad_meses'), 0),
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
    unwrap(await supabase.from('mascotas').delete().eq('id', id));
    return { mensaje: 'Mascota eliminada correctamente' };
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
    const { nombre, telefono, direccion } = body;
    return unwrap(await supabase.from('duenos').insert({ nombre: nombre?.trim(), telefono: telefono?.trim(), direccion: direccion || null }).select('*').single());
  }},
  { m: 'PUT', re: /^\/duenos\/(\d+)$/, fn: async ({ id, body }) => {
    const { nombre, telefono, direccion } = body;
    return unwrap(await supabase.from('duenos').update({ nombre, telefono, direccion }).eq('id', id).select('*').single());
  }},
  { m: 'DELETE', re: /^\/duenos\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('duenos').delete().eq('id', id));
    return { mensaje: 'Dueño eliminado correctamente' };
  }},

  // ===== DASHBOARD =====
  { m: 'GET', re: /^\/dashboard$/, fn: async () => {
    const h = hoy();
    const [citasHoy, atendidosHoy, totalMascotas, vacunasProximas, vacunasUrgentes, vacunasSemana] = await Promise.all([
      count('citas', (q) => q.eq('fecha', h)),
      count('citas', (q) => q.eq('fecha', h).eq('estado', 'atendida')),
      count('mascotas'),
      count('vacunas', (q) => q.gte('proxima_dosis', h).lte('proxima_dosis', masDias(30))),
      count('vacunas', (q) => q.gte('proxima_dosis', h).lte('proxima_dosis', masDias(3))),
      count('vacunas', (q) => q.gte('proxima_dosis', masDias(4)).lte('proxima_dosis', masDias(7))),
    ]);
    const citasDelDia = (unwrap(
      await supabase.from('citas').select('*, mascotas(nombre,especie)').eq('fecha', h).neq('estado', 'cancelada').order('hora', { ascending: true })
    )).map((c) => { const m = c.mascotas || {}; const { mascotas, ...r } = c; return { ...r, mascota_nombre: m.nombre ?? null, especie: m.especie ?? null }; });
    return { citasHoy, atendidosHoy, totalMascotas, vacunasProximas, vacunasUrgentes, vacunasSemana, citasDelDia };
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
  { m: 'GET', re: /^\/recordatorios\/vacunas$/, fn: async ({ params = {} }) => {
    const dias = parseInt(params.dias) || 30;
    const rows = unwrap(await supabase.from('vacunas')
      .select('*, mascotas(nombre,especie,raza,duenos(nombre,telefono))')
      .gte('proxima_dosis', hoy()).lte('proxima_dosis', masDias(dias))
      .order('proxima_dosis', { ascending: true }));
    return rows.map((v) => { const m = v.mascotas || {}; const d = m.duenos || {}; const { mascotas, ...r } = v; return { ...r, mascota_nombre: m.nombre ?? null, especie: m.especie ?? null, raza: m.raza ?? null, dueno_nombre: d.nombre ?? null, dueno_telefono: d.telefono ?? null }; });
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
