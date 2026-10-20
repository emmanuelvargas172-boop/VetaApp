# Importador de base de clientes · diseño

Que la clínica suba su propio archivo de clientes y la app lo integre, sin
que nadie toque una terminal.

Escrito el 2026-10-15. Nace de un pedido del dueño: *"un apartado en donde
los dueños de la veterinaria cuando quieran subir una base de datos la
puedan hacer y el mismo software se los integre"*.

---

## 1. El problema

Hoy esto existe, pero no sirve para una clínica.

`importar/armar-sql.mjs` son 731 líneas que **corre Emmanuel** en su
terminal, y que escupen un `.sql` que **él** pega en el SQL Editor de
Supabase. Funcionó: la base de La Huella entró completa — 53 tutores, 54
mascotas, 74 baños y desparasitaciones, 13 vacunas.

Pero el camino es ese porque estábamos escribiendo en la cuenta de **otra
persona**. Las políticas de `001_init.sql` son `auth.uid() = user_id`: sin
clave de servicio, nadie escribe en la cuenta ajena desde el navegador, y
por eso hubo que pasar por el SQL Editor, que corre como `postgres`.

**Cuando la clínica sube sus propios datos, ese problema no existe.** Ella
está logueada, las filas son suyas, RLS la deja. No hace falta backend ni
clave de servicio: el importador entero cabe en el navegador.

Y hay una consecuencia que vale más que la comodidad. El archivo trae
cédulas y direcciones de casa de clientes de ella. Si nunca sale del
navegador, no hay servidor nuestro del que se pueda filtrar.

---

## 2. Decisiones tomadas

Cinco preguntas, cinco respuestas del dueño. Todo lo demás se deriva de
aquí.

| Pregunta | Respuesta |
|---|---|
| ¿Qué formatos llegan de verdad? | **Excel/Sheets y PDF con texto adentro.** Nada de escaneados |
| ¿Quién lo usa y cuándo? | **La clínica sola, cuando quiera**, sin Emmanuel al lado |
| ¿Qué entra? | **Lo que el archivo traiga** — tutores, mascotas e historial |
| ¿Qué pasa con los que ya existen? | **Completar lo vacío, nunca pisar lo lleno; si hay duda, preguntar** |
| ¿Se puede deshacer? | **Sí, cuando sea**, con el valor anterior guardado |

Y una de secuencia: **Excel primero, PDF en una segunda etapa.**

### Por qué Excel primero

La parte difícil no es leer el archivo. Es el mapeo de columnas, la vista
previa, el emparejado y el deshacer — y todo eso es idéntico venga de
Excel o de PDF. Con Excel resuelto, el PDF es un lector nuevo enchufado a
una pantalla que ya funciona y que el dueño ya vio funcionando.

Al revés, el día que falle no se sabe si falló el detector de tablas o el
emparejado.

Además, un PDF no tiene columnas: tiene palabras con una coordenada X y
una Y. Reconstruir la tabla es adivinar dónde empieza cada columna midiendo
espacios en blanco, y eso falla distinto en cada PDF — nombres largos que
invaden la columna de al lado, direcciones en dos renglones, encabezados
repetidos por página. No es "leer un PDF": es escribir un detector de
tablas.

### Por qué "lo que el archivo traiga" no es peligroso

El dueño eligió la opción más ambiciosa. Se vuelve segura con **una** regla,
que es parte del diseño y no un detalle de la interfaz:

> La app nunca crea nada que la clínica no haya visto antes en una pantalla.

Lee, decide qué puede armar, y lo muestra en números concretos. Hasta que
no le den Confirmar, no toca la base. No existe un botón que salte del
paso 1 al 4.

---

## 3. Los cuatro pasos

Vive en **Configuración → Importar base de clientes**. Atrás siempre
disponible. Nada se escribe hasta el paso 4.

### Paso 1 · El archivo

Suelta el `.xlsx` / `.xls` / `.csv`. Si el libro tiene varias hojas, se
muestran con **cuántas filas con datos** tiene cada una.

El conteo es de filas con datos, no de filas. La hoja de La Huella venía
estirada hasta la 155 con 101 vacías: decir "155 filas" es mentir, y la
clínica elegiría la hoja equivocada confiando en ese número.

Acá también se chequea la suscripción (ver §7).

### Paso 2 · Las columnas

La app adivina por el encabezado y muestra lo que entendió, con ejemplos
reales del archivo al lado — "Columna 7" no le dice nada a nadie:

```
Columna del archivo            →  Campo en VetaApp        Ejemplo
Nombre y apellidos del Tutor   →  Nombre del dueño   ✓    "German Ana Villamizar"
Cedula                         →  Cédula             ✓    "1000000004"
Contacto telefonos (2)         →  Teléfono           ✓    "3000000043 - 3000000045"
Raza                           →  Raza               ✓    "Poodle"
Otras observaciones            →  No importar        ▾    "Muy nervioso con el secador"
```

Cada fila es un desplegable. Lo que no reconoce entra como **No importar**,
nunca como basura.

**Mínimo para seguir:** nombre del tutor y nombre de la mascota. Sin esos
dos no hay nada que crear; el botón queda apagado diciendo cuál falta.

### Paso 3 · Qué va a pasar

Acá se juega todo. Números concretos antes de tocar nada:

```
Voy a crear          53 tutores · 54 mascotas
Ya existen            2 tutores → les completo cédula y dirección
Tengo dudas           1 caso → decidilo abajo
No voy a importar     3 filas → mirá por qué

⚠ "Nube" tiene una vacuna el 2026-07-14, anterior a su nacimiento (2026-09-17).
   La fecha de nacimiento está mal. La importo sin fecha.

⚠ Fila 35: el teléfono dice "0". WhatsApp le va a quedar apagado.

❓ "Teofilo Arboleda Rueda" ya existe con el teléfono 3000000010.
   El archivo trae otra con el teléfono 3000000028.
   [ Es la misma ]   [ Son dos personas distintas ]
```

**Las filas descartadas se muestran, no se esconden.** Una fila con
teléfono y costo pero sin nombres es una visita que se cobró; hacerla
desaparecer en silencio es el peor error posible de este módulo.

**Los avisos no bloquean.** Solo frena lo del paso 2. Cincuenta y tres
clientes sin fecha de nacimiento siguen siendo cincuenta y tres clientes.

### Paso 4 · Confirmar

Escribe (§7). Al terminar: qué quedó, **Deshacer esta importación** ahí
mismo, y la misma opción después en la lista de importaciones.

---

## 4. Dónde vive el código

De los seis bloques de `armar-sql.mjs`, **dos** son lógica pura y se van a
un núcleo compartido. Los otros cuatro son terminal y SQL y se quedan.

```
frontend/src/importador/
  nucleo/              ← lo comparten el navegador Y el script de terminal
    normalizar.js        telefonos, fechaISO, pesos, clasificar, sinTildes
    mapear.js            adivinar qué columna es cuál
    agrupar.js           filas sueltas → tutores / mascotas / eventos
    plan.js              lo agrupado + lo que ya hay en la base → qué hacer
  leerXlsx.js          ← solo navegador (SheetJS)
  escribir.js          ← solo navegador (supabase-js)
  Importar.jsx         ← los cuatro pasos

importar/armar-sql.mjs ← se queda, importa del núcleo, sigue generando SQL
```

El núcleo va dentro de `frontend/src/` y no en una carpeta aparte: así Vite
lo compila sin configuración, y `armar-sql.mjs` —que es ESM— lo importa con
una ruta relativa. Cero cambios de setup.

**Qué no cruza al navegador:** `q` y `qNoNulo`, que arman comillas de SQL.
En el navegador se escribe con parámetros. Efecto práctico: un cliente
llamado **O'Brien** no rompe nada ni abre un agujero. En el script ese
apóstrofe sí hay que escaparlo; en la app no existe el problema.

### Tres cosas que hay que arreglar al mover

Están en el archivo hoy. No son opinión.

**a) Estado global** (líneas 125, 140, 279):

```js
const avisos = [];
let fechasVistas = 0, fechasRotas = 0;
const razasDesconocidas = new Set();
```

En un script da igual: corre una vez y se muere. En el navegador **no se
muere**. Importa un archivo, sale, importa otro sin recargar — y el segundo
arranca con las advertencias del primero y los contadores inflados. Se ve
así: "47 cosas para revisar" en un archivo limpio de 10 filas. Se arregla
pasando todo eso en un objeto por corrida.

**b) La fecha de hoy está clavada** (línea 50):

```js
const HOY = new Date(2026, 9, 15); // 15/10/2026
```

Hoy es 15/10/2026, así que corriendo el script hoy está bien **de
casualidad**. En la app tiene que ser la fecha real, o en marzo toda mascota
importada queda con la edad que tenía en octubre. Y es silencioso: nadie
mira una edad y dice "esa está cinco meses atrasada".

**c) El freno de formato llama a `process.exit(1)`.** En el navegador no hay
proceso que matar. Pasa a ser un estado del paso 3: dice que no reconoció
el formato de fecha, muestra cinco ejemplos, y deja seguir **sin fechas**.

### Lo que gana el script de terminal

Hoy arreglar el teléfono `"0"` o agregar una raza sería arreglarlo en un
lado y dejarlo roto en el otro, sin que nadie se entere hasta que a una
clínica le quede el WhatsApp apagado. Con el núcleo compartido se arregla
una vez.

---

## 5. Cómo decide

### Contra qué se compara

Antes del paso 3 el navegador se trae los tutores y mascotas que la cuenta
ya tiene —solo las columnas que sirven para emparejar: `id`, `nombre`,
`telefono`, `cedula`, y de las mascotas `id`, `dueno_id`, `nombre`—. Para
una clínica de 300 clientes son unos pocos cientos de kilobytes.

Pasando las ~5.000 fichas eso deja de ser gratis. En ese caso se consulta
contra la base por tandas en vez de traerlo todo. No se diseña ahora: no
hay ninguna clínica cerca de ese tamaño, y el límite queda anotado para
cuando aparezca.

### Emparejar tutores

Tres niveles de certeza. Solo el tercero pregunta.

**Seguro, es la misma persona**

1. **Misma cédula.** Dos personas no comparten cédula.
2. **Mismo nombre + mismo teléfono**, sin cédula en ninguno de los dos.

**Seguro, es alguien nuevo.** No coincide por ninguna de las dos.

**Dudoso, pregunta**

3. **Mismo nombre, teléfono distinto, ninguno con cédula.** El caso de las
   dos "Teofilo Arboleda" de la base de La Huella, que son dos personas.
4. **Misma cédula, nombre completamente distinto.** Eso no es un parecido,
   es un error: o la cédula está mal tecleada o es de otra persona.

**Por defecto queda marcado "son dos personas distintas".** Si le dan
Confirmar sin leer, el resultado son dos fichas repetidas que se pueden
juntar después. Al revés —unir a dos clientes que no son el mismo— deja
una sola ficha con el historial de dos animales adentro, y eso no se
desarma. Equivocarse duplicando se arregla; equivocarse uniendo, no.

El teléfono con varios números nunca se compara crudo: primero se parte y
se normaliza, y se empareja contra el **primero**, que es el que usa el
recordatorio de WhatsApp.

### Completar

Solo escribe donde hay vacío:

| Tabla | Campos |
|---|---|
| `duenos` | `cedula`, `direccion`, `telefono2` |
| `mascotas` | `raza`, `fecha_nacimiento`, `especie`, `edad_anios`, `edad_meses` |

**`duenos.telefono` no está en la lista**: es `NOT NULL`, siempre tiene
algo, así que completarlo es imposible por definición. Si el archivo trae
otro número, no lo cambia — lo avisa en el paso 3:

> ⚠ Jorge Rueda ya tiene el teléfono 3000000021. El archivo trae
> 3000000001. Dejo el que ya estaba.

`edad_anios` / `edad_meses` solo se tocan si el archivo trae **fecha de
nacimiento**, porque ahí la edad deja de ser un dato tecleado y pasa a ser
una resta. Sin fecha, no se toca nada.

### Emparejar mascotas

Dentro de un tutor ya emparejado, por nombre sin tildes ni mayúsculas.
Mismo tutor + mismo nombre = la misma. Distinto nombre = una nueva.

Eso deja **Noah** y **Noah Emiliano** separados, que es lo que el dueño
decidió cuando se le preguntó. La app no adivina que uno es el apodo del
otro, y está bien que no lo haga.

### Subir dos veces el mismo archivo

Tutores y mascotas se emparejan solos con lo de arriba. El problema son los
**eventos** —baños, vacunas, desparasitaciones—, que no tienen nada que los
identifique. Sin regla, el mismo archivo dos veces deja **148 baños donde
hubo 74**: historial duplicado e informe de caja con el doble de servicios.

Regla: **misma mascota + mismo tipo + misma fecha = ya está.**

Costo conocido: si la clínica bañó al mismo perro dos veces el mismo día, el
segundo se pierde. Se acepta — es rarísimo y se arregla a mano en diez
segundos. El caso contrario es frecuente y es un desastre para limpiar.

Resultado: **subir el mismo archivo dos veces no hace nada.** El paso 3
dice "0 para crear, 0 para completar", y esa es la respuesta correcta.

---

## 6. Migración 012 · de dónde salió cada fila

### El hallazgo que cambia el "deshacer"

En `001_init.sql`:

```sql
mascotas.dueno_id             → duenos(id)    on delete cascade
citas.mascota_id              → mascotas(id)  on delete cascade
vacunas.mascota_id            → mascotas(id)  on delete cascade
tratamientos.mascota_id       → mascotas(id)  on delete cascade
historias_clinicas.mascota_id → mascotas(id)  on delete cascade
```

**Todo está en cascada.** Borrar un dueño importado borra sus mascotas, y
borrar una mascota borra su historia clínica, vacunas, citas y tratamientos
— **incluido lo que la clínica escribió después del import**.

El escenario: importa en octubre, atiende a "Killer" seis veces, le escribe
la historia, le agenda cita. En marzo entra a Importaciones, le da
Deshacer para limpiar algo, y **se va el trabajo de cinco meses**. Sin
aviso, porque la cascada la hace Postgres en silencio.

Entonces **deshacer no es borrar**: es borrar solo lo que no tiene nada
encima, y frenar en lo demás mostrándoselo.

### La tabla

```sql
create table if not exists public.importaciones (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  archivo     text not null,          -- "Base Clientes.xlsx"
  hoja        text,                   -- "Respuestas de formulario 1"
  estado      text not null default 'en_curso'
              check (estado in ('en_curso','listo','deshecho',
                                'deshecho_parcial','fallido')),
  mapeo       jsonb not null default '{}'::jsonb,
  resumen     jsonb not null default '{}'::jsonb,
  anteriores  jsonb not null default '[]'::jsonb,
  creado_en   timestamptz not null default now(),
  cerrado_en  timestamptz
);

alter table public.duenos       add column if not exists importacion_id bigint
  references public.importaciones(id) on delete set null;
-- igual en mascotas, tratamientos, vacunas
```

`on delete set null` a propósito: si algún día se borra el registro de la
importación, **los datos se quedan**. Se pierde el rastro, no los clientes.

RLS igual que las otras siete tablas: `auth.uid() = user_id`, `for all`.

### Para qué sirve cada columna

- **`mapeo`** — sube el mismo archivo actualizado en tres meses y la app le
  propone el mapeo de la vez pasada en vez de hacerla elegir de nuevo.
- **`resumen`** — lo que vio en el paso 3, guardado. Seis meses después
  puede volver a leer *por qué* "Nube" quedó sin fecha de nacimiento, en
  vez de pensar que la app se la comió.
- **`anteriores`** — el valor que tenía cada campo que el import
  **completó**. Sin esto, deshacer deja a medias lo modificado:
  ```json
  [{ "tabla": "duenos", "id": 41, "campo": "cedula", "antes": null }]
  ```
- **`estado`** — la fila se crea en `'en_curso'` **antes** de escribir nada.
  Un import que nadie registró no se puede ni diagnosticar ni limpiar.

### Deshacer, el procedimiento

1. Busca todo con `importacion_id = X`.
2. De cada mascota, mira si tiene historia, vacunas, citas o tratamientos
   **que no sean de ese import**.
3. Lo limpio, lo borra.
4. Lo que tiene cosas encima, **no lo toca** y lo dice:
   > "3 mascotas no las borré: Killer tiene 6 consultas y 2 citas escritas
   > después del import. Si las borro, eso se va también. [Ver cuáles]"
5. **Si una mascota se queda, su dueño también se queda**, aunque el dueño
   esté limpio. No es una elección: `mascotas.dueno_id` es `NOT NULL`, y
   borrar al dueño arrastraría a la mascota por la cascada — justo la que
   se acaba de decidir conservar.
6. Restaura `anteriores`.
7. Marca `estado = 'deshecho'`. Si quedaron cosas sin borrar, el registro
   lo dice: un "deshecho" parcial se tiene que poder distinguir de uno
   completo, o seis meses después nadie entiende por qué siguen ahí esos
   tres clientes.

---

## 7. Cuándo falla y qué queda cuando falla

### El import a medias

Desde el navegador, `supabase-js` manda cada insert como un pedido HTTP
suelto. No hay transacción. Si el wifi de la clínica se cae en la mitad —y
se va a caer— quedan 30 tutores escritos, 0 mascotas, y una base peor que
antes de empezar.

**Solución: una función en Postgres.** El paso 4 no manda 180 inserts.
Manda **uno**: el plan completo en JSON.

```sql
create or replace function public.aplicar_importacion(plan jsonb)
returns jsonb
language plpgsql
security invoker          -- corre como la clínica, NO como postgres
set search_path = public
as $$ ... $$;
```

`security invoker` es lo importante: corre con los permisos de ella, así que
RLS sigue aplicando igual que siempre. Nada de `security definer` acá —
sería un camino para escribir en la cuenta de otra clínica, que es
exactamente lo que RLS está para impedir.

Con eso, **o entra todo o no entra nada**.

Orden adentro de la transacción: `duenos` → `mascotas` (necesitan
`dueno_id`) → `tratamientos` y `vacunas` (necesitan `mascota_id`).

**`anteriores` lo calcula la función, no el navegador.** Es la única que
puede: lee el valor viejo adentro de la misma transacción en la que lo
pisa. Si el navegador mandara lo que creyó ver en el paso 3, bastaría con
que alguien edite ese cliente desde otra pestaña mientras tanto para que
"deshacer" restaure un valor que ya no era el que estaba.

Devuelve el resumen de lo que hizo —cuántos creó, cuántos completó y los
`id` nuevos— para que el paso 4 muestre números que salieron de la base y
no la predicción del paso 3.

**La función nunca escribe `mascotas.codigo`.** Lo pone el trigger de
`008_codigo_mascota.sql`, que es `security definer` e ignora cualquier
código que le manden. Mandarlo no rompe nada, pero deja a alguien creyendo
que ese campo lo controla el import.

Para archivos de más de ~2.000 filas se parte en varias llamadas. Ahí vuelve
a existir el import a medias — pero cada tanda es una transacción completa,
y como cada fila lleva su `importacion_id`, reintentar continúa donde quedó
en vez de duplicar.

### Los cinco frenos

| Qué pasa | Qué hace |
|---|---|
| No es Excel, o está corrupto | Frena en el paso 1 |
| La hoja no tiene filas con datos | Frena en el paso 1, con la lista de hojas |
| Falta nombre de tutor o de mascota | Frena en el paso 2, diciendo cuál falta |
| No reconoce ninguna fecha | **No frena.** Avisa con 5 ejemplos y sigue sin fechas |
| Filas sucias sueltas | **No frena.** Avisos en el paso 3 |

### La especie desconocida

`mascotas.especie` es `NOT NULL`. Cuando `clasificar()` no reconoce la raza
devuelve `especie: null` — y el script de terminal **se detiene y obliga a
decidir**. En el navegador eso no sirve. Pasa a ser una pregunta del paso 3:

> ❓ No sé qué es **"Criollo"** (3 mascotas). ¿Perro o gato?
> **[ Perro ]** [ Gato ]

Marcado "Perro" por defecto, porque en esta base 51 de 54 son perros. La
raza se guarda igual, tal como la escribieron: lo único que se pregunta es
la especie.

### Dos que no son errores técnicos

- **Suscripción vencida.** Si `estado_suscripcion` no está activa, RLS no la
  deja escribir. Sin chequeo, eso saldría como un error crudo de Postgres a
  mitad del paso 4. Se chequea en el **paso 1**.
- **El archivo no es de ella.** Nada impide subir la base de otra clínica, y
  técnicamente no hay cómo detectarlo. Lo único que lo mitiga es el paso 3:
  si los 300 nombres que ve no son sus clientes, se nota.

---

## 8. Pruebas

El proyecto no tiene ni un test. `frontend/package.json` solo tiene `dev`,
`build`, `preview`.

Esto los necesita, y no por prolijidad: el smoke test de `armar-sql.mjs`
contra un CSV inventado encontró **cuatro bugs**, y uno —`q('')` devolviendo
`null` en `duenos.telefono`, que es `NOT NULL`— **abortaba el import
completo de 54 clientes** por un tutor sin celular. Ese bug no se ve
leyendo el código.

Entra **Vitest** como dependencia de desarrollo. No toca el build de
producción.

### Sin base de datos ni navegador

El núcleo es funciones puras.

| Caso | Entrada → esperado |
|---|---|
| Teléfono doble | `"3000000043 - 3000000045"` → dos números separados |
| Teléfono basura | `"0"` → `null`, sin reventar |
| Fecha ISO | `"2018-07-26"` → `2018-07-26` |
| Fecha d/m/Y | `"26/07/2018"` → `2018-07-26` |
| Costo sucio | `"88.000 sí 72"` → `88000` |
| Costo sucio | `"$60.000 c/u"` → `60000` |
| Cédula float | `"1000000004.0"` → `1000000004`, **no** `10000000040` |
| Especie escrita | `"Gato"` → especie `gato`, raza `null` |
| Vacuna imposible | nacimiento posterior a la vacuna → entra **sin** fecha |
| Fila sin nombres | no se importa, **pero aparece en los avisos** |
| Dos corridas seguidas | la segunda arranca en 0 avisos (§4a) |

**El fixture es inventado.** El `.xlsx` de La Huella tiene cédulas,
teléfonos y direcciones de casa de 53 personas que no son clientes
nuestros; está en `.gitignore` por eso y ahí se queda. El fixture
reproduce cada patología del archivo real, con nombres falsos.

### Con Postgres de verdad

La cuenta `emmanuelvargas1722@gmail.com` tiene **53 / 54 / 74 / 13**,
idéntico a la clínica. Dejó de ser una copia de prueba y pasó a ser el
banco de pruebas del importador.

1. **Idempotencia** — mismo archivo otra vez → `0 para crear, 0 para completar`
2. **Completar** — vaciar una cédula, reimportar → se la pone, y
   `anteriores` guarda el `null`
3. **No pisar** — cambiar un teléfono, reimportar → no lo cambia, lo avisa
4. **Deshacer limpio** → vuelve a 0 / 0, `anteriores` restaurado
5. **Deshacer con datos encima** — escribirle una historia clínica a
   "Killer", deshacer → **no borra a Killer**, lo muestra. Prueba que la
   cascada de `001_init.sql` no se lleva meses de trabajo
6. **Transacción** — plan con una fila inválida → **cero filas escritas**

### A mano

- Subir un `.xlsx` de varias hojas y elegir la correcta
- Cambiar un mapeo que la app adivinó mal
- Que los dudosos aparezcan con "son dos personas distintas" ya marcado
- Que las filas descartadas se **vean**
- Barra de progreso en un archivo grande

---

## 9. Lo que este diseño NO hace

- **No lee PDF.** Etapa 2, con el núcleo y la pantalla ya probados.
- **No lee escaneados ni fotos.** Eso es OCR: servicio externo, plata por
  página, y errores que nadie ve — un `3` que se lee `8` en una cédula.
- **No junta fichas repetidas que ya existían** antes del import. Solo
  decide sobre lo que trae el archivo.
- **No adivina apodos.** "Noah" y "Noah Emiliano" quedan separados.
- **No traduce tipos de servicio raros.** `tratamientos.tipo` solo acepta
  `vacunacion`, `desparasitacion`, `bano`, `consulta`. Una columna que diga
  "Guardería" o "Cirugía" se avisa en el paso 3 y no se importa como
  evento. Traducir eso es trabajo aparte, y necesita preguntarle valor por
  valor.
- **No importa inventario, citas ni cobros.** Clientes, mascotas e
  historial. Nada más.
