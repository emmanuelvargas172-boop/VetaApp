-- ============================================================
-- VetaApp · 008_codigo_mascota.sql
-- Numeración de mascotas por veterinaria (arregla la fuga de MASC-0025)
--
-- ---------- QUÉ SE ESTABA FILTRANDO ----------
-- La ficha mostraba "MASC-0025" a partir de mascotas.id, que es una
-- secuencia GLOBAL: una sola cuenta para toda la plataforma. O sea que la
-- primera mascota que registraba una veterinaria nueva no salía MASC-0001,
-- salía con el número que siguiera en toda VetaApp.
--
-- Eso cuenta cosas que no son de nadie más:
--   · una clínica nueva ve MASC-0025 y sabe que en TODA la plataforma hay
--     25 mascotas — o sea, cuántos clientes tenemos;
--   · dos clínicas que comparen códigos deducen cuántos pacientes registró
--     la otra entre una fecha y otra;
--   · los huecos entre códigos consecutivos son la actividad de los demás.
--
-- No es robo de datos (RLS nunca dejó ver una fila ajena), es una fuga de
-- negocio entre inquilinos: el identificador mismo era el mensaje.
--
-- ---------- LA CORRECCIÓN ----------
-- Se agrega `codigo`, que cuenta desde 1 dentro de cada veterinaria. El id
-- global se queda donde siempre estuvo — llaves foráneas, rutas, joins —
-- pero deja de ser lo que se le muestra a nadie.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. LA COLUMNA ----------
-- Nace nullable a propósito: hay filas viejas que todavía no tienen número
-- y el NOT NULL solo se puede poner después del relleno (paso 2).
alter table public.mascotas
  add column if not exists codigo integer;


-- ---------- 2. RELLENO DE LO QUE YA EXISTE ----------
-- Se numera por orden de creación dentro de cada cuenta, así el código
-- coincide con la intuición: la primera mascota que registró la clínica es
-- la MASC-0001. Se desempata por id porque created_at puede repetirse.
--
-- El `where codigo is null` hace esto repetible: correr la migración dos
-- veces no renumera a nadie. Renumerar sería grave — el código puede estar
-- escrito a mano en un carné de vacunación de papel.
with numeradas as (
  select id,
         row_number() over (partition by user_id order by created_at, id) as n
  from public.mascotas
  where codigo is null
)
update public.mascotas m
   set codigo = numeradas.n
  from numeradas
 where numeradas.id = m.id
   and m.codigo is null;


-- ---------- 3. QUIÉN PONE EL NÚMERO ----------
-- Lo pone la base, nunca el cliente. Si lo calculara el navegador, dos
-- pestañas abiertas darían el mismo número, y con F12 se podría escribir
-- cualquier cosa en la columna.
--
-- El advisory lock es la parte importante. Sin él, dos registros
-- simultáneos de la MISMA veterinaria leen el mismo max() y el segundo
-- revienta contra el índice único del paso 4 — la veterinaria vería
-- "no se pudo guardar" sin ninguna razón visible. El lock es por cuenta
-- (hash del user_id), así que dos clínicas distintas nunca se esperan
-- entre sí, y se suelta solo al terminar la transacción.
--
-- `security definer` para que el max() vea todas las filas de esa cuenta
-- sin depender de RLS. No filtra nada: solo se consulta el máximo de
-- new.user_id, que es la propia cuenta que está insertando.
create or replace function public.asignar_codigo_mascota()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  -- Se ASIGNA, no se respeta lo que venga: si el cliente manda un `codigo`
  -- en el insert, se pisa. La numeración no es negociable desde afuera.
  select coalesce(max(codigo), 0) + 1
    into new.codigo
    from public.mascotas
   where user_id = new.user_id;

  return new;
end;
$fn$;

-- El código no cambia nunca después de asignado. Puede estar escrito en un
-- carné de papel o dictado por teléfono; que se mueva sería peor que no
-- tenerlo. Un UPDATE que intente tocarlo se ignora en silencio en vez de
-- fallar, porque el cliente manda la fila entera al editar una mascota y
-- no tiene por qué saber de esto.
create or replace function public.congelar_codigo_mascota()
returns trigger
language plpgsql
as $fn$
begin
  new.codigo := old.codigo;
  return new;
end;
$fn$;

drop trigger if exists mascotas_codigo on public.mascotas;
create trigger mascotas_codigo
  before insert on public.mascotas
  for each row execute function public.asignar_codigo_mascota();

drop trigger if exists mascotas_codigo_inmutable on public.mascotas;
create trigger mascotas_codigo_inmutable
  before update on public.mascotas
  for each row execute function public.congelar_codigo_mascota();


-- ---------- 4. GARANTÍAS ----------
-- Único DENTRO de cada cuenta, no en toda la tabla: dos veterinarias
-- distintas deben poder tener cada una su MASC-0001. Ese es justamente el
-- punto de la migración.
create unique index if not exists idx_mascotas_user_codigo
  on public.mascotas(user_id, codigo);

-- Ya se puede exigir: el relleno cubrió lo viejo y el trigger cubre lo nuevo.
alter table public.mascotas
  alter column codigo set not null;

-- Lección de 007: en Postgres toda función nace con EXECUTE para PUBLIC, y
-- `authenticated` hereda de ahí. Estas dos solo tienen sentido como
-- disparadores (llamarlas a mano da error), pero se cierran igual por
-- higiene. Va DESPUÉS de crear los triggers a propósito: el permiso sobre
-- la función del trigger se verifica al crearlo, no cada vez que dispara.
revoke all on function public.asignar_codigo_mascota()  from public, anon, authenticated;
revoke all on function public.congelar_codigo_mascota() from public, anon, authenticated;


-- ============================================================
--  PRUEBAS
--
--  Cada bloque termina en `raise exception`, así que la transacción se
--  aborta y todo lo que insertó se deshace sola: el resultado viaja en el
--  mensaje de error. Es la forma de probar contra la base de producción
--  sin dejar basura.
--
--  Se corren de a uno, descomentados, en el SQL Editor.
-- ============================================================

-- ---------- PRUEBA A · cada cuenta empieza en 1 y sigue de a 1 ----------
-- do $$
-- declare
--   v_a uuid; v_b uuid; v_d_a bigint; v_d_b bigint;
--   c1 int; c2 int; c3 int;
-- begin
--   select id into v_a from auth.users order by created_at limit 1;
--   select id into v_b from auth.users order by created_at offset 1 limit 1;
--   if v_b is null then raise exception 'se necesitan 2 usuarios para esta prueba'; end if;
--
--   insert into public.duenos(user_id, nombre, telefono) values (v_a, 'Prueba A', '300') returning id into v_d_a;
--   insert into public.duenos(user_id, nombre, telefono) values (v_b, 'Prueba B', '301') returning id into v_d_b;
--
--   insert into public.mascotas(user_id, nombre, especie, dueno_id) values (v_a, 'z1', 'perro', v_d_a) returning codigo into c1;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id) values (v_a, 'z2', 'perro', v_d_a) returning codigo into c2;
--   -- La de la OTRA cuenta no debe verse afectada por las dos anteriores.
--   insert into public.mascotas(user_id, nombre, especie, dueno_id) values (v_b, 'z3', 'gato', v_d_b) returning codigo into c3;
--
--   raise exception 'A: consecutivo_a=% siguiente_a=% otra_cuenta=% (esperado: n, n+1, m independiente)', c1, c2, c3;
-- end $$;

-- ---------- PRUEBA B · el código no se puede mover ----------
-- do $$
-- declare v_u uuid; v_d bigint; v_m bigint; antes int; despues int;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '300') returning id into v_d;
--   insert into public.mascotas(user_id, nombre, especie, dueno_id) values (v_u, 'z', 'perro', v_d)
--     returning id, codigo into v_m, antes;
--
--   -- Intento de renumerar a mano: debe quedar igual.
--   update public.mascotas set codigo = 9999 where id = v_m;
--   select codigo into despues from public.mascotas where id = v_m;
--
--   raise exception 'B: antes=% despues=% (deben ser iguales)', antes, despues;
-- end $$;

-- ---------- PRUEBA C · no quedó nadie sin número ni repetido ----------
-- do $$
-- declare sin_codigo int; repetidos int;
-- begin
--   select count(*) into sin_codigo from public.mascotas where codigo is null;
--   select count(*) into repetidos from (
--     select user_id, codigo from public.mascotas group by 1,2 having count(*) > 1
--   ) x;
--   raise exception 'C: sin_codigo=% repetidos=% (ambos deben ser 0)', sin_codigo, repetidos;
-- end $$;

-- ---------- PRUEBA D · el cliente no puede imponer su código ----------
-- do $$
-- declare v_u uuid; v_d bigint; c int;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '300') returning id into v_d;
--   -- Se manda codigo=1 explícito, como lo haría alguien desde la consola.
--   insert into public.mascotas(user_id, nombre, especie, dueno_id, codigo)
--     values (v_u, 'z', 'perro', v_d, 1) returning codigo into c;
--   raise exception 'D: codigo_asignado=% (NO debe ser 1 si la cuenta ya tenía mascotas)', c;
-- end $$;
