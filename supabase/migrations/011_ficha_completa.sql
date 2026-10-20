-- ============================================================
-- VetaApp · 011_ficha_completa.sql
-- Cédula, segundo teléfono y fecha de nacimiento
--
-- ---------- POR QUÉ ----------
-- La primera clínica que llega con base propia (La Huella, peluquería en
-- Girón) la tiene en un formulario de Google con tres datos que VetaApp no
-- sabía dónde guardar:
--
--   · la CÉDULA del tutor. Es el campo con el que ella identifica a un
--     cliente — su propio formulario lo pide primero. `duenos` solo tenía
--     nombre, y en esa base ya hay dos "Teofilo Arboleda" distintas (Rueda y
--     Pinzón). Sin cédula no hay forma de decidir si dos filas son la
--     misma persona, ni al importar ni después en el mostrador.
--
--   · el SEGUNDO TELÉFONO. Buena parte de las filas trae dos números en
--     una sola celda ("3000000043-3000000045"). Guardarlos pegados rompe
--     `normalizarTelefonoCO`, que decide por el largo del número: 20
--     dígitos no son un celular, así que devuelve null, el enlace de
--     WhatsApp no se arma y el botón queda apagado sin que se vea por qué.
--     Guardar solo el primero pierde alcance, y el recordatorio por
--     WhatsApp es el producto, no un adorno.
--
--   · la FECHA DE NACIMIENTO. `mascotas` guarda edad_anios/edad_meses, que
--     es la edad del día en que alguien la escribió. Importar 54 mascotas
--     así deja 54 edades congeladas en octubre de 2026: en un año todas
--     están mal y nadie sabe cuáles, porque nada registra desde cuándo.
--     La edad es dato clínico: la dosis de un cachorro no es la de un
--     adulto. Con la fecha, la edad se calcula y nunca se desactualiza.
--
-- ---------- POR QUÉ LAS TRES NACEN NULLABLE ----------
-- Y se quedan así. La base real las tiene vacías a veces — hay una fila sin
-- ningún teléfono — y las mascotas que ya están registradas en la
-- plataforma no tienen fecha de nacimiento ni la van a tener. Un NOT NULL
-- con default inventado sería peor que la columna faltante: convertiría
-- "no sé" en un dato que se lee como cierto.
--
-- ---------- POR QUÉ `text` Y NO `date` ----------
-- Por consistencia con el resto del esquema: `citas.fecha`,
-- `vacunas.fecha_aplicacion` y `tratamientos.fecha` ya son text ISO. Meter
-- un `date` acá obligaría al frontend a tratar esta fecha distinto de todas
-- las demás, y ahí es donde aparecen los errores de un día de diferencia.
-- El formato se defiende con un check, que es lo que `date` daba gratis.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. LAS COLUMNAS ----------
alter table public.duenos
  add column if not exists cedula    text,
  add column if not exists telefono2 text;

alter table public.mascotas
  add column if not exists fecha_nacimiento text;


-- ---------- 2. EL FORMATO DE LA FECHA ----------
-- Lo que entra tiene que ser YYYY-MM-DD o nada. Sin esto, el importador o
-- un formulario podrían dejar "1/06/2021" guardado, y `new Date()` lo
-- interpreta como 1 de junio o 6 de enero según el navegador: la misma
-- mascota tendría dos edades distintas en dos computadores de la misma
-- clínica.
--
-- Postgres no tiene `add constraint if not exists`, de ahí el bloque: la
-- migración tiene que poder correrse dos veces sin reventar.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mascotas_fecha_nacimiento_iso'
  ) then
    alter table public.mascotas
      add constraint mascotas_fecha_nacimiento_iso
      check (fecha_nacimiento is null or fecha_nacimiento ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
end $$;


-- ---------- 3. UNA CÉDULA, UN TUTOR ----------
-- Único DENTRO de cada cuenta, igual que el código de mascota de 008: dos
-- veterinarias distintas pueden tener al mismo señor como cliente, y
-- ninguna de las dos tiene por qué enterarse de la otra.
--
-- Parcial (`where cedula is not null`) porque la columna es opcional: sin
-- el filtro, la segunda mascota que se registre sin cédula choca contra la
-- primera. En Postgres dos NULL no son iguales para un índice único, pero
-- el filtro lo deja explícito y además achica el índice.
--
-- OJO: el índice compara el texto tal cual. "1.000.000.004" y "1000000004"
-- son dos filas distintas para él. Por eso la cédula se normaliza a solo
-- dígitos antes de insertar — lo hace `axios.js` en POST/PUT /duenos y el
-- importador en `importar/armar-sql.mjs`. No se pone un check de formato
-- acá a propósito: un cliente puede ser una empresa con NIT y guion de
-- verificación, y un check lo dejaría por fuera sin aviso.
create unique index if not exists idx_duenos_user_cedula
  on public.duenos(user_id, cedula)
  where cedula is not null;


-- ---------- 4. BÚSQUEDA POR CÉDULA ----------
-- El índice del paso 3 ya sirve para buscar por (user_id, cedula), que es
-- como la va a buscar la app. No hace falta otro.
--
-- RLS no se toca: las políticas de 001_init.sql son por tabla
-- (`auth.uid() = user_id`), no por columna, así que las tres columnas
-- nuevas quedan protegidas por lo que ya existía.


-- ============================================================
--  PRUEBAS
--
--  Cada bloque termina en `raise exception`, así que la transacción se
--  aborta y todo lo que insertó se deshace solo: el resultado viaja en el
--  mensaje de error. Es la forma de probar contra la base de producción
--  sin dejar basura.
--
--  Se corren de a uno, descomentados, en el SQL Editor.
-- ============================================================

-- ---------- PRUEBA A · la misma cédula no entra dos veces en una cuenta ----------
-- do $$
-- declare v_u uuid; choco boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono, cedula)
--     values (v_u, 'Prueba Uno', '3000000001', '999999999');
--   begin
--     insert into public.duenos(user_id, nombre, telefono, cedula)
--       values (v_u, 'Prueba Dos', '3000000002', '999999999');
--   exception when unique_violation then
--     choco := true;
--   end;
--   raise exception 'A: choco=% (esperado: true)', choco;
-- end $$;

-- ---------- PRUEBA B · dos cuentas sí pueden tener la misma cédula ----------
-- do $$
-- declare v_a uuid; v_b uuid; cuantos int;
-- begin
--   select id into v_a from auth.users order by created_at limit 1;
--   select id into v_b from auth.users order by created_at offset 1 limit 1;
--   if v_b is null then raise exception 'se necesitan 2 usuarios para esta prueba'; end if;
--
--   insert into public.duenos(user_id, nombre, telefono, cedula)
--     values (v_a, 'Prueba A', '3000000001', '888888888');
--   insert into public.duenos(user_id, nombre, telefono, cedula)
--     values (v_b, 'Prueba B', '3000000002', '888888888');
--
--   select count(*) into cuantos from public.duenos where cedula = '888888888';
--   raise exception 'B: filas=% (esperado: 2)', cuantos;
-- end $$;

-- ---------- PRUEBA C · varios tutores sin cédula no chocan entre sí ----------
-- do $$
-- declare v_u uuid; cuantos int;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Sin ced 1', '3000000001');
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Sin ced 2', '3000000002');
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Sin ced 3', '3000000003');
--   select count(*) into cuantos from public.duenos where nombre like 'Sin ced %';
--   raise exception 'C: filas=% (esperado: 3, ningún choque)', cuantos;
-- end $$;

-- ---------- PRUEBA D · la fecha de nacimiento solo acepta ISO ----------
-- do $$
-- declare v_u uuid; v_d bigint; rechazo_dmy boolean := false; rechazo_basura boolean := false;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   insert into public.duenos(user_id, nombre, telefono) values (v_u, 'Prueba', '3000000001')
--     returning id into v_d;
--
--   -- ISO: pasa.
--   insert into public.mascotas(user_id, nombre, especie, dueno_id, fecha_nacimiento)
--     values (v_u, 'ok', 'perro', v_d, '2021-06-01');
--   -- Nada: pasa.
--   insert into public.mascotas(user_id, nombre, especie, dueno_id)
--     values (v_u, 'sin fecha', 'perro', v_d);
--
--   begin
--     insert into public.mascotas(user_id, nombre, especie, dueno_id, fecha_nacimiento)
--       values (v_u, 'dmy', 'perro', v_d, '1/06/2021');
--   exception when check_violation then rechazo_dmy := true;
--   end;
--
--   begin
--     insert into public.mascotas(user_id, nombre, especie, dueno_id, fecha_nacimiento)
--       values (v_u, 'basura', 'perro', v_d, 'no sé');
--   exception when check_violation then rechazo_basura := true;
--   end;
--
--   raise exception 'D: rechazo_dmy=% rechazo_basura=% (ambos deben ser true)',
--     rechazo_dmy, rechazo_basura;
-- end $$;

-- ---------- PRUEBA E · las columnas quedaron donde van ----------
-- do $$
-- declare faltan text;
-- begin
--   select string_agg(x.col, ', ') into faltan
--   from (values ('duenos','cedula'), ('duenos','telefono2'), ('mascotas','fecha_nacimiento'))
--        as x(tabla, col)
--   where not exists (
--     select 1 from information_schema.columns
--      where table_schema = 'public' and table_name = x.tabla and column_name = x.col
--   );
--   raise exception 'E: faltan=[%] (debe quedar vacío)', coalesce(faltan, '');
-- end $$;
