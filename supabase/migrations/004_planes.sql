-- ============================================================
--  004_planes.sql — Planes por función (Fichas / Completo / Facturación)
--
--  Los planes de la landing se separan por lo que hace la app, no por
--  cuántas mascotas caben:
--
--    fichas       → mascotas, dueños, historias, citas, vacunas, calendario
--    completo     → todo lo anterior + inventario + caja/reportes
--    facturacion  → todo lo anterior + facturación electrónica DIAN
--                   (el módulo DIAN todavía no existe; el plan queda
--                    definido para no tener que migrar otra vez después)
--
--  El bloqueo vive aquí, en RLS, no en React: con F12 cualquiera puede
--  llamar a supabase-js directamente, así que el frontend solo esconde
--  botones — la base de datos es la que dice que no.
--
--  Idempotente: se puede correr varias veces. Rollback al final.
--  Ejecutar completo en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- 1. COLUMNA plan ----------
-- Default 'completo' a propósito: al correr esta migración NADIE pierde
-- acceso a lo que ya usaba. Los planes se asignan a mano desde el panel
-- de admin, igual que estado_suscripcion (no hay cobro automático aún).

alter table public.perfiles
  add column if not exists plan text not null default 'completo';

alter table public.perfiles drop constraint if exists perfiles_plan_check;
alter table public.perfiles add  constraint perfiles_plan_check
  check (plan in ('fichas', 'completo', 'facturacion'));

create index if not exists idx_perfiles_plan on public.perfiles(plan);

-- El usuario puede LEER su plan (para esconder menús), pero no escribirlo.
-- 002_admin.sql ya hizo `grant update (nombre)`: al no listar `plan`, un
-- update del cliente sobre esa columna es rechazado por permisos.


-- ---------- 2. HELPERS ----------
-- security definer: leen perfiles saltándose RLS, como es_admin()/esta_activo().

create or replace function public.plan_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Si no hay perfil, se asume 'completo' para no dejar a nadie fuera
  -- por una fila faltante (mismo criterio que esta_activo()).
  select coalesce(
    (select p.plan from public.perfiles p where p.id = auth.uid()),
    'completo'
  );
$$;

-- ¿La cuenta actual tiene derecho a este módulo?
-- El admin siempre pasa: necesita ver y probar todo.
create or replace function public.tiene_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.es_admin() then true
    when p_modulo = 'inventario'  then public.plan_actual() in ('completo', 'facturacion')
    when p_modulo = 'caja'        then public.plan_actual() in ('completo', 'facturacion')
    when p_modulo = 'facturacion' then public.plan_actual() = 'facturacion'
    else true   -- módulos base (mascotas, historias, citas, vacunas…)
  end;
$$;

revoke all on function public.plan_actual()        from anon, authenticated;
revoke all on function public.tiene_modulo(text)   from anon, authenticated;
grant execute on function public.plan_actual()     to authenticated;
grant execute on function public.tiene_modulo(text) to authenticated;


-- ---------- 3. RLS POR MÓDULO ----------
-- Se reescriben SOLO las dos tablas que un plan puede no incluir.
-- Las demás (mascotas, duenos, historias_clinicas, vacunas, citas,
-- tratamientos, configuracion) siguen con la política de 002_admin.sql.
--
-- Ojo con el comportamiento de Postgres: si USING da false, un SELECT
-- devuelve 0 filas en silencio (no error) y un INSERT/UPDATE sí falla
-- con 42501. Por eso el dashboard de un plan 'fichas' muestra ceros en
-- vez de romperse.

alter table public.inventario enable row level security;
drop policy if exists "own_rows_inventario" on public.inventario;
create policy "own_rows_inventario" on public.inventario
  for all
  to authenticated
  using       (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('inventario'))
  with check  (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('inventario'));

alter table public.cobros enable row level security;
drop policy if exists "own_rows_cobros" on public.cobros;
create policy "own_rows_cobros" on public.cobros
  for all
  to authenticated
  using       (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('caja'))
  with check  (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('caja'));


-- ---------- 4. ADMINISTRACIÓN DEL PLAN ----------
-- El listado del panel admin ahora trae también el plan. Cambia la firma
-- de salida, así que hay que dropear antes: create or replace no permite
-- modificar las columnas de retorno.

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
           p.rol, p.estado_suscripcion, p.plan, p.fecha_registro, p.notas_admin
    from public.perfiles p
    left join public.configuracion c on c.user_id = p.id
    order by p.fecha_registro desc;
end $$;

create or replace function public.admin_set_plan(p_id uuid, p_plan text)
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
  if p_plan not in ('fichas', 'completo', 'facturacion') then
    raise exception 'Plan inválido: %', p_plan;
  end if;

  update public.perfiles
     set plan = p_plan, updated_at = now()
   where id = p_id and rol = 'veterinaria'
  returning * into fila;

  if fila.id is null then
    raise exception 'Veterinaria no encontrada (o es una cuenta admin)';
  end if;
  return fila;
end $$;

revoke all on function public.admin_listar_veterinarias()    from anon, authenticated;
revoke all on function public.admin_set_plan(uuid, text)     from anon, authenticated;
grant execute on function public.admin_listar_veterinarias() to authenticated;
grant execute on function public.admin_set_plan(uuid, text)  to authenticated;


-- ---------- 5. VERIFICACIÓN ----------
--   select email, rol, estado_suscripcion, plan from public.perfiles;
--
-- Probar el bloqueo con una cuenta de plan 'fichas' (desde su sesión):
--   select public.plan_actual();                  -- 'fichas'
--   select public.tiene_modulo('inventario');     -- false
--   insert into public.inventario (nombre, categoria) values ('x','Otros');
--     → ERROR 42501 new row violates row-level security policy


-- ============================================================
--  ROLLBACK (descomentar para deshacer)
-- ============================================================
-- drop policy if exists "own_rows_inventario" on public.inventario;
-- create policy "own_rows_inventario" on public.inventario for all to authenticated
--   using (auth.uid() = user_id and public.esta_activo())
--   with check (auth.uid() = user_id and public.esta_activo());
-- drop policy if exists "own_rows_cobros" on public.cobros;
-- create policy "own_rows_cobros" on public.cobros for all to authenticated
--   using (auth.uid() = user_id and public.esta_activo())
--   with check (auth.uid() = user_id and public.esta_activo());
-- drop function if exists public.admin_set_plan(uuid, text);
-- drop function if exists public.tiene_modulo(text);
-- drop function if exists public.plan_actual();
-- alter table public.perfiles drop constraint if exists perfiles_plan_check;
-- alter table public.perfiles drop column if exists plan;
-- -- y volver a crear admin_listar_veterinarias() sin la columna plan (ver 002_admin.sql)
