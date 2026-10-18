-- ============================================================
-- VetaApp · 013_aplicar_importacion.sql
-- El paso 4 del importador: una llamada, una transacción.
--
-- ---------- POR QUÉ UNA FUNCIÓN ----------
-- Desde el navegador, supabase-js manda cada insert como un pedido HTTP
-- suelto. No hay transacción. El wifi de una clínica de barrio se cae, y
-- cuando se cae en la mitad de un import quedan 30 tutores escritos, 0
-- mascotas, y una base peor que antes de empezar — sin forma de saber por
-- dónde iba. Con una sola llamada: o entra todo o no entra nada.
--
-- ---------- POR QUÉ security invoker ----------
-- Corre con los permisos de la clínica que llama, así que RLS aplica
-- igual que en cualquier otra escritura. `security definer` acá sería un
-- camino para escribir en la cuenta de otra clínica, que es justo lo que
-- RLS está para impedir. No se cambia nunca.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create or replace function public.aplicar_importacion(plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_imp         bigint := (plan->>'importacion_id')::bigint;
  v_user        uuid   := auth.uid();

  -- ref de mentira → id real. El plan no puede traer los id de lo que
  -- todavía no existe, así que las mascotas y los eventos señalan a su
  -- tutor por un ref que solo vale adentro de esta llamada.
  v_ids_tutor   jsonb  := '{}'::jsonb;
  v_ids_masc    jsonb  := '{}'::jsonb;

  -- El valor que tenía cada campo ANTES de completarlo. Sin esto,
  -- deshacer borra lo creado pero deja lo modificado: queda a medias y la
  -- clínica cree que volvió todo atrás.
  v_anteriores  jsonb  := '[]'::jsonb;

  -- Lo que no se pudo hacer sin reventar el import entero. Viaja de vuelta
  -- para que el paso 4 lo muestre en vez de que desaparezca.
  v_omitidos    jsonb  := '[]'::jsonb;

  v_item        jsonb;
  v_campo       text;
  v_valor       text;
  v_antes       text;
  v_estado      text;
  v_toco        boolean;
  v_id          bigint;
  v_dueno       bigint;

  n_tut_nuevos  int := 0;
  n_tut_compl   int := 0;
  n_mas_nuevos  int := 0;
  n_mas_compl   int := 0;
  n_trat        int := 0;
  n_vac         int := 0;
  n_repetidos   int := 0;
begin
  -- La importación tiene que existir y ser de quien llama. RLS ya frenaría
  -- la escritura, pero el error que da no explica nada; este sí.
  select estado into v_estado from importaciones where id = v_imp and user_id = v_user;
  if v_estado is null then
    raise exception 'La importación % no existe o no es de esta cuenta', v_imp;
  end if;
  -- El freno es solo contra los dos estados de deshecho, no contra cualquier
  -- estado distinto de 'en_curso'. El spec parte archivos grandes en varias
  -- tandas con el mismo importacion_id: cada tanda cierra en 'listo', así que
  -- una guarda v_estado <> 'en_curso' frenaría la segunda tanda contra sí
  -- misma. Los estados de deshecho sí son terminales: restaurar v_anteriores
  -- encima de lo que la clínica escribió después del primer deshacer le
  -- borraría datos propios sin posibilidad de recuperación.
  if v_estado in ('deshecho', 'deshecho_parcial') then
    raise exception 'La importación % ya se deshizo', v_imp;
  end if;

  -- ---------- 1. TUTORES NUEVOS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'crear_tutores', '[]'::jsonb)) loop
    begin
      insert into duenos (user_id, nombre, telefono, telefono2, cedula, direccion, importacion_id)
      values (
        v_user,
        v_item->>'nombre',
        -- telefono es NOT NULL. Cadena vacía antes que null: el archivo
        -- real trae una fila sin ningún teléfono usable, y esa persona
        -- entra igual con el botón de WhatsApp apagado.
        coalesce(v_item->>'telefono', ''),
        v_item->>'telefono2',
        v_item->>'cedula',
        v_item->>'direccion',
        v_imp
      )
      returning id into v_id;
    exception when unique_violation then
      -- HUECO CONOCIDO DE DUPLICACIÓN (no se tapa acá):
      -- Si la respuesta HTTP de una tanda se pierde después del commit,
      -- la clínica reenvía el mismo JSON y crear_tutores no tiene dedup:
      -- el tutor entra otra vez. Peor: este handler inserta el duplicado
      -- igualmente sin cédula y lo reporta como 'omitidos por cédula
      -- repetida', no como 'esto ya se hizo', así que el único índice que
      -- podía frenarlo está neutralizado. No se corrige aquí porque la
      -- función no puede distinguir un reintento de una tanda nueva: el
      -- JSON no trae id de tanda y agregarlo cambiaría dos tareas futuras
      -- en curso. El tapón va en el navegador: contar
      -- `select count(*) from duenos where importacion_id = X` antes de
      -- reenviar. (Revisión 2026-10-17)
      --
      -- idx_duenos_user_cedula (011) es único por cuenta. Si el archivo
      -- trae una cédula que ya es de otro cliente, lo que NO puede pasar
      -- es que se caiga el import entero por una celda: entra sin cédula
      -- y el paso 4 lo dice.
      insert into duenos (user_id, nombre, telefono, telefono2, direccion, importacion_id)
      values (v_user, v_item->>'nombre', coalesce(v_item->>'telefono', ''),
              v_item->>'telefono2', v_item->>'direccion', v_imp)
      returning id into v_id;
      v_omitidos := v_omitidos || jsonb_build_object(
        'que', 'cedula_repetida', 'quien', v_item->>'nombre', 'valor', v_item->>'cedula');
    end;

    v_ids_tutor  := v_ids_tutor || jsonb_build_object(v_item->>'ref', v_id);
    n_tut_nuevos := n_tut_nuevos + 1;
  end loop;

  -- ---------- 2. TUTORES QUE YA EXISTÍAN ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'completar_tutores', '[]'::jsonb)) loop
    v_id   := (v_item->>'id')::bigint;
    v_toco := false;

    -- Que el tutor exista y sea de esta cuenta se comprueba ACÁ, una vez por
    -- tutor, y no con `found` después del select de abajo: la lista de
    -- sentencias que actualizan `found` no incluye `execute`, y acá no hay
    -- forma de ejecutar nada para comprobar lo contrario. Sin esta guarda un
    -- id ajeno o inexistente hace que el update de abajo afecte 0 filas sin
    -- error, el contador se infle, y el comentario "los números salen de la
    -- base" deje de ser cierto. Mismo idioma que usan los ids que vienen en
    -- el plan, más abajo.
    if not exists (select 1 from duenos where id = v_id and user_id = v_user) then
      raise exception 'El tutor % no existe o no es de esta cuenta', v_id;
    end if;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- Lista blanca y no "lo que venga": el nombre del campo entra en un
      -- format() y de ahí a SQL. Y telefono NO está — es NOT NULL, siempre
      -- tiene algo, así que completarlo es imposible por definición. Si el
      -- archivo trae otro número, el paso 3 lo avisa y no lo pisa.
      if v_campo not in ('cedula', 'direccion', 'telefono2') then
        raise exception 'Campo no completable en duenos: %', v_campo;
      end if;

      execute format('select %I from duenos where id = $1 and user_id = $2', v_campo)
        into v_antes using v_id, v_user;

      -- Solo donde haya vacío. Entre la vista previa y este momento alguien
      -- pudo llenarlo desde otra pestaña, y pisarlo sería exactamente lo
      -- que se le prometió que no iba a pasar.
      if v_antes is null or v_antes = '' then
        begin
          execute format('update duenos set %I = $1 where id = $2 and user_id = $3', v_campo)
            using v_valor, v_id, v_user;
          v_anteriores := v_anteriores || jsonb_build_object(
            'tabla', 'duenos', 'id', v_id, 'campo', v_campo, 'antes', v_antes);
          v_toco := true;
        exception when unique_violation then
          v_omitidos := v_omitidos || jsonb_build_object(
            'que', 'cedula_repetida', 'quien', v_id::text, 'valor', v_valor);
        end;
      end if;
    end loop;

    if v_toco then n_tut_compl := n_tut_compl + 1; end if;
  end loop;

  -- ---------- 3. MASCOTAS NUEVAS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'crear_mascotas', '[]'::jsonb)) loop
    v_dueno := coalesce(
      (v_item->>'tutor_id')::bigint,
      (v_ids_tutor->>(v_item->>'tutor_ref'))::bigint
    );
    if v_dueno is null then
      raise exception 'La mascota "%" no tiene tutor (ref %)',
        v_item->>'nombre', v_item->>'tutor_ref';
    end if;

    -- Las FK comprueban existencia pero no miran RLS. Un tutor_id de otra
    -- clínica pasa la FK, entra como dueno_id, y deshacer_importacion lo
    -- borra cuando no encuentra mascotas propias: la cascada se lleva la
    -- mascota de la otra clínica con toda su historia.
    if not exists (select 1 from duenos where id = v_dueno and user_id = v_user) then
      raise exception 'El tutor % no existe o no es de esta cuenta', v_dueno;
    end if;

    -- `codigo` no se escribe. Lo pone el trigger de 008, que es
    -- security definer e ignora lo que le manden; ponerlo acá dejaría a
    -- alguien creyendo que ese campo lo controla el import.
    insert into mascotas (user_id, nombre, especie, raza, fecha_nacimiento,
                          edad_anios, edad_meses, dueno_id, importacion_id)
    values (
      v_user,
      v_item->>'nombre',
      -- especie es NOT NULL y acá no se adivina. El paso 3 no deja pasar
      -- una mascota sin especie resuelta, así que si llega null el que
      -- está mal es el plan y tiene que doler.
      v_item->>'especie',
      v_item->>'raza',
      -- 011:74 exige null o YYYY-MM-DD. Una celda vacía en el Excel llega
      -- como '' y no como null, y '' no pasa el check: revienta el import
      -- entero en esa fila. nullif convierte '' en null, igual que la
      -- política de cédulas repetidas: el dato faltante cuesta un campo
      -- vacío, no el import completo.
      nullif(v_item->>'fecha_nacimiento', ''),
      coalesce((v_item->>'edad_anios')::int, 0),
      coalesce((v_item->>'edad_meses')::int, 0),
      v_dueno,
      v_imp
    )
    returning id into v_id;

    v_ids_masc   := v_ids_masc || jsonb_build_object(v_item->>'ref', v_id);
    n_mas_nuevos := n_mas_nuevos + 1;
  end loop;

  -- ---------- 4. MASCOTAS QUE YA EXISTÍAN ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'completar_mascotas', '[]'::jsonb)) loop
    v_id   := (v_item->>'id')::bigint;
    v_toco := false;

    -- Misma razón que en completar_tutores: una vez por mascota y con
    -- `not exists`, no con `found` después de un `execute`.
    if not exists (select 1 from mascotas where id = v_id and user_id = v_user) then
      raise exception 'La mascota % no existe o no es de esta cuenta', v_id;
    end if;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- especie NO está: es NOT NULL, una mascota que ya existe siempre
      -- tiene especie, no hay vacío que llenar. (El spec la lista por
      -- error; el razonamiento es el mismo que para duenos.telefono.)
      if v_campo not in ('raza', 'fecha_nacimiento', 'edad_anios', 'edad_meses') then
        raise exception 'Campo no completable en mascotas: %', v_campo;
      end if;

      execute format('select %I::text from mascotas where id = $1 and user_id = $2', v_campo)
        into v_antes using v_id, v_user;

      -- edad_anios y edad_meses son NOT NULL default 0, así que nunca
      -- están "vacías": el 0 cuenta como vacío porque es lo que deja un
      -- registro al que nunca le pusieron la edad.
      if v_antes is null or v_antes = ''
         or (v_campo in ('edad_anios', 'edad_meses') and v_antes = '0') then
        execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
          using (case when v_campo in ('edad_anios', 'edad_meses')
                          then coalesce(v_valor, '0')
                      -- fecha_nacimiento: misma razón que en crear_mascotas.
                      -- '' no pasa el check de 011:74 y revienta el import.
                      when v_campo = 'fecha_nacimiento'
                          then nullif(v_valor, '')
                      else v_valor end), v_id, v_user;
        v_anteriores := v_anteriores || jsonb_build_object(
          'tabla', 'mascotas', 'id', v_id, 'campo', v_campo, 'antes', v_antes);
        v_toco := true;
      end if;
    end loop;

    if v_toco then n_mas_compl := n_mas_compl + 1; end if;
  end loop;

  -- ---------- 5. TRATAMIENTOS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'tratamientos', '[]'::jsonb)) loop
    v_id := coalesce(
      (v_item->>'mascota_id')::bigint,
      (v_ids_masc->>(v_item->>'mascota_ref'))::bigint
    );
    if v_id is null then
      raise exception 'Un tratamiento del % no tiene mascota (ref %)',
        v_item->>'fecha', v_item->>'mascota_ref';
    end if;

    -- Las FK no miran RLS: un mascota_id de otra clínica pasa la FK y el
    -- insert entra con user_id de esta cuenta — la fila queda colgada de una
    -- mascota ajena.
    if not exists (select 1 from mascotas where id = v_id and user_id = v_user) then
      raise exception 'La mascota % no existe o no es de esta cuenta', v_id;
    end if;

    -- Misma mascota + mismo tipo + misma fecha = ya está. La comprobación
    -- va acá y no solo en el navegador: el navegador comparó contra una
    -- foto de hace un minuto; esto compara contra lo que hay. Sin esto, el
    -- mismo archivo dos veces deja 148 baños donde hubo 74.
    --
    -- Costo conocido: si bañaron al mismo perro dos veces el mismo día, el
    -- segundo se pierde. Se acepta — es rarísimo y se arregla a mano en
    -- diez segundos; el caso contrario es frecuente y es un desastre.
    if exists (
      select 1 from tratamientos
       where mascota_id = v_id
         and tipo  = v_item->>'tipo'
         and fecha = v_item->>'fecha'
    ) then
      n_repetidos := n_repetidos + 1;
      continue;
    end if;

    insert into tratamientos (user_id, mascota_id, tipo, fecha, hora, notas, importacion_id)
    values (v_user, v_id, v_item->>'tipo', v_item->>'fecha',
            v_item->>'hora', v_item->>'notas', v_imp);
    n_trat := n_trat + 1;
  end loop;

  -- ---------- 6. VACUNAS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'vacunas', '[]'::jsonb)) loop
    v_id := coalesce(
      (v_item->>'mascota_id')::bigint,
      (v_ids_masc->>(v_item->>'mascota_ref'))::bigint
    );
    if v_id is null then
      raise exception 'Una vacuna del % no tiene mascota (ref %)',
        v_item->>'fecha_aplicacion', v_item->>'mascota_ref';
    end if;

    -- Misma razón que en tratamientos: las FK no miran RLS.
    if not exists (select 1 from mascotas where id = v_id and user_id = v_user) then
      raise exception 'La mascota % no existe o no es de esta cuenta', v_id;
    end if;

    -- Misma regla que los tratamientos, con el nombre adentro: a una
    -- mascota se le pueden aplicar dos vacunas distintas el mismo día.
    if exists (
      select 1 from vacunas
       where mascota_id = v_id
         and nombre = v_item->>'nombre'
         and fecha_aplicacion = v_item->>'fecha_aplicacion'
    ) then
      n_repetidos := n_repetidos + 1;
      continue;
    end if;

    insert into vacunas (user_id, mascota_id, nombre, fecha_aplicacion,
                         proxima_dosis, notas, importacion_id)
    values (v_user, v_id, v_item->>'nombre', v_item->>'fecha_aplicacion',
            v_item->>'proxima_dosis', v_item->>'notas', v_imp);
    n_vac := n_vac + 1;
  end loop;

  -- ---------- 7. CERRAR EL REGISTRO ----------
  -- `anteriores` se acumula con ||, no se pisa: una segunda tanda tiene que
  -- AGREGAR sus entradas a las de la primera para que deshacer pueda iterar
  -- el registro completo. `= v_anteriores` borra lo de las tandas previas.
  --
  -- Los contadores del resumen se suman al valor que ya estaba: el || de
  -- jsonb reemplaza claves repetidas con el valor del lado derecho, así que
  -- sin la suma el resumen refleja solo la última tanda. Se lee el valor
  -- acumulado con (resumen->>'clave')::int y se suma lo de esta tanda.
  -- `omitidos` es un array y también se acumula con ||.
  --
  -- El `return` de abajo devuelve los números de ESTA tanda, no el acumulado.
  -- El navegador lleva su propio total sumando las respuestas de cada tanda:
  -- devolver el acumulado acá y el parcial allá era la fuente de confusión.
  update importaciones
     set estado     = 'listo',
         anteriores = anteriores || v_anteriores,
         resumen    = jsonb_build_object(
                        'tutores_creados',
                          coalesce((resumen->>'tutores_creados')::int, 0)      + n_tut_nuevos,
                        'tutores_completados',
                          coalesce((resumen->>'tutores_completados')::int, 0)  + n_tut_compl,
                        'mascotas_creadas',
                          coalesce((resumen->>'mascotas_creadas')::int, 0)     + n_mas_nuevos,
                        'mascotas_completadas',
                          coalesce((resumen->>'mascotas_completadas')::int, 0) + n_mas_compl,
                        'tratamientos',
                          coalesce((resumen->>'tratamientos')::int, 0)         + n_trat,
                        'vacunas',
                          coalesce((resumen->>'vacunas')::int, 0)              + n_vac,
                        'repetidos',
                          coalesce((resumen->>'repetidos')::int, 0)            + n_repetidos,
                        'omitidos',
                          coalesce(resumen->'omitidos', '[]'::jsonb)           || v_omitidos),
         cerrado_en = now()
   where id = v_imp and user_id = v_user;

  -- Los números salen de la base, no de la predicción del paso 3. Es la
  -- diferencia entre "esto hice" y "esto creía que iba a hacer".
  -- Este retorno es el de ESTA tanda, no el acumulado: el navegador suma las
  -- respuestas de cada tanda por su cuenta; leer el resumen acumulado y este
  -- retorno como si fueran lo mismo daría el doble en la segunda tanda.
  return jsonb_build_object(
    'importacion_id',       v_imp,
    'tutores_creados',      n_tut_nuevos,
    'tutores_completados',  n_tut_compl,
    'mascotas_creadas',     n_mas_nuevos,
    'mascotas_completadas', n_mas_compl,
    'tratamientos',         n_trat,
    'vacunas',              n_vac,
    'repetidos',            n_repetidos,
    'omitidos',             v_omitidos
  );
end
$fn$;

-- Una función es ejecutable por PUBLIC por defecto. Sin JWT auth.uid() es
-- null y la primera comprobación ya la frena, pero dejarlo explícito es
-- más barato que confiar en eso.
revoke all on function public.aplicar_importacion(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_importacion(jsonb) to authenticated;
