-- ============================================================
-- VetaApp · 015_archivos_mascota.sql
-- Documentos clínicos en PDF, colgados de la mascota.
--
-- LOS LÍMITES DE ESTE ARCHIVO YA NO SON LOS VIGENTES. La 016 los cambió:
-- el peso por PDF pasó de 5 MB (5242880) a 12 MB (12582912) y el cupo por
-- mascota de 10 a 7. Todo lo que diga 5242880 o 10 de acá para abajo es
-- historia: así quedó la base el día que corrió esta migración, no como
-- está hoy. El motivo del cambio está en 016_subir_limite_archivos.sql.
--
-- ---------- POR QUÉ ----------
-- Lo que la clínica tiene hoy de una mascota que llega con historia de
-- otra parte es un campo de texto. Los exámenes de laboratorio, la
-- ecografía, el informe de la cirugía y las dos hojas de la historia
-- anterior son papeles o PDFs que viven en el WhatsApp de la
-- veterinaria. En la consulta siguiente no están.
--
-- ---------- POR QUÉ CUELGA DE LA MASCOTA Y NO DE LA CONSULTA ----------
-- Porque el documento que más importa es el que llega ANTES de la primera
-- consulta: la historia de la clínica anterior. Si el PDF necesitara una
-- `historia_id`, ese caso —el que motivó todo— sería el único que no se
-- puede guardar. Y una mascota con ocho documentos repartidos entre seis
-- consultas obliga a abrir las seis para encontrar el examen de sangre.
-- La ficha de la mascota es el lugar donde alguien los busca.
--
-- ---------- POR QUÉ EL BUCKET ES NUEVO ----------
-- `001` ya creó el bucket `mascotas` para las fotos. Meter los PDFs ahí
-- deja un bucket con dos clases de cosas adentro, y a partir de ahí toda
-- regla —el límite de tamaño, los tipos permitidos, el barrido de
-- huérfanos— tiene que preguntar primero "¿esto es foto o documento?".
-- Un bucket más cuesta un insert.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. LA TABLA ----------
-- Mismo molde que `mascotas` (001_init.sql:19-31): `bigint generated always
-- as identity`, y `user_id` con `default auth.uid()` para que ninguna
-- pantalla tenga que acordarse de mandarlo.
create table if not exists public.archivos_mascota (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id  bigint not null references public.mascotas(id) on delete cascade,

  -- La ruta del objeto en el bucket: {user_id}/{mascota_id}/{ts}-{rand}.pdf
  --
  -- `unique` no es decoración. Es lo que impide que dos filas apunten al
  -- mismo objeto: si eso pasara, borrar una fila borraría el archivo que
  -- la otra sigue mostrando, y la segunda quedaría ofreciendo un PDF que
  -- ya no existe. Es también lo que hace que reintentar un insert que
  -- falló sea seguro.
  ruta        text   not null unique,

  -- El nombre con el que el archivo salió del computador de la clínica.
  -- No sirve para encontrar el objeto (la ruta es otra), sirve para que
  -- la lista diga "examenes-sangre-firulais.pdf" y no un timestamp.
  nombre      text   not null,

  -- Las seis llaves van sin tildes a propósito: son valores de base de
  -- datos, no texto de pantalla. Lo que la clínica lea saldrá de
  -- ETIQUETA_TIPO en frontend/src/archivos/textos.js,
  -- que es donde se podrá cambiar la palabra sin tocar una migración ya corrida.
  tipo        text   not null check (tipo in (
                'chequeo','examenes','imagenes','cirugia','historia_anterior','otro')),

  -- Opcional, y se queda opcional. La subida más rápida posible es
  -- elegir el archivo, elegir el tipo y darle. Un campo obligatorio más
  -- en esa pantalla es una subida menos.
  descripcion text,

  -- La fecha DEL DOCUMENTO, que no es la de la subida: un examen de 2023
  -- que se sube hoy es de 2023. `created_at` guarda la otra.
  --
  -- `text` y no `date` por consistencia con el resto del esquema
  -- (`citas.fecha`, `vacunas.fecha_aplicacion`, `mascotas.fecha_nacimiento`
  -- ya son text ISO — ver 011_ficha_completa.sql:38-43). El formato se
  -- defiende con el check de abajo, que es lo que `date` daba gratis.
  fecha_documento text,

  -- Lo que pesa, en bytes, copiado de `file.size` al subir.
  --
  -- Se guarda aunque Storage ya lo sepa en `metadata->>'size'`, porque la
  -- lista de la ficha tiene que poder decir "2,4 MB" sin una segunda
  -- consulta a storage por cada fila.
  --
  -- El check hace dos cosas. El `> 0` rechaza el archivo vacío, que es un
  -- PDF que no se abre y nadie sabe por qué. El `<= 5242880` es la capa 2
  -- de tres: el mismo número está en `MAX_BYTES` (limites.js) y en
  -- `file_size_limit` del bucket, acá abajo. Si se separan, el que
  -- rechaza primero decide, y el mensaje que ve la clínica cambia según
  -- cuál sea — el del bucket está en inglés.
  peso_bytes  bigint not null check (peso_bytes > 0 and peso_bytes <= 5242880),

  created_at  timestamptz not null default now()
);


-- ---------- 2. EL FORMATO DE LA FECHA ----------
-- YYYY-MM-DD o nada. Sin esto, un formulario podría dejar "1/06/2021"
-- guardado, y `new Date()` lo lee como 1 de junio o 6 de enero según el
-- navegador: el mismo examen tendría dos fechas en dos computadores de la
-- misma clínica.
--
-- Postgres no tiene `add constraint if not exists`, de ahí el bloque: la
-- migración tiene que poder correrse dos veces sin reventar. Mismo patrón
-- que 011_ficha_completa.sql:67-76.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'archivos_mascota_fecha_documento_iso'
  ) then
    alter table public.archivos_mascota
      add constraint archivos_mascota_fecha_documento_iso
      check (fecha_documento is null or fecha_documento ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
end $$;


-- ---------- 3. EL ÍNDICE ----------
-- La única consulta que hace la app es "los archivos de ESTA mascota, el
-- más nuevo arriba". El índice es exactamente esa consulta.
create index if not exists idx_archivos_mascota_mascota
  on public.archivos_mascota(mascota_id, created_at desc);


-- ---------- 4. RLS ----------
-- NO se agrega al bucle de 001_init.sql:109-126, y el motivo es doble.
--
-- Uno: `001` YA CORRIÓ en producción. Editar su texto no lo vuelve a
-- correr. La tabla nacería con RLS apagada y sin política, o sea con cada
-- clínica leyendo los documentos clínicos de todas las demás.
--
-- Dos: ese bucle usa `create policy` desnudo, sin `drop policy if
-- exists`. Correrlo de nuevo levanta 42710 en la primera tabla y no
-- llega nunca a esta.
--
-- El patrón correcto es el de 012_importaciones.sql:70-77: política con
-- nombre propio, en su propia migración, idempotente.
--
-- Y lleva `esta_activo()` además de `user_id` porque toda tabla desde
-- `002` lo lleva (002:253-254, 003:90-91, 004:98-99 y 106-107, 012:70-77).
-- Sin eso, una clínica con la suscripción vencida sigue subiendo PDFs de
-- 5 MB al bucket que paga el dueño. La regla del proyecto es que el
-- bloqueo por suscripción vive en RLS, no en React: en React se salta
-- con F12.
alter table public.archivos_mascota enable row level security;

drop policy if exists "own_rows_archivos_mascota" on public.archivos_mascota;
create policy "own_rows_archivos_mascota" on public.archivos_mascota
  for all
  to authenticated
  using      (auth.uid() = user_id and public.esta_activo())
  with check (auth.uid() = user_id and public.esta_activo());


-- ---------- 5. DIEZ POR MASCOTA ----------
-- El límite de arriba es por archivo; este es por mascota. Sin él, una
-- ficha con 200 escaneos es una lista que no se puede leer y una factura
-- de storage que nadie pidió.
--
-- NO lleva `security definer`, y eso es a propósito: adentro de plpgsql
-- la RLS se evalúa con el invocador, así que este `count(*)` ya cuenta
-- SOLO los archivos de la clínica que está insertando. Con `security
-- definer` contaría los de todas y una clínica quedaría bloqueada por los
-- archivos de otra.
--
-- NO es a prueba de carreras: el limite es POR SENTENCIA, no por
-- transaccion. Dos inserts simultaneos pueden leer 9 los dos, disparar
-- el trigger sobre 9 cada uno, y quedar 11. Se acepta — la app sube de
-- a un archivo por sentencia (POST /archivos, Task 4, inserta una sola
-- fila), así que el desborde no es alcanzable desde el producto; sería
-- alcanzable con un insert de varias filas en una sola sentencia (lo que
-- hace el cliente de Supabase con un arreglo: `.insert([fila1, fila2, ...])`),
-- pero eso no es algo que el producto haga.
--
-- Ademas: un `insert ... values (...), (...)` de dos filas en UNA sola
-- sentencia pasa por el trigger dos veces, pero ambas veces leen el mismo
-- conteo pre-insert (las filas del mismo comando son invisibles entre si
-- en los triggers `before`), asi que el limite se salta completamente —
-- no queda 11, puede quedar cualquier numero. Por eso la restriccion
-- correcta es "una fila por sentencia", que es lo que garantiza la ruta
-- de la app. La alternativa seria bloquear la fila de la mascota en cada
-- subida: complejidad real por un problema imaginario en una clinica donde
-- sube archivos una persona a la vez.
--
-- El `raise exception` dice un nombre seco, no una frase en español. La
-- frase que lee la clínica vivirá en limites.js, que sí se puede probar;
-- acá quedaría encerrada en una migración ya corrida. api/axios.js
-- reconocerá este nombre y lo traducirá (lo construye la Task 4).
create or replace function public.limite_archivos_mascota()
returns trigger
language plpgsql
set search_path = public
as $$
declare cuantos int;
begin
  select count(*) into cuantos
    from public.archivos_mascota
   where mascota_id = new.mascota_id;

  -- El 10 tiene un gemelo: MAX_POR_MASCOTA en frontend/src/archivos/limites.js
  -- (lo crea la Task 2). Si se sube ese numero, cambiarlo acá tambien.
  if cuantos >= 10 then
    raise exception 'limite_archivos_mascota' using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_limite_archivos_mascota on public.archivos_mascota;
create trigger trg_limite_archivos_mascota
  before insert on public.archivos_mascota
  for each row execute function public.limite_archivos_mascota();


-- ---------- 6. EL BUCKET ----------
-- `public = false`: un PDF clínico no se sirve por URL pública. Se abrirá
-- con URL firmada de 300 s, pedida al momento del clic (la ruta es
-- GET /archivos/:id/url, que construye la Task 4 con createSignedUrl).
--
-- `file_size_limit` es bigint EN BYTES, no la cadena '5MB' que usa el
-- cliente de JavaScript — verificado contra information_schema el
-- 2026-10-20. `allowed_mime_types` es un arreglo.
--
-- OJO con el `on conflict (id) do nothing`: si este bucket ya existiera
-- creado sin los dos límites, esta línea NO los agrega. Si eso pasa, hay
-- que ponerlos con el update que está comentado abajo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Red de seguridad para el caso de arriba. Correr solo si el bucket ya
-- existía:
-- update storage.buckets
--    set file_size_limit = 5242880,
--        allowed_mime_types = array['application/pdf']
--  where id = 'documentos';


-- ---------- 7. LAS CUATRO POLÍTICAS DEL BUCKET ----------
-- Copiadas de 001_init.sql:135-149 con 'documentos' en lugar de
-- 'mascotas': misma carpeta {user_id}/..., mismo
-- (storage.foldername(name))[1] = auth.uid()::text.
--
-- `001` las creó desnudas y no se pueden volver a correr; acá van con
-- `drop policy if exists` por el mismo motivo que la de la tabla.
drop policy if exists "documentos_read_own"   on storage.objects;
drop policy if exists "documentos_insert_own" on storage.objects;
drop policy if exists "documentos_update_own" on storage.objects;
drop policy if exists "documentos_delete_own" on storage.objects;

-- `select` tampoco mira la suscripción: la política de la tabla
-- (own_rows_archivos_mascota, `for all`, línea 147) ya bloquea la fila
-- a una clínica vencida, así que no puede pedir una URL firmada para un
-- archivo que ya no ve. Lo que sí puede hacer es leer bytes de una ruta
-- que tenga guardada de antes de vencer — eso es comportamiento aceptado,
-- porque quien ya tenía la ruta no es la amenaza que defiende esta política.
create policy "documentos_read_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- La ÚNICA de las cuatro que mira la suscripción, y es la que cuesta
-- plata. La política de la tabla tapa la FILA de una clínica vencida,
-- pero no los BYTES: sin esta cláusula la clínica vencida sube el objeto,
-- el insert le falla, y queda un huérfano por intento.
create policy "documentos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.esta_activo());

-- `update` NO lleva `esta_activo()`, igual que `select` y `delete`. Motivo:
-- la app no tiene ninguna ruta que actualice un objeto existente — todos los
-- uploads usan `upsert: false` (subirDocumento en api/axios.js:151), así que
-- no hay un path de la app por donde una clínica vencida pueda llegar acá a
-- sobreescribir bytes. Si en el futuro se agrega un endpoint de actualización,
-- habrá que revisar si esta política necesita `esta_activo()`.
create policy "documentos_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- `delete` NO mira la suscripción a propósito: por acá pasa el rollback
-- de una subida cuyo insert falló —que es exactamente lo que pasa cuando
-- la clínica está vencida— y por acá pasa el barrido. Una capa que impide
-- limpiar deja basura, no la evita.
create policy "documentos_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------- 8. CUÁNTO ESPACIO OCUPA CADA CLÍNICA ----------
-- Esta columna es para el dueño de VetaApp, no para la clínica. La
-- pregunta que contesta es "¿cuánto me está costando esta cuenta?", y la
-- respuesta tiene que estar en la misma tabla donde él decide a quién
-- activar.
--
-- OJO CON LA VERSIÓN: `admin_listar_veterinarias()` existe en cuatro
-- migraciones distintas y la que estaba viva hasta esta sección era la
-- ÚLTIMA, 007_pagos.sql:329-363, con ONCE columnas. Las de 002 y las
-- intermedias tienen ocho. Si se recrea sobre la versión vieja, Admin.jsx
-- pierde el selector de plan (`CeldaPlan`), la insignia de prueba
-- (`pruebaViva`) y el botón de "+8 días" (`extenderPrueba`), porque
-- desaparecen `plan`, `prueba_hasta` y `suscripcion_hasta` — y no falla
-- nada: las celdas quedan en `undefined`.
--
-- `drop function` primero porque `create or replace` no puede cambiar el
-- tipo de retorno de una función que devuelve `table (...)`.
drop function if exists public.admin_listar_veterinarias();

create or replace function public.admin_listar_veterinarias()
returns table (
  id uuid, email text, nombre text, clinica_nombre text, rol text,
  estado_suscripcion text, plan text,
  prueba_hasta timestamptz, suscripcion_hasta timestamptz,
  fecha_registro timestamptz, notas_admin text,
  espacio_bytes bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  return query
    select p.id, p.email, p.nombre, c.clinica_nombre,
           p.rol, p.estado_suscripcion, p.plan, p.prueba_hasta, p.suscripcion_hasta,
           p.fecha_registro, p.notas_admin,
           -- `coalesce` y no el null del left join: una clínica que no
           -- subió nada ocupa 0 bytes, no "no sé". El null obligaría a
           -- cada pantalla a decidir qué hacer con él.
           coalesce(e.bytes, 0) as espacio_bytes
      from public.perfiles p
      left join public.configuracion c on c.user_id = p.id
      left join (
        select o.path_tokens[1]::uuid as uid,
               -- `sum(bigint)` devuelve `numeric` en Postgres. La columna
               -- declarada en `returns table` es `bigint`, y `return query`
               -- rechaza el resultado completo si los tipos no son
               -- binariamente coercibles entre sí (error 42804). El cast
               -- explícito a `bigint` es obligatorio, no cosmético.
               sum((o.metadata->>'size')::bigint)::bigint as bytes
          from storage.objects o
         -- GUARDA 1, y es la que evita que la función entera reviente.
         -- `path_tokens[1]::uuid` levanta `invalid input syntax for type
         -- uuid` con CUALQUIER objeto que no esté guardado bajo una
         -- carpeta con forma de uuid. Un solo archivo suelto en la raíz
         -- de cualquier bucket —subido a mano desde el Dashboard— y el
         -- panel de Admin deja de cargar por completo.
         where o.path_tokens[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         -- GUARDA 2: este proyecto tiene versionado de objetos
         -- (`archived_at`, `is_delete_marker`, `is_versioned` existen en
         -- storage.objects — verificado el 2026-10-20). Sin estos dos
         -- filtros la suma cuenta versiones viejas y lápidas de borrado,
         -- o sea que una clínica que borró todo seguiría mostrando el
         -- espacio de lo que borró.
           and coalesce(o.is_delete_marker, false) = false
           and o.archived_at is null
         group by 1
      ) e on e.uid = p.id
     order by p.fecha_registro desc;
end $$;

-- NO lleva filtro por bucket, y es a propósito: la pregunta es cuánto
-- cobra Supabase por esa cuenta, y Supabase cobra por todo —los PDFs de
-- `documentos` y las fotos de `mascotas`—. Un filtro por 'documentos'
-- daría un número más chico que la factura. Nota: la Guarda 1 excluye
-- objetos en la raíz de cualquier bucket (los que no tienen una carpeta
-- con forma de uuid como primer segmento), así que el número es el espacio
-- atribuible a una clínica, no la factura exacta de Supabase.
--
-- El `drop function` anterior borra el ACL junto con la función, así que
-- los permisos se reinstalan a continuación, idénticos a las cuatro
-- migraciones anteriores (002_admin.sql, 004_planes.sql, 005_prueba.sql,
-- 007_pagos.sql). `es_admin()` dentro del cuerpo es lo que realmente
-- protege los datos. Ver 007_pagos.sql:300-322 para el día que faltó un
-- revoke.
revoke all on function public.admin_listar_veterinarias()    from anon, authenticated;
grant execute on function public.admin_listar_veterinarias() to authenticated;


-- ============================================================
--  PRUEBAS
--
--  Cada bloque termina en `raise exception`, así que la transacción se
--  aborta y lo que insertó se deshace solo: el resultado viaja en el
--  mensaje de error. Es la forma de probar contra la base de producción
--  sin dejar basura. Mismo estilo que 011_ficha_completa.sql:109-208.
--
--  Se corren de a uno, descomentados, en el SQL Editor.
-- ============================================================

-- ---------- PRUEBA A · el tipo solo acepta las seis llaves ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; rechazo boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--     values (v_u, v_m, 'x/1/ok.pdf', 'ok.pdf', 'examenes', 1000);
--
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/mal.pdf', 'mal.pdf', 'radiografia', 1000);
--   exception when check_violation then rechazo := true;
--   end;
--
--   raise exception 'A: % — el check de tipo rechazo un tipo invalido: rechazo=%',
--     case when rechazo then 'OK' else 'FALLO' end, rechazo;
-- end $$;

-- ---------- PRUEBA B · el peso: 0, justo 5 MB, y un byte más ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; r_cero boolean := false; r_grande boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   -- Exactamente 5 MB: pasa.
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--     values (v_u, v_m, 'x/1/justo.pdf', 'justo.pdf', 'otro', 5242880);
--
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/cero.pdf', 'cero.pdf', 'otro', 0);
--   exception when check_violation then r_cero := true;
--   end;
--
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/grande.pdf', 'grande.pdf', 'otro', 5242881);
--   exception when check_violation then r_grande := true;
--   end;
--
--   raise exception 'B: % — el check de peso rechazo cero y exceso: cero=% grande=%',
--     case when r_cero and r_grande then 'OK' else 'FALLO' end, r_cero, r_grande;
-- end $$;

-- ---------- PRUEBA C · el décimo entra, el once no ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; i int; freno boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   for i in 1..10 loop
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/' || i || '.pdf', i || '.pdf', 'otro', 1000);
--   end loop;
--
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/once.pdf', 'once.pdf', 'otro', 1000);
--   exception when check_violation then freno := true;
--   end;
--
--   raise exception 'C: % — el trigger freno el once: freno=%',
--     case when freno then 'OK' else 'FALLO' end, freno;
-- end $$;

-- ---------- PRUEBA D · la fecha del documento solo acepta ISO ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; rechazo boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes, fecha_documento)
--     values (v_u, v_m, 'x/1/iso.pdf', 'iso.pdf', 'otro', 1000, '2023-04-18');
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--     values (v_u, v_m, 'x/1/sinfecha.pdf', 'sinfecha.pdf', 'otro', 1000);
--
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes, fecha_documento)
--       values (v_u, v_m, 'x/1/dmy.pdf', 'dmy.pdf', 'otro', 1000, '18/04/2023');
--   exception when check_violation then rechazo := true;
--   end;
--
--   raise exception 'D: % — el check ISO rechazo el formato dd/mm/aaaa: rechazo=%',
--     case when rechazo then 'OK' else 'FALLO' end, rechazo;
-- end $$;

-- ---------- PRUEBA E · la misma ruta no entra dos veces ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; choco boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--     values (v_u, v_m, 'x/1/igual.pdf', 'a.pdf', 'otro', 1000);
--   begin
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u, v_m, 'x/1/igual.pdf', 'b.pdf', 'otro', 1000);
--   exception when unique_violation then choco := true;
--   end;
--
--   raise exception 'E: % — el unique de ruta rechazo la ruta duplicada: choco=%',
--     case when choco then 'OK' else 'FALLO' end, choco;
-- end $$;

-- ---------- PRUEBA F · el bucket quedó con sus dos límites ----------
-- do $$
-- declare lim bigint; tipos text;
-- begin
--   select file_size_limit, array_to_string(allowed_mime_types, ',')
--     into lim, tipos
--     from storage.buckets where id = 'documentos';
--   raise exception 'F: % — limites del bucket: limite=% (esperado: 5242880) tipos=% (esperado: application/pdf)',
--     case when lim = 5242880 and tipos = 'application/pdf' then 'OK' else 'FALLO' end,
--     lim, tipos;
-- end $$;

-- ---------- PRUEBA G · borrar la mascota borra las filas de sus archivos ----------
-- Esta prueba cubre la mitad que la base sí hace: la cascada de FILAS. Los
-- OBJETOS del bucket no los borra Postgres y nunca los va a borrar — eso lo
-- hace `DELETE /mascotas/:id` desde el frontend (Task 4) y, lo que se le
-- escape, el barrido (Task 8). Si esta prueba pasa, lo único que quedó
-- probado es que no sobreviven filas apuntando a una mascota que ya no está.
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; quedaron int;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'Prueba', 'perro', v_d) returning id into v_m;
--
--   insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--     values (v_u, v_m, 'x/1/casc1.pdf', 'a.pdf', 'otro', 1000),
--            (v_u, v_m, 'x/1/casc2.pdf', 'b.pdf', 'otro', 1000);
--
--   delete from public.mascotas where id = v_m;
--
--   select count(*) into quedaron from public.archivos_mascota where mascota_id = v_m;
--   raise exception 'G: % — cascada al borrar mascota: filas que sobrevivieron=%',
--     case when quedaron = 0 then 'OK' else 'FALLO' end, quedaron;
-- end $$;

-- ---------- PRUEBA H · el trigger cuenta solo los archivos del invocador ----------
--
-- POR QUE EXISTE ESTA PRUEBA:
-- El count(*) de la funcion trigger esta acotado por mascota_id (linea 192).
-- Sin security definer, la RLS se evalua con el rol invocador, asi que el
-- count ademas solo ve las filas cuyo user_id = auth.uid(): las filas de
-- otra clinica son invisibles aunque compartan mascota_id.
--
-- La politica de la tabla (lineas 147-148) valida unicamente
-- auth.uid() = user_id; NO valida que mascota_id pertenezca al invocador.
-- Por eso es posible construir el siguiente estado: la clinica A inserta
-- 10 filas con su propio user_id apuntando a la mascota de la clinica B.
-- Postgres lo permite porque la cuenta A tiene suscripcion activa y el
-- user_id es suyo; la restriccion de ownership de la mascota no existe en
-- la politica. Con security invoker esas 10 filas son invisibles para B
-- porque la RLS filtra por user_id. Con security definer el count bypassea
-- la RLS y ve las 10 filas de A sobre la misma mascota_id de B, bloqueando
-- el primer insert de B antes de que haya subido nada.
--
-- Ningun otro bloque cubre este caso: PRUEBA C corre como `postgres`, que
-- salta la RLS completamente.
-- NOTA: el gap de que la politica no valide la propiedad de mascota_id es
-- conocido y esta anotado para la revision final de la rama. No se corrige
-- aqui porque Tasks 4 y 8 consumen el contrato actual de la politica.
--
-- POR QUE NO ES UN BLOQUE do $$:
-- `set role` dentro de plpgsql no funciona con la semantica de impersonacion
-- que se necesita aca: el rol cambia pero request.jwt.claims no, y la
-- funcion esta_activo() lee ese claim. La unica forma de impersonar un JWT
-- completo en el SQL Editor es con `set local role` + `set_config` dentro
-- de una transaccion explicita, igual que el Step 2 del brief. Un `do $$`
-- que llame a `set role` haria el cambio de rol pero no tocaria los claims,
-- asi que esta_activo() seguiria viendo el claim del postgres original y la
-- prueba pasaria aunque la logica estuviera rota.
--
-- COMO CORRER:
-- Descomentar TODO el bloque de abajo (desde `begin;` hasta `rollback;`)
-- y pegarlo entero en el SQL Editor. Requiere al menos dos cuentas en
-- auth.users con suscripcion activa. Si solo hay una, registrarse con otro
-- correo antes de correr esto.
--
-- RESULTADO ESPERADO con el codigo actual (security invoker):
--   Sub-bloque 1 (10 inserts de cuenta 2): todos entran; imprime 'H: OK'.
-- RESULTADO SI ALGUIEN AGREGA security definer:
--   Sub-bloque 1 (primer insert de cuenta 2): ya lanza check_violation
--   porque el count ve las 10 filas de cuenta 1 sobre la misma mascota_id;
--   error_prematuro = true; imprime 'H: FALLO'.
--
-- begin;
--
-- create temp table _ctas as
--   select id, row_number() over (order by created_at) as n
--   from auth.users order by created_at limit 2;
--
-- -- La tabla temporal la crea `postgres`. Despues del `set local role
-- -- authenticated` de mas abajo la sesion pierde el permiso de leerla, pero
-- -- el `set_config` la necesita para sacar el `sub`. Sin este grant el bloque
-- -- muere con `42501: permission denied for table _ctas` antes de medir nada.
-- -- Medido en el SQL Editor real el 2026-10-21, no deducido.
-- --
-- -- Esto NO debilita la prueba: `_ctas` es el andamio, no el sujeto. Sobre
-- -- `public.archivos_mascota` no se toca ningun permiso.
-- grant select on _ctas to authenticated;
--
-- -- Cuenta 2: dueno y mascota (como postgres, sin RLS activa).
-- -- La mascota de cuenta 2 es la que se usa como mascota_id compartida.
-- insert into public.duenos(user_id, nombre, telefono)
--   select id, 'Prueba H c2', '3000000011' from _ctas where n = 2;
-- insert into public.mascotas(user_id, nombre, especie, dueno_id)
--   select d.user_id, 'Prueba H c2', 'perro', d.id
--   from public.duenos d where d.telefono = '3000000011';
--
-- -- 10 filas de cuenta 1 apuntando a la mascota de cuenta 2.
-- -- Se insertan como postgres (sin RLS): la politica permite estas filas
-- -- porque user_id es de cuenta 1 (activa) y mascota_id no se valida.
-- -- Con security invoker estas filas son invisibles para cuenta 2.
-- -- Con security definer el count las ve y bloquea el primer insert de cuenta 2.
-- do $$
-- declare v_u1 uuid; v_m2 bigint; i int;
-- begin
--   select id into v_u1 from _ctas where n = 1;
--   select m.id into v_m2
--     from public.mascotas m where m.nombre = 'Prueba H c2' limit 1;
--   for i in 1..10 loop
--     insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--       values (v_u1, v_m2, 'h/c1sobre_c2/' || i || '.pdf', i || '.pdf', 'otro', 1000);
--   end loop;
-- end $$;
--
-- -- Ahora suplantamos la cuenta 2 con JWT real.
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select id from _ctas where n = 2),
--                     'role', 'authenticated')::text,
--   true);
--
-- -- Cuenta 2 inserta hasta 10 archivos en su propia mascota.
-- -- Con security invoker: las 10 filas de cuenta 1 son invisibles para
-- -- cuenta 2, el count arranca en 0 y los 10 inserts pasan -> 'H: OK'.
-- -- Con security definer: el count bypassea RLS, ve las 10 filas de cuenta 1,
-- -- el primer insert ya alcanza >= 10 -> error_prematuro = true -> 'H: FALLO'.
-- do $$
-- declare v_m bigint; i int; error_prematuro boolean := false;
-- begin
--   select m.id into v_m
--     from public.mascotas m where m.nombre = 'Prueba H c2' limit 1;
--   for i in 1..10 loop
--     begin
--       insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
--         values (auth.uid(), v_m, 'h/c2/' || i || '.pdf', i || '.pdf', 'otro', 1000);
--     exception when check_violation then
--       error_prematuro := true;
--     end;
--   end loop;
--   raise exception 'H: % — los 10 inserts de cuenta 2 pasaron sin ser bloqueados por cuenta 1: error_prematuro=%',
--     case when not error_prematuro then 'OK' else 'FALLO' end, error_prematuro;
-- end $$;
--
-- rollback;
