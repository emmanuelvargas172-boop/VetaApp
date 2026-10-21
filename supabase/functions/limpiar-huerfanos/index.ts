// ============================================================
//  limpiar-huerfanos — borra los objetos del storage que ninguna fila
//  nombra.
//
//  ---------- POR QUÉ EXISTE ----------
//  El camino normal ya limpia: subir borra el objeto si el insert falla,
//  borrar un archivo borra las dos cosas, y borrar una mascota borra sus
//  objetos antes de la fila. Esto es para lo que ese camino no cubre: la
//  pestaña que se cerró a mitad de la subida, el navegador que se quedó
//  sin internet entre el upload y el insert, y las fotos de las mascotas
//  que se borraron antes de que existiera este código.
//
//  ---------- POR QUÉ UNA EDGE FUNCTION Y NO UN TRIGGER ----------
//  Porque los objetos de Storage NO se borran con SQL. La documentación
//  oficial: "Deleting objects should always be done via the Storage API
//  and NOT via a SQL query [...] will result in the object being
//  orphaned." Y desde el 5 de marzo de 2026 Supabase lo rechaza con un
//  trigger a nivel de sentencia salvo que se prenda
//  `storage.allow_delete_query`.
//
//  Un trigger que borrara el objeto fue la primera idea de este diseño.
//  Se descartó al verificarla: era la causa más común del problema que
//  pretendía resolver.
//
//  ---------- POR QUÉ SE LLAMA A MANO ----------
//  No hay cron. La corre el dueño de VetaApp cuando la columna "Espacio"
//  del panel de Admin muestra un número que no cuadra. Un barrido
//  automático que borra archivos de clínicas que pagan, sin que nadie
//  mire el resultado, es la clase de cosa que se descubre tarde.
//
//  Desplegar:
//    supabase functions deploy limpiar-huerfanos
//
//  Llamar (con la sesión de la cuenta admin):
//    curl -X POST "$SUPABASE_URL/functions/v1/limpiar-huerfanos" \
//         -H "Authorization: Bearer $TOKEN_DEL_ADMIN"
//
//  En seco, sin borrar nada (es lo primero que hay que correr):
//    ... -H "Content-Type: application/json" -d '{"simular": true}'
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rutasHuerfanas, type ObjetoStorage } from '../_compartido/huerfanos.ts';

/**
 * Cuántos minutos tiene que tener un objeto para que "no tiene fila"
 * cuente como huérfano. Una hora: el orden de la subida es bucket y
 * después fila, y un objeto recién subido puede ser una subida en curso.
 */
const MINUTOS_GRACIA = 60;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/**
 * Todos los objetos de un bucket, con su ruta completa.
 *
 * `list()` no es recursivo: devuelve los archivos de UN prefijo y las
 * carpetas que hay abajo, con `id: null`. El bucket `documentos` tiene dos
 * niveles ({user_id}/{mascota_id}/) y `mascotas` tiene uno, así que hay
 * que bajar.
 *
 * `limit: 1000` es el techo de la API, y de ahí el `offset`: una clínica
 * con 54 mascotas de a 10 archivos ya pasa de 500, y un barrido que ve
 * solo los primeros 1000 objetos dejaría de limpiar en silencio el día
 * que el bucket supere esa cantidad.
 */
async function listarTodo(
  storage: ReturnType<typeof createClient>['storage'],
  bucket: string,
  prefijo = '',
  profundidad = 0,
): Promise<ObjetoStorage[]> {
  // Tres niveles alcanzan para {user_id}/{mascota_id}/{archivo}. El freno
  // está para que un bucket con una estructura rara no deje la función
  // dando vueltas hasta el timeout.
  if (profundidad > 3) return [];

  const salida: ObjetoStorage[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.from(bucket).list(prefijo, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list(${bucket}/${prefijo}): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      if (entrada.id === null) {
        salida.push(...await listarTodo(storage, bucket, ruta, profundidad + 1));
      } else {
        salida.push({ name: ruta, created_at: entrada.created_at, id: entrada.id });
      }
    }

    if (data.length < 1000) break;
    offset += data.length;
  }

  return salida;
}

/** Borra de a 100: `remove()` acepta un arreglo, pero no uno infinito. */
async function borrarEnLotes(
  storage: ReturnType<typeof createClient>['storage'],
  bucket: string,
  rutas: string[],
): Promise<string[]> {
  const fallaron: string[] = [];
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    const { error } = await storage.from(bucket).remove(lote);
    if (error) {
      console.error(`remove(${bucket}) falló en el lote ${i}:`, error.message);
      fallaron.push(...lote);
    }
  }
  return fallaron;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ---------- ¿quién pide? ----------
  // Esta función borra archivos de TODAS las clínicas. Lo primero que hace
  // es preguntar quién la llamó, con el token del invocador y no con nada
  // que venga en el cuerpo.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return responder({ error: 'Falta la sesión' }, 401);

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });

  const { data: quien, error: errAuth } = await comoUsuario.auth.getUser();
  if (errAuth || !quien?.user) return responder({ error: 'Sesión inválida' }, 401);

  // `es_admin()` es `security definer` y no tiene revoke (002_admin.sql:78-89),
  // así que `authenticated` la puede ejecutar — es lo que permite
  // preguntarle a la base, con el token del invocador, si es el dueño.
  // Preguntárselo a la base y no mirar `perfiles.rol` acá es la diferencia
  // entre una respuesta que no se puede falsificar y una que depende de qué
  // fila devolvió una consulta.
  const { data: esAdmin, error: errRol } = await comoUsuario.rpc('es_admin');
  if (errRol) return responder({ error: errRol.message }, 500);
  if (esAdmin !== true) return responder({ error: 'No autorizado' }, 403);

  // `simular: true` lista lo que borraría y no borra nada. Es el modo con
  // el que se corre la primera vez, siempre.
  let simular = false;
  try {
    const cuerpo = await req.json();
    simular = cuerpo?.simular === true;
  } catch {
    // Sin cuerpo o cuerpo inválido: barrido de verdad.
  }

  const comoServidor = createClient(url, service);
  const ahora = new Date();
  const salida: Record<string, unknown> = { simulacion: simular };

  try {
    // ---------- bucket documentos ----------
    const objDocs = await listarTodo(comoServidor.storage, 'documentos');
    const { data: filasDocs, error: eDocs } = await comoServidor
      .from('archivos_mascota').select('ruta');
    if (eDocs) throw new Error(`archivos_mascota: ${eDocs.message}`);

    const huerfanosDocs = rutasHuerfanas(
      objDocs, (filasDocs ?? []).map((f) => f.ruta), ahora, MINUTOS_GRACIA,
    );

    // ---------- bucket mascotas (las fotos) ----------
    // Va gratis con el mismo código, y tapa una fuga que existe desde
    // 001: borrar una mascota nunca borró su foto.
    //
    // `mascotas.foto` guarda una URL, no una ruta — `rutaDesdeValor` lo
    // resuelve adentro de `rutasHuerfanas`. Sin eso, ninguna foto
    // coincidiría y este barrido las borraría todas.
    const objFotos = await listarTodo(comoServidor.storage, 'mascotas');
    const { data: filasFotos, error: eFotos } = await comoServidor
      .from('mascotas').select('foto').not('foto', 'is', null);
    if (eFotos) throw new Error(`mascotas: ${eFotos.message}`);

    const huerfanosFotos = rutasHuerfanas(
      objFotos, (filasFotos ?? []).map((f) => f.foto), ahora, MINUTOS_GRACIA,
    );

    // ---------- borrar ----------
    let fallaronDocs: string[] = [];
    let fallaronFotos: string[] = [];
    if (!simular) {
      if (huerfanosDocs.length > 0) {
        fallaronDocs = await borrarEnLotes(comoServidor.storage, 'documentos', huerfanosDocs);
      }
      if (huerfanosFotos.length > 0) {
        fallaronFotos = await borrarEnLotes(comoServidor.storage, 'mascotas', huerfanosFotos);
      }
    }

    // Las rutas se devuelven completas, no solo el conteo: un barrido que
    // dice "borré 12" y no cuáles no se puede auditar, y es lo único que
    // queda de un archivo que ya no existe.
    salida.documentos = {
      revisados: objDocs.length,
      huerfanos: huerfanosDocs.length,
      rutas: huerfanosDocs,
      fallaron: fallaronDocs,
    };
    salida.mascotas = {
      revisados: objFotos.length,
      huerfanos: huerfanosFotos.length,
      rutas: huerfanosFotos,
      fallaron: fallaronFotos,
    };

    return responder(salida);
  } catch (err) {
    console.error('[limpiar-huerfanos]', err);
    return responder({ error: (err as Error).message }, 500);
  }
});
