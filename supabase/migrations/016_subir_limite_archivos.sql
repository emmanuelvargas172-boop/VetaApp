-- ============================================================
-- 016_subir_limite_archivos.sql
-- Sube el peso máximo por PDF de 5 MB a 12 MB, y baja el cupo por
-- mascota de 10 a 7.
--
-- POR QUÉ. El límite de 5 MB de la 015 fue un número elegido antes de ver
-- archivos reales. Los escaneos que trae una clínica pesan entre 5 y 7 MB,
-- así que el tope quedó justo encima del tamaño NORMAL y rechazaba trabajo
-- legítimo: una historia de otra veterinaria escaneada entera no entraba.
-- Un tope sirve para frenar el disparate (la foto del celular en color, el
-- escaneo de 80 páginas sin comprimir), no para frenar el caso de todos los
-- días. 12 MB deja aire sobre lo que se vio y sigue estando muy por debajo
-- del disparate.
--
-- El cupo baja de 10 a 7 en el mismo movimiento. No es ahorro de espacio
-- real —un PDF ocupa lo que pesa, tenga el tope en 5 o en 12—, es el techo
-- del peor caso por mascota: 7 × 12 MB = 84 MB, contra los 150 MB que daría
-- 10 × 15. El plan gratis de Supabase es 1 GB de archivos para TODO el
-- proyecto, y cuando se llena no falla la mascota que se pasó: dejan de
-- subir todas las clínicas, incluidas las que pagan.
--
-- LOS TRES LUGARES. El peso vive por triplicado y los tres tienen que
-- moverse juntos, porque el que rechace primero decide qué mensaje lee la
-- clínica:
--   1. el check de la tabla          → acá abajo
--   2. file_size_limit del bucket    → acá abajo
--   3. MAX_BYTES en limites.js       → en el mismo commit que esta migración
-- El cupo vive por duplicado: el trigger de acá y MAX_POR_MASCOTA.
--
-- ORDEN. Esta migración va ANTES que el cambio de limites.js. Al revés, la
-- pantalla acepta 12 MB y la tabla los rebota con un error de Postgres en
-- inglés.
--
-- La 015 no se reescribe: ya corrió. Sus límites quedan como historia y su
-- encabezado apunta acá.
-- ============================================================


-- ---------- 1. EL CHECK DE LA TABLA ----------
-- El NOMBRE de la restricción se conserva a propósito.
-- `traducirErrorSql` (frontend/src/archivos/limites.js) reconoce el error
-- de Postgres buscando la cadena 'archivos_mascota_peso_bytes_check'
-- dentro del mensaje. Si esta restricción se recrea con otro nombre, el
-- rechazo deja de traducirse y la clínica ve el texto crudo de Postgres.
--
-- El `add` revalida las filas que ya existen. No hay riesgo: el límite se
-- está AGRANDANDO, así que toda fila que pasaba el check viejo pasa el
-- nuevo.
alter table public.archivos_mascota
  drop constraint if exists archivos_mascota_peso_bytes_check;

alter table public.archivos_mascota
  add constraint archivos_mascota_peso_bytes_check
  check (peso_bytes > 0 and peso_bytes <= 12582912);


-- ---------- 2. EL LÍMITE DEL BUCKET ----------
-- 12582912 = 12 × 1048576. `file_size_limit` es bigint EN BYTES, no la
-- cadena '12MB' que acepta el cliente de JavaScript (verificado contra
-- information_schema el 2026-10-20, ver 015 línea 216).
--
-- Acá va un `update` y no el `insert ... on conflict do nothing` de la
-- 015: el bucket ya existe, y esa forma no habría cambiado nada.
update storage.buckets
   set file_size_limit = 12582912
 where id = 'documentos';


-- ---------- 3. EL CUPO POR MASCOTA ----------
-- Mismo cuerpo que la 015, con 7 en vez de 10. Se recrea entera y no se
-- parchea porque `create or replace function` reemplaza el cuerpo
-- completo; dejar el viejo a la vista arriba sería dejar dos versiones de
-- la misma función en el repositorio.
--
-- El trigger de la 015 (trg_limite_archivos_mascota) sigue apuntando a
-- esta función: no hace falta recrearlo.
--
-- Lo que esta función NO hace, igual que en la 015: tomar un lock sobre la
-- mascota. Dos inserts simultáneos pueden dejar 8 archivos. La garantía
-- real es "una fila por sentencia", que es la que da la ruta de la app.
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

  -- El 7 tiene un gemelo: MAX_POR_MASCOTA en frontend/src/archivos/limites.js.
  -- Si se mueve uno, se mueve el otro.
  if cuantos >= 7 then
    raise exception 'limite_archivos_mascota' using errcode = 'check_violation';
  end if;

  return new;
end $$;


-- ---------- 4. QUÉ MIRAR DESPUÉS DE CORRERLA ----------
-- Las tres comprobaciones, para pegar en el SQL Editor. Las tres tienen
-- que decir 12582912 / 12582912 / 7.
--
-- select pg_get_constraintdef(oid)
--   from pg_constraint
--  where conname = 'archivos_mascota_peso_bytes_check';
--   -- esperado: CHECK ((peso_bytes > 0) AND (peso_bytes <= 12582912))
--
-- select file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'documentos';
--   -- esperado: 12582912 | {application/pdf}
--
-- select pg_get_functiondef('public.limite_archivos_mascota'::regproc)
--          like '%cuantos >= 7%' as cupo_en_7;
--   -- esperado: true
--
-- OJO con una fila que YA tenga 8, 9 o 10 archivos cuando esta migración
-- corra: no se borra nada ni se rechaza nada de lo que ya está. El trigger
-- es `before insert`, así que esa mascota simplemente no podrá subir más
-- hasta que borre. Es el comportamiento buscado —ningún documento clínico
-- desaparece por bajar un cupo— pero la clínica va a ver "ya tiene 7
-- documentos" mientras la pantalla le muestra 9. Hoy la mascota con más
-- archivos tiene 3, así que el caso no existe todavía.
