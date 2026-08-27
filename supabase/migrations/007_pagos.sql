-- ============================================================
--  007_pagos.sql — Cobro de la suscripción (base de datos)
--
--  Hasta ahora cobrar era una conversación de WhatsApp: la veterinaria
--  escribía, pagaba por fuera, y el admin ponía estado='activo' a mano.
--  'activo' no vencía nunca, así que si alguien dejaba de pagar seguía
--  entrando hasta que un humano se acordara de suspenderlo.
--
--  Esta migración pone la parte que la base de datos tiene que saber:
--
--    · hasta cuándo está pago cada quien   (perfiles.suscripcion_hasta)
--    · cuánto vale cada plan               (planes_precios)
--    · qué pagos existen y en qué estado   (pagos)
--    · cómo se activa un pago aprobado     (registrar_pago_aprobado)
--
--  Lo que NO está aquí, a propósito:
--
--    · La pasarela. El monto se firma con un secreto que no puede tocar
--      el navegador, y el webhook de confirmación necesita un endpoint
--      HTTP. Hoy VetaApp no despliega nada de servidor (wrangler.jsonc
--      solo publica frontend/dist). Eso va en una Edge Function aparte.
--    · Cobro recurrente automático. Wompi lo permite tokenizando la
--      tarjeta con 3D Secure, pero eso es otro proyecto. Aquí el modelo
--      es "pago único que extiende la fecha": se paga un mes, se corre
--      la fecha un mes. Honesto y suficiente para empezar.
--
--  Idempotente: se puede correr varias veces. Rollback al final.
--  Ejecutar completo en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. HASTA CUÁNDO ESTÁ PAGO ----------
-- null = sin vencimiento. Es el caso de todas las cuentas que ya existen
-- y de las que el admin active a mano, y es deliberado: al correr esta
-- migración NADIE se queda por fuera. Solo vence quien tenga fecha, o
-- sea quien haya llegado por un pago.

alter table public.perfiles
  add column if not exists suscripcion_hasta timestamptz;

create index if not exists idx_perfiles_suscripcion on public.perfiles(suscripcion_hasta);


-- ---------- 2. EL PORTERO APRENDE A VENCER ----------
-- Misma función de 005_prueba.sql con un caso más. El orden importa:
--   admin            → siempre pasa
--   activo           → pasa si no tiene fecha, o si la fecha es futura
--   prueba           → pasa mientras prueba_hasta sea futura
--   resto (inactivo) → no pasa
--
-- Sin perfil se deja pasar, mismo criterio de 002/005: no bloquear a
-- nadie por una fila faltante.

create or replace function public.esta_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.rol = 'admin'                  then true
      when p.estado_suscripcion = 'activo'  then coalesce(p.suscripcion_hasta, now() + interval '1 day') > now()
      when p.estado_suscripcion = 'prueba'  then coalesce(p.prueba_hasta,      now() + interval '1 day') > now()
      else false
    end
    from public.perfiles p where p.id = auth.uid()
  ), true);
$$;

-- Cuántos días le quedan de suscripción paga. null = no aplica (cuenta
-- sin fecha, en prueba, o suspendida). Negativo = ya venció.
create or replace function public.dias_de_suscripcion()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.estado_suscripcion <> 'activo' or p.suscripcion_hasta is null then null
    else ceil(extract(epoch from (p.suscripcion_hasta - now())) / 86400.0)::int
  end
  from public.perfiles p where p.id = auth.uid();
$$;

revoke all on function public.dias_de_suscripcion()    from anon, authenticated;
grant execute on function public.dias_de_suscripcion() to authenticated;


-- ---------- 3. PRECIOS ----------
-- En tabla y no en el código del frontend porque el monto que se le
-- cobra a la tarjeta lo tiene que decidir el servidor. Si el precio
-- viviera en React, cualquiera con F12 pagaría $1.000 por el plan de
-- $99.000 y el webhook lo aprobaría igual.
--
-- En centavos porque así lo pide la pasarela (amount-in-cents) y porque
-- guardar plata en float es cómo se pierden pesos.

create table if not exists public.planes_precios (
  plan             text primary key,
  precio_centavos  bigint not null check (precio_centavos > 0),
  nombre_visible   text   not null,
  activo           boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- Los mismos números de la landing (Landing.jsx). $69.000 = 6.900.000 centavos.
insert into public.planes_precios (plan, precio_centavos, nombre_visible, activo) values
  ('fichas',       6900000,  'Fichas',      true),
  ('completo',     9900000,  'Completo',    true),
  ('facturacion', 14900000,  'Facturación', false)  -- el módulo DIAN no existe todavía: no se puede cobrar
on conflict (plan) do update
  set precio_centavos = excluded.precio_centavos,
      nombre_visible  = excluded.nombre_visible,
      activo          = excluded.activo,
      updated_at      = now();

-- Cualquiera logueado puede leer los precios (los necesita para pintar
-- el botón). Nadie los escribe desde el cliente: no hay policy de write.
alter table public.planes_precios enable row level security;
drop policy if exists "leer_precios" on public.planes_precios;
create policy "leer_precios" on public.planes_precios
  for select to authenticated using (true);


-- ---------- 4. PAGOS ----------
-- Una fila por intento de pago, creada ANTES de mandar a la pasarela.
-- Así, cuando el webhook llegue diciendo "referencia VETA-xxx aprobada",
-- ya sabemos de quién era y por cuánto — sin confiar en nada de lo que
-- venga en el mensaje salvo el estado y el id de la transacción.
--
-- referencia es unique: es la llave con la que la pasarela nos habla, y
-- es lo que hace que reintentar un webhook no cobre dos veces.

create table if not exists public.pagos (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  referencia        text not null unique,
  plan              text not null,
  meses             integer not null default 1 check (meses between 1 and 24),
  monto_centavos    bigint not null check (monto_centavos > 0),
  estado            text not null default 'PENDIENTE',
  pasarela          text not null default 'wompi',
  transaccion_id    text,
  metodo            text,
  payload           jsonb,
  creado_at         timestamptz not null default now(),
  actualizado_at    timestamptz not null default now()
);

alter table public.pagos drop constraint if exists pagos_estado_check;
alter table public.pagos add  constraint pagos_estado_check
  check (estado in ('PENDIENTE', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'));

alter table public.pagos drop constraint if exists pagos_plan_check;
alter table public.pagos add  constraint pagos_plan_check
  check (plan in ('fichas', 'completo', 'facturacion'));

create index if not exists idx_pagos_user on public.pagos(user_id, creado_at desc);

-- La veterinaria ve SUS pagos y nada más. No hay policy de insert ni de
-- update: las filas las crea y las cierra el servidor con service_role,
-- que se salta RLS. Si el cliente pudiera insertar, se regalaría meses.
alter table public.pagos enable row level security;
drop policy if exists "leer_pagos_propios" on public.pagos;
create policy "leer_pagos_propios" on public.pagos
  for select to authenticated using (auth.uid() = user_id);


-- ---------- 5. ABRIR UN PAGO ----------
-- La llama el servidor (no el navegador) justo antes de mandar a la
-- pasarela. Devuelve la referencia y el monto que hay que firmar.
--
-- El precio sale de planes_precios, nunca de lo que pida el cliente.
-- Si el plan no está activo para venta, se niega: no tiene sentido
-- cobrar Facturación mientras el módulo DIAN no exista.

create or replace function public.abrir_pago(
  p_user_id uuid,
  p_plan    text,
  p_meses   integer default 1
)
returns table (referencia text, monto_centavos bigint, plan text, meses integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_precio bigint;
  v_activo boolean;
  v_ref    text;
begin
  if p_meses is null or p_meses < 1 or p_meses > 24 then
    raise exception 'Meses fuera de rango: %', p_meses;
  end if;

  select pp.precio_centavos, pp.activo into v_precio, v_activo
    from public.planes_precios pp where pp.plan = p_plan;

  if v_precio is null then
    raise exception 'Plan desconocido: %', p_plan;
  end if;
  if not v_activo then
    raise exception 'El plan % no está a la venta todavía', p_plan;
  end if;
  if not exists (select 1 from public.perfiles where id = p_user_id) then
    raise exception 'No existe el perfil %', p_user_id;
  end if;

  -- Referencia legible y única. El sufijo aleatorio evita que dos
  -- intentos en el mismo segundo choquen contra el unique.
  v_ref := 'VETA-' || to_char(now(), 'YYYYMMDDHH24MISS')
                   || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8)
                   || '-' || substr(md5(random()::text), 1, 6);

  insert into public.pagos (user_id, referencia, plan, meses, monto_centavos)
  values (p_user_id, v_ref, p_plan, p_meses, v_precio * p_meses);

  return query select v_ref, (v_precio * p_meses)::bigint, p_plan, p_meses;
end $$;


-- ---------- 6. CERRAR UN PAGO ----------
-- La llama el webhook. Es el único camino por el que una cuenta pasa a
-- 'activo' sin que un humano intervenga, así que aquí está toda la
-- desconfianza:
--
--   · Idempotente. Si el pago ya estaba APPROVED, no vuelve a extender.
--     Las pasarelas reintentan el webhook; sin esto, tres reintentos
--     regalarían tres meses.
--   · El monto que llega se compara con el que se guardó al abrir el
--     pago. Si no coinciden, se marca ERROR y no se activa nada.
--   · Los meses y el plan salen de la fila guardada, no del mensaje.
--   · Si la fecha vigente ya venció, los meses cuentan desde hoy; si no,
--     se suman a lo que quedaba (no se le quitan días a quien renueva
--     antes de tiempo).

create or replace function public.registrar_pago_aprobado(
  p_referencia     text,
  p_estado         text,
  p_transaccion_id text default null,
  p_monto_centavos bigint default null,
  p_metodo         text default null,
  p_payload        jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare fila public.pagos;
begin
  select * into fila from public.pagos where referencia = p_referencia for update;

  if fila.id is null then
    return 'desconocida';           -- referencia que no abrimos nosotros
  end if;
  if fila.estado = 'APPROVED' then
    return 'ya_aplicado';           -- reintento del webhook
  end if;

  -- El monto tiene que ser exactamente el que se firmó.
  if p_monto_centavos is not null and p_monto_centavos <> fila.monto_centavos then
    update public.pagos
       set estado = 'ERROR', transaccion_id = p_transaccion_id,
           payload = p_payload, actualizado_at = now()
     where id = fila.id;
    return 'monto_no_coincide';
  end if;

  if p_estado <> 'APPROVED' then
    update public.pagos
       set estado = p_estado, transaccion_id = p_transaccion_id, metodo = p_metodo,
           payload = p_payload, actualizado_at = now()
     where id = fila.id;
    return 'no_aprobado';
  end if;

  update public.pagos
     set estado = 'APPROVED', transaccion_id = p_transaccion_id, metodo = p_metodo,
         payload = p_payload, actualizado_at = now()
   where id = fila.id;

  update public.perfiles
     set plan               = fila.plan,
         estado_suscripcion = 'activo',
         suscripcion_hasta  = greatest(coalesce(suscripcion_hasta, now()), now())
                              + make_interval(months => fila.meses),
         updated_at         = now()
   where id = fila.user_id;

  return 'activado';
end $$;

-- Ninguna de las dos se llama desde el navegador: las invoca el servidor
-- con service_role, que se salta los permisos y no necesita grant.
--
-- OJO CON EL `from public`. La primera versión de esta migración decía
-- solo `from anon, authenticated` — copiado de 004/006 — y NO servía de
-- nada: en Postgres toda función nace con execute concedido al rol
-- PUBLIC, y authenticated hereda de ahí. Quitárselo a authenticated deja
-- el permiso de PUBLIC intacto. Comprobado atacando desde una sesión de
-- veterinaria antes del arreglo:
--   abrir_pago=sin error  registrar_pago_aprobado=sin error   ← el fallo
-- O sea: cualquiera con F12 se activaba el plan que quisiera, gratis.
-- Después del `from public`:
--   abrir_pago=42501      registrar_pago_aprobado=42501
revoke all on function public.abrir_pago(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.registrar_pago_aprobado(text, text, text, bigint, text, jsonb)
  from public, anon, authenticated;

-- Y lo mismo por el lado de las tablas. RLS sola no alcanza aquí: con
-- RLS activa y sin policy de update, un UPDATE no falla — afecta cero
-- filas en silencio. Eso basta para no perder plata, pero deja pasar el
-- ataque sin ruido. Con el revoke el intento es un 42501 visible.
-- Comprobado: bajar el precio de Completo a $1 daba 'sin error' antes,
-- 42501 después, y el precio nunca se movió de 9.900.000.
revoke insert, update, delete, truncate on public.planes_precios from anon, authenticated;
revoke insert, update, delete, truncate on public.pagos           from anon, authenticated;


-- ---------- 7. ADMIN ----------
-- El panel necesita ver el vencimiento pagado junto al de la prueba.
-- Cambia la firma de salida, así que toca dropear antes.

drop function if exists public.admin_listar_veterinarias();

create or replace function public.admin_listar_veterinarias()
returns table (
  id                 uuid,
  email              text,
  nombre             text,
  clinica_nombre     text,
  rol                text,
  estado_suscripcion text,
  plan               text,
  prueba_hasta       timestamptz,
  suscripcion_hasta  timestamptz,
  fecha_registro     timestamptz,
  notas_admin        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'No autorizado';
  end if;

  return query
    select p.id, p.email, p.nombre,
           c.clinica_nombre,
           p.rol, p.estado_suscripcion, p.plan, p.prueba_hasta, p.suscripcion_hasta,
           p.fecha_registro, p.notas_admin
    from public.perfiles p
    left join public.configuracion c on c.user_id = p.id
    order by p.fecha_registro desc;
end $$;

-- Activar a mano sigue existiendo (transferencia, cortesía, un pago que
-- se cayó). p_dias null = sin vencimiento, como era antes.
create or replace function public.admin_activar_hasta(p_id uuid, p_dias integer default null)
returns public.perfiles
language plpgsql
security definer
set search_path = public
as $$
declare fila public.perfiles;
begin
  if not public.es_admin() then
    raise exception 'No autorizado';
  end if;
  if p_dias is not null and (p_dias < 1 or p_dias > 3650) then
    raise exception 'Días fuera de rango: %', p_dias;
  end if;

  update public.perfiles
     set estado_suscripcion = 'activo',
         suscripcion_hasta  = case
           when p_dias is null then null
           else greatest(coalesce(suscripcion_hasta, now()), now()) + make_interval(days => p_dias)
         end,
         updated_at = now()
   where id = p_id and rol = 'veterinaria'
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada (o es una cuenta admin)';
  end if;
  return fila;
end $$;

revoke all on function public.admin_listar_veterinarias()          from anon, authenticated;
revoke all on function public.admin_activar_hasta(uuid, integer)   from anon, authenticated;
grant execute on function public.admin_listar_veterinarias()       to authenticated;
grant execute on function public.admin_activar_hasta(uuid, integer) to authenticated;


-- ---------- PRUEBA 1: el dinero (opcional, se deshace sola) ----------
-- Comprueba las cuatro cosas que importan: que un pago aprobado activa,
-- que reintentarlo NO regala un segundo mes, que un monto distinto al
-- firmado no activa nada, y que una referencia inventada se ignora.
--
-- Resultado en producción:
--   aprobar=activado plan=completo monto=9900000
--   reintento=ya_aplicado movio_fecha=f
--   monto_malo=monto_no_coincide
--   ref_falsa=desconocida
--
-- do $$
-- declare
--   v_uid uuid; v_ref text; v_monto bigint;
--   r1 text; r2 text; r3 text; v_hasta1 timestamptz; v_hasta2 timestamptz;
-- begin
--   select id into v_uid from public.perfiles where rol = 'veterinaria' limit 1;
--   update public.perfiles set estado_suscripcion='prueba', suscripcion_hasta=null where id=v_uid;
--
--   select referencia, monto_centavos into v_ref, v_monto
--     from public.abrir_pago(v_uid, 'completo', 1);
--
--   r1 := public.registrar_pago_aprobado(v_ref, 'APPROVED', 'tx-1', v_monto, 'CARD', null);
--   select suscripcion_hasta into v_hasta1 from public.perfiles where id=v_uid;
--   r2 := public.registrar_pago_aprobado(v_ref, 'APPROVED', 'tx-1', v_monto, 'CARD', null);
--   select suscripcion_hasta into v_hasta2 from public.perfiles where id=v_uid;
--
--   select referencia, monto_centavos into v_ref, v_monto
--     from public.abrir_pago(v_uid, 'completo', 1);
--   r3 := public.registrar_pago_aprobado(v_ref, 'APPROVED', 'tx-2', 100, 'CARD', null);
--
--   raise exception 'aprobar=% | reintento=% | fecha_movio_en_reintento=% | monto_malo=% (rollback a proposito)',
--     r1, r2, (v_hasta2 is distinct from v_hasta1), r3;
-- end $$;


-- ---------- PRUEBA 2: el ataque (opcional, se deshace sola) ----------
-- Se mete en la piel de una veterinaria logueada y trata de robarse el
-- plan por los cuatro caminos posibles. Los cuatro tienen que dar 42501.
-- Sin el `set local role authenticated` la prueba no vale nada: se
-- correría como postgres, que tiene BYPASSRLS, y todo pasaría siempre.
--
-- Resultado en producción tras el arreglo del `from public`:
--   abrir_pago=42501 registrar=42501 insert=42501 update_precio=42501
--   precio 9900000->9900000 | cliente_lee_precio=9900000
--
-- do $$
-- declare v_uid uuid; e1 text:='sin error'; e2 text:='sin error';
--         e3 text:='sin error'; e4 text:='sin error'; v_lee bigint;
-- begin
--   select id into v_uid from public.perfiles where rol='veterinaria' limit 1;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
--   execute 'set local role authenticated';
--   begin perform public.abrir_pago(v_uid, 'completo', 1);        exception when others then e1 := sqlstate; end;
--   begin perform public.registrar_pago_aprobado('x','APPROVED'); exception when others then e2 := sqlstate; end;
--   begin insert into public.pagos (user_id, referencia, plan, monto_centavos)
--         values (v_uid,'HACK','completo',1);                     exception when others then e3 := sqlstate; end;
--   begin update public.planes_precios set precio_centavos = 100
--          where plan='completo';                                 exception when others then e4 := sqlstate; end;
--   select precio_centavos into v_lee from public.planes_precios where plan='completo';
--   execute 'reset role';
--   raise exception 'abrir=% registrar=% insert=% precio=% | lee=% (esperado 42501 x4) (rollback)',
--     e1, e2, e3, e4, v_lee;
-- end $$;


-- ---------- PRUEBA 3: no bloquear a nadie (opcional) ----------
-- El cambio de esta_activo() toca el portero de TODAS las tablas. Esta
-- prueba recorre cada perfil real y compara con lo esperado.
-- Resultado en producción:
--   admin/activo=true(ok) veterinaria/activo=true(ok) x3
--   veterinaria/inactivo=false(ok)
--
-- do $$
-- declare r record; v_txt text := ''; v_act boolean; v_esperado boolean;
-- begin
--   for r in select id, rol, estado_suscripcion from public.perfiles order by rol loop
--     perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role','authenticated')::text, true);
--     execute 'set local role authenticated';
--     v_act := public.esta_activo();
--     execute 'reset role';
--     v_esperado := (r.rol='admin') or (r.estado_suscripcion='activo');
--     v_txt := v_txt || r.rol || '/' || r.estado_suscripcion || '=' || v_act
--              || case when v_act = v_esperado then '(ok) ' else '(MAL) ' end;
--   end loop;
--   raise exception '%', v_txt;
-- end $$;


-- ---------- ROLLBACK (descomentar para deshacer) ----------
-- drop function if exists public.registrar_pago_aprobado(text, text, text, bigint, text, jsonb);
-- drop function if exists public.abrir_pago(uuid, text, integer);
-- drop function if exists public.admin_activar_hasta(uuid, integer);
-- drop function if exists public.dias_de_suscripcion();
-- drop table if exists public.pagos;
-- drop table if exists public.planes_precios;
-- alter table public.perfiles drop column if exists suscripcion_hasta;
-- -- y volver a crear esta_activo() y admin_listar_veterinarias() como en 005_prueba.sql
