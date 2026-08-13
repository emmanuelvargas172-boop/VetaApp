-- ============================================================
-- VetaApp · Migración inicial multi-tenant (Supabase / Postgres)
-- Cada fila pertenece a una veterinaria (user_id = auth.users.id).
-- RLS aísla los datos: cada cuenta solo ve lo suyo.
-- Ejecutar completo en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- TABLAS ----------

create table if not exists public.duenos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  telefono    text not null,
  direccion   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.mascotas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  especie     text not null,
  raza        text,
  edad_anios  integer not null default 0,
  edad_meses  integer not null default 0,
  peso        real,
  foto        text,
  dueno_id    bigint not null references public.duenos(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.historias_clinicas (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id       bigint not null references public.mascotas(id) on delete cascade,
  fecha            text not null,
  motivo           text not null,
  diagnostico      text,
  tratamiento      text,
  medicamentos     text,
  medicamentos_ids text,
  peso             real,
  veterinario      text,
  notas            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.vacunas (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id       bigint not null references public.mascotas(id) on delete cascade,
  nombre           text not null,
  fecha_aplicacion text not null,
  proxima_dosis    text,
  veterinario      text,
  notas            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.citas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id  bigint not null references public.mascotas(id) on delete cascade,
  veterinario text not null,
  fecha       text not null,
  hora        text not null,
  motivo      text not null,
  estado      text not null default 'pendiente',
  notas       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.tratamientos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id  bigint not null references public.mascotas(id) on delete cascade,
  tipo        text not null check (tipo in ('vacunacion','desparasitacion','bano','consulta')),
  fecha       text not null,
  hora        text,
  notas       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.inventario (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre          text not null,
  categoria       text not null,
  cantidad        integer not null default 0,
  cantidad_minima integer not null default 0,
  precio_compra   real,
  precio_venta    real,
  unidad          text not null default 'unidad',
  created_at      timestamptz not null default now()
);

-- Índices para filtrar por dueño/tenant rápido
create index if not exists idx_mascotas_user     on public.mascotas(user_id);
create index if not exists idx_mascotas_dueno    on public.mascotas(dueno_id);
create index if not exists idx_historias_mascota on public.historias_clinicas(mascota_id);
create index if not exists idx_vacunas_mascota   on public.vacunas(mascota_id);
create index if not exists idx_citas_mascota     on public.citas(mascota_id);
create index if not exists idx_tratam_mascota    on public.tratamientos(mascota_id);

-- ---------- ROW LEVEL SECURITY ----------
-- Una política por tabla: "cada quien solo ve/edita lo suyo".

do $$
declare t text;
begin
  foreach t in array array[
    'duenos','mascotas','historias_clinicas','vacunas',
    'citas','tratamientos','inventario'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "own_rows_%1$s" on public.%1$I
        for all
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- ---------- STORAGE: fotos de mascotas ----------
-- Bucket privado; cada usuario solo accede a su carpeta  {user_id}/...

insert into storage.buckets (id, name, public)
values ('mascotas', 'mascotas', false)
on conflict (id) do nothing;

create policy "mascotas_read_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "mascotas_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "mascotas_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "mascotas_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'mascotas' and (storage.foldername(name))[1] = auth.uid()::text);
