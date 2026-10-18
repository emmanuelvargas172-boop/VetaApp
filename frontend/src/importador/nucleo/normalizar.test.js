import { describe, it, expect } from 'vitest';
import {
  nuevoEstado, sinTildes, fechaISO, horaDe, pesos, telefonos, tipoBano, riqueza,
  clasificar,
} from './normalizar.js';

const ctx = { fila: 2, hoja: 'Hoja1', campo: 'fecha' };

describe('fechaISO', () => {
  it('lee el formato d/m/Y que escribe Google Forms en es-CO', () => {
    expect(fechaISO(nuevoEstado(), '26/07/2018', ctx)).toBe('2018-07-26');
  });

  // La MISMA hoja sale en un formato o en otro según el idioma de la
  // cuenta de Google. Sin esto, una exportación en ISO deja un import
  // sin una sola fecha y nadie se entera.
  it('lee también el formato ISO', () => {
    expect(fechaISO(nuevoEstado(), '2018-07-26', ctx)).toBe('2018-07-26');
  });

  it('acepta el doble guion que hay en la hoja real', () => {
    expect(fechaISO(nuevoEstado(), '22--04-2026', ctx)).toBe('2026-04-22');
  });

  it('parte la marca temporal y se queda con la fecha', () => {
    expect(fechaISO(nuevoEstado(), '12/09/2026 10:18:09', ctx)).toBe('2026-09-12');
  });

  it('rechaza un día que no existe', () => {
    const e = nuevoEstado();
    expect(fechaISO(e, '31/02/2026', ctx)).toBeNull();
    expect(e.avisos).toHaveLength(1);
  });

  it('la celda vacía no es un error ni cuenta como fecha vista', () => {
    const e = nuevoEstado();
    expect(fechaISO(e, '', ctx)).toBeNull();
    expect(e.fechasVistas).toBe(0);
    expect(e.avisos).toHaveLength(0);
  });
});

describe('pesos', () => {
  it('quita los separadores de miles', () => {
    expect(pesos(nuevoEstado(), '$60.000', ctx)).toBe(60000);
  });

  it('se queda con el número cuando hay texto pegado y lo avisa', () => {
    const e = nuevoEstado();
    expect(pesos(e, '88.000 sí 72', ctx)).toBe(88000);
    expect(e.avisos[0].texto).toContain('texto extra');
  });

  it('avisa de un costo sospechosamente bajo sin descartarlo', () => {
    const e = nuevoEstado();
    expect(pesos(e, '72', ctx)).toBe(72);
    expect(e.avisos[0].texto).toContain('bajo');
  });
});

describe('telefonos', () => {
  it('separa los dos números pegados con guion', () => {
    expect(telefonos(nuevoEstado(), '3000000011-3000000044', ctx))
      .toEqual(['573000000011', '573000000044']);
  });

  it('separa con espacios alrededor del guion', () => {
    expect(telefonos(nuevoEstado(), '3000000022 - 3000000033', ctx))
      .toEqual(['573000000022', '573000000033']);
  });

  // Dato real de la hoja. Tiene que avisar y NO reventar: este tutor
  // entra igual a la base, solo que con el botón de WhatsApp apagado.
  it('rechaza el "0" y avisa', () => {
    const e = nuevoEstado();
    expect(telefonos(e, '0', ctx)).toEqual([null, null]);
    expect(e.avisos.length).toBeGreaterThan(0);
  });

  it('no duplica cuando el mismo número viene dos veces', () => {
    expect(telefonos(nuevoEstado(), '3000000011 / 3000000011', ctx))
      .toEqual(['573000000011', null]);
  });
});

describe('tipoBano', () => {
  it('unifica con y sin tilde para que no salgan dos servicios', () => {
    expect(tipoBano('Clasico')).toBe('Clásico');
    expect(tipoBano('clásico')).toBe('Clásico');
  });

  it('respeta un tipo que no conoce', () => {
    expect(tipoBano('Spa de barro')).toBe('Spa de barro');
  });
});

describe('sinTildes', () => {
  it('normaliza tildes, mayúsculas y espacios de sobra', () => {
    expect(sinTildes('  Ángel  Ardila ')).toBe('angel ardila');
  });
});

describe('horaDe', () => {
  it('saca la hora de la marca temporal', () => {
    expect(horaDe('12/09/2026 10:18:09')).toBe('10:18');
  });

  it('devuelve null cuando no hay hora', () => {
    expect(horaDe('12/09/2026')).toBeNull();
  });
});

describe('riqueza', () => {
  it('cuenta los campos con dato', () => {
    expect(riqueza({ tutor: 'Ana', mascota: 'Max', cedula: null, raza: '' })).toBe(2);
  });
});

// El bug que el estado global causaría en el navegador: ella importa un
// archivo, no recarga la página, importa otro, y el segundo arranca con
// las advertencias del primero adentro.
describe('estado por corrida', () => {
  it('dos corridas no comparten avisos ni contadores', () => {
    const a = nuevoEstado();
    fechaISO(a, '31/02/2026', ctx);
    expect(a.avisos).toHaveLength(1);
    expect(a.fechasRotas).toBe(1);

    const b = nuevoEstado();
    expect(b.avisos).toHaveLength(0);
    expect(b.fechasVistas).toBe(0);
    expect(b.fechasRotas).toBe(0);
  });
});

describe('clasificar', () => {
  it('reconoce una raza de perro', () => {
    expect(clasificar(nuevoEstado(), 'Poodle')).toEqual({ especie: 'perro', raza: 'Poodle' });
  });

  it('reconoce una raza de gato', () => {
    expect(clasificar(nuevoEstado(), 'Siames')).toEqual({ especie: 'gato', raza: 'Siames' });
  });

  // Dato real: la celda de "Raza" dice "Gato". Dice lo más importante,
  // pero "Gato" no es una raza: guardarlo como tal dejaría la ficha con
  // "Raza: Gato".
  it('lee la especie cuando la escribieron en la columna de raza', () => {
    expect(clasificar(nuevoEstado(), 'Gato')).toEqual({ especie: 'gato', raza: null });
  });

  // El cambio de esta tarea. Antes devolvía 'perro'.
  it('la raza vacía NO es perro: es no sé', () => {
    const e = nuevoEstado();
    expect(clasificar(e, '')).toEqual({ especie: null, raza: null });
    expect(e.sinRaza).toBe(1);
  });

  it('la raza desconocida NO es perro: es no sé, y queda anotada', () => {
    const e = nuevoEstado();
    expect(clasificar(e, 'Criollito')).toEqual({ especie: null, raza: 'Criollito' });
    expect([...e.razasDesconocidas]).toEqual(['Criollito']);
  });

  it('nunca inventa la raza, solo la especie', () => {
    const { raza } = clasificar(nuevoEstado(), 'Spa de barro');
    expect(raza).toBe('Spa de barro');
  });
});
