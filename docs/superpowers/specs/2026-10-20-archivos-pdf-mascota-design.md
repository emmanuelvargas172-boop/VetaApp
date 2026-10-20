# Archivos PDF por mascota · diseño

Que la clínica suba documentos clínicos en PDF y queden colgados del
animal, ordenados por lo que la clínica escribe al subirlos.

Escrito el 2026-10-20. Nace de un pedido del dueño: *"hay que agregar un
apartado en donde se puedan subir las historias clinicas de los animales en
pdf"*, y de cómo él mismo lo ordenó después: *"cuando se sube el PDF se
pone tipo de documento, chequeo, que el animal se le hizo unos exámenes
[…] se coloca la fecha […] y las especificaciones. Y así se tiene un orden
mejor."*

---

## 1. El problema

`historias_clinicas` (`001_init.sql:33`) guarda lo que la veterinaria
**escribe** en VetaApp: motivo, diagnóstico, tratamiento, medicamentos,
peso. Eso cubre la consulta de hoy.

No cubre dos cosas que llegan en papel o en PDF y que hoy no tienen dónde
vivir:

- **El pasado del animal.** Una clínica que entra a VetaApp tiene historias
  en carpetas de cartón. Ese pasado es dato clínico —qué cirugía tuvo, a
  qué reaccionó mal— y hoy se pierde, porque transcribir 54 historias a
  mano no lo va a hacer nadie.

- **Lo que no se escribe, se recibe.** Un hemograma, una radiografía, una
  ecografía, la remisión de un especialista. Llegan como PDF desde el
  laboratorio. Hoy quedan en el WhatsApp de la veterinaria o en una carpeta
  del computador del mostrador, y cuando el animal vuelve en seis meses,
  nadie los encuentra.

Las dos clases de documento son del **animal**, no de una consulta de
VetaApp. Por eso el modelo las trata igual.

---

## 2. Decisiones tomadas

Las cuatro decisiones del dueño, en el orden en que se tomaron:

1. **Los dos casos.** Historias viejas escaneadas y exámenes de ahora. No
   uno de los dos.
2. **Límites apretados** (5 MB por archivo, 10 por mascota) **más una
   columna "Espacio" en el panel de Admin**, para que él vea cuánto gasta
   cada clínica.
3. **El frontend borra los archivos junto con las filas, y además hay un
   barrido manual** para los huérfanos que el camino normal no cubre.
4. **Tipo de documento, fecha del documento y descripción**, los dos
   últimos opcionales.

Y una quinta, que salió de él a mitad del diseño: **los PDFs no se unen a
las consultas.** Cuelgan solo de la mascota.

### Por qué no se unen a las consultas

La versión anterior de este diseño tenía una columna `historia_id`
nullable: un PDF podía además pertenecer a una consulta. Se quitó.

`historia_id` solo se gana el puesto si alguien, parado dentro de una
consulta, quiere ver los archivos de **esa** consulta. Nadie lo pidió. La
lista de la mascota sale completa en los dos casos, y el tipo más la fecha
del documento ya dicen de qué es cada archivo.

Y la dirección importa: agregar una columna nullable después es una
migración de una línea. Quitar una columna que ya tiene datos y código
encima, no.

### Por qué la app no lee el PDF por dentro

No se extrae nada del contenido del archivo. Ni texto, ni fechas, ni
nombres. Lo único que organiza un documento es lo que la clínica escribe
al subirlo.

Un dato que la app adivina de un escaneo se muestra con la misma cara que
un dato que alguien verificó. Un diagnóstico mal leído de una fotocopia
torcida, mostrado como si fuera cierto, es peor que no mostrar nada.

### Por qué los dos campos opcionales son opcionales

`fecha_documento` y `descripcion` no son obligatorios, y la pantalla **dice
que son opcionales**.

Si fueran forzosos, la clínica pondría cualquier cosa para pasar la
pantalla: la fecha de hoy en un papel de 2023, un punto en la descripción.
Un dato inventado que se lee como cierto es peor que un campo vacío. Mismo
criterio que las tres columnas de `011_ficha_completa.sql:31`.

---

## 3. Los datos · migración `015_archivos_mascota.sql`

```sql
create table if not exists public.archivos_mascota (
  id              bigint generated always as identity primary key,
  user_id         uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  mascota_id      bigint not null references public.mascotas(id) on delete cascade,

  tipo            text   not null,
  descripcion     text,
  fecha_documento text,

  ruta            text   not null,
  nombre_original text   not null,
  peso_bytes      bigint not null,

  created_at      timestamptz not null default now()
);
```

### Las dos fechas

`created_at` es cuándo se subió. `fecha_documento` es de cuándo es el
papel.

Son dos columnas y no una porque el caso principal las separa: un
laboratorio de marzo de 2023 escaneado en octubre de 2026 tiene las dos, y
son distintas. Con una sola, la historia del animal queda en orden
mentiroso — todo su pasado fechado el día en que alguien lo escaneó.

Es el mismo error que `011_ficha_completa.sql:21` evita guardando
`fecha_nacimiento` en vez de la edad: un dato congelado en el día en que
alguien lo escribió se vuelve mentira solo.

### El formato de `fecha_documento`

```sql
check (fecha_documento is null or fecha_documento ~ '^\d{4}-\d{2}-\d{2}$')
```

Idéntico a `mascotas_fecha_nacimiento_iso` (`011:74`), y por el mismo
motivo: sin el check, `1/06/2021` queda guardado y `new Date()` lo
interpreta como 1 de junio o 6 de enero según el navegador. El mismo
documento tendría dos fechas en dos computadores de la misma clínica.

Va dentro de un bloque `do $$ … end $$` que pregunta por `pg_constraint`
primero, porque Postgres no tiene `add constraint if not exists` y la
migración tiene que poder correrse dos veces.

### El tipo

```sql
check (tipo in ('chequeo','examenes','imagenes','cirugia','historia_anterior','otro'))
```

**Cerrado, no texto libre.** Con texto libre, en seis meses hay `Examen`,
`examenes`, `EXÁMENES` y `lab` en la misma columna, y no sirve para agrupar
ni filtrar nada. Con el check, agregar un tipo es una línea de migración y
queda registrado cuándo y por qué se agregó.

**Las llaves van sin tildes y en minúscula.** La etiqueta que se lee
—"Exámenes", "Historia anterior"— vive en el frontend. Si la llave
guardada fuera `'Exámenes'`, una fila escrita desde el SQL Editor sin la
tilde sería un tipo distinto que no cae en ningún filtro, y el check la
rechazaría sin que se entienda por qué.

El vocabulario es el del dueño, no el mío: él dijo "chequeo" y "exámenes".
Los que venden esto son él y las clínicas.

### El peso

```sql
check (peso_bytes > 0 and peso_bytes <= 5242880)
```

5 MB exactos. El `> 0` rechaza un PDF de cero bytes, que es lo que deja un
escáner que falló a mitad: la fila existe, la pantalla lo muestra como
disponible, y no abre.

### Índice

```sql
create index if not exists idx_archivos_mascota
  on public.archivos_mascota(mascota_id, created_at desc);
```

Es la única consulta que hace la pantalla: los archivos de esta mascota, el
más nuevo primero.

### RLS

La política se escribe **dentro de `015`**, en el molde de
`012_importaciones.sql:70-77`:

```sql
alter table public.archivos_mascota enable row level security;
drop policy if exists "own_rows_archivos_mascota" on public.archivos_mascota;
create policy "own_rows_archivos_mascota" on public.archivos_mascota
  for all to authenticated
  using      (auth.uid() = user_id and public.esta_activo())
  with check (auth.uid() = user_id and public.esta_activo());
```

#### Corregido el 2026-10-20: por qué NO va en el bucle de `001`

La versión anterior de esta sección decía que `archivos_mascota` se agregara
a la lista de tablas del bucle de `001_init.sql:112-115`. Está mal por dos
motivos, y el segundo es grave:

1. **`001` ya corrió en producción.** Editar su texto no vuelve a ejecutarlo.
   La tabla nacería con RLS apagada y sin ninguna política: cualquier cuenta
   vería los documentos clínicos de todas las demás.
2. **El `create policy` del bucle es desnudo** (`001:119`) — sin
   `drop policy if exists`. Si alguien corriera `001` de nuevo en un
   proyecto nuevo, revienta con `42710` a la mitad. Es exactamente el motivo
   por el que `012` dejó de usar ese molde.

El miedo de la versión anterior —"si se escribe aparte, el día que alguien
toque el bucle esta tabla queda afuera"— apunta al revés: la tabla que queda
afuera es la que *depende* del bucle. Una política con nombre propio en su
propia migración no depende de nada.

#### Y por qué lleva `esta_activo()`

El bucle de `001` es de antes de que existieran las suscripciones. Toda
tabla desde `002` lleva las dos condiciones: `002_admin.sql:253-254`,
`003_cobros.sql:90-91`, `004_planes.sql:98-99` y `106-107`,
`012_importaciones.sql:70-77`.

Sin `esta_activo()`, una clínica con la suscripción vencida sigue subiendo
PDFs de 5 MB a un bucket que el dueño paga. Y la regla del proyecto es que
el bloqueo por suscripción vive en RLS, no en React: en React se salta con
F12.

La función es la de `007_pagos.sql:54` —la que sabe vencer— y devuelve
`true` cuando no hay perfil, así que no bloquea a nadie por una fila
faltante.

---

## 4. El bucket

```sql
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;
```

Privado. Las cuatro políticas son copia literal de `001_init.sql:135-149`
con `'documentos'` en lugar de `'mascotas'`: misma carpeta
`{user_id}/...`, mismo `(storage.foldername(name))[1] = auth.uid()::text`.

Ruta de cada objeto: `{user_id}/{mascota_id}/{timestamp}-{aleatorio}.pdf`.

**No lleva el `id` de la fila**, aunque sería más bonito. El orden de la
sección 6 es subir primero y insertar después, así que en el momento de
subir el `id` todavía no existe — lo genera Postgres en el insert. Poner el
`id` en la ruta obligaría a insertar primero, que es el orden que deja
filas mentirosas.

El `{aleatorio}` va además del timestamp porque dos archivos subidos en el
mismo milisegundo —la clínica seleccionando 8 escaneos de una— chocarían.
`subirFoto` (`api/axios.js:112`) usa solo `Date.now()` y tiene ese hueco;
acá no se copia.

### Por qué un bucket nuevo y no el de fotos

Los límites son distintos (PDF de 5 MB vs. foto), los tipos permitidos son
distintos, y el barrido de la sección 6 apunta a un bucket sin riesgo de
tocar fotos. Un bucket con dos clases de cosas adentro obliga a que toda
regla pregunte primero "¿esto es foto o documento?".

### Los límites, en tres capas

1. **Frontend** — mira `file.size` y `file.type` antes de subir. Es la
   única capa que puede decir algo útil: *"Este PDF pesa 12 MB y el máximo
   son 5. Si lo escaneaste en color, volvé a escanearlo en blanco y
   negro."*
2. **`check` en la tabla** — atrapa cualquier inserción que no pase por la
   pantalla.
3. **El bucket** — `file_size_limit` y `allowed_mime_types`.

Tres y no una porque la primera es la que ayuda y la más fácil de
saltarse, y la tercera es la que nadie puede saltarse y no sabe
explicarse.

### El límite de 10 por mascota

Las tres capas de arriba son del **tamaño**. El tope de cantidad es otra
cosa y no cabe en un `check`: un `check` mira una fila, y "cuántas hay" es
una pregunta sobre la tabla entera.

Se hace con un trigger `before insert`:

```sql
create or replace function public.limite_archivos_mascota()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.archivos_mascota
       where mascota_id = new.mascota_id) >= 10 then
    raise exception 'limite_archivos_mascota';
  end if;
  return new;
end $$;
```

Y el frontend cuenta antes de ofrecer el botón, para que el mensaje sea
útil (*"Esta mascota ya tiene 10 archivos. Borrá uno para subir otro."*) en
vez de un error de Postgres.

El trigger levanta un nombre seco y no una frase en español a propósito: la
frase que lee la clínica vive en `archivos/limites.js`, donde se puede
probar. Un mensaje bonito dentro del `raise exception` es una cadena que
nadie prueba y que sale cruda si el frontend no la reconoce.

**Esto no es a prueba de carreras.** Dos subidas simultáneas de la misma
mascota pueden pasar las dos el `count` y dejar 11. Se acepta: el daño de
once archivos donde caben diez es cero, y la alternativa —bloquear la fila
de la mascota en cada subida— es complejidad real por un problema
imaginario en una clínica donde sube archivos una persona a la vez.

### Verificado el 2026-10-20

La documentación de Supabase solo muestra `fileSizeLimit: '1MB'` y
`allowedMimeTypes: ['image/*']` por el cliente de JavaScript, y no
documenta los nombres de columna para ponerlos por SQL. Se consultó el
esquema del proyecto directamente:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'storage' and table_name = 'buckets';
```

Las dos columnas existen: **`file_size_limit` es `bigint`** (bytes, no la
cadena `'5MB'` del cliente JS) y **`allowed_mime_types` es un arreglo**.
La capa 3 va en la migración:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
```

`5242880` es el mismo número que el `check` de `peso_bytes`. Los dos
límites tienen que moverse juntos; si se separan, el que rechaza primero
decide, y el mensaje que ve la clínica cambia según cuál sea.

**Un detalle de la misma consulta:** `storage.buckets` tiene una columna
`type` de tipo `USER-DEFINED` — las versiones nuevas de Supabase distinguen
buckets estándar de buckets analíticos. El insert de arriba no la nombra, o
sea que toma el default, que es el estándar. Es lo que se quiere; se deja
dicho para que nadie lo "complete" después pensando que faltaba.

### Cómo se abre un PDF: URL firmada

```js
const { data } = await supabase.storage
  .from('documentos')
  .createSignedUrl(ruta, 300);
```

Se pide en el momento del clic, vive 5 minutos, y **no se guarda** en la
tabla ni en el estado de React.

Esto es deliberadamente lo contrario de lo que hace el código de hoy.
`api/axios.js:116` guarda `getPublicUrl(...)` de un bucket privado — una
URL que no resuelve. Ese patrón no se copia.

Y hay una razón más fuerte que ese bug: una URL firmada guardada en la base
es una llave con fecha de vencimiento escrita en un campo de texto. Dentro
de un año la fila sigue ahí y la llave ya no sirve; o peor, todavía sirve.

---

## 5. La pantalla

### Dónde va

Tercer tab en `pages/Historias.jsx`. Las tabs son un arreglo literal en
`:468-470`, así que es una entrada más:

```js
{ key: 'archivos', label: 'Archivos', count: archivos.length },
```

Y el panel al lado de los otros dos (`:492`):

```jsx
{tabActiva === 'archivos' && <ArchivosMascota mascotaId={mascota.id} />}
```

No va en una página nueva ni en la ficha de la mascota. Va donde el
veterinario ya está mirando el historial del animal.

### Archivos nuevos

**`components/ArchivosMascota.jsx`** — la lista y el formulario.

Aparte y no inline: `Historias.jsx` ya tiene 852 líneas y es el archivo que
más hay que leer para entender la app. Metiendo esto adentro llega a ~1100
y empeora con cada cosa que se le agregue después.

**`archivos/limites.js`** — qué se deja subir. Funciones puras, sin React:

```js
export const MAX_BYTES = 5242880;   // el mismo número que el check de 015
export const MAX_POR_MASCOTA = 10;
// `cuantosHay` es el conteo actual de esa mascota: el tope de 10 no se
// puede decidir mirando solo el archivo.
export function revisarArchivo(file, cuantosHay)  // → { ok } | { ok:false, motivo }
```

**`archivos/textos.js`** — las frases. También puras:

```js
export const ETIQUETA_TIPO     // llave de la base → etiqueta que se lee
export function textoArchivo(a) // la línea que se lee en la lista
```

**Corregido el 2026-10-20: son dos archivos, no uno.** La versión anterior
metía `ETIQUETA_TIPO` y `textoArchivo` dentro de `limites.js`. Un archivo
llamado "limites" que además guarda el diccionario de etiquetas es un
archivo cuyo nombre miente, y el repo ya tiene la separación hecha en el
importador: `nucleo/` decide, `textos.js` redacta
(`importador/textos.js:1-8`). Se sigue ese corte.

Los dos van afuera del JSX por el motivo que `importador/textos.js:6` deja
escrito: adentro del componente no se pueden probar. El mensaje de "este PDF
pesa 12 MB" es el único lugar donde la clínica se entera de qué hacer; si se
rompe, se rompe en silencio.

### El formulario

Pide, en este orden: el archivo, el tipo (desplegable, obligatorio), la
fecha del documento (opcional) y la descripción (opcional). Los dos
opcionales dicen "opcional" en la pantalla.

### La lista

Por fila: el tipo como etiqueta, la fecha del documento si la hay, la
descripción, y el nombre original del escáner en letra chica. El más nuevo
arriba — es el orden del índice.

El nombre original se muestra aunque sea `scan_0001.pdf`: es lo que la
clínica reconoce si tiene que buscar el mismo archivo en su computador.
Pero va en chico, porque no es lo que identifica el documento.

Clic en una fila → se pide la URL firmada y se abre en pestaña nueva.

### Lo que se modifica

- `pages/Historias.jsx` — entrada de tab, panel, y el subtítulo (abajo)
- `api/axios.js` — las rutas de la sección 6

### El plural del subtítulo

`Historias.jsx:410` arma hoy:

```js
subtitle={`${consultas.length} consultas · ${vacunas.length} vacunas`}
```

Con una sola consulta dice **"1 consultas"**. El bug ya está ahí, y es
exactamente el que `importador/textos.js:16` describe. Agregar
`${archivos.length} archivos` sin más agrega un tercer "1 archivos" a la
misma línea.

Esa línea pasa a usar `n()` (`importador/textos.js:20`), lo que **arregla
de paso los otros dos**. Es la línea que se está tocando, no una
refactorización suelta.

---

## 6. Las rutas, el borrado y el barrido

Cuatro rutas, en el patrón de tabla `{ m, re, fn }` que ya usa
`api/axios.js`:

```
GET    /archivos/mascota/:id   → lista
POST   /archivos               → sube al bucket + inserta la fila
GET    /archivos/:id/url       → createSignedUrl(ruta, 300)
DELETE /archivos/:id           → .remove() del bucket + borra la fila
```

### El orden de las dos operaciones, en cada sentido

**Al subir: primero el bucket, después la fila.** Si se cae en el medio,
queda un archivo sin fila — un huérfano, que el barrido limpia. Al revés
quedaría una fila apuntando a un archivo que no existe, y la pantalla lo
muestra como un PDF disponible que no abre.

Falla mejor un huérfano que una fila mentirosa.

**Al borrar: primero el bucket, después la fila** — y la fila se borra
**solo si `.remove()` devolvió sin error**. Si el `.remove()` falla, la fila
se queda y el usuario ve "no se pudo borrar", que es la verdad. Al revés
quedaría una fila sin archivo, que es el caso peor.

### Borrar una mascota

`api/axios.js:223` hoy solo borra la fila. Pasa a: listar los archivos de
la mascota, `.remove()` de todas las rutas en una llamada, y después borrar
la fila.

Postgres borra en cascada las **filas**, no los **archivos**:
`storage.objects` no tiene ninguna llave hacia `mascotas`. Sin esto, los
PDFs quedan en el bucket cobrando para siempre, y la columna "Espacio"
empieza a contar basura — lo contrario de para qué se pidió.

### El barrido de huérfanos

Edge function `limpiar-huerfanos`, en el molde de `pago-webhook` que ya
existe.

1. Lista los objetos de los buckets `documentos` **y** `mascotas`.
2. Compara contra `archivos_mascota.ruta` y `mascotas.foto`.
3. Lo que no tenga fila, lo borra **por la Storage API**.

**Nunca con SQL, y esto está verificado, no supuesto.** La documentación
oficial dice: *"Deleting objects should always be done via the Storage API
and NOT via a SQL query […] will result in the object being orphaned."* Y
desde el 5 de marzo de 2026 Supabase lo rechaza activamente: *"A new
statement-level trigger now rejects DELETE on Storage schema tables unless
the session variable `storage.allow_delete_query` is set to true."*

Un trigger en Postgres que borrara el objeto era la primera idea de este
diseño. Se descartó al verificar: era la causa más común del problema que
pretendía resolver.

La variante "trigger + `pg_net` llamando a la Storage API" también se
descarta: obliga a guardar la `service_role` key dentro de Postgres, la
llamada es asíncrona y sin manejo de error, y la documentación no la
respalda. Meter una llave de servicio en la base para ahorrar una llamada
de frontend es un mal cambio.

**Quién la puede llamar.** Corre con `service_role` porque mira cuentas que
no son la del invocador, y **lo primero que hace es validar `es_admin()`**
(`002_admin.sql:78`). Una función que puede borrar archivos de todas las
clínicas y no pregunta quién la llamó es una puerta abierta.

**Cubre el bucket de fotos gratis**, con el mismo código. Eso tapa una fuga
que existe hoy: borrar una mascota deja su foto en el bucket para siempre.

---

## 7. La columna "Espacio" en el Admin

Va en `admin_listar_veterinarias()`, que ya es `security definer` y ya
valida `es_admin()` antes de devolver nada: una columna más en el
`returns table`, y una más en la tabla de `Admin.jsx:380`.

**Corregido el 2026-10-20:** esta sección decía `002_admin.sql:135`. Esa es
la **primera** versión de la función, de ocho columnas. La que está viva hoy
se redefinió tres veces —`004_planes.sql:117`, `005_prueba.sql:124` y por
última vez `007_pagos.sql:331`— y devuelve once columnas, con `plan`,
`prueba_hasta` y `suscripcion_hasta`. `015` tiene que partir de **esa**, no
de la de `002`.

Si se parte de la de `002`, el `drop function` + `create` deja una función
de nueve columnas y `Admin.jsx` pierde de golpe el selector de plan
(`:425`), el badge de días de prueba (`:411-414`) y el botón "+8 días"
(`:440`). Tres cosas que funcionan hoy, rotas por copiar la línea
equivocada.

Y como cambia la firma de salida, va `drop function if exists` antes del
`create or replace` — mismo paso que `007:329` tuvo que dar por lo mismo.

Un KPI nuevo arriba (`Admin.jsx:340`): **"Espacio total"**, para ver de
una si va por 200 MB o por 900 del giga del plan gratis.

### El número sale del bucket, no de la tabla

La suma se hace sobre `storage.objects` por carpeta `{user_id}`, no sobre
`sum(peso_bytes)` de `archivos_mascota`.

Porque lo que se quiere saber es **lo que Supabase cobra**, y eso incluye
los huérfanos. Sumando la tabla propia, el número diría lo que creemos que
hay, no lo que hay — y los huérfanos, que son justo el problema, serían
invisibles.

Efecto secundario bueno: después de correr el barrido, el número baja a la
vista. Ahí se comprueba que el barrido funcionó.

### Verificado el 2026-10-20 (y lo que quedó sin verificar)

`select metadata from storage.objects limit 1` devolvió **cero filas**: no
hay un solo objeto en el storage del proyecto. Así que la forma del
`metadata` no se pudo mirar con un dato real.

Lo que sí se pudo: listar las columnas de `storage.objects`, que no
necesita filas.

```
id, bucket_id, name, owner, created_at, updated_at, last_accessed_at,
metadata (jsonb), path_tokens (ARRAY), version, owner_id,
user_metadata (jsonb), archived_at, is_delete_marker, is_versioned
```

**Ninguna columna guarda el tamaño.** Queda confirmado que está dentro de
`metadata`, y que no hay una alternativa mejor escondida. La Storage API lo
escribe como `metadata->>'size'`.

**Cómo se verifica sin poder verificarlo hoy:** la suma se escribe con
`(metadata->>'size')::bigint`, y la primera prueba manual de la sección 9
—subir un PDF y mirar el Admin— lo comprueba. Si la llave fuera otra, la
columna "Espacio" muestra 0 con un archivo de 2 MB adentro, y eso se ve de
una. El riesgo está acotado a una celda de una pantalla que solo mira el
dueño, y la prueba que lo detecta ya está en el plan.

### Dos hallazgos de esa misma consulta

**`path_tokens` es un arreglo.** `path_tokens[1]` es el `user_id` directo.
La suma por clínica lo usa en vez de `storage.foldername(name)`: es la
misma información sin llamar a una función por fila.

**El proyecto tiene versionado de objetos** — `archived_at`,
`is_delete_marker`, `is_versioned`. Un barrido o una suma ingenuos
contarían marcadores de borrado y versiones archivadas como si fueran
archivos. No lo son.

Las dos consultas de la sección 7 y el barrido de la sección 6 filtran:

```sql
where coalesce(is_delete_marker, false) = false
  and archived_at is null
```

Sin ese filtro, la columna "Espacio" cobraría de más y el barrido
intentaría borrar cosas que no son archivos.

---

## 8. Lo legal

`pages/Legal.jsx:63` enumera hoy qué datos se guardan: cuenta, correo,
nombre y foto de Google. No menciona documentos clínicos de animales de
terceros.

Cuando la clínica sube la historia de un animal, entra un documento con el
nombre del animal, el del tutor y a veces su cédula. La política de
privacidad tiene que decirlo.

La frase nueva tiene que decir la verdad de lo que hace `015`: documentos
en bucket privado, accesibles solo por la cuenta que los subió, borrables
por ella, y acceso por enlaces que vencen en 5 minutos. Cada parte de esa
frase apunta a una línea de código verificable:

| Lo que dirá la política | Lo que lo cumple |
|---|---|
| bucket privado | `storage.buckets.public = false` |
| solo la cuenta que los subió | las 4 políticas de `storage.objects` por carpeta |
| borrables por ella | `DELETE /archivos/:id` + `.remove()` |
| enlaces que vencen | `createSignedUrl(ruta, 300)` |

No se publica una frase que no se pueda rastrear a una de esas líneas.

---

## 9. Pruebas

Separadas por lo que de verdad verifica cada una.

### Sin navegador ni base (vitest, se suman a los 203 actuales)

`limites.js`:
- exactamente 5 MB → pasa
- un byte más → falla, y el motivo nombra el tamaño y qué hacer
- 0 bytes → falla
- un archivo que el navegador reporta como `image/jpeg` → falla
- con 9 archivos ya subidos → pasa; con 10 → falla, y el motivo dice que
  hay que borrar uno

#### Corregido el 2026-10-20: el chequeo de tipo NO atrapa un renombrado

La versión anterior de esta lista decía *"un `.jpg` renombrado a `.pdf` →
falla (se mira `file.type`, no la extensión)"*. Es falso, y al revés de lo
que pasa: el navegador **deriva** `File.type` de la extensión del nombre,
no de los bytes. Un JPG renombrado a `.pdf` llega con
`type === 'application/pdf'`, pasa `revisarArchivo`, y pasa también
`allowed_mime_types` del bucket, porque la subida manda `contentType`
tomado de ese mismo `file.type`.

Lo que el chequeo sí atrapa es el caso real y frecuente: la clínica elige
una foto del celular —`.jpg` de verdad, con nombre `.jpg`— y la pantalla
se lo dice en vez de subirla a un bucket que solo muestra PDFs.

Validar de verdad el contenido exigiría leer los primeros bytes y buscar
`%PDF-`. No se hace, y el motivo es que no cambiaría nada: el archivo se
entrega a la clínica por URL firmada y lo abre su propio visor, que falla
solo y de forma obvia. Lo que no se puede hacer es que un comentario o un
texto de pantalla afirme que la validación es de contenido. La prueba de
arriba y el comentario de `limites.js` dicen exactamente lo que el
chequeo hace: mira lo que el navegador reporta.

`textoArchivo`:
- con fecha y con descripción
- con fecha, sin descripción
- sin fecha, sin descripción (el caso de la subida más rápida posible)
- cada una de las seis llaves de tipo tiene etiqueta en `ETIQUETA_TIPO`
  (si se agrega un tipo al check de `015` y no acá, esta prueba lo avisa)

El subtítulo de `Historias.jsx`:
- con 1 consulta dice "1 consulta", no "1 consultas"

#### Cómo se prueba el subtítulo, dado que no hay jsdom

**Verificado el 2026-10-20:** el proyecto no tiene `vitest.config.*` ni
`@testing-library/*` en `package.json`, y `paso3Revisar.test.jsx:1-10` lo
deja escrito: *"en este entorno de vitest sin jsdom no"*. O sea que no se
puede renderizar un componente en una prueba, y una prueba que pretenda
hacerlo no compila.

La línea se saca entonces a una función pura **exportada desde
`pages/Historias.jsx`**, con el precedente exacto de `calcular`, que
`paso3Revisar.test.jsx:12` importa de un `.jsx`:

```js
export const subtituloPaciente = (consultas, vacunas, archivos) => [
  n(consultas, 'consulta', 'consultas'),
  n(vacunas,   'vacuna',   'vacunas'),
  n(archivos,  'archivo',  'archivos'),
].join(' · ');
```

La prueba la importa con `vi.mock('../lib/supabase.js', …)` antes del
import, igual que `paso3Revisar.test.jsx:10`: `Historias.jsx` importa
`api/axios`, que importa `lib/supabase.js`, que hace `window.supabase = …`
en DEV (`lib/supabase.js:21`) — y sin `window` eso revienta al importar.

No va a `archivos/textos.js`: el subtítulo cuenta consultas y vacunas, que
no tienen nada que ver con archivos. Guardarlo ahí lo esconde del único
lugar donde alguien lo buscaría.

### Contra Postgres de verdad

Bloques `do $$ … end $$` que terminan en `raise exception`, al final de la
migración y comentados, como las cinco de `011_ficha_completa.sql:120`. La
transacción se aborta y el resultado viaja en el mensaje de error: se
prueba contra la base real sin dejar basura.

- `fecha_documento`: acepta `2023-03-14`, acepta `null`, rechaza
  `1/06/2021`, rechaza `'no sé'`
- `tipo`: acepta `'examenes'`, rechaza `'Exámenes'` y rechaza `'lab'`
- `peso_bytes`: acepta 5242880, rechaza 5242881, rechaza 0
- el trigger de cantidad: la décima fila entra, la undécima revienta con
  `limite_archivos_mascota`
- RLS: la cuenta A no ve ni una fila de la cuenta B
- cascada: borrar la mascota borra las filas de sus archivos

### En el navegador, a mano

Ninguna de las de arriba cubre esto:

1. Subir un PDF, hacer clic, y que **abra de verdad**. Es la prueba de que
   la URL firmada funciona y de que no se repitió el bug de
   `getPublicUrl`.
2. Borrar la mascota desde la app y confirmar **en el dashboard de
   Supabase** que el archivo ya no está en el bucket.
3. Borrar una mascota **desde el dashboard** (el camino que la parte B no
   cubre), correr el barrido, y ver la columna "Espacio" bajar.

La 3 es la única que prueba el barrido, y la única que no se puede
automatizar.

---

## 10. Lo que este diseño NO hace

- **No lee el PDF por dentro.** Ver sección 2.
- **No une archivos a consultas.** Ver sección 2. Si se pide, es una
  columna nullable y una migración de una línea.
- **No arregla la foto de las mascotas.** `api/axios.js:116` guarda una URL
  pública de un bucket privado, y es muy probable que las fotos no se vean.
  Es un bug anterior y aparte; esta tarea solo se cuida de **no copiarlo**.
  El barrido sí cubre las fotos huérfanas, porque sale gratis.
- **No comparte documentos con el tutor.** Ni por WhatsApp ni por enlace.
  Nadie lo pidió, y abrirlo significa decidir cuánto vive un enlace que
  sale de la clínica — una decisión distinta de las cinco de arriba.
- **No acepta otra cosa que PDF.** Ni fotos de la historia, ni Word. Si
  entra `image/*`, el límite de 5 MB se topa con cualquier foto de celular
  moderna y el escaneo de 8 páginas se vuelve 8 archivos sueltos.
- **No avisa al dueño cuando una clínica se pasa de espacio.** La columna y
  el KPI son para que él mire; no hay alerta. Con 1 o 2 clínicas la mira
  cuando entra al Admin. A los 10 clientes eso se revisa de nuevo.
