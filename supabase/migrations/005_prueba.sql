-- ============================================================
--  005_prueba.sql — Prueba gratis de 14 días, de verdad
--
--  La landing promete 14 días gratis sin tarjeta, pero hasta ahora
--  cualquiera se registraba y usaba todo para siempre: estado_suscripcion
--  nacía en 'activo' y nadie lo cambiaba nunca.
--
--  A partir de aquí:
--    prueba   → entra normal hasta prueba_hasta; después queda bloqueado
--    activo   → pagó (lo pone el admin a mano)
--    inactivo → suspendido
--
--  El bloqueo lo aplica esta_activo(), que ya usan TODAS las políticas de
--  las tablas de datos (002_admin.sql, 003_cobros.sql, 004_planes.sql).
--  No hay que tocar ninguna política: se corrige la función y listo.
--
--  Las cuentas que YA existen no se tocan: siguen en 'activo'. Nadie que
--  hoy esté trabajando se queda por fuera al correr esto.
--
--  Idempotente. Rollback al final.
--  Ejecutar completo en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. COLUMNA Y ESTADO NUEVO ----------

alter table public.perfiles
  add column if not exists prueba_hasta timestamptz;

-- 'prueba' se suma a los estados válidos.
alter table public.perfiles drop constraint if exists perfiles_estado_suscripcion_check;
alter table public.perfiles add  constraint perfiles_estado_suscripcion_check
  check (estado_suscripcion in ('activo', 'inactivo', 'prueba'));

-- Los que se registren de ahora en adelante nacen en prueba.
alter table public.perfiles alter column estado_suscripcion set default 'prueba';

create index if not exists idx_perfiles_prueba on public.perfiles(prueba_hasta);


-- ---------- 2. ALTA DE PERFIL CON FECHA DE VENCIMIENTO ----------
-- Reemplaza la versión de 002_admin.sql. Si algún día se vuelve a correr
-- 002 completo, esta función queda pisada y hay que correr 005 otra vez.

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, fecha_registro, estado_suscripcion, prueba_hasta)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.created_at, now()),
    'prueba',
    coalesce(new.created_at, now()) + interval '14 days'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();


-- ---------- 3. EL BLOQUEO ----------
-- Misma función de siempre, ahora con la prueba vencida.
-- Sin perfil se deja pasar (criterio de 002: no dejar a nadie fuera por
-- una fila faltante). Una prueba sin fecha se trata como vigente, para no
-- bloquear por un dato incompleto.

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
      when p.estado_suscripcion = 'activo'  then true
      when p.estado_suscripcion = 'prueba'  then coalesce(p.prueba_hasta, now() + interval '1 day') > now()
      else false
    end
    from public.perfiles p where p.id = auth.uid()
  ), true);
$$;

-- Cuántos días le quedan de prueba a la cuenta actual.
-- null = no está en prueba (o ya no aplica). Negativo = ya se venció.
create or replace function public.dias_de_prueba()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.estado_suscripcion <> 'prueba' or p.prueba_hasta is null then null
    else ceil(extract(epoch from (p.prueba_hasta - now())) / 86400.0)::int
  end
  from public.perfiles p where p.id = auth.uid();
$$;

revoke all on function public.dias_de_prueba()     from anon, authenticated;
grant execute on function public.dias_de_prueba()  to authenticated;


-- ---------- 4. ADMINISTRACIÓN ----------
-- El listado trae el vencimiento; cambia la firma, así que toca dropear.

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
           p.rol, p.estado_suscripcion, p.plan, p.prueba_hasta,
           p.fecha_registro, p.notas_admin
    from public.perfiles p
    left join public.configuracion c on c.user_id = p.id
    order by p.fecha_registro desc;
end $$;

-- Ahora también acepta 'prueba'. Al volver a prueba sin fecha vigente se
-- dan 14 días desde hoy: si no, el estado quedaría vencido de nacimiento.
create or replace function public.admin_set_estado(p_id uuid, p_estado text)
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
  if p_estado not in ('activo', 'inactivo', 'prueba') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  update public.perfiles
     set estado_suscripcion = p_estado,
         prueba_hasta = case
           when p_estado <> 'prueba' then prueba_hasta
           when prueba_hasta is null or prueba_hasta <= now() then now() + interval '14 days'
           else prueba_hasta
         end,
         updated_at = now()
   where id = p_id and rol = 'veterinaria'
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada (o es una cuenta admin)';
  end if;
  return fila;
end $$;

-- Alargar (o recortar) la prueba sin cambiar de estado.
create or replace function public.admin_extender_prueba(p_id uuid, p_dias integer)
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
  if p_dias is null or abs(p_dias) > 365 then
    raise exception 'Días fuera de rango: %', p_dias;
  end if;

  update public.perfiles
     set estado_suscripcion = 'prueba',
         -- Si ya venció, los días cuentan desde hoy, no desde la fecha vieja.
         prueba_hasta = greatest(coalesce(prueba_hasta, now()), now()) + make_interval(days => p_dias),
         updated_at = now()
   where id = p_id and rol = 'veterinaria'
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada (o es una cuenta admin)';
  end if;
  return fila;
end $$;

revoke all on function public.admin_listar_veterinarias()          from anon, authenticated;
revoke all on function public.admin_extender_prueba(uuid, integer)  from anon, authenticated;
grant execute on function public.admin_listar_veterinarias()       to authenticated;
grant execute on function public.admin_extender_prueba(uuid, integer) to authenticated;


-- ---------- 5. VERIFICACIÓN ----------
--   select email, rol, estado_suscripcion, plan, prueba_hasta from public.perfiles;
--
-- Probar el vencimiento (sin dejar rastro): correr esto y ver el error.
--   do $$
--   declare v_uid uuid; v_ok boolean;
--   begin
--     select id into v_uid from public.perfiles where rol='veterinaria' limit 1;
--     update public.perfiles set estado_suscripcion='prueba',
--            prueba_hasta = now() - interval '1 day' where id=v_uid;
--     perform set_config('request.jwt.claims', json_build_object('sub',v_uid)::text, true);
--     v_ok := public.esta_activo();
--     raise exception 'esta_activo con prueba vencida = % (rollback)', v_ok;
--   end $$;


-- ============================================================
--  ROLLBACK (descomentar para deshacer)
-- ============================================================
-- update public.perfiles set estado_suscripcion = 'activo' where estado_suscripcion = 'prueba';
-- alter table public.perfiles alter column estado_suscripcion set default 'activo';
-- alter table public.perfiles drop constraint if exists perfiles_estado_suscripcion_check;
-- alter table public.perfiles add  constraint perfiles_estado_suscripcion_check
--   check (estado_suscripcion in ('activo', 'inactivo'));
-- alter table public.perfiles drop column if exists prueba_hasta;
-- drop function if exists public.admin_extender_prueba(uuid, integer);
-- drop function if exists public.dias_de_prueba();
-- -- y volver a crear crear_perfil(), esta_activo(), admin_set_estado() y
-- -- admin_listar_veterinarias() como estaban (ver 002_admin.sql y 004_planes.sql)
