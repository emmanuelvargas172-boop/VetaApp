-- ============================================================
-- VetaApp · Datos de DEMOSTRACIÓN para mostrar a clínicas
--
-- Diferencia con seed_ejemplo.sql: ese sirve para probar la app; este es
-- para enseñarla. Por eso hay varias historias POR mascota (el perfil se
-- ve como una historia clínica de verdad, no una fila suelta), citas
-- repartidas por todo el mes (el calendario se ve con movimiento) y
-- tratamientos (la pantalla de Operaciones deja de estar vacía).
--
-- Ejecutar en:  Supabase Dashboard → SQL Editor → New query
-- Requiere 001 a 008 aplicadas.
--
-- Todas las fechas son relativas a hoy: la demo se ve fresca dentro de
-- tres meses sin volver a tocar el archivo.
-- ============================================================

do $$
declare
  v_email  text := 'emmanuelvargas1772@gmail.com';

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
    raise exception 'No hay ningún usuario con el correo "%". Revisa la línea v_email.', v_email;
  end if;

  -- La cuenta admin entra al panel de administración y nunca ve estas
  -- pantallas (App.jsx: if (esAdmin) return <Admin />). Sembrarle datos
  -- sería trabajo invisible.
  if exists (select 1 from public.perfiles where id = v_user and rol = 'admin') then
    raise exception 'La cuenta "%" es admin: nunca ve las pantallas de la clínica. Usa el correo de una veterinaria.', v_email;
  end if;

  -- Correr esto dos veces dejaría 24 mascotas y dos Lunas idénticas: una
  -- demo con datos repetidos se nota y desarma la venta. Para volver a
  -- empezar está el bloque de limpieza del final.
  if exists (select 1 from public.mascotas where user_id = v_user) then
    raise exception 'La cuenta "%" ya tiene mascotas. Corre primero el bloque de LIMPIEZA del final de este archivo.', v_email;
  end if;

  -- Semilla fija: los mismos cobros cada vez que se corre.
  perform setseed(0.4272);

  -- ---------- DUEÑOS ----------
  -- El CTE devuelve solo las filas recién insertadas. Leer la tabla entera
  -- arrastraría dueños que la cuenta ya tuviera y correría los índices d[1..8].
  with ins as (
    insert into public.duenos (user_id, nombre, telefono, direccion) values
      (v_user, 'María Fernanda Ríos',   '3104457821', 'Cra. 45 #12-30, Laureles'),
      (v_user, 'Carlos Andrés Pineda',  '3128890145', 'Calle 9 Sur #22-14, Envigado'),
      (v_user, 'Luisa Gómez Trujillo',  '3016672290', 'Av. Poblado #10-55, Apto 402'),
      (v_user, 'Jorge Iván Restrepo',   '3201148876', 'Cra. 70 #44-18, Estadio'),
      (v_user, 'Sara Villegas Mora',    '3145520037', 'Calle 33 #76-09, Belén'),
      (v_user, 'Andrés Felipe Cadavid', '3183304412', 'Cra. 80 #32-21, Floresta'),
      (v_user, 'Paula Andrea Zapata',   '3006658140', 'Calle 10 #43-77, Manila'),
      (v_user, 'Diego Alejandro Muñoz', '3122287905', 'Cra. 65 #98-12, Castilla')
    returning id
  )
  select array_agg(id order by id) into d from ins;

  -- ---------- MASCOTAS ----------
  -- Hay conejo y ave a propósito: en la demo se ven avatares de colores
  -- distintos y la clínica entiende de una que no es solo para perros.
  -- El código MASC-000n lo pone el trigger de 008, no se manda aquí.
  with ins as (
    insert into public.mascotas (user_id, nombre, especie, raza, edad_anios, edad_meses, peso, dueno_id) values
      (v_user, 'Luna',    'perro',  'Golden Retriever',  4, 2, 28.4, d[1]),
      (v_user, 'Simón',   'gato',   'Criollo',           2, 7,  4.1, d[1]),
      (v_user, 'Rocky',   'perro',  'Bulldog Francés',   5, 0, 12.8, d[2]),
      (v_user, 'Nube',    'gato',   'Siamés',            1, 4,  3.6, d[3]),
      (v_user, 'Toby',    'perro',  'Beagle',            7, 3, 15.2, d[3]),
      (v_user, 'Kira',    'perro',  'Pastor Alemán',     3, 9, 31.0, d[4]),
      (v_user, 'Pelusa',  'gato',   'Persa',             6, 1,  5.3, d[4]),
      (v_user, 'Max',     'perro',  'Criollo',           2, 0, 18.7, d[5]),
      (v_user, 'Copo',    'conejo', 'Mini Lop',          1, 2,  1.8, d[6]),
      (v_user, 'Nala',    'perro',  'Schnauzer',         8, 5,  8.9, d[6]),
      (v_user, 'Kiwi',    'ave',    'Periquito',         0, 9,  0.05, d[7]),
      (v_user, 'Zeus',    'perro',  'Labrador',          6, 7, 33.5, d[8])
    returning id
  )
  select array_agg(id order by id) into m from ins;

  -- ---------- INVENTARIO ----------
  -- Categorías y unidades salen de las listas de Operaciones.jsx:5-6
  -- (CATEGORIAS y UNIDADES). Si aquí se escribe 'vacunas' en minúscula o
  -- 'tableta', el filtro por categoría no encuentra el producto y el
  -- selector de unidad aparece en blanco al editarlo.
  -- Dos productos quedan en o por debajo del mínimo: se ven las alertas.
  insert into public.inventario (user_id, nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad) values
    (v_user, 'Vacuna Triple Felina',    'Vacunas',          18,  8, 28000, 45000, 'frasco'),
    (v_user, 'Vacuna Antirrábica',      'Vacunas',           6, 10, 12000, 25000, 'frasco'),
    (v_user, 'Amoxicilina 500mg',       'Medicamentos',     42, 15,  1200,  3500, 'caja'),
    (v_user, 'Meloxicam inyectable',    'Medicamentos',      3, 10,  9500, 18000, 'ampolla'),
    (v_user, 'Antiparasitario interno', 'Antiparasitarios', 25, 10,  6800, 14000, 'caja'),
    (v_user, 'Shampoo medicado',        'Otros',            12,  5, 15000, 28000, 'frasco'),
    (v_user, 'Jeringa 5ml',             'Accesorios',      140, 50,   350,   900, 'unidad'),
    (v_user, 'Alimento renal felino',   'Alimentos',         9,  4, 52000, 89000, 'unidad'),
    (v_user, 'Collar isabelino M',      'Accesorios',        0,  3,  8000, 16000, 'unidad');

  -- ---------- HISTORIAS CLÍNICAS ----------
  -- Varias por mascota y en orden cronológico: al abrir a Luna se ve la
  -- consulta, el control y el alta. Eso es lo que convence al veterinario,
  -- no una fila suelta. El peso baja o sube entre visitas a propósito.
  insert into public.historias_clinicas (user_id, mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, peso, veterinario, notas) values
    -- Luna: cojera → control → alta
    (v_user, m[1],  to_char(v_hoy - 96, 'YYYY-MM-DD'), 'Vacunación anual y examen general',   'Paciente sano',                     'Refuerzo antirrábica',                  null,                        27.9, 'Dr. Camilo Vega',  'Condición corporal ideal.'),
    (v_user, m[1],  to_char(v_hoy - 12, 'YYYY-MM-DD'), 'Cojera pata trasera derecha',          'Distensión leve de ligamento',      'Reposo 10 días y antiinflamatorio',     'Meloxicam 1 amp',           28.4, 'Dr. Camilo Vega',  'Se le pide al dueño evitar escaleras.'),
    (v_user, m[1],  to_char(v_hoy - 3,  'YYYY-MM-DD'), 'Control de cojera',                    'Mejoría evidente, apoya la pata',   'Suspender antiinflamatorio',            null,                        28.2, 'Dr. Camilo Vega',  'Retomar paseos cortos desde el lunes.'),

    -- Rocky: dermatitis, el caso crónico
    (v_user, m[3],  to_char(v_hoy - 61, 'YYYY-MM-DD'), 'Rascado y enrojecimiento de piel',     'Dermatitis alérgica',               'Baño medicado semanal',                 'Shampoo medicado',          13.1, 'Dra. Ana Salazar', 'Coincide con cambio de alimento.'),
    (v_user, m[3],  to_char(v_hoy - 33, 'YYYY-MM-DD'), 'Control dermatitis',                   'Lesiones en disminución',           'Continuar baño medicado',               'Shampoo medicado',          12.9, 'Dra. Ana Salazar', 'Se recomienda dieta hipoalergénica.'),
    (v_user, m[3],  to_char(v_hoy - 8,  'YYYY-MM-DD'), 'Rebrote leve en abdomen',              'Dermatitis alérgica recurrente',    'Antihistamínico 7 días',                'Amoxicilina 500mg',         12.8, 'Dra. Ana Salazar', 'Confirmar si volvió al alimento anterior.'),

    -- Toby: el adulto mayor con seguimiento
    (v_user, m[5],  to_char(v_hoy - 120,'YYYY-MM-DD'), 'Chequeo geriátrico',                   'Sobrepeso leve',                    'Plan de dieta y caminatas',             null,                        16.4, 'Dr. Camilo Vega',  'Se cita control en 3 meses.'),
    (v_user, m[5],  to_char(v_hoy - 30, 'YYYY-MM-DD'), 'Control de peso',                      'Reducción de 900 g',                'Continuar plan',                        null,                        15.5, 'Dr. Camilo Vega',  'El dueño cumple la dieta.'),
    (v_user, m[5],  to_char(v_hoy - 5,  'YYYY-MM-DD'), 'Vómito y decaimiento',                 'Gastroenteritis leve',              'Dieta blanda 3 días',                   'Amoxicilina 500mg',         15.2, 'Dr. Camilo Vega',  null),

    -- Nube: la gata joven
    (v_user, m[4],  to_char(v_hoy - 74, 'YYYY-MM-DD'), 'Primera consulta',                     'Paciente sano',                     'Esquema de vacunación iniciado',        null,                         3.2, 'Dra. Ana Salazar', 'Gata de interior.'),
    (v_user, m[4],  to_char(v_hoy - 19, 'YYYY-MM-DD'), 'Estornudos y ojo lloroso',             'Rinotraqueítis leve',               'Lisina 10 días',                        null,                         3.6, 'Dra. Ana Salazar', 'Aislar de otros gatos por ahora.'),

    -- Kira, Pelusa, Max, Nala, Zeus: casos sueltos pero completos
    (v_user, m[6],  to_char(v_hoy - 2,  'YYYY-MM-DD'), 'Control anual',                        'Paciente sano',                     'Refuerzo de vacunas',                   null,                        31.0, 'Dra. Ana Salazar', 'Peso ideal, buena condición corporal.'),
    (v_user, m[7],  to_char(v_hoy - 44, 'YYYY-MM-DD'), 'Bolas de pelo y vómito ocasional',     'Tricobezoar',                       'Malta felina y cepillado diario',       null,                         5.3, 'Dr. Camilo Vega',  'Raza de pelo largo, requiere rutina.'),
    (v_user, m[8],  to_char(v_hoy - 27, 'YYYY-MM-DD'), 'Herida en almohadilla',                'Laceración superficial',            'Limpieza y vendaje, revisión a 5 días', 'Amoxicilina 500mg',         18.7, 'Dra. Ana Salazar', 'Se cortó con vidrio en la calle.'),
    (v_user, m[8],  to_char(v_hoy - 22, 'YYYY-MM-DD'), 'Retiro de vendaje',                    'Cicatrización completa',            'Alta',                                  null,                        18.7, 'Dra. Ana Salazar', null),
    (v_user, m[10], to_char(v_hoy - 15, 'YYYY-MM-DD'), 'Mal aliento y sarro',                  'Enfermedad periodontal grado 2',    'Profilaxis dental programada',          null,                         8.9, 'Dr. Camilo Vega',  'Se agenda limpieza con anestesia.'),
    (v_user, m[12], to_char(v_hoy - 9,  'YYYY-MM-DD'), 'Chequeo previo a cirugía',             'Apto para procedimiento',           'Ayuno 12 horas',                        null,                        33.5, 'Dr. Camilo Vega',  'Exámenes prequirúrgicos normales.'),
    (v_user, m[9],  to_char(v_hoy - 6,  'YYYY-MM-DD'), 'Revisión de dientes',                  'Sobrecrecimiento dental leve',      'Limado y heno a voluntad',              null,                         1.8, 'Dra. Ana Salazar', 'Control en un mes.');

  -- ---------- VACUNAS ----------
  -- Varias con próxima dosis entre 2 y 15 días: así Recordatorios abre con
  -- lista llena y se puede mostrar el botón de WhatsApp en la demo.
  insert into public.vacunas (user_id, mascota_id, nombre, fecha_aplicacion, proxima_dosis, veterinario) values
    (v_user, m[1],  'Antirrábica',   to_char(v_hoy - 340, 'YYYY-MM-DD'), to_char(v_hoy + 4,   'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[1],  'Polivalente',   to_char(v_hoy - 200, 'YYYY-MM-DD'), to_char(v_hoy + 165, 'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    -- Esta vence HOY: es la que Recordatorios pinta en rojo con el botón de
    -- WhatsApp. Sin ninguna a 0 días, la demo no puede mostrar ese botón.
    (v_user, m[2],  'Triple Felina', to_char(v_hoy - 365, 'YYYY-MM-DD'), to_char(v_hoy,       'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[3],  'Polivalente',   to_char(v_hoy - 355, 'YYYY-MM-DD'), to_char(v_hoy + 9,   'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[4],  'Triple Felina', to_char(v_hoy - 180, 'YYYY-MM-DD'), to_char(v_hoy + 15,  'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[5],  'Antirrábica',   to_char(v_hoy - 300, 'YYYY-MM-DD'), to_char(v_hoy + 12,  'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[6],  'Antirrábica',   to_char(v_hoy - 2,   'YYYY-MM-DD'), to_char(v_hoy + 363, 'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[7],  'Leucemia Felina', to_char(v_hoy - 170,'YYYY-MM-DD'), to_char(v_hoy + 20, 'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[8],  'Polivalente',   to_char(v_hoy - 200, 'YYYY-MM-DD'), to_char(v_hoy + 2,   'YYYY-MM-DD'), 'Dr. Camilo Vega'),
    (v_user, m[10], 'Antirrábica',   to_char(v_hoy - 358, 'YYYY-MM-DD'), to_char(v_hoy + 6,   'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[12], 'Polivalente',   to_char(v_hoy - 120, 'YYYY-MM-DD'), to_char(v_hoy + 245, 'YYYY-MM-DD'), 'Dra. Ana Salazar'),
    (v_user, m[12], 'Antirrábica',   to_char(v_hoy - 350, 'YYYY-MM-DD'), to_char(v_hoy + 14,  'YYYY-MM-DD'), 'Dr. Camilo Vega');

  -- ---------- CITAS ----------
  -- Repartidas por todo el mes, no solo esta semana: en el calendario se
  -- ven puntos en casi todos los días y la pantalla no se ve estrenada.
  --
  -- Los estados son los cuatro de Citas.jsx:14-19: pendiente, confirmada,
  -- atendida, cancelada. La base no los valida, así que un 'completada'
  -- entraría sin quejarse y después saldría sin color y fuera de todos los
  -- filtros. Las pasadas quedan atendidas o canceladas: una agenda donde
  -- todo sigue pendiente delata que los datos son inventados.
  insert into public.citas (user_id, mascota_id, veterinario, fecha, hora, motivo, estado) values
    (v_user, m[2],  'Dr. Camilo Vega',  to_char(v_hoy,      'YYYY-MM-DD'), '09:30', 'Control de peso',           'confirmada'),
    (v_user, m[7],  'Dra. Ana Salazar', to_char(v_hoy,      'YYYY-MM-DD'), '11:00', 'Baño y corte de uñas',      'confirmada'),
    (v_user, m[11], 'Dr. Camilo Vega',  to_char(v_hoy,      'YYYY-MM-DD'), '14:00', 'Revisión de plumaje',       'pendiente'),
    (v_user, m[1],  'Dr. Camilo Vega',  to_char(v_hoy + 1,  'YYYY-MM-DD'), '15:00', 'Control de cojera',         'confirmada'),
    (v_user, m[10], 'Dra. Ana Salazar', to_char(v_hoy + 2,  'YYYY-MM-DD'), '08:30', 'Profilaxis dental',         'pendiente'),
    (v_user, m[5],  'Dra. Ana Salazar', to_char(v_hoy + 3,  'YYYY-MM-DD'), '10:15', 'Desparasitación',           'pendiente'),
    (v_user, m[12], 'Dr. Camilo Vega',  to_char(v_hoy + 4,  'YYYY-MM-DD'), '07:30', 'Cirugía programada',        'confirmada'),
    (v_user, m[3],  'Dra. Ana Salazar', to_char(v_hoy + 6,  'YYYY-MM-DD'), '16:00', 'Control dermatitis',        'pendiente'),
    (v_user, m[9],  'Dra. Ana Salazar', to_char(v_hoy + 8,  'YYYY-MM-DD'), '09:00', 'Control dental',            'pendiente'),
    (v_user, m[6],  'Dr. Camilo Vega',  to_char(v_hoy + 11, 'YYYY-MM-DD'), '11:30', 'Vacunación',                'pendiente'),
    (v_user, m[4],  'Dr. Camilo Vega',  to_char(v_hoy - 1,  'YYYY-MM-DD'), '16:30', 'Vacunación',                'atendida'),
    (v_user, m[8],  'Dra. Ana Salazar', to_char(v_hoy - 4,  'YYYY-MM-DD'), '08:45', 'Consulta general',          'atendida'),
    (v_user, m[1],  'Dr. Camilo Vega',  to_char(v_hoy - 6,  'YYYY-MM-DD'), '10:00', 'Control de cojera',         'atendida'),
    (v_user, m[7],  'Dr. Camilo Vega',  to_char(v_hoy - 9,  'YYYY-MM-DD'), '13:15', 'Consulta por vómito',       'atendida'),
    (v_user, m[11], 'Dra. Ana Salazar', to_char(v_hoy - 12, 'YYYY-MM-DD'), '15:45', 'Corte de uñas',             'cancelada'),
    (v_user, m[3],  'Dra. Ana Salazar', to_char(v_hoy - 15, 'YYYY-MM-DD'), '09:15', 'Baño medicado',             'atendida'),
    (v_user, m[10], 'Dr. Camilo Vega',  to_char(v_hoy - 18, 'YYYY-MM-DD'), '11:45', 'Consulta odontológica',     'atendida'),
    (v_user, m[12], 'Dra. Ana Salazar', to_char(v_hoy - 21, 'YYYY-MM-DD'), '08:00', 'Exámenes prequirúrgicos',   'atendida'),
    (v_user, m[5],  'Dr. Camilo Vega',  to_char(v_hoy - 24, 'YYYY-MM-DD'), '17:00', 'Control de peso',           'cancelada'),
    (v_user, m[2],  'Dra. Ana Salazar', to_char(v_hoy - 28, 'YYYY-MM-DD'), '10:30', 'Desparasitación',           'atendida');

  -- ---------- TRATAMIENTOS ----------
  -- Los tipos son los cuatro del check de 001: vacunacion, desparasitacion,
  -- bano, consulta. Cualquier otra palabra hace fallar el insert entero.
  insert into public.tratamientos (user_id, mascota_id, tipo, fecha, hora, notas) values
    (v_user, m[1],  'desparasitacion', to_char(v_hoy - 40, 'YYYY-MM-DD'), '10:00', 'Antiparasitario interno, dosis por peso'),
    (v_user, m[3],  'bano',            to_char(v_hoy - 15, 'YYYY-MM-DD'), '09:15', 'Baño medicado por dermatitis'),
    (v_user, m[3],  'bano',            to_char(v_hoy - 8,  'YYYY-MM-DD'), '09:30', 'Segundo baño medicado'),
    (v_user, m[5],  'desparasitacion', to_char(v_hoy - 30, 'YYYY-MM-DD'), '11:00', null),
    (v_user, m[6],  'vacunacion',      to_char(v_hoy - 2,  'YYYY-MM-DD'), '12:00', 'Refuerzo antirrábica'),
    (v_user, m[7],  'bano',            to_char(v_hoy - 21, 'YYYY-MM-DD'), '14:30', 'Corte de nudos, gato de pelo largo'),
    (v_user, m[8],  'consulta',        to_char(v_hoy - 27, 'YYYY-MM-DD'), '16:00', 'Herida en almohadilla'),
    (v_user, m[10], 'consulta',        to_char(v_hoy - 15, 'YYYY-MM-DD'), '11:45', 'Valoración odontológica'),
    (v_user, m[12], 'consulta',        to_char(v_hoy - 9,  'YYYY-MM-DD'), '08:00', 'Prequirúrgico'),
    (v_user, m[4],  'vacunacion',      to_char(v_hoy - 1,  'YYYY-MM-DD'), '16:30', 'Triple felina, primera dosis del año');

  -- ---------- COBROS ----------
  -- 45 días hacia atrás: cubre la gráfica de 7 días y deja el mes anterior
  -- completo para la comparación. Más movimiento entre semana que en
  -- domingo, que es como se comporta una clínica de verdad.
  if to_regclass('public.cobros') is null then
    raise notice 'Sin cobros: la tabla no existe todavía. Aplica 003_cobros.sql.';
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

  raise notice 'Demo creada para % (%): 8 dueños, 12 mascotas, 18 historias, 12 vacunas, 20 citas, 10 tratamientos, 9 productos.', v_email, v_user;
end $$;


-- ============================================================
-- LIMPIEZA · descomentar para borrar TODOS los datos de esa cuenta
-- y poder volver a sembrar la demo.
-- Ojo: borra lo real también, no solo lo de ejemplo.
-- ============================================================
-- do $$
-- declare v_user uuid;
-- begin
--   select id into v_user from auth.users where lower(email) = lower('emmanuelvargas1772@gmail.com');
--   delete from public.avisos              where user_id = v_user;
--   delete from public.cobros              where user_id = v_user;
--   delete from public.citas               where user_id = v_user;
--   delete from public.vacunas             where user_id = v_user;
--   delete from public.historias_clinicas  where user_id = v_user;
--   delete from public.tratamientos        where user_id = v_user;
--   delete from public.inventario          where user_id = v_user;
--   delete from public.mascotas            where user_id = v_user;
--   delete from public.duenos              where user_id = v_user;
-- end $$;
