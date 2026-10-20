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
  -- Los dos estados de deshecho se miran aparte para poder decir "ya se
  -- deshizo" y no un "ya se cerró" genérico, que es lo que la clínica
  -- necesita leer: restaurar v_anteriores encima de lo que ella escribió
  -- después del primer deshacer le borraría datos propios sin recuperación.
  if v_estado in ('deshecho', 'deshecho_parcial') then
    raise exception 'La importación % ya se deshizo', v_imp;
  end if;
  -- Y una importación que ya cerró por cualquier motivo tampoco se vuelve a
  -- aplicar. Este es el freno de la base contra un doble envío. No hay
  -- "tandas" que esta guarda pueda frenar contra sí mismas: paso4Escribir.jsx
  -- abre una fila nueva de `importaciones` en cada intento (su línea 48) y
  -- escribir.js manda el plan completo en un solo RPC (su línea 148, el único
  -- llamador del repo), así que toda llamada legítima llega sobre una fila
  -- recién creada en 'en_curso' y acá no estorba. Sin la guarda, reaplicar un
  -- plan sobre una fila en 'listo' vuelve a crear los tutores y las mascotas
  -- —ni crear_tutores ni crear_mascotas deduplican— e infla los contadores de
  -- resumen.escrito. Si algún día el plan se parte en varios envíos sobre el
  -- mismo importacion_id, esto se cambia por un id de envío; no se quita.
  if v_estado <> 'en_curso' then
    raise exception 'La importación % ya se cerró (estado %)', v_imp, v_estado;
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
      -- Si la respuesta HTTP se pierde después del commit, la clínica vuelve
      -- a correr el asistente y crear_tutores no tiene dedup: el tutor entra
      -- otra vez. Peor: este handler inserta el duplicado igualmente sin
      -- cédula y lo reporta como 'omitidos por cédula repetida', no como
      -- 'esto ya se hizo', así que el único índice que podía frenarlo queda
      -- neutralizado. Y no es solo de tutores: crear_mascotas tampoco
      -- deduplica, y ahí no hay ningún índice único que ni siquiera lo
      -- intente.
      --
      -- La guarda de v_estado de arriba NO alcanza contra este caso: el
      -- segundo intento abre una fila nueva de `importaciones` en 'en_curso'
      -- (paso4Escribir.jsx:48), así que llega limpia. Por la misma razón el
      -- conteo de `yaEscribio()` (escribir.js:123) tampoco lo tapa: cuenta
      -- por importacion_id, y sobre un id recién nacido siempre da 0 en las
      -- cuatro tablas —
      -- sirve contra un doble envío de la MISMA fila, no contra volver a
      -- correr el asistente. Lo que hoy frena el duplicado es que el paso 3
      -- recalcula el plan contra la base y empareja por cédula/nombre/
      -- teléfono. Cerrarlo acá pide un id de envío adentro del JSON, y eso es
      -- decisión del frontend; se está viendo aparte. (Revisión 2026-10-19)
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
    -- base" deje de ser cierto.
    --
    -- Salta en vez de reventar: `not exists` no distingue "la clínica borró
    -- ese cliente desde otra pestaña entre el paso 3 y el Confirmar" de
    -- "este id es de otra clínica", y el primer caso es el probable. Un
    -- cliente borrado no puede costar el import de los otros 179 — misma
    -- política que la cédula repetida de más arriba: el dato que ya no está
    -- cuesta un registro y queda dicho en el paso 4. El contador sigue
    -- exacto porque solo sube con v_toco.
    if not exists (select 1 from duenos where id = v_id and user_id = v_user) then
      v_omitidos := v_omitidos || jsonb_build_object(
        -- null::text y no null pelado: jsonb_build_object recibe "any" y un
        -- NULL sin tipo revienta con "could not determine polymorphic type".
        'que', 'tutor_no_encontrado', 'quien', v_id::text, 'valor', null::text);
      continue;
    end if;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- Lista blanca y no "lo que venga": el nombre del campo entra en un
      -- format() y de ahí a SQL. Y telefono NO está, por decisión y no por
      -- imposibilidad: es NOT NULL, pero sí puede quedar en '' —este mismo
      -- archivo lo escribe así unas líneas arriba, en el coalesce del insert
      -- de tutores nuevos— y un '' es un hueco perfectamente completable. No
      -- se completa porque un teléfono es el canal de contacto: si el archivo
      -- trae otro número, el paso 3 lo avisa y la clínica decide a mano. Ese
      -- aviso del paso 3 no es código muerto; es el único lugar donde se le
      -- dice "traés un teléfono para esta persona y no lo estoy escribiendo".
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

    -- Misma razón que en completar_tutores: una vez por mascota, con
    -- `not exists` y no con `found` después de un `execute`, y salta en vez
    -- de reventar porque el caso probable es una mascota borrada desde otra
    -- pestaña, no un id ajeno.
    if not exists (select 1 from mascotas where id = v_id and user_id = v_user) then
      v_omitidos := v_omitidos || jsonb_build_object(
        'que', 'mascota_no_encontrada', 'quien', v_id::text, 'valor', null::text);
      continue;
    end if;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- especie NO está, y por decisión, igual que duenos.telefono: es NOT
      -- NULL pero nada le impide estar en ''. Queda afuera porque el import
      -- nunca la deja así —crear_mascotas la escribe sin coalesce, así que
      -- una mascota sin especie resuelta ni entra— y completarla después
      -- sería adivinar perro o gato sobre una ficha que ya existe. (El spec
      -- la lista como completable; es un error del spec.)
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
        -- Dos `execute` y no un `case` con todos los campos adentro: en
        -- `execute ... using`, el tipo de cada $n lo pone la expresión que se
        -- le pasa, y un `case` tiene UN solo tipo de salida. Estaba con las
        -- cuatro columnas en el mismo `case`, todas las ramas de texto, así
        -- que $1 salía text — y edad_anios/edad_meses son integer
        -- (001_init.sql:25-26). Postgres no convierte text a integer en
        -- contexto de asignación: el update se cae con 42804 y, como acá no
        -- hay handler, se lleva el import entero. Y es la rama que más
        -- importa, porque es la que motivó 011: completarle la fecha de
        -- nacimiento y las dos edades a una mascota que ya estaba registrada
        -- con 0 y 0. Las edades van por su propio execute con ::int afuera del
        -- `case`, igual que el ::int con el que 014_deshacer_importacion.sql
        -- las restaura — esa asimetría era el bug.
        --
        -- Razonado contra el esquema y las reglas de coerción, no corrido: no
        -- hay Postgres a mano. Partido así da lo mismo si plpgsql tipa $1 por
        -- la expresión o si lo infiriera del destino; las dos lecturas quedan
        -- correctas, y eso es justo la razón de partirlo en vez de castear
        -- adentro del `case`.
        if v_campo in ('edad_anios', 'edad_meses') then
          execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
            using coalesce(v_valor, '0')::int, v_id, v_user;
        else
          execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
            -- fecha_nacimiento: misma razón que en crear_mascotas.
            -- '' no pasa el check de 011:74 y revienta el import.
            using (case when v_campo = 'fecha_nacimiento' then nullif(v_valor, '')
                        else v_valor end), v_id, v_user;
        end if;
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
  -- `anteriores` se agrega con ||, no se pisa: `= v_anteriores` reemplazaría
  -- el array entero, y lo que haya ahí es lo único con lo que deshacer puede
  -- devolver un campo completado a como estaba. Con la guarda de v_estado de
  -- arriba, una importación entra acá una sola vez y el array está vacío,
  -- así que hoy el || y el = darían lo mismo: se escribe || porque el que lo
  -- pise el día que eso cambie no se va a enterar hasta que alguien pida
  -- Deshacer y no vuelva nada.
  --
  -- Los contadores se suman al valor que ya estaba por la misma razón: el ||
  -- de jsonb reemplaza una clave repetida con el valor del lado derecho, así
  -- que escribirlos pelados sería pisar y no acumular. Se lee el acumulado
  -- con (resumen->'escrito'->>'clave')::int y se le suma lo de esta llamada;
  -- `omitidos` es un array y también se agrega con ||. Las dos columnas son
  -- `not null default` en 012:31 y 012:36, así que ningún || de acá puede
  -- anular la columna.
  --
  -- El `return` de abajo devuelve los números de ESTA llamada. Hoy coinciden
  -- con el acumulado —una llamada por fila— y es a propósito que no se lea el
  -- resumen para armarlo: leer el acumulado acá y el parcial allá era la
  -- fuente de confusión.
  update importaciones
     set estado     = 'listo',
         anteriores = anteriores || v_anteriores,
         -- Los números de la función van bajo 'escrito' y NO planos, por dos
         -- razones que se descubrieron juntas. La primera: `resumen` no es de
         -- esta función. El navegador escribe ahí lo que la clínica vio en el
         -- paso 3 ANTES de llamar, y es lo que la pantalla de historial lee
         -- para decir "53 tutores · 54 mascotas · 74 baños". Un
         -- jsonb_build_object plano reemplaza la columna entera y se lleva eso
         -- puesto. La segunda: `tratamientos` y `vacunas` son claves que
         -- existen en los dos lados, así que sumar plano suma la predicción
         -- del paso 3 con lo que de verdad se escribió y guarda 148 donde
         -- hubo 74. Con su propio namespace no hay colisión posible y el
         -- `||` de arriba conserva lo del paso 3. Misma forma que usa
         -- 014_deshacer_importacion.sql con la clave 'deshecho'.
         resumen    = resumen || jsonb_build_object('escrito', jsonb_build_object(
                        'tutores_creados',
                          coalesce((resumen->'escrito'->>'tutores_creados')::int, 0)      + n_tut_nuevos,
                        'tutores_completados',
                          coalesce((resumen->'escrito'->>'tutores_completados')::int, 0)  + n_tut_compl,
                        'mascotas_creadas',
                          coalesce((resumen->'escrito'->>'mascotas_creadas')::int, 0)     + n_mas_nuevos,
                        'mascotas_completadas',
                          coalesce((resumen->'escrito'->>'mascotas_completadas')::int, 0) + n_mas_compl,
                        'tratamientos',
                          coalesce((resumen->'escrito'->>'tratamientos')::int, 0)         + n_trat,
                        'vacunas',
                          coalesce((resumen->'escrito'->>'vacunas')::int, 0)              + n_vac,
                        'repetidos',
                          coalesce((resumen->'escrito'->>'repetidos')::int, 0)            + n_repetidos,
                        'omitidos',
                          coalesce(resumen->'escrito'->'omitidos', '[]'::jsonb)           || v_omitidos)),
         cerrado_en = now()
   where id = v_imp and user_id = v_user;

  -- Los números salen de la base, no de la predicción del paso 3. Es la
  -- diferencia entre "esto hice" y "esto creía que iba a hacer".
  -- Son los contadores de ESTA llamada y no una lectura del resumen que se
  -- acaba de escribir: si algún día el mismo importacion_id recibe más de una
  -- llamada, devolver el acumulado acá y el parcial en la pantalla daría el
  -- doble en la segunda.
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
