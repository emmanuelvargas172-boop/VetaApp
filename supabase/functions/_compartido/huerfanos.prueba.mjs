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

// ---------- rutasHuerfanas ----------
const AHORA = new Date('2026-10-20T12:00:00Z');
const hace = (min) => new Date(AHORA.getTime() - min * 60000).toISOString();

const obj = (name, min) => ({ name, created_at: hace(min) });

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

// Una lista de conocidas con nulls adentro —una mascota sin foto— no puede
// hacer que un objeto se vea huérfano ni reventar la comparación.
t('los nulls de la lista de conocidas se ignoran',
  rutasHuerfanas([obj('u/m.jpg', 180)], [null, undefined, '', 'u/m.jpg'], AHORA, 60).length === 0);

// Un objeto sin created_at (no debería pasar, pero Storage es de otro) se
// RESPETA, no se borra. Ante la duda, no se borra nada.
t('un objeto sin fecha no se borra',
  rutasHuerfanas([{ name: 'u/7/sinfecha.pdf' }], [], AHORA, 60).length === 0);

// Las carpetas que devuelve `list()` vienen con `id: null` y sin
// `created_at` útil. No son archivos y no se pueden borrar.
t('las carpetas no entran',
  rutasHuerfanas([{ name: 'u', id: null }], [], AHORA, 60).length === 0);

console.log(`\n${ok} OK · ${mal} MAL`);
if (mal > 0) process.exit(1);
