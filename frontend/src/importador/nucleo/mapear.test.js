import { describe, it, expect } from 'vitest';
import { mapearEncabezados, faltanRequeridos, CAMPOS } from './mapear.js';

// Los encabezados reales de la hoja de La Huella, con los espacios al
// final y los paréntesis tal como vienen. Si esto se rompe, se rompió la
// única importación que sabemos que quedó bien.
const LA_HUELLA = [
  'Marca temporal', 'Cedula', 'Nombre y apellidos del Tutor ',
  'Dirección y barrio', 'Contacto telefonos (2)',
  'Nombre Completo de la Mascota ', 'Raza', 'Fecha nacimiento ',
  'Tipo baño', 'Costo final del servicio (Groomer)',
  'Otras observaciones (recomendaciones tutor)', 'Extra [Vacunas anual]',
  'Extra [Tos de las perreras]',
  'Última vacuna (si no recuerda dejar en blanco)',
  'Última desparasitación  (si no recuerda dejar en blanco)',
];

describe('mapearEncabezados · regresión de La Huella', () => {
  it('reconoce las columnas que ya se importaron bien', () => {
    const m = mapearEncabezados(LA_HUELLA);
    expect(m.ts).toBe(0);
    expect(m.cedula).toBe(1);
    expect(m.tutor).toBe(2);
    expect(m.direccion).toBe(3);
    expect(m.telefonos).toBe(4);
    expect(m.mascota).toBe(5);
    expect(m.raza).toBe(6);
    expect(m.nacimiento).toBe(7);
    expect(m.tipo_bano).toBe(8);
    expect(m.costo).toBe(9);
    expect(m.observaciones).toBe(10);
    expect(m.ultima_vacuna).toBe(13);
    expect(m.ultima_desp).toBe(14);
  });

  // "Fecha nacimiento" y "Marca temporal" compiten: la pista 'fecha' de
  // la fecha del servicio también calza. Gana la pista más específica.
  it('no confunde la fecha de nacimiento con la del servicio', () => {
    const m = mapearEncabezados(['Fecha nacimiento', 'Fecha']);
    expect(m.nacimiento).toBe(0);
    expect(m.ts).toBe(1);
  });
});

describe('mapearEncabezados · otras clínicas', () => {
  it('reconoce los sinónimos que usa otro software', () => {
    const m = mapearEncabezados(['Propietario', 'Paciente', 'Celular', 'Documento']);
    expect(m.tutor).toBe(0);
    expect(m.mascota).toBe(1);
    expect(m.telefonos).toBe(2);
    expect(m.cedula).toBe(3);
  });

  it('no asigna dos campos a la misma columna', () => {
    const m = mapearEncabezados(['Nombre', 'Nombre']);
    const usados = Object.values(m);
    expect(new Set(usados).size).toBe(usados.length);
  });

  // Lo que no reconoce NO se adivina: queda fuera, y la pantalla lo
  // muestra como "No importar" para que ella lo corrija si hace falta.
  it('deja fuera lo que no reconoce', () => {
    const m = mapearEncabezados(['Tutor', 'Mascota', 'Columna rara 7']);
    expect(Object.values(m)).not.toContain(2);
  });
});

describe('faltanRequeridos', () => {
  it('no deja seguir sin nombre de tutor ni de mascota', () => {
    expect(faltanRequeridos({})).toEqual(['Nombre del dueño', 'Nombre de la mascota']);
  });

  it('con los dos puestos, no falta nada', () => {
    expect(faltanRequeridos({ tutor: 0, mascota: 1 })).toEqual([]);
  });
});

describe('CAMPOS', () => {
  it('tutor y mascota son los únicos obligatorios', () => {
    expect(CAMPOS.filter((c) => c.requerido).map((c) => c.clave))
      .toEqual(['tutor', 'mascota']);
  });
});
