# Gastos y utilidad · diseño

Qué entró, qué salió y qué quedó, dentro de Caja y Reportes.

Escrito el 2026-10-08. Nace de una pregunta del dueño: *"quiero que me diga
cuánto invertí, cuánto generó la veterinaria y cuánto me queda a mí"*.

---

## 1. El problema

La app sabe lo que la clínica **cobra** (`cobros`) y lo que tiene **quieto en
bodega** (`inventario.precio_compra × cantidad`). No sabe nada de lo que
gasta: no hay arriendo, ni sueldos, ni compras al proveedor, ni servicios.

Sin gastos no hay utilidad. Y el número que sí se puede calcular hoy —el
valor del inventario— no es la inversión: es lo que **no** se ha vendido.
Vender bien lo hace bajar. Presentarlo como "lo que invertí" sería un número
que empeora cuando al negocio le va mejor.

Entonces: tabla nueva, o no hay respuesta.

---

## 2. Decisiones tomadas

Cuatro preguntas, cuatro respuestas del dueño. Todo lo demás se deriva de
aquí.

| Pregunta | Respuesta |
|---|---|
| ¿Qué cuenta como inversión? | **Todo lo que sale de la caja** — proveedor, arriendo, sueldos, servicios |
| ¿Arriendo y sueldos? | **Fijos aparte, se repiten solos** |
| ¿Tu sueldo? | **Se lo paga aparte**: es un gasto fijo más, y lo que sobra después es utilidad del negocio |
| ¿Dónde vive? | Pestaña nueva en **Caja y Reportes** |

La ubicación la escogió el asistente por delegación explícita. Razones: los
ingresos ya viven en esa pantalla, así que `entró − salió` se calcula sin
saltar; el módulo `caja` ya existe en `tiene_modulo()` y gatea el plan sin
código nuevo; y no suma un octavo ítem a un menú que ya tiene siete.

---

## 3. Por qué plantilla + materializar, y no las otras dos

El requisito "los fijos se repiten solos" tiene tres implementaciones. Se
escogió la primera.

**A · Plantilla que se materializa en filas reales.** `gastos_fijos` guarda
la regla; al abrir la pestaña se insertan las filas que falten en `gastos`.
Una vez generada, la fila es editable como cualquier otra, y el histórico
queda congelado.

**B · Plantilla que se suma al vuelo, sin filas.** Menos código, imposible
duplicar. Rechazada: no deja corregir un mes puntual, y subir el arriendo
hoy **reescribiría el valor de todos los meses pasados**. Un número
financiero que cambia el pasado no sirve para decidir nada.

**C · `pg_cron` que inserta el día 1.** Rechazada: el proyecto no tiene hoy
ni un solo job programado. Infraestructura nueva que falla callado, para
resolver algo que la pestaña puede hacer al abrirse.

---

## 4. Datos — migración `011_gastos.sql`

### `gastos_fijos` — la regla, no la plata

```
nombre        text           'Arriendo local', 'Sueldo Marcela'
categoria     text           check contra la lista de gastos
monto         numeric(12,2)  check (monto > 0)
dia_del_mes   int            check (dia_del_mes between 1 and 28)
desde         date           primer mes en que aplica
hasta         date           null = sigue vigente
activo        boolean
```

`dia_del_mes` tope **28**, no 31: con 31 el arriendo de febrero no existe y
habría que inventar una regla de corrimiento. Con 28 el problema no nace.

`hasta` en vez de borrar: si se despide a alguien en junio, se cierra la
plantilla con `hasta` y mayo sigue valiendo lo que valió. Borrarla borraría
el pasado.

### `gastos` — la plata que salió

```
fecha        date
categoria    text           check (arriendo, sueldos, sueldo_dueno,
                                   proveedor, servicios, impuestos,
                                   mantenimiento, otros)
descripcion  text
monto        numeric(12,2)  check (monto > 0)
fijo_id      bigint         references gastos_fijos(id) on delete set null
anulado      boolean        default false
```

**`fecha` es `date`, no `text`.** Rompe con `citas`, `tratamientos` y
`vacunas`, que guardan texto. Se hace a propósito: esta tabla se agrupa por
mes en todas las consultas, y con `text` eso obliga a `substring` en cada
una. La consistencia con una decisión vieja no vale una consulta peor en
todas las nuevas.

**`sueldo_dueno` es una categoría, no una tabla.** Es exactamente lo que
pidió el dueño: su sueldo es un gasto fijo más. Las dos cifras que quiere
ver salen de filtrar por esa categoría, sin estructura extra.

**`fijo_id` recuerda de dónde salió la fila**, con índice único parcial:

```sql
create unique index idx_gastos_fijo_mes
  on public.gastos (user_id, fijo_id, (date_trunc('month', fecha)))
  where fijo_id is not null;
```

El mes es `date_trunc('month', fecha)`, no una columna aparte: una columna
podría quedar desalineada de la fecha al editarla. Eso impide que abrir
la pestaña en dos del navegador genere el arriendo dos veces: la segunda
choca contra el índice. Si se borra la plantilla, el gasto ya generado
sobrevive con `fijo_id` en null — el pasado no depende de la regla.

**`anulado` existe por un error que casi se cuela.** La primera versión de
este diseño decía que borrar una fila generada impedía que volviera. Es
falso: el índice único solo bloquea duplicados mientras la fila existe, así
que al borrarla el hueco queda libre y la siguiente generación la mete otra
vez. El dueño diría "este mes no pagué arriendo" y al día siguiente estaría
ahí de nuevo.

Por eso las filas generadas **no se borran, se anulan**: dejan de sumar, se
ven tachadas, y siguen ocupando su lugar en el índice. El botón dice "Este
mes no lo pagué", no "Eliminar". El borrado de verdad queda solo para los
gastos sueltos (`fijo_id is null`), que nadie genera y por tanto no pueden
volver.

### RLS

Igual que `cobros` en `004_planes.sql:101`:

```sql
using (auth.uid() = user_id and public.esta_activo() and public.tiene_modulo('caja'))
```

Plan Avanzado. Un plan Esencial ve ceros, no un error: con `USING` en falso,
Postgres devuelve cero filas en silencio y un `insert` sí falla con `42501`.
Así se comporta ya el resto de la app.

---

## 5. Generación de los fijos

Función `generar_gastos_fijos()`, que la pestaña llama al abrirse. No es un
cron: corre cuando alguien entra.

Por cada plantilla activa recorre los meses entre `desde` y el mes actual, e
inserta la fila que falte. El `on conflict do nothing` contra el índice único
la hace idempotente: correrla diez veces deja lo mismo que correrla una.

**El mes en curso solo se genera si `dia_del_mes` ya pasó.** El arriendo
vence el 5; si hoy es 3, no se inserta. `gastos` es *plata que ya salió*, y
anotar el día 1 un pago que no se ha hecho es inventar un movimiento.

El costo de esa decisión es que la utilidad del mes en curso se ve mejor de
lo que va a terminar. Se compensa en pantalla con una línea aparte —
*"Fijos que faltan este mes: $X"*— que nunca deja aparecer el número
optimista solo. Sin esa línea, la opción A mentiría a principio de mes igual
que la B mentía sobre el pasado.

**El mes que nadie abrió.** Si no se entra en marzo y se vuelve en mayo, al
abrir se generan marzo, abril y mayo. Por eso recorre meses y no solo el
actual. Tope de 12 meses hacia atrás: sin tope, una plantilla con `desde` en
2020 generaría sesenta filas la primera vez.

**El monto se copia, no se referencia.** La fila guarda el monto que tenía la
plantilla el día que se generó. Se sube el arriendo en julio y junio sigue
diciendo lo que decía. Eso es lo que hace que el histórico aguante.

---

## 6. API

`frontend/src/api/axios.js` no habla con un backend: es un shim que traduce
rutas REST a llamadas del cliente de Supabase. Las pantallas creen que hay un
API; hay Postgres y RLS. Las rutas nuevas siguen ese patrón.

```
GET    /gastos?desde=&hasta=   lista del periodo, anulados aparte
POST   /gastos                 gasto suelto
PATCH  /gastos/:id             corregir monto o fecha, o anular
DELETE /gastos/:id             solo si fijo_id is null
GET    /gastos/fijos           plantillas
POST   /gastos/fijos           nueva plantilla
PATCH  /gastos/fijos/:id       cambiar monto, o cerrar con `hasta`
POST   /gastos/generar         llama a generar_gastos_fijos()
```

`DELETE` valida `fijo_id is null` en el cliente **y** en la base. El del
cliente es para dar buen mensaje; el que manda es el de la base, porque el
cliente se puede saltar.

El resumen del mes **no es una ruta**: es `GET /cobros` (ya existe) más
`GET /gastos`, restados en la pantalla. No vale una vista SQL para restar dos
números, y así el periodo elegido aplica a los dos lados sin coordinar nada.

---

## 7. La pantalla

Caja y Reportes pasa de dos pestañas a tres: Caja · Reportes · **Gastos**.

```
┌──────────────────┬──────────────────┬──────────────────┐
│ ENTRÓ            │ SALIÓ            │ QUEDÓ            │
│ $8.450.000       │ $6.120.000       │ $2.330.000       │
│ 47 cobros        │ 23 gastos        │ margen 27%       │
└──────────────────┴──────────────────┴──────────────────┘
   Tu sueldo este mes: $1.500.000  ·  ya incluido en "salió"
   Fijos que faltan: $800.000 (arriendo, vence el 5)
```

**"Entró / Salió / Quedó", no "Ingresos / Egresos / Utilidad".** El cliente
es una veterinaria, no un contador. "Utilidad" obliga a explicar; "quedó" no.

**El sueldo del dueño va bajo "salió", no al lado de "quedó".** Son las dos
cifras que pidió, pero la aclaración *"ya incluido"* existe para que nadie
las sume: sin ella alguien lee 2.330.000 + 1.500.000 y cree que le quedaron
3.8 millones.

**"Fijos que faltan" solo aparece en el mes en curso.** En un mes cerrado no
falta nada, y un cero ahí es ruido.

**El margen se esconde si "entró" es cero.** Dividir por cero da `Infinity`,
y todo mes empieza en cero. Es el bug que saldría el primero de cada mes.

Debajo, la lista: fecha, categoría, descripción, monto. Los anulados salen
tachados y al final, no desaparecidos: si no se ven, nadie entiende por qué
el arriendo no suma.

Aparte, la sección **Gastos fijos** con las plantillas y lo que cada una
cuesta al mes.

### Lo que no entra en pantalla

El valor del inventario (`precio_compra × cantidad`) **no** aparece como
"lo que invertí", por lo dicho en §1: baja cuando se vende bien.

La inversión real en mercancía se ve por el otro lado: cada compra al
proveedor entra como gasto de categoría `proveedor`, con su fecha, y eso sí
se acumula.

Si más adelante se quiere mostrar, va como tarjeta aparte y con nombre
propio —*"Plata quieta en bodega"*— y nunca dentro del cálculo de lo que
quedó. Queda fuera de este alcance.

---

## 8. Verificación

**No hay con qué probar automáticamente.** El proyecto no tiene corredor de
pruebas: `frontend/package.json` solo trae `dev`, `build` y `preview`, y no
existe un solo archivo `.test.`. Montar Vitest es otra tarea, no esta.

Lo que sí existe es la costumbre de las migraciones: `006_avisos.sql` trae un
bloque de autoprueba que corre en una transacción y hace rollback al final.
`011_gastos.sql` lleva el suyo, y prueba las tres cosas que pueden fallar
calladas:

1. Correr `generar_gastos_fijos()` dos veces deja el mismo número de filas.
2. Anular una fila generada y volver a generar **no** la revive.
3. Con el plan en `fichas`, un `insert` en `gastos` falla con `42501`.

La tercera es la que de verdad importa: es la que impide que el plan Esencial
vea las finanzas que paga el Avanzado.

---

## 9. Lo que hay que tocar además del código

**La demo.** `seed_demo.sql` no siembra gastos, así que la pestaña nueva
abriría vacía justo al mostrarle la app a una clínica. Hay que sembrar
plantillas y gastos sueltos de los últimos tres meses, y agregarlos a
`refrescar_demo.sql` para que no envejezcan como envejecieron las citas.

**Los textos de venta.** `docs/guion-de-venta.md:158-166` dice que la
diferencia entre planes son exactamente tres módulos —inventario, caja y
recordatorios— y advierte *"No inventes uno más"*. Esto no inventa uno más:
mete gastos dentro de `caja`. Pero sí cambia lo que esa palabra promete, y el
libreto de precio pasa de

> "Avanzado es lo mismo más caja, inventario y los recordatorios de vacunas."

a algo como

> "Avanzado le dice además cuánto entró, cuánto salió y cuánto le quedó."

Hay que actualizar `guion-de-venta.md`, `speech-en-clinica.md` y el
comparador de planes de la landing **en el mismo cambio**. Si la pantalla se
despliega y los textos quedan viejos, se promete de menos — o peor, dos
documentos dicen cosas distintas.

**Lo que sigue sin poderse prometer.** Esto no es contabilidad: no hay IVA,
ni retenciones, ni DIAN. Es cuánto entró y cuánto salió de la caja. Si en una
clínica preguntan si sirve para la declaración, la respuesta es no — y es la
misma oportunidad de siempre: *"¿y hoy con qué la hacen?"*

---

## 10. Fuera de alcance

- Vitest y pruebas de frontend.
- La tarjeta de "plata quieta en bodega" (§7).
- Descontar del inventario la compra al proveedor: hoy la cantidad se ajusta
  a mano y eso no lo cambia este diseño.
- Cualquier cosa con IVA, retenciones o DIAN.
- Botón de "regenerar" una fila anulada: se decidió dejarlo fuera, se
  reconsidera si estorba al usarlo.
