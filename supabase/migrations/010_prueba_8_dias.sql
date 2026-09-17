-- ============================================================
-- VetaApp · 010_prueba_8_dias.sql
-- La prueba gratis baja de 14 días a 8
--
-- ---------- POR QUÉ ----------
-- Catorce días es más tiempo del que una clínica necesita para saber si
-- va a usar esto: el guion de venta ya dice que si al día 3 no metió una
-- cita, no se queda. Los once días que sobran solo alargan la decisión y
-- enfrían el seguimiento.
--
-- Ocho y no siete: "de hoy en ocho" es como se dice una semana en
-- Colombia, y deja un día de gracia para el que se registra un viernes
-- por la tarde y no vuelve a abrirlo hasta el lunes.
--
-- ---------- POR QUÉ UNA MIGRACIÓN NUEVA ----------
-- Cambiar el '14 days' dentro de 005_prueba.sql no haría nada: esa
-- migración ya corrió contra la base de producción y Postgres no la
-- vuelve a leer. Lo que vale es la última definición de cada función, y
-- esa es la que queda aquí.
--
-- ---------- A QUIÉN LE APLICA ----------
-- Solo a quien se registre después de correr esto. Las cuentas que ya
-- están en prueba conservan su prueba_hasta: a esas se les prometió
-- catorce días y recortárselos por detrás sería quitarles algo que ya
-- tenían, justo a la gente que está decidiendo si paga.
-- ============================================================


-- ---------- 1. LA PRUEBA QUE SE DA SOLA AL REGISTRARSE ----------
-- Copia de la de 005_prueba.sql:45 con el intervalo en 8. El
-- `on conflict do nothing` sigue ahí: si el perfil ya existe (reintento
-- de registro, o un usuario creado a mano desde el panel de Supabase),
-- el trigger no puede reventar — reventaría el signup entero.
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
    coalesce(new.created_at, now()) + interval '8 days'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- El trigger no se vuelve a crear: sigue apuntando a crear_perfil() por
-- nombre, así que con reemplazar el cuerpo de la función basta.


-- ---------- 2. CUANDO EL ADMIN PONE UNA CUENTA EN PRUEBA ----------
-- Copia de la de 005_prueba.sql:159 con el intervalo en 8.
--
-- El `case` es lo importante y se conserva igual: si la cuenta ya tenía
-- una prueba viva, no se le reinicia el contador por pasar por aquí. Solo
-- se le da prueba nueva a quien no tenía o la tenía vencida.
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
           when prueba_hasta is null or prueba_hasta <= now() then now() + interval '8 days'
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


-- ---------- 3. LO QUE NO SE TOCA ----------
-- admin_extender_prueba(p_id, p_dias) recibe los días por parámetro desde
-- el panel, así que no tiene ningún 14 escrito adentro. Lo que cambia es
-- el botón de Admin.jsx, que ahora manda 8 en vez de 14.
--
-- esta_activo() y dias_de_prueba() solo comparan contra prueba_hasta: les
-- da igual cuántos días duró la prueba.


-- ============================================================
-- COMPROBAR
-- ============================================================
-- Que las funciones quedaron en 8:
--   select prosrc from pg_proc where proname = 'crear_perfil';
--   select prosrc from pg_proc where proname = 'admin_set_estado';
--
-- Que las pruebas vivas NO se movieron:
--   select email, estado_suscripcion, prueba_hasta
--     from public.perfiles where estado_suscripcion = 'prueba';
