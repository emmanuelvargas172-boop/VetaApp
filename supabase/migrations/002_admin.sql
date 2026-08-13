-- ============================================================
--  002_admin.sql — Panel de super-administrador
--  Rol por usuario, estado de suscripción y control de acceso.
--  Ejecutar completo en el SQL Editor de Supabase (rol postgres).
--  Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================

-- ---------- 1. TABLA DE PERFILES ----------
-- Una fila por usuario de auth.users. Es la fuente de verdad del rol
-- y del estado de suscripción.

create table if not exists public.perfiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  nombre             text,
  rol                text not null default 'veterinaria'
                     check (rol in ('admin', 'veterinaria')),
  estado_suscripcion text not null default 'activo'
                     check (estado_suscripcion in ('activo', 'inactivo')),
  fecha_registro     timestamptz not null default now(),
  notas_admin        text,
  updated_at         timestamptz not null default now()
);

create index if not exists idx_perfiles_rol    on public.perfiles(rol);
create index if not exists idx_perfiles_estado on public.perfiles(estado_suscripcion);


-- ---------- 2. ALTA AUTOMÁTICA DE PERFIL ----------
-- Cada registro nuevo (email o Google) crea su perfil como
-- veterinaria / activo.

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, fecha_registro)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Backfill: perfiles para los usuarios que ya existen.
insert into public.perfiles (id, email, nombre, fecha_registro)
select u.id,
       u.email,
       coalesce(
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name',
         split_part(coalesce(u.email, ''), '@', 1)
       ),
       u.created_at
from auth.users u
on conflict (id) do nothing;


-- ---------- 3. HELPERS DE AUTORIZACIÓN ----------
-- security definer: leen perfiles saltándose RLS. Sin esto, una política
-- sobre perfiles que consulte perfiles entra en recursión infinita.

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- Un usuario "está activo" si es admin, o si su suscripción está activa.
-- Si por lo que sea no tiene perfil, se le deja pasar (no dejar a nadie
-- fuera por un perfil faltante).
create or replace function public.esta_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.rol = 'admin' or p.estado_suscripcion = 'activo'
       from public.perfiles p where p.id = auth.uid()),
    true
  );
$$;


-- ---------- 4. RLS DE PERFILES ----------
-- Cada quien ve su perfil; el admin los ve todos.
-- Nadie cambia su propio rol ni su propio estado: eso se restringe con
-- permisos por columna (RLS no filtra columnas) y solo se toca vía RPC.

alter table public.perfiles enable row level security;

drop policy if exists "perfil_select" on public.perfiles;
create policy "perfil_select" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists "perfil_update_propio" on public.perfiles;
create policy "perfil_update_propio" on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on public.perfiles from anon, authenticated;
grant select          on public.perfiles to authenticated;
grant update (nombre) on public.perfiles to authenticated;


-- ---------- 5. RPCs DE ADMINISTRACIÓN ----------
-- Toda escritura sobre rol/estado/notas pasa por aquí y valida es_admin().

create or replace function public.admin_listar_veterinarias()
returns table (
  id                 uuid,
  email              text,
  nombre             text,
  clinica_nombre     text,
  rol                text,
  estado_suscripcion text,
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
           p.rol, p.estado_suscripcion, p.fecha_registro, p.notas_admin
    from public.perfiles p
    left join public.configuracion c on c.user_id = p.id
    order by p.fecha_registro desc;
end $$;

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
  if p_estado not in ('activo', 'inactivo') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  update public.perfiles
     set estado_suscripcion = p_estado, updated_at = now()
   where id = p_id and rol = 'veterinaria'
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada (o es una cuenta admin)';
  end if;
  return fila;
end $$;

create or replace function public.admin_set_notas(p_id uuid, p_notas text)
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

  update public.perfiles
     set notas_admin = nullif(btrim(coalesce(p_notas, '')), ''), updated_at = now()
   where id = p_id
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada';
  end if;
  return fila;
end $$;

revoke all on function public.admin_listar_veterinarias()          from anon, authenticated;
revoke all on function public.admin_set_estado(uuid, text)         from anon, authenticated;
revoke all on function public.admin_set_notas(uuid, text)          from anon, authenticated;
grant execute on function public.admin_listar_veterinarias()       to authenticated;
grant execute on function public.admin_set_estado(uuid, text)      to authenticated;
grant execute on function public.admin_set_notas(uuid, text)       to authenticated;


-- ---------- 6. BLOQUEO A NIVEL DE BASE DE DATOS ----------
-- Se reescriben las políticas de las tablas de datos añadiendo
-- esta_activo(). Una veterinaria inactiva no lee ni escribe nada,
-- aunque se salte el frontend y llame a supabase-js desde la consola.

do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array[
    'duenos', 'mascotas', 'historias_clinicas', 'vacunas',
    'citas', 'tratamientos', 'inventario', 'configuracion'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;  -- tabla que aún no existe en este proyecto
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I;', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "own_rows_%1$s" on public.%1$I
        for all
        to authenticated
        using (auth.uid() = user_id and public.esta_activo())
        with check (auth.uid() = user_id and public.esta_activo());
    $f$, t);
  end loop;
end $$;


-- ---------- 7. ÚLTIMO PASO MANUAL ----------
-- Marcar tu propia cuenta como admin (cambia el correo si hace falta):
--
--   update public.perfiles set rol = 'admin'
--    where email = 'emmanuelvargas172@gmail.com';
--
-- Verificar:  select email, rol, estado_suscripcion from public.perfiles;


-- ============================================================
--  ROLLBACK (por si hay que volver atrás)
-- ============================================================
-- do $$
-- declare t text; pol record;
-- begin
--   foreach t in array array['duenos','mascotas','historias_clinicas','vacunas',
--                            'citas','tratamientos','inventario','configuracion']
--   loop
--     if to_regclass('public.'||t) is null then continue; end if;
--     for pol in select policyname from pg_policies
--                where schemaname='public' and tablename=t
--     loop execute format('drop policy %I on public.%I;', pol.policyname, t); end loop;
--     execute format($f$
--       create policy "own_rows_%1$s" on public.%1$I for all to authenticated
--         using (auth.uid() = user_id) with check (auth.uid() = user_id);
--     $f$, t);
--   end loop;
-- end $$;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.admin_listar_veterinarias();
-- drop function if exists public.admin_set_estado(uuid, text);
-- drop function if exists public.admin_set_notas(uuid, text);
-- drop function if exists public.esta_activo();
-- drop function if exists public.es_admin();
-- drop function if exists public.crear_perfil();
-- drop table if exists public.perfiles;
