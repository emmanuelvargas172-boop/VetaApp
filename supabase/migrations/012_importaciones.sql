-- ============================================================
-- VetaApp · 012_importaciones.sql
-- De dónde salió cada fila que entró por un archivo.
--
-- No es solo para poder deshacer. Es para que la ficha pueda decir "este
-- cliente entró del archivo que subiste el 15/10, no lo escribió nadie".
-- El día que un dato esté raro, saber de dónde salió es la diferencia
-- entre arreglarlo y adivinar.
-- ============================================================

create table if not exists public.importaciones (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  archivo     text not null,
  hoja        text,

  -- La fila se crea en 'en_curso' ANTES de escribir nada. Un import que
  -- se cortó a mitad y que nadie registró no se puede ni diagnosticar ni
  -- limpiar. 'deshecho_parcial' existe porque un deshacer que dejó
  -- mascotas atrás no se puede ver igual que uno completo.
  estado      text not null default 'en_curso'
              check (estado in ('en_curso','listo','deshecho','deshecho_parcial','fallido')),

  -- Qué columna fue a qué campo. Si sube el mismo archivo actualizado en
  -- tres meses, se le propone el mapeo de la vez pasada.
  mapeo       jsonb not null default '{}'::jsonb,

  -- Lo que vio en el paso 3, guardado. Seis meses después puede volver a
  -- leer POR QUÉ una mascota quedó sin fecha de nacimiento, en vez de
  -- pensar que la app se la comió.
  resumen     jsonb not null default '{}'::jsonb,

  -- El valor que tenía cada campo que el import COMPLETÓ. Sin esto,
  -- deshacer borra lo creado pero deja lo modificado: queda a medias y
  -- ella cree que volvió todo atrás.
  anteriores  jsonb not null default '[]'::jsonb,

  creado_en   timestamptz not null default now(),
  cerrado_en  timestamptz
);

create index if not exists idx_importaciones_user on public.importaciones(user_id);

-- `on delete set null` a propósito: si algún día se borra el registro de
-- la importación, los datos se quedan. Se pierde el rastro, no los
-- clientes.
do $$
declare t text;
begin
  foreach t in array array['duenos','mascotas','tratamientos','vacunas']
  loop
    execute format(
      'alter table public.%I add column if not exists importacion_id bigint
         references public.importaciones(id) on delete set null;', t);
    execute format(
      'create index if not exists idx_%1$s_importacion on public.%1$I(importacion_id);', t);
  end loop;
end $$;

-- Misma política que las otras ocho tablas (002_admin.sql:249-254): además
-- de aislar por user_id, exige esta_activo(). Sin esta cláusula, una cuenta
-- suspendida puede llamar a deshacer_importacion(), que lee el estado de la
-- importación (cero filas bloqueadas → sin error), itera cero mascotas
-- porque RLS las esconde, restaura cero campos sin quejarse, y escribe
-- estado='deshecho'. El resultado: no borró nada, dice que sí lo hizo, y
-- cuando la clínica reactive la suscripción el freno de "ya se deshizo"
-- le impide el deshacer para siempre. Sin esta_activo() el RLS no falla
-- cerrado — falla devolviendo cero filas, y la función lee cero como "no
-- hay nada encima".
alter table public.importaciones enable row level security;

drop policy if exists "own_rows_importaciones" on public.importaciones;
create policy "own_rows_importaciones" on public.importaciones
  for all
  to authenticated
  using (auth.uid() = user_id and public.esta_activo())
  with check (auth.uid() = user_id and public.esta_activo());
