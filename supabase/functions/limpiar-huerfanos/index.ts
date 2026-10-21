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
//  trigger a nivel de sentencia (verificado en api/axios.js:268-269).
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

// M4: constantes con nombre para que los dos usos del límite de Storage
// y el tamaño de lote se muevan juntos si alguna vez cambian.
// El límite de Storage se usa en listarTodo; el de lotes en borrarEnLotes.
const LIMITE_LIST = 1000;
const TAMANO_LOTE_REMOVE = 100;

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
 * M2: el bucle corta cuando la página vuelve vacía, no cuando devuelve
 * menos de LIMITE_LIST. Así es correcto sea cual sea el techo real del
 * servidor, y el código no depende de que sea 1000.
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
      limit: LIMITE_LIST,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list(${bucket}/${prefijo}): ${error.message}`);
    // M2: página vacía = no hay más. Salir.
    if (!data || data.length === 0) break;

    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      // M1: `== null` cubre tanto `null` como `undefined`.
      if (entrada.id == null) {
        salida.push(...await listarTodo(storage, bucket, ruta, profundidad + 1));
      } else {
        salida.push({ name: ruta, created_at: entrada.created_at, id: entrada.id });
      }
    }

    // M2: avanzar por lo que llegó. Si la API recortó la página, el bucle
    // continúa en vez de salir.
    offset += data.length;
  }

  return salida;
}

/**
 * Borra de a lotes: se acota el tamaño para no armar una petición
 * gigante si hay muchos huérfanos acumulados.
 *
 * I4: `remove()` devuelve `{ data: [objetos_borrados], error: null }` en
 * cualquier éxito HTTP. Un objeto que no borró simplemente está ausente
 * de `data`, sin error —igual que en `api/axios.js:295-300` y `:449-466`.
 * Comparamos el lote pedido contra lo que volvió en `data` para detectar
 * los que no se borraron.
 */
async function borrarEnLotes(
  storage: ReturnType<typeof createClient>['storage'],
  bucket: string,
  rutas: string[],
): Promise<string[]> {
  const fallaron: string[] = [];
  for (let i = 0; i < rutas.length; i += TAMANO_LOTE_REMOVE) {
    const lote = rutas.slice(i, i + TAMANO_LOTE_REMOVE);
    const { data, error } = await storage.from(bucket).remove(lote);
    if (error) {
      console.error(`remove(${bucket}) falló en el lote ${i}:`, error.message);
      fallaron.push(...lote);
    } else {
      // I4: verificar que `data` confirme cada ruta que pedimos borrar.
      // Las ausentes no son error de red pero tampoco fueron borradas.
      const borrados = new Set((data ?? []).map((o: { name: string }) => o.name));
      for (const ruta of lote) {
        if (!borrados.has(ruta)) {
          console.warn(`remove(${bucket}): Storage no confirmó el borrado de ${ruta}`);
          fallaron.push(ruta);
        }
      }
    }
  }
  return fallaron;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  // En las edge functions hosteadas estas tres las inyecta la plataforma;
  // el caso en que falta alguna es `supabase functions serve` local. El `!`
  // es solo para el compilador: `Deno.env.get` no lanza, devuelve
  // `undefined`. Quien lanza es `createClient`, y por eso se crea adentro
  // del try de abajo (ver el comentario de ahí).
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ---------- ¿quién pide? ----------
  // Esta función borra archivos de TODAS las clínicas. Lo primero que hace
  // es preguntar quién la llamó, con el token del invocador y no con nada
  // que venga en el cuerpo.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return responder({ error: 'Falta la sesión' }, 401);

  // Los dos clientes se crean adentro del try a propósito. Si falta
  // SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY, `createClient` lanza
  // `supabaseKey is required` en el constructor; afuera del try esa
  // excepción escaparía del handler y el runtime respondería un 500 opaco,
  // sin JSON y sin los headers CORS de arriba, que desde el navegador se
  // lee como error de CORS en vez del problema real.
  try {
    const comoUsuario = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });

    const { data: quien, error: errAuth } = await comoUsuario.auth.getUser();
    if (errAuth || !quien?.user) return responder({ error: 'Sesión inválida' }, 401);

    // `es_admin()` es `security definer` y no tiene revoke (002_admin.sql:78-89),
    // así que `authenticated` la puede ejecutar — es lo que permite
    // preguntarle a la base, con el token del invocador, si es el dueño.
    // M6: usar `auth.uid()` del JWT (que GoTrue ya validó) es lo que impide
    // falsificar la identidad: el uid no viene del cuerpo ni de ninguna
    // fila que el llamador pueda manipular.
    const { data: esAdmin, error: errRol } = await comoUsuario.rpc('es_admin');
    if (errRol) return responder({ error: errRol.message }, 500);
    if (esAdmin !== true) return responder({ error: 'No autorizado' }, 403);

    // I3: Se distingue "sin cuerpo" de "cuerpo roto".
    // Un POST sin cuerpo es una orden sin ambigüedad: barrido de verdad.
    // Un cuerpo que no parsea o que tiene `simular` con un tipo inesperado
    // es ambiguo y se rechaza con 400 —hacer el barrido con un JSON mal
    // escrito sería peor que no hacerlo.
    let simular = false;
    const textoRaw = await req.text();
    if (textoRaw.trim().length > 0) {
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(textoRaw);
      } catch {
        return responder({ error: 'Cuerpo inválido: no es JSON válido' }, 400);
      }
      const c = cuerpo as Record<string, unknown>;
      if ('simular' in c) {
        if (typeof c.simular !== 'boolean') {
          return responder(
            { error: '`simular` tiene que ser booleano (true o false)' },
            400,
          );
        }
        simular = c.simular;
      }
    }

    const comoServidor = createClient(url, service);
    const ahora = new Date();
    const salida: Record<string, unknown> = { simulacion: simular };

    // ---------- bucket documentos ----------
    const objDocs = await listarTodo(comoServidor.storage, 'documentos');

    // C1: paginamos con .range() + .order('id') para no depender del techo
    // de PostgREST. Sin orden estable dos .range() consecutivos pueden
    // repetir o saltear filas. Sin paginación, PostgREST devuelve 200 con
    // las primeras N filas y sin error —la base silencia el truncamiento.
    //
    // Antes de paginar pedimos el conteo exacto y al terminar verificamos
    // que trajimos exactamente esa cantidad. Esta guarda es la que de verdad
    // protege: "traje menos filas de las que hay" es un estado que el modo
    // simulación no puede detectar, porque simula con la misma consulta
    // truncada. Si el conteo no cierra, tira antes de borrar nada.
    const TAMANO_PAGINA_PG = 1000;

    const { count: conteoDocsTotal, error: eContDocs } = await comoServidor
      .from('archivos_mascota')
      .select('ruta', { count: 'exact', head: true });
    if (eContDocs) throw new Error(`archivos_mascota conteo: ${eContDocs.message}`);

    const filasDocs: { ruta: string }[] = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA_PG) {
      const { data, error } = await comoServidor
        .from('archivos_mascota')
        .select('ruta')
        .order('id', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA_PG - 1);
      if (error) throw new Error(`archivos_mascota: ${error.message}`);
      const lote = data ?? [];
      filasDocs.push(...lote);
      if (lote.length < TAMANO_PAGINA_PG) break;
    }

    // Guarda de conteo: si trajimos menos filas de las que hay en la base,
    // algo truncó la consulta y el barrido borraría archivos buenos.
    if (conteoDocsTotal !== null && filasDocs.length !== conteoDocsTotal) {
      throw new Error(
        `archivos_mascota: se esperaban ${conteoDocsTotal} filas, se trajeron ${filasDocs.length}. ` +
        'Abortando antes de borrar nada.',
      );
    }

    const huerfanosDocs = rutasHuerfanas(
      objDocs, filasDocs.map((f) => f.ruta), ahora, MINUTOS_GRACIA,
    );

    // ---------- bucket mascotas (las fotos) ----------
    // Va gratis con el mismo código, y tapa una fuga que existe desde
    // 001: borrar una mascota nunca borró su foto.
    //
    // `mascotas.foto` guarda una URL, no una ruta — `rutaDesdeValor` lo
    // resuelve adentro de `rutasHuerfanas`. Sin eso, ninguna foto
    // coincidiría y este barrido las borraría todas.
    const objFotos = await listarTodo(comoServidor.storage, 'mascotas');

    const { count: conteoFotosTotal, error: eContFotos } = await comoServidor
      .from('mascotas')
      .select('foto', { count: 'exact', head: true })
      .not('foto', 'is', null);
    if (eContFotos) throw new Error(`mascotas conteo: ${eContFotos.message}`);

    const filasFotos: { foto: string }[] = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA_PG) {
      const { data, error } = await comoServidor
        .from('mascotas')
        .select('foto')
        .not('foto', 'is', null)
        .order('id', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA_PG - 1);
      if (error) throw new Error(`mascotas: ${error.message}`);
      const lote = data ?? [];
      filasFotos.push(...lote);
      if (lote.length < TAMANO_PAGINA_PG) break;
    }

    if (conteoFotosTotal !== null && filasFotos.length !== conteoFotosTotal) {
      throw new Error(
        `mascotas: se esperaban ${conteoFotosTotal} filas, se trajeron ${filasFotos.length}. ` +
        'Abortando antes de borrar nada.',
      );
    }

    const huerfanosFotos = rutasHuerfanas(
      objFotos, filasFotos.map((f) => f.foto), ahora, MINUTOS_GRACIA,
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
    // dice "borré 12" y no cuáles no se puede auditar, y lo que borró
    // ya no existe.
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
