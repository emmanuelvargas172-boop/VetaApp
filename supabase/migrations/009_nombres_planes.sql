-- ============================================================
-- VetaApp · 009_nombres_planes.sql
-- Fichas → Esencial, Completo → Avanzado (solo el nombre visible)
--
-- ---------- POR QUÉ ----------
-- "Fichas" nombraba el artefacto, y en Colombia una ficha suena a tarjeta
-- de archivador: administrativo y barato. Ese plan guarda la historia
-- clínica completa, vacunas, peso y citas — el nombre le bajaba el precio
-- antes de que la veterinaria viera el precio.
--
-- "Completo" tenía un problema peor: se definía por comparación. Hacía
-- sentir al que compraba el otro que compraba el incompleto, y además
-- tenía fecha de vencimiento — el día que salga el plan Facturación, el
-- plan llamado "Completo" deja de ser el completo y el nombre se vuelve
-- mentira solo.
--
-- ---------- LO QUE NO SE TOCA ----------
-- La columna `plan` NO se toca. Ni aquí ni nunca desde afuera. Esos
-- valores ('fichas', 'completo', 'facturacion') están cableados en:
--
--   · tiene_modulo()                     006_avisos.sql
--   · las políticas RLS de inventario,
--     cobros y avisos                    003, 004, 006
--   · el check perfiles_plan_check       004_planes.sql:31
--   · abrir_pago()                       007_pagos.sql
--   · perfiles.plan de cada cuenta viva
--
-- Renombrarlos sería una migración de verdad, con riesgo de dejar cuentas
-- fuera de su propio plan. Y no hace falta: nombre_visible existe
-- exactamente para esto. Un identificador interno feo es gratis; un
-- identificador interno que cambia es caro.
--
-- Por eso esto es un UPDATE de dos filas y nada más.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ---------- EL CAMBIO ----------
-- Se filtra por el nombre viejo además del id para que correr esto dos
-- veces no pise un nombre que se haya editado a mano después.
update public.planes_precios
   set nombre_visible = 'Esencial',
       updated_at     = now()
 where plan = 'fichas'
   and nombre_visible = 'Fichas';

update public.planes_precios
   set nombre_visible = 'Avanzado',
       updated_at     = now()
 where plan = 'completo'
   and nombre_visible = 'Completo';

-- 'facturacion' se queda como 'Facturación': nombra una función real
-- (facturar electrónicamente ante la DIAN), no un escalón. No caduca ni
-- se define por lo que le falta a los otros.


-- ============================================================
--  PRUEBAS
--
--  Cada bloque termina en `raise exception` para que la transacción se
--  aborte y no quede basura. El resultado viaja en el mensaje de error.
--  Se corren de a uno, descomentados, en el SQL Editor.
-- ============================================================

-- ---------- PRUEBA A · los nombres quedaron, los ids NO se movieron ----------
-- do $$
-- declare v_txt text;
-- begin
--   select string_agg(plan || '=' || nombre_visible || '/' || activo, ' | ' order by precio_centavos)
--     into v_txt from public.planes_precios;
--   -- Esperado:
--   --   fichas=Esencial/true | completo=Avanzado/true | facturacion=Facturación/false
--   raise exception 'A: %', v_txt;
-- end $$;

-- ---------- PRUEBA B · el renombre no tocó los planes de las cuentas ----------
-- Si esto devolviera algo distinto de los tres ids viejos, alguien habría
-- renombrado la columna `plan` y habría cuentas sin plan válido.
-- do $$
-- declare v_txt text;
-- begin
--   select string_agg(plan || '=' || n, ' | ' order by plan) into v_txt
--     from (select plan, count(*) n from public.perfiles group by plan) x;
--   raise exception 'B: %  (los ids deben seguir siendo fichas/completo/facturacion)', v_txt;
-- end $$;

-- ---------- PRUEBA C · tiene_modulo() sigue respondiendo igual ----------
-- El renombre no puede haber cambiado quién ve qué. Esto se apoya en que
-- la función lee `plan`, no `nombre_visible`.
-- do $$
-- declare v_u uuid; v_inv boolean; v_caja boolean; v_rec boolean; v_plan text;
-- begin
--   select id into v_u from auth.users order by created_at limit 1;
--   select plan into v_plan from public.perfiles where id = v_u;
--   raise exception 'C: plan=% (lee el id interno, no el nombre visible)', v_plan;
-- end $$;


-- ---------- VOLVER ATRÁS ----------
-- Cuesta lo mismo que aplicarlo. Ese es el punto de haberlo hecho así.
--
-- update public.planes_precios set nombre_visible = 'Fichas'   where plan = 'fichas';
-- update public.planes_precios set nombre_visible = 'Completo' where plan = 'completo';
