-- ============================================================
-- VetaApp · 014_deshacer_importacion.sql
-- Deshacer una importación sin llevarse por delante meses de trabajo.
--
-- ---------- POR QUÉ ESTO NO ES UN DELETE ----------
-- En 001_init.sql todo está en cascada:
--
--   mascotas.dueno_id             → duenos(id)    on delete cascade
--   citas.mascota_id              → mascotas(id)  on delete cascade
--   vacunas.mascota_id            → mascotas(id)  on delete cascade
--   tratamientos.mascota_id       → mascotas(id)  on delete cascade
--   historias_clinicas.mascota_id → mascotas(id)  on delete cascade
--
-- cobros.mascota_id (003_cobros.sql:18) es la excepción: on delete set null.
-- El recibo tiene que sobrevivir aunque la mascota se vaya — el cobro ya
-- ocurrió y tiene que seguir en el historial de ingresos. Por eso el paso 2
-- cuenta también los cobros antes de decidir si borra la mascota: una
-- mascota importada a la que se le facturó pero no tiene historia clínica
-- caería en "no tiene nada encima" con el conteo anterior. No se pierde
-- plata (003:19-20 guarda mascota_nombre y dueno_nombre como copia), pero
-- se pierde la trazabilidad del recibo al paciente.
--
-- El escenario: la clínica importa en octubre, atiende a "Killer" seis
-- veces, le escribe la historia clínica, le agenda cita. En marzo entra a
-- Importaciones, le da Deshacer para limpiar otra cosa, y se va el trabajo
-- de cinco meses. Sin aviso, porque la cascada la hace Postgres en
-- silencio.
--
-- Entonces deshacer es: borrar solo lo que no tiene nada encima, y frenar
-- en lo demás mostrándoselo.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create or replace function public.deshacer_importacion(p_importacion bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user        uuid := auth.uid();
  v_estado      text;
  v_conservadas jsonb := '[]'::jsonb;
  m             record;
  v_item        jsonb;
  v_campo       text;

  n_trat        int := 0;
  n_vac         int := 0;
  n_mas         int := 0;
  n_duenos      int := 0;
  n_restaurados int := 0;
  v_hist        int; v_citas int; v_vac_m int; v_trat_m int; v_cobros int;
begin
  select estado into v_estado
    from importaciones where id = p_importacion and user_id = v_user;
  if v_estado is null then
    raise exception 'La importación % no existe o no es de esta cuenta', p_importacion;
  end if;

  -- Deshacer dos veces restauraría los `anteriores` encima de lo que la
  -- clínica tecleó después del primer deshacer: le borraría datos que ella
  -- escribió a mano. Es más simple frenar que intentar distinguirlo.
  if v_estado in ('deshecho', 'deshecho_parcial') then
    raise exception 'La importación % ya se deshizo', p_importacion;
  end if;

  -- ---------- 1. LOS EVENTOS DEL IMPORT ----------
  -- Se van siempre y van primero. Un baño importado no tiene nada colgado
  -- abajo, y sacarlos antes es lo que deja ver si a una mascota le queda
  -- historia propia o solo tenía lo que trajo el archivo.
  with d as (delete from tratamientos where importacion_id = p_importacion returning 1)
  select count(*) into n_trat from d;

  with d as (delete from vacunas where importacion_id = p_importacion returning 1)
  select count(*) into n_vac from d;

  -- ---------- 2. LAS MASCOTAS, UNA POR UNA ----------
  for m in select id, nombre, dueno_id from mascotas
            where importacion_id = p_importacion loop

    select count(*) into v_hist   from historias_clinicas where mascota_id = m.id;
    select count(*) into v_citas  from citas              where mascota_id = m.id;
    select count(*) into v_vac_m  from vacunas            where mascota_id = m.id;
    select count(*) into v_trat_m from tratamientos       where mascota_id = m.id;
    select count(*) into v_cobros from cobros             where mascota_id = m.id;

    if v_hist + v_citas + v_vac_m + v_trat_m + v_cobros = 0 then
      delete from mascotas where id = m.id and user_id = v_user;
      n_mas := n_mas + 1;
    else
      -- No se toca. Borrarla se llevaría por cascada todo lo que la
      -- clínica escribió DESPUÉS del import. Se devuelve con los números
      -- para que la pantalla pueda decir "Killer tiene 6 consultas y 2
      -- citas escritas después del import" en vez de un número pelado.
      v_conservadas := v_conservadas || jsonb_build_object(
        'id', m.id, 'nombre', m.nombre,
        'historias', v_hist, 'citas', v_citas,
        'vacunas', v_vac_m, 'tratamientos', v_trat_m, 'cobros', v_cobros);
    end if;
  end loop;

  -- ---------- 3. LOS TUTORES ----------
  -- Solo los que se quedaron sin ninguna mascota. Si una mascota se
  -- conservó, su dueño se conserva: no es una elección, mascotas.dueno_id
  -- es NOT NULL y borrar al dueño la arrastraría por la cascada — justo la
  -- que se acaba de decidir conservar. El `not exists` cubre además el
  -- caso de un tutor importado al que la clínica le registró una mascota
  -- nueva después.
  with d as (
    delete from duenos
     where importacion_id = p_importacion
       and user_id = v_user
       -- user_id filtra las mascotas: sin él, RLS no ve una mascota ajena
       -- colgada de este tutor (la subconsulta corre security invoker), lo
       -- borra creyéndolo sin mascotas, y la cascada se lleva la mascota de
       -- la otra clínica. Es el otro extremo de la cadena de F3 de 013.
       and not exists (select 1 from mascotas
                        where mascotas.dueno_id = duenos.id
                          and mascotas.user_id = v_user)
     returning 1)
  select count(*) into n_duenos from d;

  -- ---------- 4. LO QUE EL IMPORT COMPLETÓ ----------
  for v_item in select * from jsonb_array_elements(
                  (select anteriores from importaciones
                    where id = p_importacion and user_id = v_user)) loop
    v_campo := v_item->>'campo';

    if v_item->>'tabla' = 'duenos' and v_campo in ('cedula','direccion','telefono2') then
      execute format('update duenos set %I = $1 where id = $2 and user_id = $3', v_campo)
        using v_item->>'antes', (v_item->>'id')::bigint, v_user;

    elsif v_item->>'tabla' = 'mascotas' and v_campo in ('edad_anios','edad_meses') then
      -- NOT NULL default 0: restaurar null reventaría. El valor anterior
      -- de una edad siempre es un número, y si no estaba, era 0.
      execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
        using coalesce((v_item->>'antes')::int, 0), (v_item->>'id')::bigint, v_user;

    elsif v_item->>'tabla' = 'mascotas' and v_campo in ('raza','fecha_nacimiento') then
      execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
        using v_item->>'antes', (v_item->>'id')::bigint, v_user;

    else
      -- Un campo que no está en ninguna lista blanca llegó a `anteriores`
      -- de alguna versión vieja de la función. Se salta en silencio: la
      -- alternativa es que el deshacer entero falle por un dato histórico.
      continue;
    end if;

    n_restaurados := n_restaurados + 1;
  end loop;

  -- ---------- 5. CERRAR ----------
  -- Un deshacer que dejó mascotas atrás tiene que poder distinguirse de uno
  -- completo, o seis meses después nadie entiende por qué siguen ahí esos
  -- tres clientes.
  --
  -- El objeto que se guarda tiene que llevar los MISMOS contadores que el que
  -- se devuelve abajo. La pantalla muestra la respuesta de la llamada solo
  -- mientras la clínica sigue en la pantalla; en cuanto recarga, lee esta fila
  -- y nada más. Un contador que esté en la respuesta y no acá se puede decir
  -- bien hoy y mal mañana: `campos_restaurados` faltaba, y una importación que
  -- solo completó datos pasaba de "Devolví 2 datos a como estaban" a "de este
  -- archivo no quedaba nada en la base" al apretar F5 — que es falso, esos
  -- datos sí estaban y sí se revirtieron.
  update importaciones
     set estado = case when jsonb_array_length(v_conservadas) > 0
                       then 'deshecho_parcial' else 'deshecho' end,
         resumen = resumen || jsonb_build_object('deshecho', jsonb_build_object(
                     'mascotas_borradas', n_mas, 'tutores_borrados', n_duenos,
                     'tratamientos', n_trat, 'vacunas', n_vac,
                     'campos_restaurados', n_restaurados,
                     'conservadas', v_conservadas)),
         cerrado_en = now()
   where id = p_importacion and user_id = v_user;

  return jsonb_build_object(
    'mascotas_borradas', n_mas,
    'tutores_borrados',  n_duenos,
    'tratamientos',      n_trat,
    'vacunas',           n_vac,
    'campos_restaurados', n_restaurados,
    'conservadas',       v_conservadas,
    'estado', (select estado from importaciones where id = p_importacion)
  );
end
$fn$;

revoke all on function public.deshacer_importacion(bigint) from public, anon, authenticated;
grant execute on function public.deshacer_importacion(bigint) to authenticated;
