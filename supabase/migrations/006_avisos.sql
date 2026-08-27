-- ============================================================
-- VetaApp · Memoria de recordatorios enviados
--
-- Hasta ahora la app abría wa.me y se olvidaba: nadie sabía a quién ya
-- se le había avisado, así que al día siguiente la lista salía igual y
-- el mismo dueño recibía el mismo mensaje tres veces. Esta tabla es esa
-- memoria. NO envía nada por su cuenta: el envío sigue siendo un clic
-- de la veterinaria (WhatsApp no deja mandar mensajes sin la API de
-- negocio de Meta, que exige número verificado y plantillas aprobadas).
--
-- Idempotente: se puede correr varias veces. Rollback al final.
-- Ejecutar en:  Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- 1. TABLA ----------
-- vacuna_id se pone a null si borran la vacuna: el aviso ya salió y el
-- historial de "a quién le escribí" no puede desaparecer. Por eso se
-- guardan también nombre y teléfono como copia.

create table if not exists public.avisos (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vacuna_id      bigint references public.vacunas(id) on delete set null,
  mascota_nombre text,
  dueno_nombre   text,
  telefono       text,
  canal          text not null default 'whatsapp',
  mensaje        text,
  enviado_at     timestamptz not null default now()
);

alter table public.avisos drop constraint if exists avisos_canal_check;
alter table public.avisos add  constraint avisos_canal_check
  check (canal in ('whatsapp'));

create index if not exists idx_avisos_user    on public.avisos(user_id, enviado_at desc);
create index if not exists idx_avisos_vacuna  on public.avisos(user_id, vacuna_id, enviado_at desc);


-- ---------- 2. tiene_modulo() APRENDE 'recordatorios' ----------
-- En 004 la lista de módulos terminaba en `else true`, pensada para los
-- módulos base (mascotas, historias, citas…) que van en todos los planes.
-- 'recordatorios' caía ahí, así que tiene_modulo('recordatorios') devolvía
-- true incluso con plan 'fichas'. Daba igual mientras el módulo solo se
-- escondiera del menú; a partir de esta migración una política lo consulta
-- de verdad, y sin este caso el plan Fichas podría escribir en `avisos`.
-- Comprobado en producción antes de este arreglo:
--   plan leido=fichas | tiene_modulo(recordatorios)=true   ← el fallo
--
-- Se deja el `else true` porque los módulos base dependen de él, pero cada
-- módulo que se pueda vender aparte tiene que estar listado arriba.

create or replace function public.tiene_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.es_admin() then true
    when p_modulo = 'inventario'    then public.plan_actual() in ('completo', 'facturacion')
    when p_modulo = 'caja'          then public.plan_actual() in ('completo', 'facturacion')
    when p_modulo = 'recordatorios' then public.plan_actual() in ('completo', 'facturacion')
    when p_modulo = 'facturacion'   then public.plan_actual() = 'facturacion'
    else true   -- módulos base (mascotas, historias, citas, vacunas…)
  end;
$$;

revoke all on function public.tiene_modulo(text)    from anon, authenticated;
grant execute on function public.tiene_modulo(text) to authenticated;


-- ---------- 3. RLS ----------
-- Mismo patrón que cobros/inventario (003, 004): aísla por user_id y
-- exige esta_activo(). Además tiene_modulo('recordatorios'), y aquí sí
-- muerde de verdad: hasta ahora el módulo Recordatorios solo se escondía
-- del menú, porque bloquear `vacunas` habría roto el plan Fichas — las
-- vacunas son parte de la ficha clínica. Esta tabla, en cambio, existe
-- solo para el módulo, así que puede bloquearse sin dañar nada.

alter table public.avisos enable row level security;

drop policy if exists "own_rows_avisos" on public.avisos;
create policy "own_rows_avisos" on public.avisos
  for all
  to authenticated
  using       (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('recordatorios'))
  with check  (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('recordatorios'));


-- ---------- 4. CONSULTA DE APOYO ----------
-- Último aviso por vacuna. La app la usa para dos cosas: pintar
-- "avisado hace N días" y no volver a contar esa vacuna como pendiente.
-- Es una vista con security_invoker: respeta la RLS de quien pregunta.

create or replace view public.avisos_ultimo
with (security_invoker = true) as
  select vacuna_id, user_id, max(enviado_at) as enviado_at
    from public.avisos
   where vacuna_id is not null
   group by vacuna_id, user_id;


-- ---------- PRUEBA (opcional, se deshace sola) ----------
-- Comprueba que un plan sin el módulo no puede registrar avisos.
-- do $$
-- declare v_uid uuid; v_error text := 'sin error';
-- begin
--   select id into v_uid from public.perfiles where rol = 'veterinaria' limit 1;
--   update public.perfiles set plan = 'fichas' where id = v_uid;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
--   begin
--     insert into public.avisos (user_id, telefono) values (v_uid, '3000000000');
--   exception when others then v_error := sqlstate;
--   end;
--   raise exception 'RESULTADO insert con plan fichas = % (esperado 42501) (rollback a proposito)', v_error;
-- end $$;


-- ---------- ROLLBACK (descomentar para deshacer) ----------
-- drop view  if exists public.avisos_ultimo;
-- drop table if exists public.avisos;
