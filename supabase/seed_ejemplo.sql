-- ============================================================
-- VetaApp · Datos de ejemplo para probar la app
--
-- ANTES DE EJECUTAR: cambia el correo de la línea marcada por el de la
-- cuenta de VETERINARIA con la que vas a entrar. No uses la cuenta de
-- admin: esa entra al panel de administración y nunca ve estas pantallas.
--
-- Ejecutar en:  Supabase Dashboard → SQL Editor → New query
-- Requiere que 001, 002 y 003 ya estén aplicadas.
--
-- Es aditivo: si lo corres dos veces, duplica los datos. Al final hay un
-- bloque de limpieza comentado para volver a empezar.
-- ============================================================

do $$
declare
  -- ⬇️  CAMBIA ESTE CORREO  ⬇️
  v_email  text := 'cambia@este-correo.com';

  v_user   uuid;
  -- current_date sería UTC: en Supabase después de las 7 p.m. hora de
  -- Colombia ya devuelve el día siguiente, y la Caja de hoy saldría vacía.
  v_hoy    date := (now() at time zone 'America/Bogota')::date;
  d        bigint[];   -- ids de dueños
  m        bigint[];   -- ids de mascotas
  v_masc   bigint;
  i        int;
  j        int;
  n_dia    int;
  f_dia    date;
  v_serv   jsonb;
  v_sub    numeric;
  v_desc   numeric;
  v_hora   time;

  -- Catálogo para generar cobros variados. Peso: los primeros salen más.
  serv_nom  text[]    := array['Consulta general','Vacuna','Desparasitación','Baño y peluquería','Cirugía'];
  serv_pre  numeric[] := array[35000, 25000, 20000, 40000, 150000];
  metodos   text[]    := array['efectivo','transferencia','nequi','tarjeta','efectivo','nequi'];
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No hay ningún usuario con el correo "%". Cámbialo en la línea v_email.', v_email;
  end if;

  -- La cuenta admin entra al panel de administración y nunca ve estas
  -- pantallas (App.jsx: if (esAdmin) return <Admin />). Sembrarle datos
  -- sería trabajo invisible.
  if exists (select 1 from public.perfiles where id = v_user and rol = 'admin') then
    raise exception 'La cuenta "%" es admin: nunca ve las pantallas de la clínica. Usa el correo de una veterinaria.', v_email;
  end if;

  -- Semilla fija: los mismos datos cada vez que se corre.
  perform setseed(0.4272);

  -- ---------- DUEÑOS ----------
  -- El CTE devuelve solo las filas recién insertadas. Leer la tabla entera
  -- arrastraría dueños que la cuenta ya tuviera y correría los índices d[1..5].
  with ins as (
    insert into public.duenos (user_id, nombre, telefono, direccion) values
      (v_user, 'María Fernanda Ríos',  '3104457821', 'Cra. 45 #12-30, Laureles'),
      (v_user, 'Carlos Andrés Pineda', '3128890145', 'Calle 9 Sur #22-14, Envigado'),
      (v_user, 'Luisa Gómez Trujillo', '3016672290', 'Av. Poblado #10-55, Apto 402'),
      (v_user, 'Jorge Iván Restrepo',  '3201148876', 'Cra. 70 #44-18, Estadio'),
      (v_user, 'Sara Villegas Mora',   '3145520037', 'Calle 33 #76-09, Belén')
    returning id
  )
  select array_agg(id order by id) into d from ins;

  -- ---------- MASCOTAS ----------
  with ins as (
    insert into public.mascotas (user_id, nombre, especie, raza, edad_anios, edad_meses, peso, dueno_id) values
      (v_user, 'Luna',    'perro', 'Golden Retriever',   4, 2, 28.4, d[1]),
      (v_user, 'Simón',   'gato',  'Criollo',            2, 7,  4.1, d[1]),
      (v_user, 'Rocky',   'perro', 'Bulldog Francés',    5, 0, 12.8, d[2]),
      (v_user, 'Nube',    'gato',  'Siamés',             1, 4,  3.6, d[3]),
      (v_user, 'Toby',    'perro', 'Beagle',             7, 3, 15.2, d[3]),
      (v_user, 'Kira',    'perro', 'Pastor Alemán',      3, 9, 31.0, d[4]),
      (v_user, 'Pelusa',  'gato',  'Persa',              6, 1,  5.3, d[4]),
      (v_user, 'Max',     'perro', 'Criollo',            2, 0, 18.7, d[5])
    returning id
  )
  select array_agg(id order by id) into m from ins;

  -- ---------- INVENTARIO ----------
  -- Dos productos quedan por debajo del mínimo, para que se vean las alertas.
  insert into public.inventario (user_id, nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad) values
    (v_user, 'Vacuna Triple Felina',   'vacunas',      18,  8, 28000, 45000, 'dosis'),
    (v_user, 'Vacuna Antirrábica',     'vacunas',       6, 10, 12000, 25000, 'dosis'),
    (v_user, 'Amoxicilina 500mg',      'medicamentos', 42, 15,  1200,  3500, 'tableta'),
    (v_user, 'Meloxicam inyectable',   'medicamentos',  3, 10,  9500, 18000, 'ampolla'),
    (v_user, 'Antiparasitario interno','medicamentos', 25, 10,  6800, 14000, 'tableta'),
    (v_user, 'Shampoo medicado',       'insumos',      12,  5, 15000, 28000, 'frasco'),
    (v_user, 'Jeringa 5ml',            'insumos',     140, 50,   350,   900, 'unidad'),
    (v_user, 'Alimento renal felino',  'alimento',      9,  4, 52000, 89000, 'bolsa');

  -- ---------- HISTORIAS CLÍNICAS ----------
  insert into public.historias_clinicas (user_id, mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, peso, veterinario, notas) values
    (v_user, m[1], to_char(v_hoy - 12, 'YYYY-MM-DD'), 'Cojera pata trasera derecha', 'Distensión leve de ligamento', 'Reposo 10 días y antiinflamatorio', 'Meloxicam 1 amp', 28.4, 'Dr. Camilo Vega', 'Control en dos semanas.'),
    (v_user, m[3], to_char(v_hoy - 8,  'YYYY-MM-DD'), 'Rascado constante y piel roja', 'Dermatitis alérgica', 'Baño medicado semanal', 'Shampoo medicado', 12.8, 'Dra. Ana Salazar', 'El dueño reporta cambio de alimento reciente.'),
    (v_user, m[5], to_char(v_hoy - 5,  'YYYY-MM-DD'), 'Vómito y decaimiento', 'Gastroenteritis leve', 'Dieta blanda 3 días', 'Amoxicilina 500mg', 15.2, 'Dr. Camilo Vega', null),
    (v_user, m[6], to_char(v_hoy - 2,  'YYYY-MM-DD'), 'Control anual', 'Paciente sano', 'Refuerzo de vacunas', null, 31.0, 'Dra. Ana Salazar', 'Peso ideal, buena condición corporal.');

  -- ---------- VACUNAS ----------
  -- Con próxima dosis cercana, para que Recordatorios tenga contenido.
  insert into public.vacunas (user_id, mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario) values
    (v_user, m[1], 'Antirrábica',     to_char(v_hoy - 340, 'YYYY-MM-DD'), to_char(v_hoy + 4,  'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[3], 'Polivalente',     to_char(v_hoy - 355, 'YYYY-MM-DD'), to_char(v_hoy + 9,  'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[4], 'Triple Felina',   to_char(v_hoy - 180, 'YYYY-MM-DD'), to_char(v_hoy + 15, 'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[6], 'Antirrábica',     to_char(v_hoy - 2,   'YYYY-MM-DD'), to_char(v_hoy + 363,'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[8], 'Polivalente',     to_char(v_hoy - 200, 'YYYY-MM-DD'), to_char(v_hoy + 2,  'YYYY-MM-DD'), 'Dr. Camilo Vega');

  -- ---------- CITAS ----------
  insert into public.citas (user_id, mascota_id, veterinario, fecha, hora, motivo, estado) values
    (v_user, m[2], 'Dr. Camilo Vega',  to_char(v_hoy,     'YYYY-MM-DD'), '09:30', 'Control de peso',        'pendiente'),
    (v_user, m[7], 'Dra. Ana Salazar', to_char(v_hoy,     'YYYY-MM-DD'), '11:00', 'Baño y corte de uñas',   'pendiente'),
    (v_user, m[1], 'Dr. Camilo Vega',  to_char(v_hoy + 1, 'YYYY-MM-DD'), '15:00', 'Control de cojera',      'pendiente'),
    (v_user, m[5], 'Dra. Ana Salazar', to_char(v_hoy + 3, 'YYYY-MM-DD'), '10:15', 'Desparasitación',        'pendiente'),
    (v_user, m[4], 'Dr. Camilo Vega',  to_char(v_hoy - 1, 'YYYY-MM-DD'), '16:30', 'Vacunación',             'completada'),
    (v_user, m[8], 'Dra. Ana Salazar', to_char(v_hoy - 4, 'YYYY-MM-DD'), '08:45', 'Consulta general',       'completada');

  -- ---------- COBROS ----------
  -- 45 días hacia atrás: cubre la gráfica de 7 días y deja mes anterior
  -- completo para la comparación. Más movimiento entre semana que en
  -- domingo, que es como se comporta una clínica de verdad.
  if to_regclass('public.cobros') is null then
    raise notice 'Sin cobros: la tabla no existe todavía. Aplica 003_cobros.sql y vuelve a correr solo el bloque de limpieza + este archivo.';
  else
  for i in reverse 44..0 loop
    f_dia := v_hoy - i;

    n_dia := case extract(dow from f_dia)
               when 0 then floor(random() * 2)::int        -- domingo: 0-1
               when 6 then 1 + floor(random() * 3)::int     -- sábado: 1-3
               else        1 + floor(random() * 4)::int     -- resto: 1-4
             end;

    for j in 1..n_dia loop
      -- 1 o 2 servicios por cobro; la cirugía sale poco.
      v_serv := '[]'::jsonb;
      declare
        k int := case when random() < 0.06 then 5 else 1 + floor(random() * 4)::int end;
      begin
        v_serv := v_serv || jsonb_build_object('nombre', serv_nom[k], 'precio', serv_pre[k]);
        if random() < 0.35 then
          k := 1 + floor(random() * 3)::int;
          v_serv := v_serv || jsonb_build_object('nombre', serv_nom[k], 'precio', serv_pre[k]);
        end if;
      end;

      select coalesce(sum((e ->> 'precio')::numeric), 0) into v_sub
        from jsonb_array_elements(v_serv) e;

      -- Descuento ocasional del 10% o 15%.
      v_desc := case when random() < 0.15 then (array[10, 15])[1 + floor(random() * 2)::int] else 0 end;

      v_hora := time '08:00' + (floor(random() * 540) || ' minutes')::interval;

      -- La mascota se escoge ANTES del insert. Puesta dentro del where,
      -- random() es volátil y se evalúa fila por fila: cada mascota se
      -- compara contra un índice distinto y entran varias de golpe.
      v_masc := m[1 + floor(random() * array_length(m, 1))::int];

      insert into public.cobros (
        user_id, mascota_id, mascota_nombre, dueno_nombre,
        servicios, subtotal, descuento, total, metodo_pago, fecha
      )
      select
        v_user, ms.id, ms.nombre, du.nombre,
        v_serv, v_sub, v_desc, round(v_sub * (1 - v_desc / 100)),
        metodos[1 + floor(random() * array_length(metodos, 1))::int],
        (f_dia + v_hora) at time zone 'America/Bogota'
      from public.mascotas ms
      join public.duenos du on du.id = ms.dueno_id
      where ms.id = v_masc;
    end loop;
  end loop;
  end if;

  raise notice 'Datos de ejemplo creados para % (%)', v_email, v_user;
end $$;


-- ============================================================
-- LIMPIEZA · descomentar para borrar TODOS los datos de esa cuenta.
-- Ojo: borra lo real también, no solo lo de ejemplo.
-- ============================================================
-- do $$
-- declare v_user uuid;
-- begin
--   select id into v_user from auth.users where lower(email) = lower('cambia@este-correo.com');
--   delete from public.cobros              where user_id = v_user;
--   delete from public.citas               where user_id = v_user;
--   delete from public.vacunas             where user_id = v_user;
--   delete from public.historias_clinicas  where user_id = v_user;
--   delete from public.tratamientos        where user_id = v_user;
--   delete from public.inventario          where user_id = v_user;
--   delete from public.mascotas            where user_id = v_user;
--   delete from public.duenos              where user_id = v_user;
-- end $$;
