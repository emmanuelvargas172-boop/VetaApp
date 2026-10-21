// Pruebas del diff del barrido de huérfanos.
//
// Correr con:   cd supabase/functions/_compartido && node huerfanos.prueba.mjs
//
// Node 24 ejecuta TypeScript directo, y huerfanos.ts a propósito no usa
// ninguna API de Deno: así la parte que decide QUÉ ARCHIVO SE BORRA se
// puede probar sin desplegar nada y sin llaves. Mismo arreglo que
// wompi.prueba.mjs.
//
// Es la función más peligrosa del proyecto: lo que devuelva se borra, y un
// archivo borrado de Storage no vuelve.

const M = await import('./huerfanos.ts');
const { rutaDesdeValor, rutasHuerfanas } = M;

let ok = 0, mal = 0;
const t = (nombre, cond, extra = '') => { (cond ? ok++ : mal++); console.log(`${cond ? 'OK  ' : 'MAL '} ${nombre}${extra ? ' → ' + extra : ''}`); };

// ---------- rutaDesdeValor ----------
// `archivos_mascota.ruta` ya guarda la ruta pelada.
t('deja pasar una ruta pelada',
  rutaDesdeValor('abc-123/7/1760000000-x9f2.pdf') === 'abc-123/7/1760000000-x9f2.pdf');

// `mascotas.foto` guarda la URL pública completa (api/axios.js:116). Sin
// esta conversión, TODAS las fotos se verían huérfanas y el barrido las
// borraría. Es la prueba que más importa de todo el archivo.
t('saca la ruta de una URL pública de Supabase',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/public/mascotas/abc-123/mascota_1760000000.jpg')
  === 'abc-123/mascota_1760000000.jpg');

t('saca la ruta de una URL firmada, con query y todo',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/sign/documentos/abc-123/7/a.pdf?token=eyJ')
  === 'abc-123/7/a.pdf');

t('null y vacío devuelven null',
  rutaDesdeValor(null) === null && rutaDesdeValor('') === null);

// Una URL de otro lado —alguien pegó un link de Google Drive en la
// columna— devuelve null. Lo que no se entiende NO se convierte en una
// ruta a borrar.
t('una URL que no es de storage devuelve null',
  rutaDesdeValor('https://drive.google.com/file/d/123/view') === null);

// I1: `getPublicUrl` aplica `encodeURI`, `storage.list()` devuelve el
// `name` crudo. Un nombre con espacio (`ecografia.jpg (2)`) llega como
// `%20` en la URL y sin decodificar no coincide —la foto se vería
// huérfana y se borraría. Se compara contra la versión cruda, que es
// lo que Storage devuelve y lo que hay que encontrar en el Set.
t('decodifica %20 de una URL pública (I1)',
  rutaDesdeValor('https://xyz.supabase.co/storage/v1/object/public/mascotas/abc-123/ecografia.jpg%20(2)')
  === 'abc-123/ecografia.jpg (2)');

// ---------- rutasHuerfanas ----------
const AHORA = new Date('2026-10-20T12:00:00Z');
const hace = (min) => new Date(AHORA.getTime() - min * 60000).toISOString();

// Los archivos reales de Storage siempre tienen un `id` uuid. Se lo
// ponemos explícito al helper para que la guarda de carpetas (id == null)
// no los descarte —ver M1 en huerfanos.ts.
const obj = (name, min) => ({ name, id: 'fake-id', created_at: hace(min) });

t('el objeto sin fila y viejo se borra',
  JSON.stringify(rutasHuerfanas([obj('u/7/huerfano.pdf', 180)], ['u/7/otro.pdf'], AHORA, 60))
  === JSON.stringify(['u/7/huerfano.pdf']));

t('el objeto con fila no se toca',
  rutasHuerfanas([obj('u/7/bueno.pdf', 180)], ['u/7/bueno.pdf'], AHORA, 60).length === 0);

// LA GUARDA QUE EVITA BORRAR UNA SUBIDA EN CURSO. El orden de la subida es
// bucket y después fila: un objeto de hace dos minutos sin fila puede ser
// una subida que todavía no terminó, no un huérfano.
t('el objeto reciente sin fila se respeta',
  rutasHuerfanas([obj('u/7/subiendo.pdf', 2)], [], AHORA, 60).length === 0);

t('justo en el borde de la gracia no se borra',
  rutasHuerfanas([obj('u/7/borde.pdf', 60)], [], AHORA, 60).length === 0);

t('un minuto más allá del borde sí se borra',
  rutasHuerfanas([obj('u/7/pasado.pdf', 61)], [], AHORA, 60).length === 1);

// I2-nulls: Los nulls de la lista de conocidas no protegen NI revientan.
// Antes el caso incluía 'u/m.jpg' en las conocidas, con lo cual el objeto
// sobrevivía tanto con el filtro de nulls como sin él: borrar el
// `.filter(r => !!r)` de huerfanos.ts no mataba la aserción.
// Ahora la lista NO tiene la ruta del objeto: si los nulls no se filtran
// correctamente el Set tiene basura y nada falla, pero si se filtran
// el objeto de 180 min sin fila queda huérfano (length === 1).
t('los nulls de la lista de conocidas no protegen ni revientan (I2)',
  rutasHuerfanas([obj('u/m.jpg', 180)], [null, undefined, ''], AHORA, 60).length === 1);

// I2-fecha: Un objeto con created_at: null se RESPETA, no se borra.
// `!o.created_at` atapa tanto undefined como null. Sin esa guarda,
// `new Date(null).getTime()` es 0 (epoch 1970), que está muy por debajo
// del corte: el objeto saldría en la lista de huérfanos y se borraría.
// Con la guarda presente, el objeto con null no supera el filtro y
// length === 1 (solo el viejo con created_at real).
// I5: `created_at?: string | null` en ObjetoStorage habilita este caso.
t('un objeto con created_at null no se borra, pero uno con fecha y sin fila sí (I2)',
  rutasHuerfanas(
    [{ name: 'u/7/sinfecha.pdf', id: 'a', created_at: null }, obj('u/7/viejo.pdf', 180)],
    [],
    AHORA,
    60,
  ).length === 1);

// I2-carpetas: Las carpetas vienen con `id: null`. No son archivos y no
// se pueden borrar. El caso anterior no tenía created_at, así que la
// carpeta caía en la guarda de `!created_at` de todas formas: borrar el
// `if (o.id === null)` no mataba la aserción. Ahora la carpeta tiene
// created_at viejo: si la guarda de id se borra, la carpeta sale en la
// lista y length es 1, no 0.
t('las carpetas no entran aunque tengan created_at viejo (I2)',
  rutasHuerfanas([{ name: 'u', id: null, created_at: hace(180) }], [], AHORA, 60).length === 0);

// M5: los marcadores `.emptyFolderPlaceholder` que crea el Dashboard al
// "crear carpeta" tienen id y created_at reales, pero ninguna fila los
// nombra. El barrido los ignoraría porque el filtro está acá.
t('el marcador de carpeta vacía no es huérfano (M5)',
  rutasHuerfanas(
    [{ name: 'u/7/.emptyFolderPlaceholder', id: 'abc', created_at: hace(180) }],
    [],
    AHORA,
    60,
  ).length === 0);

// I2-NaN: una fecha que `new Date()` no puede leer da NaN, y NaN pierde
// toda comparación —`NaN >= corte` es false—, así que sin la guarda
// explícita el objeto se colaría hasta el borrado. Van dos entradas y no
// una: la segunda, que sí es huérfana, es la que hace que la aserción
// distinga en vez de comparar contra una lista vacía. Si se borra el
// `if (Number.isNaN(nacio))`, length pasa a 2 y esto muere.
t('una fecha impareseable no se borra, y la huérfana de al lado sí (I2)',
  rutasHuerfanas(
    [{ name: 'u/7/mala-fecha.pdf', id: 'a', created_at: 'no-es-una-fecha' }, obj('u/7/viejo.pdf', 180)],
    [],
    AHORA,
    60,
  ).length === 1);

console.log(`\n${ok} OK · ${mal} MAL`);
if (mal > 0) process.exit(1);
