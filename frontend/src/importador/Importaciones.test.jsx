import { describe, it, expect, vi } from 'vitest';

// `Importaciones.jsx` importa `escribir.js`, que importa `supabase.js`.
// En el entorno de tests (Node) `supabase.js` intenta asignar
// `window.supabase` y revienta. El mock lo cortocircuita antes de que
// llegue a esa línea; es el mismo patrón de `escribir.test.js:5`.
vi.mock('../lib/supabase.js', () => ({ supabase: {}, default: {} }));

import { lineaResumen, ESTADOS, sePuedeDeshacer } from './Importaciones.jsx';

describe('lineaResumen', () => {
  // El resumen que guardó el paso 3, leído seis meses después. Las
  // llaves son las de `plan.resumen` de la tarea 9.
  const RESUMEN = {
    tutores_nuevos: 53, tutores_a_completar: 2,
    mascotas_nuevas: 54, mascotas_a_completar: 0,
    tratamientos: 74, vacunas: 13, eventos_repetidos: 0,
    dudas: 1, especies_sin_resolver: 0,
  };

  it('dice qué entró, en una línea', () => {
    expect(lineaResumen({ resumen: RESUMEN })).toBe(
      '53 tutores · 54 mascotas · 2 tutores a los que les completo datos · 74 baños y desparasitaciones · 13 vacunas',
    );
  });

  it('no escribe las partes en cero', () => {
    expect(lineaResumen({ resumen: { ...RESUMEN, vacunas: 0, tratamientos: 0 } })).toBe(
      '53 tutores · 54 mascotas · 2 tutores a los que les completo datos',
    );
  });

  // El test que los números del piloto no podían agarrar. Con 53 y 54 un
  // plural pegado a mano pasa igual; con 1 y 1 dice "1 tutores".
  it('dice el singular en singular', () => {
    expect(lineaResumen({ resumen: { tutores_nuevos: 1, mascotas_nuevas: 1, vacunas: 1 } }))
      .toBe('1 tutor · 1 mascota · 1 vacuna');
  });

  // Una importación que falló guarda el error en el mismo jsonb. Ese es
  // el dato que importa de esa fila, y va en lugar de los números.
  it('cuando falló, la línea es el error', () => {
    expect(lineaResumen({ resumen: { ...RESUMEN, error: 'se cayó el wifi' } }))
      .toBe('Falló: se cayó el wifi');
  });

  // Una fila de 'en_curso' que nunca llegó al paso 3 no tiene resumen.
  // Decir "0 tutores · 0 mascotas" sería afirmar que no entró nada, y es
  // justo lo que no se sabe.
  it('sin resumen no inventa números', () => {
    expect(lineaResumen({ resumen: {} })).toBe('No quedó registro de qué traía el archivo');
    expect(lineaResumen({})).toBe('No quedó registro de qué traía el archivo');
  });
});

describe('ESTADOS', () => {
  it('tiene un texto para cada estado que permite la tabla', () => {
    // El check de 012_importaciones.sql. Si se agrega un estado allá y no
    // acá, la pantalla muestra undefined.
    for (const e of ['en_curso', 'listo', 'deshecho', 'deshecho_parcial', 'fallido']) {
      expect(ESTADOS[e]?.texto).toBeTruthy();
    }
  });

  // 'deshecho_parcial' NO puede decir lo mismo que 'deshecho': la clínica
  // tiene que poder ver de un vistazo cuál dejó mascotas atrás.
  it('distingue el deshecho parcial del completo', () => {
    expect(ESTADOS.deshecho_parcial.texto).not.toBe(ESTADOS.deshecho.texto);
  });
});

describe('sePuedeDeshacer', () => {
  // La regla tiene que ser la misma que la de 014:65-67, que es la que manda
  // de verdad. Si la pantalla esconde el botón para un estado que la función
  // sí acepta, esos datos quedan sin forma de sacarse.
  it('solo lo bloquea para lo que ya se deshizo', () => {
    expect(sePuedeDeshacer('deshecho')).toBe(false);
    expect(sePuedeDeshacer('deshecho_parcial')).toBe(false);
  });

  // 'fallido' es el que importa. marcarFallida mira solo `duenos` y
  // `mascotas`, así que un archivo que solo le agregó baños a mascotas que ya
  // existían y perdió la respuesta queda 'fallido' CON los baños escritos.
  it('deja deshacer una que falló, que puede tener datos adentro', () => {
    expect(sePuedeDeshacer('fallido')).toBe(true);
    expect(sePuedeDeshacer('en_curso')).toBe(true);
    expect(sePuedeDeshacer('listo')).toBe(true);
  });

  // La autoridad es Postgres, que contesta con un mensaje en español. Esconder
  // el botón por las dudas esconde datos.
  it('un estado que no conoce igual lleva botón', () => {
    expect(sePuedeDeshacer('algo_nuevo')).toBe(true);
  });
});
