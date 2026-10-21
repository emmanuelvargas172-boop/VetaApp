# Archivos PDF por mascota · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una clínica pueda subir documentos clínicos en PDF a la ficha de una mascota, abrirlos, borrarlos, y que el dueño de VetaApp vea cuánto espacio ocupa cada clínica.

**Architecture:** Una tabla nueva (`archivos_mascota`) con RLS propia y un bucket privado nuevo (`documentos`), los dos en `supabase/migrations/015_archivos_mascota.sql`. El frontend sube al bucket primero y recién después inserta la fila, para que el modo de falla sea un objeto huérfano y nunca una fila que miente. Los PDFs se abren con URLs firmadas de 300 s pedidas al momento del clic, nunca guardadas. La lógica que se puede probar (límites, textos, diff del barrido) vive en módulos puros fuera del JSX, porque este vitest no tiene jsdom.

**Tech Stack:** Postgres/Supabase (RLS, Storage, plpgsql), React 18 + Vite 5, vitest 2 sin jsdom, Deno (edge function), Node 24 (pruebas de la edge function).

**Spec:** `docs/superpowers/specs/2026-10-20-archivos-pdf-mascota-design.md`

## Global Constraints

- **`5242880` bytes (5 MB) aparece en tres lugares y los tres tienen que decir el mismo número:** `MAX_BYTES` en `frontend/src/archivos/limites.js`, el `check (peso_bytes > 0 and peso_bytes <= 5242880)` de la tabla, y `file_size_limit` del bucket.
- **`10` archivos por mascota aparece en dos:** `MAX_POR_MASCOTA` en `limites.js` y el trigger `limite_archivos_mascota()`.
- **Las seis llaves de `tipo`, literales y sin tildes:** `'chequeo'`, `'examenes'`, `'imagenes'`, `'cirugia'`, `'historia_anterior'`, `'otro'`. Van en el `check` de la tabla y en `ETIQUETA_TIPO`.
- **La política de la tabla lleva `auth.uid() = user_id and public.esta_activo()`** en `using` y en `with check`. La política de `insert` del bucket lleva `esta_activo()` también; las de `select`, `update` y `delete` no.
- **`archivos_mascota` NO se agrega al bucle de RLS de `001_init.sql`.** `001` ya corrió en producción y su `create policy` es desnudo (sin `drop policy if exists`): la tabla nacería sin RLS. Se sigue el patrón de `012_importaciones.sql:70-77`.
- **No hay jsdom ni `@testing-library`.** Ninguna prueba renderiza un componente. Lo que se prueba se exporta como función pura, y todo archivo de prueba que importe de un `.jsx` tiene que llevar primero `vi.mock('../lib/supabase.js', …)` — ver `importador/paso3Revisar.test.jsx:1-10`.
- **URLs firmadas a 300 segundos**, pedidas con `createSignedUrl(ruta, 300)` en el clic. Nunca se guardan en una columna.
- **Nunca se borran objetos de Storage por SQL.** Solo por la Storage API (`.remove()`). Un `delete from storage.objects` deja el archivo en el disco y desde 2026-03-05 un trigger lo rechaza.
- **Todo texto de pantalla en español de Colombia, con voseo** ("volvé", "borrá", "elegiste").
- **Los comentarios explican POR QUÉ, y son entregable.** Un comentario o un texto de pantalla que afirme algo falso es peor que no tenerlo: antes de escribir "esto valida X", hay que poder señalar la línea que lo hace.
- **Nada de PII real en código, pruebas ni commits.** Los datos de las pruebas son inventados (precedente: commit `888a8ce`).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/015_archivos_mascota.sql` (nuevo) | La tabla, su RLS, el trigger del límite, el bucket con sus 4 políticas, y la nueva versión de `admin_listar_veterinarias()` con `espacio_bytes`. Todo lo que se corre a mano en el SQL Editor, en un solo archivo, como `011` y `012`. |
| `frontend/src/archivos/limites.js` (nuevo) | Los dos números del límite, la función que decide si un archivo se puede subir, y la traducción de los errores de Postgres a frases. |
| `frontend/src/archivos/limites.test.js` (nuevo) | Prueba lo anterior con objetos planos, sin `File` y sin navegador. |
| `frontend/src/archivos/textos.js` (nuevo) | `ETIQUETA_TIPO`, la lista `TIPOS` que itera el formulario, `textoArchivo`, `fechaLegible` y `fmtBytes`. Separado de `limites.js` porque son dos preguntas distintas: una decide, el otro redacta. |
| `frontend/src/archivos/textos.test.js` (nuevo) | Prueba lo anterior. |
| `frontend/src/api/axios.js` (modificar) | Cuatro rutas nuevas (`GET`/`POST`/`DELETE` de archivos y `GET` de la URL firmada) y el cambio en `DELETE /mascotas/:id`. |
| `frontend/src/components/ArchivosMascota.jsx` (nuevo) | La pestaña: lista, formulario de subida, abrir y borrar. El único archivo con JSX que entra en esta función. |
| `frontend/src/pages/Historias.jsx` (modificar) | La pestaña nueva, el contador de su badge, y `subtituloPaciente` exportada como función pura. |
| `frontend/src/pages/Historias.test.jsx` (nuevo) | Prueba `subtituloPaciente`. |
| `frontend/src/pages/Admin.jsx` (modificar) | La columna "Espacio" y el KPI "Espacio total". |
| `supabase/functions/_compartido/huerfanos.ts` (nuevo) | `rutaDesdeValor(valor)` y `rutasHuerfanas(objetos, conocidas, ahora, minutosGracia)`: el diff, sin una sola API de Deno, para que se pueda probar con node. |
| `supabase/functions/_compartido/huerfanos.prueba.mjs` (nuevo) | Prueba el diff, en el estilo de `wompi.prueba.mjs`. |
| `supabase/functions/limpiar-huerfanos/index.ts` (nuevo) | El barrido: valida `es_admin()`, lista los dos buckets, resta lo conocido y borra el resto por la Storage API. |
| `frontend/src/pages/Legal.jsx` (modificar) | Nombrar los documentos clínicos en PDF y el almacenamiento de archivos. |

## Antes de empezar

- [ ] **Crear la rama.** El árbol está limpio en `main` en `1dd9761`.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git checkout -b archivos-pdf
```

---

### Task 1: La migración 015 — tabla, RLS, trigger y bucket

**Files:**
- Create: `supabase/migrations/015_archivos_mascota.sql`
- Leer antes de escribir (son los moldes): `supabase/migrations/012_importaciones.sql:1-78`, `supabase/migrations/001_init.sql:19-31` y `:128-149`, `supabase/migrations/011_ficha_completa.sql:58-76` y `:109-208`

**Interfaces:**
- Consumes: `public.esta_activo()` (`007_pagos.sql:54-70`), `storage.buckets`, `storage.objects`.
- Produces: la tabla `public.archivos_mascota` con columnas `id bigint`, `user_id uuid`, `mascota_id bigint`, `ruta text` (unique), `nombre text`, `tipo text`, `descripcion text`, `fecha_documento text`, `peso_bytes bigint`, `created_at timestamptz`. El bucket `documentos`. El nombre de error `limite_archivos_mascota`, que la Task 2 traduce y la Task 4 atrapa.

**Quién corre qué.** Los Steps 1, 3 y 4 son escribir, revisar y commitear: no tocan la base. Aplicar el archivo en el SQL Editor es un paso manual de Emmanuel, y por eso el archivo tiene que ser legible de arriba abajo y poder correrse dos veces sin reventar. El Step 2 es la única verificación de esta task que sí habla con Postgres, y corre **después** de que él lo aplique.

Las Tasks 2 y 3 no necesitan la base y pueden hacerse mientras tanto. La que no puede empezar antes de que el Step 2 pase es la **Task 4**: ahí ya se escribe código que inserta filas de verdad, y hacerlo sobre una tabla que no filtra por clínica sería construir encima de una fuga.

- [ ] **Step 1: Escribir el archivo completo**

`supabase/migrations/015_archivos_mascota.sql`:

```sql
-- ============================================================
-- VetaApp · 015_archivos_mascota.sql
-- Documentos clínicos en PDF, colgados de la mascota.
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
  -- datos, no texto de pantalla. Lo que la clínica lee sale de
  -- ETIQUETA_TIPO en frontend/src/archivos/textos.js, que es donde se
  -- puede cambiar la palabra sin tocar una migración ya corrida.
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
-- NO es a prueba de carreras: dos inserts simultáneos pueden leer 9 los
-- dos y quedar 11. Se acepta. La alternativa es bloquear la fila de la
-- mascota en cada subida, que es complejidad real por un problema
-- imaginario en una clínica donde sube archivos una persona a la vez, y
-- el daño de un 11 donde caben 10 es cero.
--
-- El `raise exception` dice un nombre seco, no una frase en español. La
-- frase que lee la clínica vive en limites.js, que sí se puede probar;
-- acá quedaría encerrada en una migración ya corrida. api/axios.js
-- reconoce este nombre y lo traduce.
create or replace function public.limite_archivos_mascota()
returns trigger
language plpgsql
as $$
declare cuantos int;
begin
  select count(*) into cuantos
    from public.archivos_mascota
   where mascota_id = new.mascota_id;

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
-- `public = false`: un PDF clínico no se sirve por URL pública. Se abre
-- con URL firmada de 300 s, pedida al momento del clic (ver
-- api/axios.js, GET /archivos/:id/url).
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
--   raise exception 'A: rechazo=% (esperado: true)', rechazo;
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
--   raise exception 'B: cero=% grande=% (ambos deben ser true)', r_cero, r_grande;
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
--   raise exception 'C: diez entraron, el once freno=% (esperado: true)', freno;
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
--   raise exception 'D: rechazo_dmy=% (esperado: true)', rechazo;
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
--   raise exception 'E: choco=% (esperado: true)', choco;
-- end $$;

-- ---------- PRUEBA F · el bucket quedó con sus dos límites ----------
-- do $$
-- declare lim bigint; tipos text;
-- begin
--   select file_size_limit, array_to_string(allowed_mime_types, ',')
--     into lim, tipos
--     from storage.buckets where id = 'documentos';
--   raise exception 'F: limite=% tipos=% (esperado: 5242880 / application/pdf)', lim, tipos;
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
--   raise exception 'G: filas que sobrevivieron=% (esperado: 0)', quedaron;
-- end $$;
```

- [ ] **Step 2: Probar la RLS entre dos cuentas, que NO va en un bloque `do`**

Esto corre después de que Emmanuel aplique el archivo en el SQL Editor. Si
todavía no está aplicado, dejarlo marcado como pendiente y seguir con las
Tasks 2 y 3 — pero no con la Task 4.

El spec pide confirmar que la cuenta A no ve ni una fila de la cuenta B.
Eso no se puede probar con un bloque `do $$`: el SQL Editor corre como
`postgres`, que salta la RLS, así que un bloque `do` vería las filas de
todas las clínicas y la prueba pasaría siempre — pasaría incluso si la
tabla no tuviera RLS. Una prueba que no puede fallar no es una prueba.

La forma que sí mide es suplantar el JWT dentro de una transacción. Correr
este bloque entero, de una, en el SQL Editor:

```sql
begin;

-- Dos cuentas reales, las dos primeras que haya.
create temp table _cuentas as
  select id, row_number() over (order by created_at) as n
  from auth.users order by created_at limit 2;

-- Una mascota y un archivo de la cuenta 1.
insert into public.duenos(user_id, nombre, telefono)
  select id, 'Prueba RLS', '3000000002' from _cuentas where n = 1;
insert into public.mascotas(user_id, nombre, especie, dueno_id)
  select d.user_id, 'Prueba RLS', 'perro', d.id
  from public.duenos d where d.telefono = '3000000002';
insert into public.archivos_mascota(user_id, mascota_id, ruta, nombre, tipo, peso_bytes)
  select m.user_id, m.id, 'rls/1/secreto.pdf', 'secreto.pdf', 'otro', 1000
  from public.mascotas m where m.nombre = 'Prueba RLS';

-- Ahora, como la cuenta 2, con RLS activa.
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id from _cuentas where n = 2),
                                    'role', 'authenticated')::text,
                  true);

select count(*) as filas_que_ve_la_cuenta_2
from public.archivos_mascota
where ruta = 'rls/1/secreto.pdf';

rollback;
```

Esperado: `filas_que_ve_la_cuenta_2 = 0`. El `rollback` deshace todo,
incluida la suplantación.

**Si devuelve 1, parar.** Significa que la política de la tabla no está
filtrando, y la tabla quedó legible entre clínicas. No seguir con ninguna
otra task hasta arreglarlo: es la falla más grave que puede tener este
cambio, porque expone historias clínicas de una clínica a otra.

**Si el `set local role authenticated` falla** porque solo hay una cuenta
en `auth.users`, crear la segunda registrándose en la app con otro correo y
volver a correrlo. No reemplazar esta prueba por una que corra como
`postgres`.

- [ ] **Step 3: Revisar los tres números contra las Global Constraints**

Leer el archivo escrito y confirmar, señalando la línea de cada uno:
- `5242880` aparece dos veces (el `check` de `peso_bytes` y el `file_size_limit` del bucket).
- `10` aparece una vez (el `if cuantos >= 10`).
- Las seis llaves de `tipo` están completas y sin tildes.

Si alguna no coincide, es un bug del archivo, no de esta lista.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_archivos_mascota.sql
git commit -m "Agregar la tabla y el bucket de documentos PDF por mascota"
```

---

### Task 2: `archivos/limites.js` — los límites y sus mensajes (TDD)

**Files:**
- Create: `frontend/src/archivos/limites.test.js`
- Create: `frontend/src/archivos/limites.js`

**Interfaces:**
- Consumes: nada. Módulo sin imports — por eso se puede probar sin mock.
- Produces:
  - `MAX_BYTES = 5242880`
  - `MAX_POR_MASCOTA = 10`
  - `revisarArchivo(file, cuantosHay)` → `{ ok: true }` | `{ ok: false, motivo: string }`
  - `traducirErrorSql(mensaje)` → `string | null`

`file` se usa solo por `name`, `type` y `size`, así que las pruebas pasan objetos planos y nunca construyen un `File`.

- [ ] **Step 1: Escribir la prueba que falla**

`frontend/src/archivos/limites.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAX_BYTES, MAX_POR_MASCOTA, revisarArchivo, traducirErrorSql } from './limites.js';

// Un archivo es, para esta función, tres datos. No hace falta un File.
const pdf = (size) => ({ name: 'examen.pdf', type: 'application/pdf', size });

describe('revisarArchivo · el tamaño', () => {
  it('acepta exactamente 5 MB', () => {
    expect(revisarArchivo(pdf(MAX_BYTES), 0)).toEqual({ ok: true });
  });

  // El byte de más es el caso que importa: un `<` donde va un `<=` rechaza
  // el archivo que el mensaje promete aceptar.
  it('rechaza un byte más, y el motivo dice cuánto pesa y qué hacer', () => {
    const r = revisarArchivo(pdf(MAX_BYTES + 1), 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('5');
    expect(r.motivo).toContain('blanco y negro');
  });

  it('nombra el tamaño real en MB con coma decimal', () => {
    const r = revisarArchivo(pdf(12 * 1048576), 0);
    expect(r.motivo).toContain('12,0 MB');
  });

  // Un PDF de 0 bytes no se abre y nadie sabe por qué. Es el caso del
  // escáner que se quedó a mitad.
  it('rechaza un archivo vacío', () => {
    const r = revisarArchivo(pdf(0), 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('vacío');
  });
});

describe('revisarArchivo · el tipo', () => {
  // Lo que atrapa: la clínica eligió una foto del celular, con su nombre
  // .jpg de verdad. NO atrapa un .jpg renombrado a .pdf — el navegador
  // deriva `type` de la extensión, así que el renombrado llega diciendo
  // application/pdf. Ver la sección 9 del spec.
  it('rechaza lo que el navegador reporta como imagen', () => {
    const r = revisarArchivo({ name: 'foto.jpg', type: 'image/jpeg', size: 1000 }, 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('PDF');
  });

  it('rechaza un tipo vacío sin decir "undefined"', () => {
    const r = revisarArchivo({ name: 'raro', type: '', size: 1000 }, 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).not.toContain('undefined');
  });

  it('rechaza que no haya archivo', () => {
    expect(revisarArchivo(null, 0).ok).toBe(false);
    expect(revisarArchivo(undefined, 0).ok).toBe(false);
  });
});

describe('revisarArchivo · el cupo de la mascota', () => {
  it('con nueve ya subidos, el décimo pasa', () => {
    expect(revisarArchivo(pdf(1000), MAX_POR_MASCOTA - 1)).toEqual({ ok: true });
  });

  it('con diez, no pasa, y el motivo dice que hay que borrar uno', () => {
    const r = revisarArchivo(pdf(1000), MAX_POR_MASCOTA);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('borrá');
  });

  // El cupo se mira ANTES que el tamaño: en una mascota llena, volver a
  // escanear más liviano no sirve de nada, y el mensaje del tamaño
  // mandaría a la clínica a hacer justo eso.
  it('en una mascota llena, el motivo habla del cupo y no del tamaño', () => {
    const r = revisarArchivo(pdf(MAX_BYTES + 1), MAX_POR_MASCOTA);
    expect(r.motivo).toContain('borrá');
    expect(r.motivo).not.toContain('blanco y negro');
  });
});

describe('traducirErrorSql', () => {
  // El trigger de 015 levanta un nombre seco. Esta es la función que lo
  // convierte en la misma frase que habría dicho el chequeo del frontend
  // si hubiera tenido el conteo al día.
  it('traduce el freno del trigger', () => {
    const f = traducirErrorSql('new row violates ... limite_archivos_mascota');
    expect(f).toContain('borrá');
  });

  it('traduce el check del peso', () => {
    const f = traducirErrorSql('violates check constraint "archivos_mascota_peso_bytes_check"');
    expect(f).toContain('5');
  });

  // Un error que esta versión no conoce devuelve null, para que el
  // llamador muestre el de Postgres crudo. Inventarle una frase sería
  // tapar el único caso nuevo.
  it('devuelve null para lo que no conoce', () => {
    expect(traducirErrorSql('could not connect')).toBe(null);
    expect(traducirErrorSql('')).toBe(null);
    expect(traducirErrorSql(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
cd frontend && npx vitest run src/archivos/limites.test.js
```

Esperado: FAIL — `Failed to resolve import "./limites.js"`.

- [ ] **Step 3: Escribir `limites.js`**

`frontend/src/archivos/limites.js`:

```js
// ============================================================
// VetaApp · archivos/limites.js
// Los dos números del límite, y la única función que decide si un archivo
// se puede subir.
//
// Afuera del componente por dos motivos. Uno: adentro no se puede probar
// —este vitest no tiene jsdom— y esta es la capa que decide si la clínica
// puede trabajar. Dos: de las tres capas del límite (esta, el check de la
// tabla, el límite del bucket) es la ÚNICA que puede decir algo útil. Las
// otras dos solo saben rechazar, y en inglés.
// ============================================================

/**
 * 5 MB exactos, en bytes. El MISMO número vive en otros dos lados, los dos
 * en 015_archivos_mascota.sql:
 *   · el `check (peso_bytes > 0 and peso_bytes <= 5242880)` de la tabla
 *   · `file_size_limit` del bucket `documentos`
 *
 * Si se separan, el que rechace primero decide, y el mensaje que ve la
 * clínica cambia según cuál sea.
 */
export const MAX_BYTES = 5242880;

/** Diez por mascota. El mismo número que el trigger `limite_archivos_mascota()`. */
export const MAX_POR_MASCOTA = 10;

/**
 * "12,0". Coma decimal porque la pantalla está en español, y un solo
 * decimal porque "12,04 MB" no ayuda a decidir nada.
 */
const mb = (bytes) => (bytes / 1048576).toFixed(1).replace('.', ',');

/** La frase del cupo, compartida con traducirErrorSql: tienen que decir lo mismo. */
const MOTIVO_CUPO =
  `Esta mascota ya tiene ${MAX_POR_MASCOTA} documentos, que es el máximo. ` +
  `Borrá uno para poder subir otro.`;

/** La frase del tamaño sin el dato del archivo, para cuando el error viene de Postgres. */
const MOTIVO_PESO_SIN_DATO =
  'Ese PDF pasa de 5 MB, que es el máximo. Si lo escaneaste en color, ' +
  'volvé a escanearlo en blanco y negro.';

/**
 * ¿Se puede subir este archivo?
 *
 * @param file       lo que devolvió el <input type="file">. Se usan solo
 *                   `type` y `size`; las pruebas pasan objetos planos.
 * @param cuantosHay cuántos archivos tiene YA esa mascota.
 * @returns `{ ok: true }` o `{ ok: false, motivo }` con una frase que la
 *          pantalla muestra tal cual.
 *
 * El ORDEN de los chequeos es parte de la función, no un detalle.
 *
 * El cupo va primero: en una mascota llena, el mensaje del tamaño manda a
 * la clínica a volver a escanear el archivo más liviano, y eso no arregla
 * nada — va a quedar rechazado igual. Decirle "borrá uno" es lo único que
 * la desbloquea.
 *
 * Después el tipo, y después el tamaño: de los dos, el tipo es el error de
 * dedo (eligió la foto en vez del PDF) y el tamaño el que pide trabajo.
 */
export function revisarArchivo(file, cuantosHay) {
  if ((cuantosHay ?? 0) >= MAX_POR_MASCOTA) {
    return { ok: false, motivo: MOTIVO_CUPO };
  }

  if (!file) {
    return { ok: false, motivo: 'No elegiste ningún archivo.' };
  }

  // Lo que este chequeo atrapa: la clínica eligió una foto del celular,
  // con su nombre .jpg de verdad, y la pantalla se lo dice en vez de
  // subirla a un bucket que solo muestra PDFs.
  //
  // Lo que NO atrapa, y no se puede escribir como si lo hiciera: un .jpg
  // RENOMBRADO a .pdf. El navegador deriva `File.type` de la extensión del
  // nombre, no de los bytes, así que el renombrado llega acá diciendo
  // `application/pdf` y pasa. Validar el contenido exigiría leer los
  // primeros bytes y buscar `%PDF-`; no se hace porque no cambiaría nada:
  // el archivo lo abre el visor de la clínica, que falla solo y de forma
  // obvia.
  if (file.type !== 'application/pdf') {
    const queEs = file.type
      ? `es de tipo ${file.type}`
      : 'es de un tipo que el navegador no reconoce';
    return {
      ok: false,
      motivo: `Solo se pueden subir PDF, y este archivo ${queEs}. ` +
              `Si es una foto, guardala como PDF y volvé a intentar.`,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      motivo: 'Este archivo está vacío (0 bytes). Suele pasar cuando el ' +
              'escáner se cortó a mitad: volvé a exportarlo.',
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      motivo: `Este PDF pesa ${mb(file.size)} MB y el máximo son 5. ` +
              `Si lo escaneaste en color, volvé a escanearlo en blanco y negro.`,
    };
  }

  return { ok: true };
}

/**
 * El error de Postgres, dicho en la misma frase que habría dicho la
 * pantalla.
 *
 * Existe porque las capas 2 y 3 pueden rechazar algo que la capa 1 dejó
 * pasar: `cuantosHay` es el conteo con el que se pintó la lista, y entre
 * eso y el insert pudo entrar otro archivo desde otra pestaña. Sin esta
 * traducción, la clínica ve `new row for relation "archivos_mascota"
 * violates ...` y llama por teléfono.
 *
 * Devuelve `null` —no una frase genérica— para lo que no conoce, así el
 * llamador muestra el mensaje crudo de Postgres. Un error nuevo tapado
 * detrás de "algo salió mal" es un error que nadie va a encontrar.
 */
export function traducirErrorSql(mensaje) {
  const m = mensaje || '';
  if (m.includes('limite_archivos_mascota')) return MOTIVO_CUPO;
  if (m.includes('archivos_mascota_peso_bytes_check')) return MOTIVO_PESO_SIN_DATO;
  if (m.includes('archivos_mascota_tipo_check')) {
    return 'Ese tipo de documento no existe. Elegí uno de la lista.';
  }
  if (m.includes('archivos_mascota_fecha_documento_iso')) {
    return 'La fecha del documento no quedó bien. Usá el calendario del campo.';
  }
  if (m.includes('archivos_mascota_ruta_key')) {
    return 'Ese archivo ya se había subido. Actualizá la página para verlo.';
  }
  return null;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
cd frontend && npx vitest run src/archivos/limites.test.js
```

Esperado: PASS, 12 pruebas.

- [ ] **Step 5: Correr la suite completa**

```bash
cd frontend && npm test
```

Esperado: las 203 de antes más las nuevas, todas verdes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/archivos/limites.js frontend/src/archivos/limites.test.js
git commit -m "Agregar los límites de los PDF y sus mensajes"
```

---

### Task 3: `archivos/textos.js` — etiquetas, fechas y bytes (TDD)

**Files:**
- Create: `frontend/src/archivos/textos.test.js`
- Create: `frontend/src/archivos/textos.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ETIQUETA_TIPO` — objeto con las seis llaves de `tipo` de la Task 1 → etiqueta con tildes.
  - `TIPOS` — arreglo congelado `[{ valor, etiqueta }]` en el orden del formulario. Lo itera el `<select>` de la Task 5.
  - `textoArchivo(a)` → `string`. `a` es una fila de `archivos_mascota`.
  - `fechaLegible(iso)` → `string`.
  - `fmtBytes(bytes)` → `string`. La usa también `Admin.jsx` en la Task 7.

- [ ] **Step 1: Escribir la prueba que falla**

`frontend/src/archivos/textos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ETIQUETA_TIPO, TIPOS, textoArchivo, fechaLegible, fmtBytes } from './textos.js';

// Las seis llaves del `check (tipo in (...))` de 015_archivos_mascota.sql,
// copiadas a mano. Si alguien agrega un tipo a la migración y no acá, esta
// lista queda corta y las dos pruebas de abajo lo avisan — que es
// exactamente lo que tienen que hacer.
const LLAVES_DE_LA_MIGRACION = [
  'chequeo', 'examenes', 'imagenes', 'cirugia', 'historia_anterior', 'otro',
];

describe('ETIQUETA_TIPO', () => {
  it('tiene etiqueta para cada una de las seis llaves de la migración', () => {
    for (const k of LLAVES_DE_LA_MIGRACION) {
      expect(ETIQUETA_TIPO[k], `falta la etiqueta de ${k}`).toBeTruthy();
    }
  });

  // Al revés también: una etiqueta de un tipo que la base rechaza es un
  // ítem del dropdown que falla al guardar.
  it('no tiene etiquetas de más', () => {
    expect(Object.keys(ETIQUETA_TIPO).sort()).toEqual([...LLAVES_DE_LA_MIGRACION].sort());
  });

  it('TIPOS trae los seis, en orden, para el dropdown', () => {
    expect(TIPOS.map((t) => t.valor)).toEqual(LLAVES_DE_LA_MIGRACION);
    expect(TIPOS.every((t) => t.etiqueta === ETIQUETA_TIPO[t.valor])).toBe(true);
  });
});

describe('fechaLegible', () => {
  it('escribe el día sin cero adelante y el mes en palabra', () => {
    expect(fechaLegible('2023-04-18')).toBe('18 abr 2023');
    expect(fechaLegible('2023-04-01')).toBe('1 abr 2023');
  });

  // El 1 de un mes en zona -05:00 es el caso que `toLocaleDateString`
  // corre un día para atrás. Esta función no construye un Date, así que no
  // puede pasarle.
  it('no corre el día en enero', () => {
    expect(fechaLegible('2024-01-01')).toBe('1 ene 2024');
    expect(fechaLegible('2024-12-31')).toBe('31 dic 2024');
  });

  it('devuelve vacío sin reventar cuando no hay fecha', () => {
    expect(fechaLegible(null)).toBe('');
    expect(fechaLegible('')).toBe('');
  });

  it('devuelve el texto crudo si no es ISO', () => {
    expect(fechaLegible('18/04/2023')).toBe('18/04/2023');
  });
});

describe('fmtBytes', () => {
  it('escribe KB, MB y GB según el tamaño', () => {
    expect(fmtBytes(0)).toBe('0 KB');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(1048576)).toBe('1,0 MB');
    expect(fmtBytes(2516582)).toBe('2,4 MB');
    // El plan gratis de Supabase es 1 GB: la columna del Admin llega acá.
    expect(fmtBytes(1073741824)).toBe('1,00 GB');
  });

  it('no dice "undefined KB" cuando no hay dato', () => {
    expect(fmtBytes(null)).toBe('0 KB');
    expect(fmtBytes(undefined)).toBe('0 KB');
  });
});

describe('textoArchivo', () => {
  it('junta tipo, fecha y descripción con separador', () => {
    const t = textoArchivo({
      tipo: 'examenes', fecha_documento: '2023-04-18', descripcion: 'Hemograma',
    });
    expect(t).toBe('Exámenes de laboratorio · 18 abr 2023 · Hemograma');
  });

  it('con fecha y sin descripción no deja el separador colgando', () => {
    const t = textoArchivo({ tipo: 'cirugia', fecha_documento: '2023-04-18', descripcion: null });
    expect(t).toBe('Cirugía · 18 abr 2023');
  });

  // La subida más rápida posible: archivo, tipo, y listo.
  it('sin fecha y sin descripción deja solo el tipo', () => {
    expect(textoArchivo({ tipo: 'otro' })).toBe('Otro');
  });

  it('con descripción y sin fecha salta la fecha', () => {
    expect(textoArchivo({ tipo: 'chequeo', descripcion: 'Control anual' }))
      .toBe('Chequeo general · Control anual');
  });

  // Mismo criterio que textoOmitidos del importador: un tipo que esta
  // versión de la pantalla no conoce se muestra crudo. Esconderlo sería
  // esconder justo el caso nuevo.
  it('muestra crudo un tipo que no conoce', () => {
    expect(textoArchivo({ tipo: 'radiografia' })).toBe('radiografia');
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
cd frontend && npx vitest run src/archivos/textos.test.js
```

Esperado: FAIL — `Failed to resolve import "./textos.js"`.

- [ ] **Step 3: Escribir `textos.js`**

`frontend/src/archivos/textos.js`:

```js
// ============================================================
// VetaApp · archivos/textos.js
// Una fila de `archivos_mascota` pasada a la línea que la clínica lee.
//
// Separado de limites.js porque son dos preguntas distintas: una decide
// si algo se puede subir, este redacta. Y afuera del JSX por lo de
// siempre: adentro del componente no se puede probar.
// ============================================================

/**
 * Las seis llaves del `check (tipo in (...))` de
 * 015_archivos_mascota.sql, cada una con la palabra que ve la clínica.
 *
 * Las llaves van sin tildes porque son valores de base de datos; las
 * etiquetas van con tildes porque son español. Que la etiqueta viva acá y
 * no en la migración es lo que permite cambiar "Exámenes de laboratorio"
 * por otra cosa sin tocar una migración que ya corrió en producción.
 *
 * Si se agrega un tipo al check de `015`, se agrega acá: textos.test.js
 * compara las dos listas en los dos sentidos y falla si se separan.
 */
export const ETIQUETA_TIPO = {
  chequeo:           'Chequeo general',
  examenes:          'Exámenes de laboratorio',
  imagenes:          'Imágenes (rayos X, ecografía)',
  cirugia:           'Cirugía',
  historia_anterior: 'Historia de otra clínica',
  otro:              'Otro',
};

/**
 * Los seis, en el orden del dropdown. Congelado para que ninguna pantalla
 * lo reordene por accidente y dos clínicas vean listas distintas.
 *
 * El orden no es alfabético: arriba van los dos que más se suben (chequeo
 * y exámenes) y abajo 'Otro', que es el que se elige cuando ninguno
 * aplica. Un 'Otro' en la mitad de la lista se elige por pereza.
 */
export const TIPOS = Object.freeze(
  ['chequeo', 'examenes', 'imagenes', 'cirugia', 'historia_anterior', 'otro']
    .map((valor) => Object.freeze({ valor, etiqueta: ETIQUETA_TIPO[valor] }))
);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * '2023-04-18' → '18 abr 2023'.
 *
 * A mano, con una expresión regular, y NO con `toLocaleDateString`. Dos
 * motivos, los dos reales en este proyecto:
 *
 *  · `new Date('2023-04-18')` es medianoche UTC, que en Colombia (-05:00)
 *    es el 17 a las 19:00. La fecha se muestra un día antes.
 *    `Historias.jsx:195` ya parchea eso pegándole `'T12:00:00'`; acá el
 *    problema no existe porque nunca se construye un Date.
 *
 *  · `toLocaleDateString('es-CO', …)` depende del ICU del motor, y la
 *    misma llamada devuelve 'abr' o 'abr.' según la versión de node. Una
 *    prueba que compara la cadena exacta se vuelve frágil por algo que no
 *    es el código.
 *
 * Lo que no sea ISO se devuelve crudo: si una fila tiene algo raro, que se
 * vea. El check de `015` hace que no pueda pasar por la app, pero una fila
 * puede haber entrado por el SQL Editor.
 */
export function fechaLegible(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Bytes a algo que se lee de un vistazo.
 *
 * Tres ramas y no dos: la columna "Espacio" del panel de Admin suma TODO
 * lo de una clínica, y el plan gratis de Supabase es 1 GB. Sin la rama de
 * GB, una clínica a punto de llenar la cuenta se lee como "1024,0 MB", que
 * es el número que menos alarma de todos.
 *
 * Nada de bytes sueltos: abajo de 1 KB la respuesta útil igual es "0 KB".
 * Un PDF de 400 bytes no existe.
 */
export function fmtBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2).replace('.', ',')} GB`;
  if (b >= 1048576)    return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(b / 1024)} KB`;
}

/**
 * La línea de abajo de cada archivo en la lista: qué es, de cuándo, y lo
 * que la clínica haya querido anotar.
 *
 * El nombre del archivo NO entra: va arriba, en negrita, como título. Acá
 * repetirlo sería la misma información dos veces en dos renglones
 * seguidos.
 *
 * Los pedazos vacíos se caen antes del `join`, así que nunca sale un
 * ' · ' colgando — el caso más común de todos, porque fecha y descripción
 * son opcionales y la subida rápida no pone ninguna de las dos.
 *
 * Un `tipo` que esta versión no conoce se muestra crudo, con el mismo
 * criterio que `textoOmitidos` del importador: esconderlo sería esconder
 * exactamente el caso nuevo.
 */
export function textoArchivo(a) {
  return [
    ETIQUETA_TIPO[a?.tipo] ?? a?.tipo ?? '',
    fechaLegible(a?.fecha_documento),
    a?.descripcion || '',
  ].filter(Boolean).join(' · ');
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
cd frontend && npx vitest run src/archivos/textos.test.js
```

Esperado: PASS, 13 pruebas.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/archivos/textos.js frontend/src/archivos/textos.test.js
git commit -m "Agregar las etiquetas y los textos de los archivos de mascota"
```

---

### Task 4: Las cuatro rutas en `api/axios.js`, y el borrado de la mascota

**Files:**
- Modify: `frontend/src/api/axios.js` — agregar un bloque de rutas después del de `MASCOTAS` (que termina en `:226`), y cambiar el handler de `DELETE /mascotas/:id` (`:223-226`).

**Interfaces:**
- Consumes: `revisarArchivo`, `traducirErrorSql`, `MAX_POR_MASCOTA` de `../archivos/limites.js`. El bucket `documentos` y la tabla `archivos_mascota` de la Task 1. Los helpers que ya existen en el archivo: `unwrap` (`:16-25`), `apiError` (`:16-25`), `supabase`.
- Produces, para las Tasks 5 y 6:
  - `GET /archivos/mascota/:id` → `Array<{ id, mascota_id, ruta, nombre, tipo, descripcion, fecha_documento, peso_bytes, created_at }>`, el más nuevo primero.
  - `POST /archivos` con body `{ archivo: File, mascota_id, tipo, descripcion?, fecha_documento?, cuantos_hay }` → la fila creada.
  - `GET /archivos/:id/url` → `{ url: string }`, válida 300 s.
  - `DELETE /archivos/:id` → `{ mensaje: 'Archivo eliminado' }`.

**Por qué el body manda `cuantos_hay`:** `revisarArchivo` necesita el conteo, y el componente ya lo tiene porque acaba de pintar la lista. Pedirlo acá con un `count` sería una consulta más para un dato que el llamador tiene en la mano, y de todos modos tampoco cerraría la carrera — el trigger de `015` es el que la cierra.

- [ ] **Step 1: Agregar el import arriba del archivo**

Después de la línea `import { supabase } from '../lib/supabase';` (o donde estén los imports actuales), agregar:

```js
import { revisarArchivo, traducirErrorSql } from '../archivos/limites.js';
```

- [ ] **Step 2: Escribir el helper de subida, al lado de `subirFoto`**

Justo después de `subirFoto` (que termina en `api/axios.js:117`):

```js
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
    contentType: 'application/pdf',
  });
  if (up.error) throw apiError(up.error.message);

  return ruta;
}
```

**Nota sobre `contentType`:** va la constante, no `file.type`. Son equivalentes cuando el archivo es un PDF de verdad, pero `file.type` es un dato que viene del nombre que eligió el usuario, y lo que se le dice a Storage que es el objeto no tiene por qué depender de eso. Además deja el bucket consistente: todo objeto de `documentos` tiene `application/pdf`.

- [ ] **Step 3: Agregar el bloque de rutas**

Inmediatamente después del bloque `// ===== MASCOTAS =====` (o sea, después del handler de `DELETE /mascotas/(\d+)` que queda en `:223-226`):

```js
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
    const file = (typeof FormData !== 'undefined' && body instanceof FormData)
      ? body.get('archivo')
      : body?.archivo;

    // El chequeo del frontend corre ACÁ y no solo en el componente, para
    // que ninguna pantalla futura pueda saltárselo. Es la capa que da el
    // mensaje útil; las otras dos (el check de la tabla y el límite del
    // bucket) solo rechazan.
    const veredicto = revisarArchivo(file, Number(body?.cuantos_hay) || 0);
    if (!veredicto.ok) throw apiError(veredicto.motivo);

    if (!body?.mascota_id) throw apiError('Falta decir de qué mascota es el archivo');
    if (!body?.tipo) throw apiError('Falta elegir qué tipo de documento es');

    // PRIMERO el bucket, DESPUÉS la fila. El orden es la decisión central
    // de todo esto.
    //
    // Al revés —fila primero— una subida que falla a mitad deja una fila
    // que dice "acá hay un examen de sangre" apuntando a un objeto que no
    // existe: la lista lo muestra, la clínica lo clickea, y no abre nada.
    // Nadie puede distinguir eso de un bug.
    //
    // En este orden, lo que queda si algo falla es un objeto sin fila: no
    // se ve en ninguna pantalla, no le miente a nadie, y el barrido de
    // huérfanos lo encuentra. Se falla hacia el huérfano, nunca hacia la
    // fila mentirosa.
    const ruta = await subirDocumento(file, body.mascota_id);

    try {
      return unwrap(await supabase.from('archivos_mascota').insert({
        mascota_id:      body.mascota_id,
        ruta,
        nombre:          file.name,
        tipo:            body.tipo,
        descripcion:     body.descripcion || null,
        fecha_documento: body.fecha_documento || null,
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
      const limpieza = await supabase.storage.from('documentos').remove([ruta]);
      if (limpieza.error) {
        console.warn('[api] quedó un objeto huérfano en documentos:', ruta, limpieza.error.message);
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
    const borrado = await supabase.storage.from('documentos').remove([fila.ruta]);
    if (borrado.error) throw apiError(borrado.error.message);

    unwrap(await supabase.from('archivos_mascota').delete().eq('id', id));
    return { mensaje: 'Archivo eliminado' };
  }},
```

- [ ] **Step 4: Cambiar `DELETE /mascotas/:id`**

Reemplazar el handler actual (`api/axios.js:223-226`):

```js
  { m: 'DELETE', re: /^\/mascotas\/(\d+)$/, fn: async ({ id }) => {
    unwrap(await supabase.from('mascotas').delete().eq('id', id));
    return { mensaje: 'Mascota eliminada correctamente' };
  }},
```

por:

```js
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
      }
    }

    unwrap(await supabase.from('mascotas').delete().eq('id', id));
    return { mensaje: 'Mascota eliminada correctamente' };
  }},
```

- [ ] **Step 5: Verificar que el build no se rompió**

```bash
cd frontend && npm run build && npm test
```

Esperado: build limpio y las pruebas de siempre verdes. Esta task no agrega pruebas: todo lo que hace es hablarle a Supabase, y no hay forma de probarlo sin una base. Lo que SÍ se puede probar —el veredicto y la traducción de errores— ya está probado en la Task 2 y se consume desde acá.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/axios.js
git commit -m "Agregar las rutas de archivos PDF y borrar los objetos al borrar la mascota"
```

---

### Task 5: `components/ArchivosMascota.jsx` — la pestaña

**Files:**
- Create: `frontend/src/components/ArchivosMascota.jsx`
- Leer antes (es el estilo de la casa): `frontend/src/components/ui.jsx:43` (`Card`), `:96` (`SectionHeader`), `:326` (`EmptyState`), `:4` (`Button`), `:340` (`iconBtnStyle`); `frontend/src/pages/Historias.jsx:22-28` (`labelInput` y `styleInput`).

**Interfaces:**
- Consumes: `api` (`../api/axios`) con las cuatro rutas de la Task 4; `TIPOS`, `textoArchivo`, `fmtBytes` de `../archivos/textos.js`; `revisarArchivo` de `../archivos/limites.js`; `Card`, `Button`, `SectionHeader`, `EmptyState`, `iconBtnStyle` de `./ui`; `IconFile`, `IconPlus`, `IconTrash`, `IconArrowRight` de `./icons`.
- Produces: `export default function ArchivosMascota({ mascotaId, archivos, onCambio })`.
  - `archivos` — el arreglo que ya cargó `Historias.jsx` (Task 6). El componente **no** lo carga: si lo cargara por su cuenta, el badge de la pestaña y la lista contarían por separado y podrían discrepar.
  - `onCambio()` — se llama después de cada subida y de cada borrado, para que el padre recargue y el badge quede al día.

**No hay pruebas en esta task.** Es JSX y no hay jsdom. Todo lo que se puede probar —el veredicto del archivo, las etiquetas, el texto de cada fila, el formato de los bytes— ya está probado en las Tasks 2 y 3, y este archivo lo consume sin reimplementar nada. Si acá aparece un `if (file.size > …)` o un `'Exámenes'` escrito a mano, es un bug: la lógica se duplicó.

- [ ] **Step 1: Escribir el componente**

`frontend/src/components/ArchivosMascota.jsx`:

```jsx
// ============================================================
// VetaApp · components/ArchivosMascota.jsx
// La pestaña "Archivos" de la ficha de una mascota.
//
// Tiene tres trabajos: listar, subir, borrar. Ninguna decisión vive acá —
// el límite lo decide limites.js, la redacción textos.js, y el orden de
// bucket-y-fila las rutas de api/axios.js. Este archivo es la pantalla, y
// como no hay jsdom en este proyecto, lo que no se pueda probar no puede
// decidir nada.
// ============================================================

import { useState, useRef } from 'react';
import api from '../api/axios';
import { Card, Button, SectionHeader, EmptyState, iconBtnStyle } from './ui';
import { IconFile, IconPlus, IconTrash, IconArrowRight } from './icons';
import { TIPOS, textoArchivo, fmtBytes } from '../archivos/textos.js';
import { revisarArchivo, MAX_POR_MASCOTA } from '../archivos/limites.js';

const labelInput = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
};
const styleInput = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
  fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

const FORM0 = { tipo: 'examenes', descripcion: '', fecha_documento: '' };

export default function ArchivosMascota({ mascotaId, archivos, onCambio }) {
  const [form, setForm]         = useState(FORM0);
  const [archivo, setArchivo]   = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError]       = useState('');
  const [abriendo, setAbriendo] = useState(null); // id del que se está abriendo
  const [borrando, setBorrando] = useState(null); // id del que se está borrando
  const inputRef = useRef(null);

  const lleno = archivos.length >= MAX_POR_MASCOTA;

  // El veredicto se calcula en cada render, no al submit. Así el motivo
  // aparece en el momento en que la clínica elige el archivo —cuando
  // todavía tiene el explorador abierto y puede elegir otro— y no después
  // de que le dio al botón.
  const veredicto = archivo ? revisarArchivo(archivo, archivos.length) : null;

  const elegir = (e) => {
    setError('');
    setArchivo(e.target.files?.[0] ?? null);
  };

  const limpiar = () => {
    setForm(FORM0);
    setArchivo(null);
    // El <input type="file"> no se resetea cambiando estado: el DOM se
    // queda con el archivo elegido. Sin esto, subir dos veces el mismo
    // archivo a propósito no dispara el onChange la segunda vez.
    if (inputRef.current) inputRef.current.value = '';
  };

  const subir = async (e) => {
    e.preventDefault();
    if (!veredicto?.ok || subiendo) return;

    setSubiendo(true);
    setError('');
    try {
      await api.post('/archivos', {
        archivo,
        mascota_id: mascotaId,
        tipo: form.tipo,
        descripcion: form.descripcion.trim() || null,
        fecha_documento: form.fecha_documento || null,
        // El conteo que vio esta pantalla. El trigger de 015 es el que
        // cierra la carrera; esto es para que el mensaje sea el bueno en
        // el caso normal.
        cuantos_hay: archivos.length,
      });
      limpiar();
      await onCambio();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
    }
  };

  // La URL se pide acá, en el clic, y se usa de inmediato. Vive 300 s y no
  // se guarda en ningún estado: un estado con URLs firmadas adentro es una
  // lista de llaves que se van venciendo mientras la pestaña está abierta.
  const abrir = async (a) => {
    setAbriendo(a.id);
    setError('');
    try {
      const { data } = await api.get(`/archivos/${a.id}/url`);
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo abrir el archivo');
    } finally {
      setAbriendo(null);
    }
  };

  const borrar = async (a) => {
    // Borrar un documento clínico no se deshace, así que se pregunta. Y la
    // pregunta nombra el archivo: "¿Borrar el archivo?" con ocho en la
    // lista no dice cuál.
    if (!window.confirm(`¿Borrar "${a.nombre}"? Esto no se puede deshacer.`)) return;

    setBorrando(a.id);
    setError('');
    try {
      await api.delete(`/archivos/${a.id}`);
      await onCambio();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar el archivo');
    } finally {
      setBorrando(null);
    }
  };

  return (
    <Card padding={0}>
      <SectionHeader
        title="Archivos"
        subtitle={`${archivos.length} de ${MAX_POR_MASCOTA} · solo PDF, hasta 5 MB cada uno`}
      />

      {/* ---------- subir ---------- */}
      {/* El formulario va ARRIBA de la lista y no detrás de un botón
          "Agregar": la pestaña se abre para subir algo, y un paso de más
          entre el escáner y el PDF es el paso donde la clínica desiste. */}
      <form onSubmit={subir} style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ marginBottom: 10 }}>
          <label style={labelInput}>Archivo PDF</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={elegir}
            disabled={lleno || subiendo}
            style={{ ...styleInput, height: 'auto', padding: 8 }}
          />
        </div>

        {/* El motivo del rechazo va pegado al input, no abajo del botón:
            es donde está mirando la clínica cuando acaba de elegir. */}
        {veredicto && !veredicto.ok && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--danger)' }}>
            {veredicto.motivo}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelInput}>Qué es</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              disabled={lleno || subiendo}
              style={styleInput}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>
          <div>
            {/* "opcional" en la etiqueta, no un asterisco en los
                obligatorios: así se lee lo que se puede saltar, que es la
                información que acelera la subida. */}
            <label style={labelInput}>Fecha del documento (opcional)</label>
            <input
              type="date"
              value={form.fecha_documento}
              onChange={(e) => setForm({ ...form, fecha_documento: e.target.value })}
              disabled={lleno || subiendo}
              style={styleInput}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelInput}>Descripción (opcional)</label>
          <input
            type="text"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Hemograma completo"
            disabled={lleno || subiendo}
            style={styleInput}
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<IconPlus size={13} />}
          disabled={lleno || subiendo || !veredicto?.ok}
        >
          {subiendo ? 'Subiendo…' : 'Subir documento'}
        </Button>

        {/* Cuando está llena, el aviso reemplaza al del archivo: el botón
            ya está apagado y el motivo tiene que estar a la vista sin
            tener que elegir un archivo para enterarse. */}
        {lleno && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Esta mascota ya tiene {MAX_POR_MASCOTA} documentos, que es el máximo.
            Borrá uno para poder subir otro.
          </p>
        )}

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>
        )}
      </form>

      {/* ---------- la lista ---------- */}
      {archivos.length === 0 ? (
        <EmptyState
          icon={<IconFile size={18} />}
          title="Sin archivos"
          subtitle="Subí los exámenes, las imágenes o la historia de la clínica anterior"
        />
      ) : (
        <div>
          {archivos.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px', borderBottom: '1px solid var(--divider)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'var(--stone-50)', border: '1px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-disabled)',
              }}>
                <IconFile size={15} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* `nombre` puede ser largo y con tildes; el ellipsis
                    evita que empuje los botones fuera de la tarjeta. */}
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {textoArchivo(a)} · {fmtBytes(a.peso_bytes)}
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={<IconArrowRight size={12} />}
                onClick={() => abrir(a)}
                disabled={abriendo === a.id}
                title="Abrir el PDF en otra pestaña"
              >
                {abriendo === a.id ? 'Abriendo…' : 'Abrir'}
              </Button>

              <button
                onClick={() => borrar(a)}
                disabled={borrando === a.id}
                title="Borrar este archivo"
                style={{ ...iconBtnStyle, color: 'var(--danger)' }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend && npm run build
```

Esperado: build limpio. Todavía no se puede ver en pantalla: el componente no está montado en ninguna parte hasta la Task 6.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ArchivosMascota.jsx
git commit -m "Agregar la pantalla de archivos de la ficha de mascota"
```

---

### Task 6: Montar la pestaña en `Historias.jsx` (y arreglar "1 consultas")

**Files:**
- Create: `frontend/src/pages/Historias.test.jsx`
- Modify: `frontend/src/pages/Historias.jsx` — imports (`:1-12`), estado (`:203-209`), el loader (`:236-244`), el `Promise.all` (`:251-259`), el subtítulo (`:410`), el arreglo de tabs (`:468-470`), y el panel de la derecha donde terminan los `? :` (`:678-685`).

**Interfaces:**
- Consumes: `ArchivosMascota` de `../components/ArchivosMascota`; `n` de `../importador/textos.js`; `GET /archivos/mascota/:id` de la Task 4.
- Produces: `export const subtituloPaciente(consultas, vacunas, archivos)` → `string`. Exportada **nombrada**, además del `export default` del componente de página, para que la prueba la importe sin renderizar nada.

- [ ] **Step 1: Escribir la prueba que falla**

`frontend/src/pages/Historias.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';

// El mock va ANTES del import. `subtituloPaciente` es una función pura,
// pero Historias.jsx importa api/axios.js, que importa lib/supabase.js,
// que hace `window.supabase = supabase` en modo DEV (lib/supabase.js:21).
// En este vitest no hay jsdom, así que `window` no existe y el import
// reventaría antes de llegar a la función. Mismo patrón que
// importador/paso3Revisar.test.jsx:1-10.
const mockSupabase = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() }, storage: { from: vi.fn() } }));
vi.mock('../lib/supabase.js', () => ({ supabase: mockSupabase, default: mockSupabase }));

import { subtituloPaciente } from './Historias.jsx';

describe('subtituloPaciente', () => {
  // El bug que arregla: la línea era
  // `${consultas.length} consultas · ${vacunas.length} vacunas`, así que
  // una mascota con una sola consulta decía "1 consultas · 0 vacunas" en
  // el encabezado de su propia ficha.
  it('dice singular cuando hay uno', () => {
    expect(subtituloPaciente(1, 1, 1)).toBe('1 consulta · 1 vacuna · 1 archivo');
  });

  it('dice plural cuando hay varios', () => {
    expect(subtituloPaciente(6, 3, 2)).toBe('6 consultas · 3 vacunas · 2 archivos');
  });

  // Los ceros SÍ se escriben acá, al revés que en el importador: esta
  // línea es el estado completo del paciente y "0 archivos" es la
  // respuesta correcta a "¿cuántos archivos tiene?". En el importador el
  // cero se calla porque ahí la lista es de lo que se escribió.
  it('escribe los ceros', () => {
    expect(subtituloPaciente(0, 0, 0)).toBe('0 consultas · 0 vacunas · 0 archivos');
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
cd frontend && npx vitest run src/pages/Historias.test.jsx
```

Esperado: FAIL — `subtituloPaciente is not a function` (el import resuelve, la función no existe).

- [ ] **Step 3: Agregar los imports**

En `Historias.jsx`, junto a los imports existentes (`:1-12`):

```jsx
import ArchivosMascota from '../components/ArchivosMascota';
import { n } from '../importador/textos.js';
```

`n` se reusa en vez de copiarse: es `(cuantos, singular, plural) =>` y ya está probada en `importador/textos.test.js`. Un segundo pluralizador en el proyecto es un segundo lugar donde arreglar el mismo bug.

- [ ] **Step 4: Escribir `subtituloPaciente`, afuera del componente**

Arriba de `function HistorialMascota()` (o sea, antes de `:198`):

```jsx
/**
 * La línea de abajo del título de la ficha: el estado del paciente en
 * tres números.
 *
 * Afuera del componente a propósito. Adentro no se puede probar —este
 * vitest no tiene jsdom, así que no hay forma de renderizar un
 * componente— y esta línea ya tuvo un bug visible: decía
 * `${consultas.length} consultas`, con el plural pegado, y una mascota
 * con una sola consulta se presentaba como "1 consultas".
 *
 * Recibe números, no arreglos, para que la prueba no tenga que inventar
 * seis consultas falsas para contar hasta seis.
 */
export const subtituloPaciente = (consultas, vacunas, archivos) => [
  n(consultas, 'consulta', 'consultas'),
  n(vacunas,   'vacuna',   'vacunas'),
  n(archivos,  'archivo',  'archivos'),
].join(' · ');
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

```bash
cd frontend && npx vitest run src/pages/Historias.test.jsx
```

Esperado: PASS, 3 pruebas.

- [ ] **Step 6: Agregar el estado y el loader de archivos**

Junto a `const [vacunas, setVacunas] = useState([]);` (`:205`):

```jsx
  const [archivos, setArchivos]   = useState([]);
```

Junto a `cargarVacunas` (`:241-244`):

```jsx
  // El padre carga los archivos, no el componente de la pestaña. Si los
  // cargara la pestaña, el badge del tab y la lista contarían por
  // separado: el badge diría 3 y la lista mostraría 4 hasta que alguien
  // recargue. Un contador y su lista tienen que salir de la misma
  // consulta.
  const cargarArchivos = async () => {
    const { data } = await api.get(`/archivos/mascota/${mascotaId}`);
    setArchivos(data);
  };
```

- [ ] **Step 7: Agregar la cuarta consulta al `Promise.all`**

Reemplazar el bloque de `:251-259` por:

```jsx
        const [mRes, cRes, vRes, aRes] = await Promise.all([
          api.get(`/mascotas/${mascotaId}`),
          api.get(`/historias/mascota/${mascotaId}`),
          api.get(`/historias/vacunas/mascota/${mascotaId}`),
          api.get(`/archivos/mascota/${mascotaId}`),
        ]);
        setMascota(mRes.data);
        setConsultas(cRes.data);
        setVacunas(vRes.data);
        setArchivos(aRes.data);
```

En paralelo y no una cuarta espera en fila: las cuatro son independientes y la ficha no se puede pintar sin todas.

- [ ] **Step 8: Usar `subtituloPaciente` en el `Topbar`**

Reemplazar la línea `:410`:

```jsx
        subtitle={`${consultas.length} consultas · ${vacunas.length} vacunas`}
```

por:

```jsx
        subtitle={subtituloPaciente(consultas.length, vacunas.length, archivos.length)}
```

- [ ] **Step 9: Agregar la pestaña al arreglo de tabs**

En `:468-470`, agregar la tercera entrada:

```jsx
              {[
                { key: 'consultas', label: 'Consultas', count: consultas.length },
                { key: 'vacunas',   label: 'Vacunas',   count: vacunas.length },
                { key: 'archivos',  label: 'Archivos',  count: archivos.length },
              ].map(t => (
```

El badge sale del mismo `archivos` que la lista, por lo del Step 6.

- [ ] **Step 10: Montar el panel de la pestaña**

El botón "Nuevo" del `Topbar` (`:413-416`) decide por `tabActiva` entre consulta y vacuna. Con la pestaña de archivos abierta no tiene nada que abrir —el formulario de subida ya está a la vista dentro del panel—, así que se esconde. Reemplazar el bloque de acciones del `Topbar`:

```jsx
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>}
              onClick={() => tabActiva === 'consultas' ? abrirPanelConsulta() : abrirPanelVacuna()}>
              {tabActiva === 'consultas' ? 'Nueva consulta' : 'Nueva vacuna'}
            </Button>
```

por:

```jsx
            {/* En la pestaña de archivos no se muestra: el formulario de
                subida vive adentro del panel, y un botón "Nuevo" que no
                abre nada es peor que no tenerlo. */}
            {tabActiva !== 'archivos' && (
              <Button variant="primary" size="md" icon={<IconPlus size={14}/>}
                onClick={() => tabActiva === 'consultas' ? abrirPanelConsulta() : abrirPanelVacuna()}>
                {tabActiva === 'consultas' ? 'Nueva consulta' : 'Nueva vacuna'}
              </Button>
            )}
```

Después, en la columna izquierda —junto a los dos `{tabActiva === 'consultas' && (…)}` y `{tabActiva === 'vacunas' && (…)}` que empiezan en `:491` y `:542`—, agregar el tercero al final de los dos:

```jsx
            {tabActiva === 'archivos' && (
              <ArchivosMascota
                mascotaId={mascotaId}
                archivos={archivos}
                onCambio={cargarArchivos}
              />
            )}
```

- [ ] **Step 11: Cerrar el `? :` de la columna derecha**

La columna derecha (`:678-685`) termina en un ternario que asume dos pestañas: si no hay registro seleccionado y la pestaña no es `consultas`, muestra el `EmptyState` de vacunas. Con tres pestañas eso le mostraría "Sin vacunas · Registra la primera vacuna aplicada" a quien está en Archivos.

Reemplazar la última rama:

```jsx
            ) : (
              <EmptyState
                icon={<IconSyringe size={22}/>}
                title="Sin vacunas"
                subtitle="Registra la primera vacuna aplicada"
                action={<Button variant="primary" size="md" icon={<IconPlus size={13}/>} onClick={abrirPanelVacuna}>Nueva vacuna</Button>}
              />
            )}
```

por:

```jsx
            ) : tabActiva === 'vacunas' ? (
              <EmptyState
                icon={<IconSyringe size={22}/>}
                title="Sin vacunas"
                subtitle="Registra la primera vacuna aplicada"
                action={<Button variant="primary" size="md" icon={<IconPlus size={13}/>} onClick={abrirPanelVacuna}>Nueva vacuna</Button>}
              />
            ) : (
              /* Pestaña de archivos. El detalle de la derecha es para
                 consultas y vacunas; un PDF no tiene nada que mostrar acá
                 —se abre en otra pestaña del navegador— así que lo único
                 honesto es decir dónde está la acción. */
              <EmptyState
                icon={<IconFile size={22}/>}
                title="Documentos"
                subtitle="Los archivos de esta mascota están en la lista de la izquierda"
              />
            )}
```

- [ ] **Step 12: Correr todo y probarlo a mano**

```bash
cd frontend && npm test && npm run build
```

Esperado: todo verde, build limpio.

Después, con `015` ya corrido en el SQL Editor, `npm run dev` y en una ficha de mascota:
1. La pestaña "Archivos" aparece con badge en 0.
2. Subir un PDF de verdad: aparece en la lista, el badge pasa a 1, el subtítulo dice "1 archivo".
3. "Abrir": se abre en otra pestaña y se ve el PDF.
4. "Borrar": confirma, desaparece, el badge vuelve a 0.
5. En el Dashboard de Supabase → Storage → `documentos`: la carpeta `{user_id}/{mascota_id}/` quedó vacía después del borrado.

El punto 5 es el que importa: es el único que distingue "borró la fila" de "borró el archivo".

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/Historias.jsx frontend/src/pages/Historias.test.jsx
git commit -m "Montar la pestaña de archivos en la ficha y arreglar el plural del subtítulo"
```

---

### Task 7: La columna "Espacio" en el panel de Admin

**Files:**
- Modify: `supabase/migrations/015_archivos_mascota.sql` — agregar una sección 8 al final, antes del bloque de PRUEBAS.
- Modify: `frontend/src/pages/Admin.jsx` — import, el KPI (`:340-343`), el `<th>` (`:380-385`) y la celda (`:402-405`).

**Interfaces:**
- Consumes: `admin_listar_veterinarias()` en su versión viva, `007_pagos.sql:329-363`, **11 columnas**. `storage.objects`. `fmtBytes` de `../archivos/textos.js` (Task 3).
- Produces: `admin_listar_veterinarias()` con una columna más, `espacio_bytes bigint`, al final. Las 11 de antes quedan en el mismo orden.

**Esta task va al final y no antes, y el motivo es una incógnita sin cerrar.** `admin_listar_veterinarias()` es `security definer` y la dueña es `postgres`. Si `postgres` no tiene BYPASSRLS sobre `storage.objects`, el `left join` devuelve 0 para todas las clínicas y la columna miente en silencio — que es el peor resultado posible, porque una columna que dice 0 KB se lee como "esa clínica no subió nada". El Step 1 es la verificación, y hay que correrlo **con un PDF real ya subido** (o sea después de la Task 6).

- [ ] **Step 1: Verificar que `postgres` ve `storage.objects` — ANTES de escribir nada**

Con al menos un PDF ya subido desde la app, correr en el SQL Editor (que corre como el mismo rol `postgres` que va a ejecutar la función, y eso es lo que lo hace una prueba fiel):

```sql
select count(*) as objetos,
       sum((metadata->>'size')::bigint) as bytes
from storage.objects
where bucket_id = 'documentos';
```

**Si devuelve `objetos >= 1` y un `bytes` que se parece al tamaño del PDF:** seguir al Step 2.

**Si devuelve `objetos = 0`:** la RLS de `storage.objects` está filtrando y la función no va a poder sumar. No improvisar: la salida conocida es cambiarle la dueña a la función,

```sql
alter function public.admin_listar_veterinarias() owner to supabase_storage_admin;
```

y volver a correr la verificación. Si eso tampoco, parar y escribirlo en el reporte en vez de dejar la columna puesta — una columna en 0 KB es peor que no tener columna.

- [ ] **Step 2: Agregar la sección 8 a `015_archivos_mascota.sql`**

Antes del bloque `-- PRUEBAS`:

```sql
-- ---------- 8. CUÁNTO ESPACIO OCUPA CADA CLÍNICA ----------
-- Esta columna es para el dueño de VetaApp, no para la clínica. La
-- pregunta que contesta es "¿cuánto me está costando esta cuenta?", y la
-- respuesta tiene que estar en la misma tabla donde él decide a quién
-- activar.
--
-- OJO CON LA VERSIÓN: `admin_listar_veterinarias()` existe en cuatro
-- migraciones distintas y la que está viva es la ÚLTIMA,
-- 007_pagos.sql:329-363, con ONCE columnas. Las de 002 y las intermedias
-- tienen ocho. Si se recrea sobre la versión vieja, Admin.jsx pierde el
-- selector de plan (:425), la insignia de prueba (:411-414) y el botón de
-- "+8 días" (:440), porque desaparecen `plan`, `prueba_hasta` y
-- `suscripcion_hasta` — y no falla nada: las celdas quedan en `undefined`.
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
-- daría un número más chico que la factura.
--
-- Los permisos no se tocan: la función ya era `security definer` con el
-- chequeo de `es_admin()` adentro, y ese chequeo es lo único que la
-- protege. Ver 007_pagos.sql:300-322 para el día que faltó un revoke.
```

- [ ] **Step 3: Correr la sección 8 en el SQL Editor y verificar la salida**

Pegar y ejecutar solo esa sección. Después:

```sql
select nombre, estado_suscripcion, espacio_bytes
from public.admin_listar_veterinarias();
```

Esperado: las mismas filas de antes, cada una con su `espacio_bytes`, y la cuenta desde la que se subió el PDF con un número que se parece al tamaño del archivo. Si todas salen en 0 con un objeto confirmado en el Step 1, volver al Step 1 — no seguir a la pantalla.

- [ ] **Step 4: Agregar el import en `Admin.jsx`**

Después de los imports de `../lib/planes` (`:9-11`):

```jsx
import { fmtBytes } from '../archivos/textos.js';
```

Se reusa en vez de escribir un formateador acá: es la misma pregunta ("¿cuánto es esto en MB?") y la respuesta ya está probada, incluida la rama de GB, que es justo la que esta tabla necesita.

- [ ] **Step 5: Calcular el total y agregar el KPI**

Junto a los cálculos de `activas` / `enPrueba` / `inactivas` (`:249-255`):

```jsx
  // Se suman TODAS las filas, no solo las de rol 'veterinaria': la cuenta
  // del dueño también ocupa espacio en el mismo plan de Supabase, y el
  // KPI se llama "total".
  const espacioTotal = filas.reduce((t, f) => t + (Number(f.espacio_bytes) || 0), 0);
```

Y en el grid de KPIs (`:339-344`), una quinta tarjeta:

```jsx
          <KPI label="Espacio total" value={fmtBytes(espacioTotal)} icon={<IconBox size={15} />} />
```

El grid ya es `repeat(auto-fit, minmax(200px, 1fr))`, así que la quinta entra sola sin tocar el layout. `IconBox` ya está en `icons.jsx`; agregarlo al import de iconos de `:5-8`.

- [ ] **Step 6: Agregar la columna a la tabla**

En el `<thead>` (`:380-385`), entre "Plan" y "Notas":

```jsx
                    <th style={{ ...th, textAlign: 'right' }}>Espacio</th>
```

Y la celda, en el mismo lugar del `<tr>` (después de la celda de plan, que termina en `:426`):

```jsx
                        {/* A la derecha y tabular, como todo número de la
                            app: así las magnitudes se comparan de un
                            vistazo entre filas. Y SÍ se muestra para la
                            fila de admin, al revés que plan y notas: el
                            espacio del dueño también lo cobra Supabase. */}
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span className="tabular" style={{ color: 'var(--text-muted)' }}>
                            {fmtBytes(f.espacio_bytes)}
                          </span>
                        </td>
```

El `minWidth: 860` de la tabla (`:377`) pasa a `940` para que la columna nueva no apriete las otras.

- [ ] **Step 7: Verificar en pantalla**

```bash
cd frontend && npm run build && npm test
```

Después, `npm run dev`, entrar con la cuenta de admin a `/app/admin`:
1. El KPI "Espacio total" muestra algo distinto de "0 KB".
2. La fila de la clínica desde la que se subió el PDF muestra su tamaño.
3. Las otras columnas siguen ahí: el selector de plan, la insignia de prueba y el botón de "+8 días". Esto es lo que verifica que se recreó la función de 11 columnas y no la de 8.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/015_archivos_mascota.sql frontend/src/pages/Admin.jsx
git commit -m "Mostrar el espacio que ocupa cada clínica en el panel de Admin"
```

---

### Task 8: El barrido de huérfanos

**Files:**
- Create: `supabase/functions/_compartido/huerfanos.ts`
- Create: `supabase/functions/_compartido/huerfanos.prueba.mjs`
- Create: `supabase/functions/limpiar-huerfanos/index.ts`
- Leer antes (son los moldes): `supabase/functions/pago-iniciar/index.ts:24-70`, `supabase/functions/_compartido/wompi.prueba.mjs:1-20`

**Interfaces:**
- Consumes: `public.es_admin()` (`002_admin.sql:78-89`, `security definer` y **sin revoke**, o sea que `authenticated` la puede ejecutar — eso es lo que permite validar al invocador antes de tocar nada). Las tablas `archivos_mascota` y `mascotas`. Los buckets `documentos` y `mascotas`.
- Produces:
  - `huerfanos.ts`: `rutaDesdeValor(valor: string | null): string | null` y `rutasHuerfanas(objetos, conocidas, ahora, minutosGracia): string[]`.
  - La función desplegable `limpiar-huerfanos`, que responde `{ documentos: { revisados, borrados, rutas }, mascotas: { … } }`.

**Dos cosas que esta task tiene que resolver y no son obvias:**

1. **`mascotas.foto` NO guarda una ruta, guarda una URL.** `subirFoto` (`api/axios.js:116`) termina en `getPublicUrl`, así que la columna tiene `https://…/object/public/mascotas/{user_id}/mascota_1760000000.jpg`. Comparar eso contra el `name` que devuelve Storage (`{user_id}/mascota_1760000000.jpg`) da que **todas** las fotos son huérfanas, y el barrido borraría las fotos de todas las clínicas. Es el bug más caro posible de esta función. De ahí `rutaDesdeValor`.
2. **Un objeto recién subido todavía no tiene fila.** El orden de la Task 4 es bucket y después fila: hay una ventana de milisegundos —y de minutos si la clínica tiene internet malo— en la que el objeto existe y la fila no. Un barrido sin ventana de gracia borra el PDF que se está subiendo en ese momento. De ahí `minutosGracia`.

- [ ] **Step 1: Escribir la prueba que falla**

`supabase/functions/_compartido/huerfanos.prueba.mjs`:

```js
// Pruebas del diff del barrido de huérfanos.
//
// Correr con:   cd supabase/functions/_compartido && node huerfanos.prueba.mjs
//
// Node 24 ejecuta TypeScript directo, y huerfanos.ts a propósito no usa
// ninguna API de Deno: así la parte que decide QUÉ ARCHIVO SE BORRA se
// puede probar sin desplegar nada y sin llaves. Mismo arreglo que
// wompi.prueba.mjs.
//
// Es la función más peligrosa del proyecto: lo que devuelva se borra, y un
// archivo borrado de Storage no vuelve.

const M = await import('./huerfanos.ts');
const { rutaDesdeValor, rutasHuerfanas } = M;

let ok = 0, mal = 0;
const t = (nombre, cond, extra = '') => { (cond ? ok++ : mal++); console.log(`${cond ? 'OK  ' : 'MAL '} ${nombre}${extra ? ' → ' + extra : ''}`); };

// ---------- rutaDesdeValor ----------
// `archivos_mascota.ruta` ya guarda la ruta pelada.
t('deja pasar una ruta pelada',
  rutaDesdeValor('abc-123/7/1760000000-x9f2.pdf') === 'abc-123/7/1760000000-x9f2.pdf');

// `mascotas.foto` guarda la URL pública completa (api/axios.js:116). Sin
// esta conversión, TODAS las fotos se verían huérfanas y el barrido las
// borraría. Es la prueba que más importa de todo el archivo.
t('saca la ruta de una URL pública de Supabase',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/public/mascotas/abc-123/mascota_1760000000.jpg')
  === 'abc-123/mascota_1760000000.jpg');

t('saca la ruta de una URL firmada, con query y todo',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/sign/documentos/abc-123/7/a.pdf?token=eyJ')
  === 'abc-123/7/a.pdf');

t('null y vacío devuelven null',
  rutaDesdeValor(null) === null && rutaDesdeValor('') === null);

// Una URL de otro lado —alguien pegó un link de Google Drive en la
// columna— devuelve null. Lo que no se entiende NO se convierte en una
// ruta a borrar.
t('una URL que no es de storage devuelve null',
  rutaDesdeValor('https://drive.google.com/file/d/123/view') === null);

// I1: `getPublicUrl` aplica encodeURI. Sin decodeURIComponent, un nombre
// con %20 no coincide con el name crudo de Storage y se borraría.
t('decodifica %20 de una URL pública',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/public/mascotas/abc-123/ecografia.jpg%20(2)')
  === 'abc-123/ecografia.jpg (2)');

// ---------- rutasHuerfanas ----------
const AHORA = new Date('2026-10-20T12:00:00Z');
const hace = (min) => new Date(AHORA.getTime() - min * 60000).toISOString();

// Los archivos reales siempre tienen id. Se lo ponemos al helper para que
// la guarda de carpetas (id == null) no los descarte.
const obj = (name, min) => ({ name, id: 'fake-id', created_at: hace(min) });

t('el objeto sin fila y viejo se borra',
  JSON.stringify(rutasHuerfanas([obj('u/7/huerfano.pdf', 180)], ['u/7/otro.pdf'], AHORA, 60))
  === JSON.stringify(['u/7/huerfano.pdf']));

t('el objeto con fila no se toca',
  rutasHuerfanas([obj('u/7/bueno.pdf', 180)], ['u/7/bueno.pdf'], AHORA, 60).length === 0);

// LA GUARDA QUE EVITA BORRAR UNA SUBIDA EN CURSO. El orden de la subida es
// bucket y después fila: un objeto de hace dos minutos sin fila puede ser
// una subida que todavía no terminó, no un huérfano.
t('el objeto reciente sin fila se respeta',
  rutasHuerfanas([obj('u/7/subiendo.pdf', 2)], [], AHORA, 60).length === 0);

t('justo en el borde de la gracia no se borra',
  rutasHuerfanas([obj('u/7/borde.pdf', 60)], [], AHORA, 60).length === 0);

t('un minuto más allá del borde sí se borra',
  rutasHuerfanas([obj('u/7/pasado.pdf', 61)], [], AHORA, 60).length === 1);

// I2: los nulls de conocidas no protegen NI revientan. La lista no tiene
// la ruta del objeto: si los nulls no se filtran el Set tiene basura pero
// igual no hace match; si se filtran correctamente el objeto queda huérfano.
t('los nulls de la lista de conocidas no protegen ni revientan',
  rutasHuerfanas([obj('u/m.jpg', 180)], [null, undefined, ''], AHORA, 60).length === 1);

// I2: un objeto con created_at: null se respeta. Sin la guarda `!created_at`,
// `new Date(null)` = epoch 1970, que es muy viejo y se borraría.
// El segundo objeto (viejo, con fila) discrimina: length === 1, no 0.
t('un objeto con created_at null no se borra, pero uno con fecha y sin fila sí',
  rutasHuerfanas(
    [{ name: 'u/7/sinfecha.pdf', id: 'a', created_at: null }, obj('u/7/viejo.pdf', 180)],
    [],
    AHORA,
    60,
  ).length === 1);

// I2: las carpetas que devuelve `list()` vienen con `id: null`. Con un
// created_at viejo, borrar la guarda de id las pondría en la lista.
t('las carpetas no entran aunque tengan created_at viejo',
  rutasHuerfanas([{ name: 'u', id: null, created_at: hace(180) }], [], AHORA, 60).length === 0);

// M5: los marcadores .emptyFolderPlaceholder del Dashboard tienen id y
// created_at reales pero ninguna fila los nombra: no son huérfanos.
t('el marcador de carpeta vacía no es huérfano',
  rutasHuerfanas(
    [{ name: 'u/7/.emptyFolderPlaceholder', id: 'abc', created_at: hace(180) }],
    [],
    AHORA,
    60,
  ).length === 0);

// Una fecha que `new Date()` no puede leer da NaN, y NaN pierde toda
// comparación —`NaN >= corte` es false—, así que sin la guarda explícita
// el objeto se colaría hasta el borrado. Van dos entradas y no una: la
// segunda, que sí es huérfana, es la que hace que la aserción distinga en
// vez de comparar contra una lista vacía.
t('una fecha impareseable no se borra, y la huérfana de al lado sí',
  rutasHuerfanas(
    [{ name: 'u/7/mala-fecha.pdf', id: 'a', created_at: 'no-es-una-fecha' }, obj('u/7/viejo.pdf', 180)],
    [],
    AHORA,
    60,
  ).length === 1);

console.log(`\n${ok} OK · ${mal} MAL`);
if (mal > 0) process.exit(1);
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
cd supabase/functions/_compartido && node huerfanos.prueba.mjs
```

Esperado: FAIL — `Cannot find module './huerfanos.ts'`.

- [ ] **Step 3: Escribir `huerfanos.ts`**

`supabase/functions/_compartido/huerfanos.ts`:

```ts
// ============================================================
//  huerfanos.ts — qué objeto del bucket no tiene fila que lo nombre
//
//  Sin una sola API de Deno a propósito, igual que wompi.ts: así la parte
//  que DECIDE QUÉ SE BORRA se prueba con node, sin desplegar y sin llaves
//  (ver huerfanos.prueba.mjs).
//
//  Es la función más peligrosa del proyecto. Lo que devuelve se borra, y
//  de Storage no se recupera. Por eso toda duda se resuelve para el mismo
//  lado: si no se entiende algo, NO es huérfano.
// ============================================================

/** Lo que devuelve `storage.list()` de cada entrada, de lo que acá se usa. */
export type ObjetoStorage = {
  name: string;
  // La librería declara `created_at: string | null` ("null for folders").
  created_at?: string | null;
  /** `list()` devuelve las carpetas con `id: null`. */
  id?: string | null;
};

/**
 * El valor guardado en la base, pasado a ruta dentro del bucket.
 *
 * Existe porque las dos columnas que esta función compara guardan cosas
 * distintas:
 *
 *   · `archivos_mascota.ruta` guarda la ruta pelada —
 *     `{user_id}/{mascota_id}/{ts}-{rand}.pdf`.
 *   · `mascotas.foto` guarda una URL COMPLETA, porque `subirFoto`
 *     (api/axios.js:116) termina en `getPublicUrl`.
 *
 * Sin esta conversión, ninguna URL coincidiría con ningún `name` de
 * Storage y el barrido concluiría que TODAS las fotos de TODAS las
 * clínicas son huérfanas: todas las fotos de pacientes de todas las
 * clínicas que pagan, sin posibilidad de restaurarlas.
 *
 * Lo que no se entiende devuelve `null`, y el llamador descarta los nulls.
 * Un valor raro en la columna —alguien pegó un link de Drive— tiene que
 * dar "no sé", nunca una ruta a borrar.
 */
export function rutaDesdeValor(valor: string | null | undefined): string | null {
  if (!valor) return null;

  // Ruta pelada: no tiene esquema.
  if (!valor.startsWith('http')) return valor;

  // URL de Supabase Storage, pública o firmada:
  //   .../storage/v1/object/public/{bucket}/{ruta}
  //   .../storage/v1/object/sign/{bucket}/{ruta}?token=...
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)$/.exec(valor);
  if (!m) return null;

  // `getPublicUrl` aplica `encodeURI`, `storage.list()` devuelve el `name`
  // crudo. Sin decodificar, un nombre con espacio queda con %20 y no
  // coincide. try/catch: valor corrupto que no se puede decodificar = null.
  try {
    return decodeURIComponent(m[1].split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * Los objetos del bucket que ninguna fila nombra, y que son lo bastante
 * viejos para que eso signifique algo.
 *
 * @param objetos       lo que devolvió `list()`, ya aplanado.
 * @param conocidas     las rutas que la base dice que existen. Puede traer
 *                      nulls; se descartan.
 * @param ahora         el momento de referencia. Se pasa en vez de llamar
 *                      a `new Date()` adentro para que la prueba pueda
 *                      fijarlo.
 * @param minutosGracia cuántos minutos tiene que tener un objeto para que
 *                      "no tiene fila" cuente como huérfano.
 *
 * LA VENTANA DE GRACIA ES LO QUE HACE QUE ESTO SE PUEDA CORRER SIN MIEDO.
 * El orden de la subida es bucket primero, fila después (ver POST
 * /archivos): entre las dos operaciones hay un rato —milisegundos en una
 * oficina, minutos con el internet de una clínica en Girón— en que el
 * objeto existe y la fila no. Sin gracia, el barrido borra el PDF que la
 * veterinaria está subiendo justo ahora, y en la pantalla la subida falla
 * sin un motivo que nadie pueda explicar.
 *
 * Un objeto SIN `created_at` se respeta, no se borra: no se puede saber si
 * está dentro de la ventana, y ante la duda no se borra.
 */
export function rutasHuerfanas(
  objetos: ObjetoStorage[],
  conocidas: (string | null | undefined)[],
  ahora: Date,
  minutosGracia: number,
): string[] {
  const vivas = new Set(
    conocidas.map(rutaDesdeValor).filter((r): r is string => !!r),
  );

  const corte = ahora.getTime() - minutosGracia * 60000;

  return objetos
    .filter((o) => {
      // Las carpetas vienen con `id: null`. No son archivos.
      // `== null` cubre tanto null como undefined.
      if (o.id == null) return false;
      if (!o.name) return false;
      if (!o.created_at) return false;

      const nacio = new Date(o.created_at).getTime();
      // Una fecha que no se puede leer cae del lado de "no se borra".
      if (Number.isNaN(nacio)) return false;
      // `>=` y no `>`: el que está justo en el borde se respeta. La duda
      // siempre para el mismo lado.
      if (nacio >= corte) return false;

      return !vivas.has(o.name);
    })
    .map((o) => o.name);
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

```bash
cd supabase/functions/_compartido && node huerfanos.prueba.mjs
```

Esperado: `16 OK · 0 MAL`.

Y después, la verificación que de verdad importa en una función que borra
archivos: **que cada aserción muera si se borra la guarda que nombra.** Una
prueba verde que sigue verde con la guarda borrada no está probando nada, y
acá eso significa que nada vigila el borrado. Copiar `huerfanos.ts` y la
prueba a un directorio temporal, borrar una guarda por vez —el filtro de
carpetas por `id`, el de `.emptyFolderPlaceholder`, el de `created_at`
ausente, el de `Number.isNaN`, el de la ventana de gracia y el
`decodeURIComponent`— y confirmar que en cada caso al menos una aserción
pasa a `MAL`.

La única excepción conocida es el `.filter` que descarta los nulls de la
lista de rutas conocidas: `Set.has(unString)` nunca da `true` para `null`,
así que borrarlo no cambia ningún comportamiento observable. Es una
restricción de tipo, no una guarda, y no hay que fabricarle una aserción.

- [ ] **Step 5: Escribir la edge function**

`supabase/functions/limpiar-huerfanos/index.ts`:

```ts
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
 * solo los primeros 1000 declararía huérfano a nada — pero tampoco
 * limpiaría. Peor: el día que un bucket tenga 1001 objetos, el barrido
 * empezaría a mentir sobre cuántos revisó.
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
    // Sin cuerpo: barrido de verdad.
  }

  const comoServidor = createClient(url, service);
  const ahora = new Date();
  const salida: Record<string, unknown> = { simulacion: simular };

  try {
    // ---------- bucket documentos ----------
    const objDocs = await listarTodo(comoServidor.storage, 'documentos');

    // C1: paginamos con .range() + .order('id'). PostgREST silencia el
    // truncamiento: devuelve 200 con las primeras N filas sin error.
    // Antes de paginar pedimos el conteo exacto; al terminar, si trajimos
    // menos filas de las que hay, tiramos antes de borrar nada.
    // El modo simulación no puede detectar el truncamiento porque simula
    // con la misma consulta recortada — solo la guarda de conteo protege.
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
```

- [ ] **Step 6: Desplegar y correr en seco**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
supabase functions deploy limpiar-huerfanos
```

Después, con el token de la cuenta admin (sale del `localStorage` del navegador con la sesión abierta, llave `sb-<ref>-auth-token`, campo `access_token`):

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/limpiar-huerfanos" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"simular": true}'
```

Esperado, con los archivos de prueba de la Task 6 todos borrados por el camino normal: `huerfanos: 0` en los dos buckets, y `revisados` igual a la cantidad de objetos que hay.

**Verificación que importa, y hay que hacerla:** subir un PDF desde la app, dejarlo ahí (con su fila), y volver a correr en seco. `mascotas.huerfanos` y `documentos.huerfanos` tienen que seguir en 0. Si el PDF aparece como huérfano, la comparación está mal y correr el barrido de verdad borraría archivos buenos.

- [ ] **Step 7: Verificar que rechaza a quien no es admin**

Con el token de una cuenta de veterinaria (no admin):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/functions/v1/limpiar-huerfanos" \
  -H "Authorization: Bearer $TOKEN_VETERINARIA"
```

Esperado: `403`. Y sin header de autorización: `401`.

Esta es la verificación de seguridad de la task: una función que puede borrar los archivos de todas las clínicas y no comprueba quién la llamó es una puerta abierta. Si devuelve 200, parar y arreglarlo antes de seguir.

- [ ] **Step 8: Fabricar un huérfano de verdad y barrerlo**

Esta es la única prueba que mide lo que la función existe para hacer. Las de
arriba prueban que no borra lo que no debe; esta prueba que sí borra lo que
debe. Sin ella, un barrido que devuelve `huerfanos: 0` siempre es
indistinguible de uno que funciona.

Pasos, en orden:

1. Desde la app, subir un PDF a una mascota de prueba (no a una real: esto
   termina en un borrado).
2. En el Dashboard de Supabase → Table Editor → `mascotas`, borrar **esa
   fila de mascota**. Esto es el camino que el frontend no cubre: la cascada
   se lleva la fila de `archivos_mascota` y el objeto del bucket queda solo.
3. Anotar el número de la columna "Espacio" de esa clínica en el panel de
   Admin.
4. Esperar a que el objeto pase los 60 minutos de `MINUTOS_GRACIA`. Antes de
   eso el barrido lo va a ignorar a propósito, y eso es correcto, no un bug.
5. Correr en seco:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/limpiar-huerfanos" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"simular": true}'
```

Esperado: `documentos.huerfanos: 1`, y la ruta que lista es la del PDF que
se subió. **Verificar la ruta a ojo antes de seguir.** Si lista alguna otra,
parar: el barrido de verdad borraría un archivo bueno.

6. Correr el barrido de verdad:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/limpiar-huerfanos" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

7. Recargar el panel de Admin. La columna "Espacio" de esa clínica tiene que
   haber bajado. Y en Storage → `documentos`, la carpeta de esa mascota ya no
   está.

Si el paso 7 no baja el número, hay dos culpables posibles y hay que
distinguirlos antes de tocar nada: o el barrido no borró (y entonces el
objeto sigue en Storage), o la columna no lee `storage.objects` (y entonces
el objeto ya no está pero el número no se movió). Mirar Storage primero
decide cuál de los dos es.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_compartido/huerfanos.ts \
        supabase/functions/_compartido/huerfanos.prueba.mjs \
        supabase/functions/limpiar-huerfanos/index.ts
git commit -m "Agregar el barrido manual de objetos huérfanos del storage"
```

---

### Task 9: La política de privacidad

**Files:**
- Modify: `frontend/src/pages/Legal.jsx:64` (viñeta de qué datos trata)
- Modify: `frontend/src/pages/Legal.jsx:66-67` (agregar un párrafo después de la lista)
- Modify: `frontend/src/pages/Legal.jsx:87` (viñeta de Supabase)
- Test: ninguno automatizado — es texto en JSX y no hay jsdom. La verificación es el Step 4, que compara cada frase contra el código que la cumple.

**Interfaces:**
- Consumes: `supabase/migrations/015_archivos_mascota.sql` de la Task 1 (el bucket privado y las 4 políticas), `DELETE /archivos/:id` y `GET /archivos/:id/url` de la Task 4.
- Produces: nada que otra task consuma. Es la última.

**Por qué esta task existe:** hoy `Legal.jsx:64` enumera qué datos guarda
VetaApp y no nombra documentos clínicos. Cuando la clínica sube la historia
de un animal, entra un PDF con el nombre del animal, el del tutor y a veces
su cédula — datos personales de un tercero que no leyó esta política. La
política tiene que decirlo.

Y tiene que decir solo lo que `015` cumple. Las cuatro frases del párrafo
nuevo salen de la tabla de la §8 del spec, una por una.

- [ ] **Step 1: Nombrar los documentos en la viñeta de datos**

En `frontend/src/pages/Legal.jsx:64`, dejar la viñeta que ya está y agregarle
una debajo. Es decir, reemplazar esta línea:

```jsx
        'De la operación de la clínica: mascotas, dueños, historias clínicas, citas, recordatorios, inventario y movimientos de caja que la clínica registre.',
```

por estas dos:

```jsx
        'De la operación de la clínica: mascotas, dueños, historias clínicas, citas, recordatorios, inventario y movimientos de caja que la clínica registre.',
        'Documentos clínicos en PDF que la clínica suba a la ficha de una mascota: exámenes, imágenes diagnósticas, descripciones quirúrgicas e historias de otras clínicas. Esos archivos pueden contener el nombre del dueño y su número de documento.',
```

La segunda frase es la que importa. Un PDF escaneado de una historia ajena
trae la cédula del tutor adentro, y la política no puede callarlo.

- [ ] **Step 2: Agregar el párrafo de cómo se guardan**

En `frontend/src/pages/Legal.jsx`, justo después del `<Lista items={[...]} />` de
la sección 3 (el que cierra con `]} />` en la línea 66) y **antes** del `<P>` que
empieza con `No solicitamos ni almacenamos datos de tarjetas`, insertar:

```jsx
      <P>
        Los documentos en PDF se guardan en un almacenamiento privado: no son accesibles por
        internet sin autenticación. Solo la cuenta de la clínica que los subió puede consultarlos,
        descargarlos y borrarlos. Cuando alguien de la clínica abre uno, el sistema genera un
        enlace temporal que vence en cinco minutos.
      </P>
```

Cada frase apunta a una línea verificable, y el Step 4 las verifica:

| Frase | Lo que la cumple |
|---|---|
| almacenamiento privado, no accesible sin autenticación | `public = false` en el `insert` del bucket (Task 1) |
| solo la cuenta que los subió | las 4 políticas de `storage.objects` por carpeta (Task 1) |
| puede borrarlos | `DELETE /archivos/:id` con `.remove()` (Task 4) |
| enlace que vence en cinco minutos | `createSignedUrl(fila.ruta, 300)` (Task 4) |

Lo que el párrafo **no** dice, y es a propósito: no promete cifrado en
reposo, ni retención, ni copias de respaldo. Nada de eso está verificado en
`015`.

- [ ] **Step 3: Ampliar la viñeta de Supabase**

En `frontend/src/pages/Legal.jsx:87`, reemplazar:

```jsx
        'Supabase: base de datos y autenticación.',
```

por:

```jsx
        'Supabase: base de datos, autenticación y almacenamiento de los archivos que la clínica suba.',
```

Los PDFs viven en Supabase Storage, que es Supabase pero no es la base de
datos. La viñeta vieja no cubría almacenamiento de archivos, y la sección 5
es justamente la que dice en quién se apoya VetaApp para tratar los datos.

- [ ] **Step 4: Verificar cada frase contra el código**

Correr las cuatro, desde la raíz del repo:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
grep -n "false" supabase/migrations/015_archivos_mascota.sql
grep -c "documentos_select_own\|documentos_insert_own\|documentos_update_own\|documentos_delete_own" supabase/migrations/015_archivos_mascota.sql
grep -n "\.remove(" frontend/src/api/axios.js
grep -n "createSignedUrl" frontend/src/api/axios.js
```

Esperado:
1. Una línea con `false` dentro del `insert into storage.buckets` — es el `public`.
2. Un número `>= 8` (cada política aparece en su `drop policy if exists` y en su `create policy`).
3. Al menos tres usos de `.remove(` — el rollback del `POST /archivos`, el `DELETE /archivos/:id` y el borrado en bloque del `DELETE /mascotas/:id`.
4. Una línea con `createSignedUrl(fila.ruta, 300)`.

**Si alguna sale vacía, parar y borrar la frase correspondiente del párrafo
en vez de dejarla publicada.** Una política de privacidad que promete algo
que el código no hace es peor que una que no lo menciona: la primera es una
afirmación falsa frente al titular de los datos; la segunda es solo una
omisión.

- [ ] **Step 5: Revisar que compila y que se lee bien**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run build
```

Esperado: build sin errores.

Después, con `npm run dev`, abrir `/legal` y leer las secciones 3 y 5
completas: las viñetas nuevas y el párrafo tienen que leerse como texto
corrido, sin viñetas partidas ni comillas sueltas.

- [ ] **Step 6: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Legal.jsx
git commit -m "Declarar en la política de privacidad los documentos clínicos en PDF"
```

---

## Cierre

Con las 9 tasks hechas la rama `archivos-pdf` tiene: la migración `015`
corrida en el Postgres real, los dos módulos puros con sus pruebas, las
cuatro rutas y el helper de subida, el panel de archivos montado en la
tercera pestaña de Historias, la columna de espacio en el panel de admin,
el barrido de huérfanos desplegado y verificado en seco, y la política de
privacidad al día.

Entonces sí: `superpowers:finishing-a-development-branch`.
