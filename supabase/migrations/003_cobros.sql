-- ============================================================
-- VetaApp · Módulo Caja y Reportes
-- Recibos de control interno. NO son facturas electrónicas DIAN.
-- Idempotente: se puede correr varias veces. Rollback al final.
-- Ejecutar en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- 1. TABLA ----------
-- mascota_id se pone a null si borran la mascota: un cobro ya emitido
-- no puede desaparecer del historial de ingresos. Por eso se guardan
-- también los nombres como copia — el recibo debe seguir siendo legible
-- aunque la mascota o el dueño ya no existan.

create table if not exists public.cobros (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero          bigint,
  mascota_id      bigint references public.mascotas(id) on delete set null,
  mascota_nombre  text not null,
  dueno_nombre    text,
  servicios       jsonb not null default '[]'::jsonb,
  subtotal        numeric(12,2) not null default 0,
  descuento       numeric(5,2)  not null default 0,
  total           numeric(12,2) not null default 0,
  metodo_pago     text not null default 'efectivo',
  fecha           timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Restricciones de integridad. Sin esto, un descuento de 900% o un total
-- negativo entran sin protestar y ensucian los reportes para siempre.
alter table public.cobros drop constraint if exists cobros_metodo_pago_check;
alter table public.cobros add  constraint cobros_metodo_pago_check
  check (metodo_pago in ('efectivo', 'transferencia', 'nequi', 'tarjeta'));

alter table public.cobros drop constraint if exists cobros_descuento_check;
alter table public.cobros add  constraint cobros_descuento_check
  check (descuento >= 0 and descuento <= 100);

alter table public.cobros drop constraint if exists cobros_montos_check;
alter table public.cobros add  constraint cobros_montos_check
  check (subtotal >= 0 and total >= 0);

-- Numeración por veterinaria: cada clínica lleva su propia serie 1, 2, 3…
-- El unique hace que una carrera entre dos pestañas falle en vez de
-- repetir el número de recibo.
create unique index if not exists idx_cobros_numero on public.cobros(user_id, numero);
create index if not exists idx_cobros_user    on public.cobros(user_id);
create index if not exists idx_cobros_fecha   on public.cobros(user_id, fecha desc);
create index if not exists idx_cobros_mascota on public.cobros(mascota_id);


-- ---------- 2. NUMERACIÓN AUTOMÁTICA ----------

create or replace function public.cobros_asignar_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    select coalesce(max(c.numero), 0) + 1 into new.numero
      from public.cobros c where c.user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cobros_numero on public.cobros;
create trigger trg_cobros_numero
  before insert on public.cobros
  for each row execute function public.cobros_asignar_numero();


-- ---------- 3. RLS ----------
-- Mismo patrón que las otras 8 tablas (ver 002_admin.sql): además de
-- aislar por user_id, exige esta_activo() — una veterinaria suspendida
-- no lee ni registra cobros aunque llame a supabase-js desde la consola.
--
-- Nota: el bucle de 002_admin.sql no incluye 'cobros' en su array, así
-- que esta política es la única fuente de verdad para esta tabla.

alter table public.cobros enable row level security;

drop policy if exists "own_rows_cobros" on public.cobros;
create policy "own_rows_cobros" on public.cobros
  for all
  to authenticated
  using (auth.uid() = user_id and public.esta_activo())
  with check (auth.uid() = user_id and public.esta_activo());


-- ---------- ROLLBACK (descomentar para deshacer) ----------
-- drop trigger if exists trg_cobros_numero on public.cobros;
-- drop function if exists public.cobros_asignar_numero();
-- drop table if exists public.cobros;
