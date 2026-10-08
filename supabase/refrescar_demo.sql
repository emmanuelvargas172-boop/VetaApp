-- ============================================================
-- VetaApp · Vuelve a fechar la demo a partir de HOY
--
-- Los datos sembrados envejecen: seed_demo.sql fecha todo relativo al día
-- en que se corre, así que a los dos días Citas abre en el filtro "Hoy" y
-- se ve vacía, el Calendario queda sin nada por delante y Recordatorios
-- muestra cero — justo delante de la clínica.
--
-- Esto reescribe las tres pantallas que dependen del calendario:
--   1. citas         → la agenda de Citas
--   2. tratamientos  → lo que pinta el Calendario (NO lee citas)
--   3. vacunas       → la próxima dosis que mira Recordatorios
--
-- Mascotas, dueños, historias, cobros e inventario no se tocan.
--
-- Correr antes de cada salida a ofrecer.
-- Supabase Dashboard → SQL Editor → New query → pegar → Run.
-- ============================================================

do $$
declare
  v_email text := 'emmanuelvargas1772@gmail.com';
  v_user  uuid;
  -- current_date sería UTC: después de las 7 p.m. hora de Colombia ya
  -- devuelve el día siguiente, y "Hoy" saldría corrido un día.
  v_hoy   date := (now() at time zone 'America/Bogota')::date;
  v_citas int;
  v_trat  int;
  v_vac   int;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No hay ningún usuario con el correo "%".', v_email;
  end if;

  if not exists (select 1 from public.mascotas where user_id = v_user) then
    raise exception 'Esa cuenta no tiene mascotas. Corre seed_demo.sql primero.';
  end if;

  -- ---------- 1. CITAS ----------
  -- Las mascotas se buscan por nombre, no por id: los ids cambian cada vez
  -- que se vuelve a sembrar, los nombres no. Eso vale para los tres bloques.
  --
  -- Los estados son los cuatro de Citas.jsx:14-19: pendiente, confirmada,
  -- atendida, cancelada. La base no los valida, así que un 'completada'
  -- entraría sin quejarse y después saldría sin color y fuera de todos los
  -- filtros.
  delete from public.citas where user_id = v_user;

  insert into public.citas (user_id, mascota_id, veterinario, fecha, hora, motivo, estado)
  select v_user, ms.id, x.vet, to_char(v_hoy + x.dias, 'YYYY-MM-DD'), x.hora, x.motivo, x.estado
  from (values
      ('Simón',  'Dr. Camilo Vega',    0, '09:30', 'Control de peso',         'confirmada'),
      ('Pelusa', 'Dra. Ana Salazar',   0, '11:00', 'Baño y corte de uñas',    'confirmada'),
      ('Kiwi',   'Dr. Camilo Vega',    0, '14:00', 'Revisión de plumaje',     'pendiente'),
      ('Luna',   'Dr. Camilo Vega',    1, '15:00', 'Control de cojera',       'confirmada'),
      ('Nala',   'Dra. Ana Salazar',   2, '08:30', 'Profilaxis dental',       'pendiente'),
      ('Toby',   'Dra. Ana Salazar',   3, '10:15', 'Desparasitación',         'pendiente'),
      ('Zeus',   'Dr. Camilo Vega',    4, '07:30', 'Cirugía programada',      'confirmada'),
      ('Rocky',  'Dra. Ana Salazar',   6, '16:00', 'Control dermatitis',      'pendiente'),
      ('Copo',   'Dra. Ana Salazar',   8, '09:00', 'Control dental',          'pendiente'),
      ('Kira',   'Dr. Camilo Vega',   11, '11:30', 'Vacunación',              'pendiente'),
      ('Nube',   'Dr. Camilo Vega',   -1, '16:30', 'Vacunación',              'atendida'),
      ('Max',    'Dra. Ana Salazar',  -4, '08:45', 'Consulta general',        'atendida'),
      ('Luna',   'Dr. Camilo Vega',   -6, '10:00', 'Control de cojera',       'atendida'),
      ('Pelusa', 'Dr. Camilo Vega',   -9, '13:15', 'Consulta por vómito',     'atendida'),
      ('Kiwi',   'Dra. Ana Salazar', -12, '15:45', 'Corte de uñas',           'cancelada'),
      ('Rocky',  'Dra. Ana Salazar', -15, '09:15', 'Baño medicado',           'atendida'),
      ('Nala',   'Dr. Camilo Vega',  -18, '11:45', 'Consulta odontológica',   'atendida'),
      ('Zeus',   'Dra. Ana Salazar', -21, '08:00', 'Exámenes prequirúrgicos', 'atendida'),
      ('Toby',   'Dr. Camilo Vega',  -24, '17:00', 'Control de peso',         'cancelada'),
      ('Simón',  'Dra. Ana Salazar', -28, '10:30', 'Desparasitación',         'atendida')
    ) as x(mascota, vet, dias, hora, motivo, estado)
  join public.mascotas ms on ms.user_id = v_user and ms.nombre = x.mascota;

  get diagnostics v_citas = row_count;

  -- ---------- 2. TRATAMIENTOS (el Calendario) ----------
  -- El Calendario NO lee citas: lee /tratamientos (Calendario.jsx:178).
  -- Son dos tablas distintas, y por eso llenar Citas no llena el mes.
  --
  -- Solo hay CUATRO tipos permitidos por la base (001_init.sql:78):
  -- vacunacion, desparasitacion, bano, consulta. El selector del Calendario
  -- ofrece además cirugia, emergencia y control — esos tres los rechaza el
  -- check y aquí no se usan.
  --
  -- Los días van de -18 a +21 para que el mes se vea ocupado hacia atrás y
  -- hacia adelante sin importar en qué día del mes caiga la visita.
  delete from public.tratamientos where user_id = v_user;

  insert into public.tratamientos (user_id, mascota_id, tipo, fecha, hora, notas)
  select v_user, ms.id, x.tipo, to_char(v_hoy + x.dias, 'YYYY-MM-DD'), x.hora, x.notas
  from (values
      -- Hoy: el Calendario abre con el día marcado y no vacío.
      ('Pelusa', 'bano',            0, '11:00', 'Baño y corte de uñas'),
      ('Simón',  'consulta',        0, '09:30', 'Control de peso'),
      -- Por delante
      ('Luna',   'consulta',        1, '15:00', 'Control de cojera'),
      ('Nala',   'consulta',        2, '08:30', 'Revisión antes de la profilaxis'),
      ('Toby',   'desparasitacion', 3, '10:15', 'Desparasitación interna'),
      ('Kira',   'vacunacion',      4, '11:30', 'Refuerzo antirrábica'),
      ('Max',    'bano',            5, '14:00', 'Baño sencillo'),
      ('Rocky',  'consulta',        6, '16:00', 'Control de dermatitis'),
      ('Nube',   'vacunacion',      7, '09:45', 'Triple felina, segunda dosis'),
      ('Copo',   'consulta',        8, '09:00', 'Revisión de dientes'),
      ('Zeus',   'desparasitacion',10, '08:00', 'Desparasitación externa'),
      ('Kiwi',   'consulta',       12, '14:30', 'Revisión de plumaje'),
      ('Luna',   'bano',           14, '10:30', 'Baño medicado'),
      ('Pelusa', 'vacunacion',     16, '11:15', 'Leucemia felina'),
      ('Toby',   'consulta',       18, '16:45', 'Control de peso'),
      ('Simón',  'desparasitacion',21, '09:15', 'Desparasitación interna'),
      -- Por detrás: el mes se ve trabajado, no recién estrenado.
      ('Nube',   'vacunacion',     -1, '16:30', 'Primera dosis aplicada'),
      ('Max',    'consulta',       -4, '08:45', 'Retiro de vendaje'),
      ('Luna',   'consulta',       -6, '10:00', 'Control de cojera'),
      ('Rocky',  'bano',          -10, '09:15', 'Baño medicado semanal'),
      ('Nala',   'consulta',      -13, '11:45', 'Consulta odontológica'),
      ('Zeus',   'desparasitacion',-18, '08:30', 'Desparasitación de rutina')
    ) as x(mascota, tipo, dias, hora, notas)
  join public.mascotas ms on ms.user_id = v_user and ms.nombre = x.mascota;

  get diagnostics v_trat = row_count;

  -- ---------- 3. VACUNAS (Recordatorios) ----------
  -- Recordatorios.jsx pinta por días restantes: 0 = "Hoy" en rojo y con el
  -- botón de WhatsApp, hasta 7 rojo, hasta 15 amarillo, el resto verde. El
  -- filtro abre en 30 días, así que todo lo que pase de 30 no se ve de una.
  -- Por eso hay una en 0: sin ella la demo no puede mostrar el WhatsApp.
  --
  -- Esto borra y vuelve a insertar en vez de hacer UPDATE sobre las que ya
  -- están. La primera versión actualizaba emparejando (mascota, vacuna), y
  -- eso falla en silencio: si un nombre no coincide exacto, esa fila se
  -- queda con la fecha vieja, el UPDATE no se queja, y Recordatorios sigue
  -- vacío sin ninguna pista de por qué. Insertar de cero no puede fallar a
  -- medias. Los avisos ya enviados no se pierden: avisos.vacuna_id es
  -- `on delete set null` (006_avisos.sql:23) y guarda copia del nombre y el
  -- teléfono.
  --
  -- La fecha de aplicación va un año antes de la próxima, porque una vacuna
  -- "aplicada" después de su propio refuerzo se ve mal en la ficha.
  delete from public.vacunas where user_id = v_user;

  insert into public.vacunas (user_id, mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario)
  select v_user, ms.id, x.vacuna,
         to_char(v_hoy + x.dias - 365, 'YYYY-MM-DD'),
         to_char(v_hoy + x.dias,       'YYYY-MM-DD'),
         x.vet
  from (values
      ('Simón',  'Triple Felina',    'Dra. Ana Salazar',   0),  -- hoy → rojo + WhatsApp
      ('Max',    'Polivalente',      'Dr. Camilo Vega',    2),
      ('Luna',   'Antirrábica',      'Dr. Camilo Vega',    4),
      ('Nala',   'Antirrábica',      'Dra. Ana Salazar',   6),
      ('Rocky',  'Polivalente',      'Dra. Ana Salazar',   9),
      ('Toby',   'Antirrábica',      'Dr. Camilo Vega',   12),
      ('Zeus',   'Antirrábica',      'Dr. Camilo Vega',   15),
      ('Nube',   'Triple Felina',    'Dra. Ana Salazar',  20),
      ('Pelusa', 'Leucemia Felina',  'Dr. Camilo Vega',   26),
      -- Estas tres quedan lejos a propósito: si todas estuvieran vencidas
      -- la pantalla parecería una clínica en crisis, no una al día.
      ('Kira',   'Antirrábica',      'Dra. Ana Salazar', 165),
      ('Zeus',   'Polivalente',      'Dra. Ana Salazar', 245),
      ('Luna',   'Polivalente',      'Dr. Camilo Vega',  363)
    ) as x(mascota, vacuna, vet, dias)
  join public.mascotas ms on ms.user_id = v_user and ms.nombre = x.mascota;

  get diagnostics v_vac = row_count;

  raise notice 'Demo al día (%): % citas, % eventos de calendario, % vacunas refechadas.',
    v_hoy, v_citas, v_trat, v_vac;
end $$;


-- ============================================================
-- COMPROBAR — sale solo, no hay que correr nada aparte
-- ============================================================
-- El `raise notice` de arriba no se ve en el SQL Editor de Supabase: la
-- pantalla solo dice "Success. No rows returned" y uno se queda sin saber
-- si quedó bien. Este select sí se ve, y es lo que hay que mirar antes de
-- salir a la clínica.
--
-- Lo que debe salir:
--   citas hoy        3
--   calendario hoy   2
--   calendario mes   depende del día, nunca 0
--   vacunas hoy      1     ← la de Simón, la roja con botón de WhatsApp
--   vacunas en 30    9
-- Un 0 donde no debería, es que ese bloque no encontró las mascotas por
-- nombre: corre seed_demo.sql primero.
with u as (
  select id from public.perfiles where lower(email) = 'emmanuelvargas1772@gmail.com'
), h as (
  select (now() at time zone 'America/Bogota')::date as d
)
select 'citas hoy'      as pantalla, count(*) from public.citas c, u, h
  where c.user_id = u.id and c.fecha = to_char(h.d, 'YYYY-MM-DD')
union all
select 'calendario hoy', count(*) from public.tratamientos t, u, h
  where t.user_id = u.id and t.fecha = to_char(h.d, 'YYYY-MM-DD')
union all
select 'calendario mes', count(*) from public.tratamientos t, u, h
  where t.user_id = u.id and t.fecha like to_char(h.d, 'YYYY-MM') || '%'
union all
select 'vacunas hoy',    count(*) from public.vacunas v, u, h
  where v.user_id = u.id and v.proxima_dosis = to_char(h.d, 'YYYY-MM-DD')
union all
select 'vacunas en 30',  count(*) from public.vacunas v, u, h
  where v.user_id = u.id
    and v.proxima_dosis >= to_char(h.d,      'YYYY-MM-DD')
    and v.proxima_dosis <= to_char(h.d + 30, 'YYYY-MM-DD');
