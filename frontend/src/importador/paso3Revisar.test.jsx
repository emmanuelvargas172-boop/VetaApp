import { describe, it, expect, vi } from 'vitest';

// El mock va antes del import del módulo que lo usa. `calcular` es una
// función pura que no toca la base, pero paso3Revisar.jsx importa
// escribir.js para el efecto del componente React, y escribir.js importa
// supabase.js, que hace `window.supabase = …` en modo DEV. En jsdom `window`
// existe, pero en este entorno de vitest sin jsdom no — el mock corta el
// import antes de que llegue ahí.
const mockSupabase = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: mockSupabase, default: mockSupabase }));

import { calcular } from './paso3Revisar.jsx';
import { formatoDeFechasRoto } from './nucleo/filas.js';

// Los valores son inventados. Ver el commit 888a8ce: los datos reales de
// clientes no van a los tests, ni aunque el test sea sobre ellos.

const HOY = new Date(2026, 9, 15);
const vacia = { duenos: [], mascotas: [], tratamientos: [], vacunas: [] };
const sinDecidir = { dudas: {}, especies: {} };

// Los encabezados y el mapa que deja el paso 2, recortados a lo que
// necesita cada caso.
const ENC = ['Tutor', 'Mascota', 'Telefono', 'Cedula', 'Raza', 'Nacimiento', 'Marca temporal'];
const MAPA = { tutor: 0, mascota: 1, telefonos: 2, cedula: 3, raza: 4, nacimiento: 5, ts: 6 };

const cols = (grilla) => ({ hoja: 'Hoja1', mapa: MAPA, encabezados: ENC, grilla });

const UNA = [['Ana Gómez', 'Max', '3000000011', '1000000001', 'Poodle', '26/07/2018', '12/09/2026 10:18:00']];

describe('calcular', () => {
  it('una fila limpia da un tutor, una mascota y un baño', () => {
    const { plan } = calcular({ columnas: cols(UNA), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(plan.resumen.tutores_nuevos).toBe(1);
    expect(plan.resumen.mascotas_nuevas).toBe(1);
    expect(plan.resumen.tratamientos).toBe(1);
    expect(plan.dudas).toHaveLength(0);
  });

  // El número del paso 3 tiene que ser el que va a pasar, no el que
  // pasaría con la base vacía. Subir el mismo archivo dos veces debe
  // decir 0 desde el principio: si dice 54 y después crea 0, nadie
  // vuelve a creerle a esta pantalla.
  it('con todo ya en la base no propone crear nada', () => {
    const existentes = {
      duenos: [{ id: 1, nombre: 'Ana Gómez', telefono: '573000000011', telefono2: null, cedula: '1000000001', direccion: 'Calle 1' }],
      mascotas: [{ id: 9, dueno_id: 1, nombre: 'Max', raza: 'Poodle', fecha_nacimiento: '2018-07-26', edad_anios: 8, edad_meses: 2 }],
      tratamientos: [{ mascota_id: 9, tipo: 'bano', fecha: '2026-09-12' }],
      vacunas: [],
    };
    const { plan } = calcular({ columnas: cols(UNA), existentes, decisiones: sinDecidir, hoy: HOY });
    expect(plan.resumen.tutores_nuevos).toBe(0);
    expect(plan.resumen.mascotas_nuevas).toBe(0);
    expect(plan.resumen.tratamientos).toBe(0);
    expect(plan.resumen.eventos_repetidos).toBe(1);
  });

  // Una fila con teléfono pero sin nombres es una visita que se cobró.
  // Se cuenta y se muestra; esconderla es el peor error de este módulo.
  it('cuenta las filas descartadas aparte de los avisos de dato', () => {
    const grilla = [
      ...UNA,
      ['', '', '3000000022', '', '', '', '13/09/2026 09:02:00'],
    ];
    const { estado } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(estado.avisos.filter((a) => a.clase === 'descarte')).toHaveLength(1);
  });

  it('una raza desconocida se pregunta, no se adivina', () => {
    // 'Sabueso' no está en RAZAS_PERRO ni en RAZAS_GATO (normalizar.js:131-144),
    // así que la máquina no puede decidir la especie sola. 'Criollo' no sirve
    // para este test porque está en RAZAS_PERRO y la máquina lo clasifica sin
    // preguntar. Ver el reporte de la tarea 12.
    const grilla = [['Ana Gómez', 'Max', '3000000011', '', 'Sabueso', '', '12/09/2026 10:18:00']];
    const { plan } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(plan.especies).toHaveLength(1);
    expect(plan.especies[0].raza).toBe('Sabueso');
    expect(plan.resumen.especies_sin_resolver).toBe(1);
  });

  it('contestada la especie, deja de preguntar y la mascota entra', () => {
    // Mismo razonamiento que el test anterior: 'Sabueso' es la raza
    // desconocida del sistema, no 'Criollo'.
    const grilla = [['Ana Gómez', 'Max', '3000000011', '', 'Sabueso', '', '12/09/2026 10:18:00']];
    const { plan } = calcular({
      columnas: cols(grilla), existentes: vacia, hoy: HOY,
      decisiones: { dudas: {}, especies: { sabueso: 'gato' } },
    });
    expect(plan.resumen.especies_sin_resolver).toBe(0);
    expect(plan.envio.crear_mascotas[0].especie).toBe('gato');
    // La raza se guarda tal como la escribieron: lo único que se
    // preguntó fue la especie.
    expect(plan.envio.crear_mascotas[0].raza).toBe('Sabueso');
  });

  // Correr dos veces sobre el mismo archivo no puede acumular avisos: el
  // estado se crea adentro de calcular, no afuera.
  it('dos corridas no comparten avisos', () => {
    const grilla = [['Ana Gómez', 'Max', '3000000011', '', 'Poodle', '31/02/2026', '12/09/2026 10:18:00']];
    const a = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    const b = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    // Comparar los largos NO alcanza: con un estado de módulo las dos
    // corridas devolverían el mismo array y los largos coincidirían igual.
    // Que sean objetos distintos es lo único que prueba que cada corrida
    // arrancó de cero.
    expect(a.estado).not.toBe(b.estado);
    expect(a.estado.avisos).not.toBe(b.estado.avisos);
    expect(a.estado.avisos.length).toBe(b.estado.avisos.length);
    expect(a.estado.avisos.length).toBeGreaterThan(0);
  });

  it('avisa cuando el formato de fechas de la hoja entero no se entiende', () => {
    // Doce filas con fechas que no son fechas: no es un dato suelto malo,
    // es la hoja equivocada.
    const grilla = Array.from({ length: 12 }, (_, i) => (
      [`Tutor ${i}`, `Mascota ${i}`, '3000000011', '', 'Poodle', 'ayer', 'pasado mañana']
    ));
    const { estado } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(estado.fechasRotas).toBeGreaterThanOrEqual(10);
    expect(formatoDeFechasRoto(estado)).toBe(true);
  });

  // La otra cara: unas pocas fechas malas son filas sucias, no la hoja
  // equivocada. Si el banner rojo saliera acá, saldría siempre, y un aviso
  // que sale siempre no lo lee nadie.
  it('unas pocas fechas malas no encienden el banner', () => {
    const grilla = Array.from({ length: 12 }, (_, i) => (
      [`Tutor ${i}`, `Mascota ${i}`, '3000000011', '', 'Poodle', i < 2 ? 'ayer' : '26/07/2018', '12/09/2026 10:18:00']
    ));
    const { estado } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(formatoDeFechasRoto(estado)).toBe(false);
  });

  // El único control contra subir la base de otra veterinaria, y por eso
  // los nombres tienen que salir del envío: es lo que se va a escribir.
  it('los nombres que se muestran son los que se van a crear', () => {
    const { plan } = calcular({ columnas: cols(UNA), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(plan.envio.crear_tutores.map((t) => t.nombre)).toEqual(['Ana Gómez']);
  });

  // La raza en blanco cae en el grupo de clave vacía. La pantalla lo
  // pregunta aparte porque `No sé qué es ""` no es una pregunta.
  it('las mascotas sin raza quedan en el grupo de clave vacía', () => {
    const grilla = [['Ana Gómez', 'Max', '3000000011', '', '', '', '12/09/2026 10:18:00']];
    const { plan } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(plan.especies).toHaveLength(1);
    expect(plan.especies[0].clave).toBe('');
    expect(plan.especies[0].raza).toBe('');
  });
});
