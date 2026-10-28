import { describe, it, expect, vi } from 'vitest';

// El mock va ANTES del import. `subtituloPaciente` es una función pura,
// pero Historias.jsx importa api/axios.js, que importa lib/supabase.js,
// que hace `window.supabase = supabase` en modo DEV (lib/supabase.js:21).
// En este vitest no hay jsdom, así que `window` no existe y el import
// reventaría antes de llegar a la función. Mismo patrón que
// importador/paso3Revisar.test.jsx:1-10.
const mockSupabase = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() }, storage: { from: vi.fn() } }));
vi.mock('../lib/supabase.js', () => ({ supabase: mockSupabase, default: mockSupabase }));

import { subtituloPaciente } from './Historias.jsx';

describe('subtituloPaciente', () => {
  // El bug que arregla: la línea era
  // `${consultas.length} consultas · ${vacunas.length} vacunas`, así que
  // una mascota con una sola consulta decía "1 consultas · 0 vacunas" en
  // el encabezado de su propia ficha.
  it('dice singular cuando hay uno', () => {
    expect(subtituloPaciente(1, 1, 1)).toBe('1 consulta · 1 vacuna · 1 archivo');
  });

  it('dice plural cuando hay varios', () => {
    expect(subtituloPaciente(6, 3, 2)).toBe('6 consultas · 3 vacunas · 2 archivos');
  });

  // Los ceros SÍ se escriben acá, al revés que en el importador: esta
  // línea es el estado completo del paciente y "0 archivos" es la
  // respuesta correcta a "¿cuántos archivos tiene?". En el importador el
  // cero se calla porque ahí la lista es de lo que se escribió.
  it('escribe los ceros', () => {
    expect(subtituloPaciente(0, 0, 0)).toBe('0 consultas · 0 vacunas · 0 archivos');
  });
});
