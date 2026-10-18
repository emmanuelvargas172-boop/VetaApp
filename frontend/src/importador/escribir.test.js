import { describe, it, expect, vi, beforeEach } from 'vitest';

// El mock va antes del import del módulo que lo usa.
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: mock, default: mock }));

const {
  traerExistentes, abrirImportacion, aplicar, marcarFallida, deshacer,
  yaEscribio, listarImportaciones, obtenerImportacion,
} = await import('./escribir.js');

// Un `from()` que devuelve filas y guarda qué columnas le pidieron.
const selects = [];
const tabla = (filas) => ({
  select: (cols) => {
    selects.push(cols);
    const p = Promise.resolve({ data: filas, error: null });
    // .order() y .in() devuelven el mismo thenable para poder encadenar.
    p.order = () => p;
    p.in = () => p;
    p.eq = () => p;
    return p;
  },
});

// Un `from` que sabe contestar las tres formas que usa escribir.js: el
// select de columnas, el select con count para el tapón del reintento, y
// el update del resumen.
const fromQueCuenta = ({
  duenos = 0, mascotas = 0, orden = null, update = null, errorUpdate = null,
} = {}) => (t) => ({
  select: (cols, opts) => {
    if (opts?.count) {
      // `head: true` no es decoración: sin él Supabase hace un GET que baja
      // las filas enteras en vez de un HEAD que solo lee el Content-Range.
      // El mock lo exige para que quitarlo del código ponga el test rojo en
      // vez de dejar producción bajando la base completa para contarla.
      if (!opts.head) throw new Error('el select con count tiene que pedir head: true');
      const n = t === 'duenos' ? duenos : mascotas;
      return { eq: () => Promise.resolve({ count: n, error: null }) };
    }
    const p = Promise.resolve({ data: [], error: null });
    p.order = () => p; p.in = () => p; p.eq = () => p;
    return p;
  },
  update: (campos) => {
    if (orden) orden.push('resumen');
    if (update) update(campos);
    return { eq: () => Promise.resolve({ error: errorUpdate }) };
  },
});

beforeEach(() => {
  selects.length = 0;
  mock.from.mockReset();
  mock.rpc.mockReset();
});

describe('traerExistentes', () => {
  it('pide las columnas que hacen falta para emparejar Y para completar', async () => {
    mock.from.mockImplementation(() => tabla([]));
    await traerExistentes();

    const todas = selects.join(' | ');
    // Sin cedula y direccion no se puede decir "les completo cédula y
    // dirección": el número del paso 3 sería una adivinanza.
    expect(todas).toContain('cedula');
    expect(todas).toContain('direccion');
    expect(todas).toContain('telefono2');
    expect(todas).toContain('fecha_nacimiento');
    expect(todas).toContain('edad_anios');
    // Y sin los eventos, subir el mismo archivo dos veces muestra "74 para
    // crear" y después crea 0.
    expect(mock.from).toHaveBeenCalledWith('tratamientos');
    expect(mock.from).toHaveBeenCalledWith('vacunas');
  });

  it('no trae columnas de más: la foto son kilobytes por mascota', async () => {
    mock.from.mockImplementation(() => tabla([]));
    await traerExistentes();
    expect(selects.join(' | ')).not.toContain('foto');
  });
});

describe('abrirImportacion', () => {
  it('crea la fila en en_curso y devuelve el id', async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 42 }, error: null }) }),
    }));
    mock.from.mockReturnValue({ insert });

    const id = await abrirImportacion({
      archivo: 'Base.xlsx', hoja: 'Hoja1', mapeo: { tutor: 0 },
    });

    expect(id).toBe(42);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      archivo: 'Base.xlsx', hoja: 'Hoja1', mapeo: { tutor: 0 },
    }));
    // `estado` no se manda: el default de la tabla es 'en_curso' y
    // repetirlo acá sería un segundo lugar donde se puede desincronizar.
    expect(insert.mock.calls[0][0]).not.toHaveProperty('estado');
  });
});

describe('aplicar', () => {
  it('manda UNA llamada con el plan completo', async () => {
    // Defecto B del addendum: este test también mockea from, porque
    // aplicar guarda el resumen antes del rpc. Sin este mock, from() sería
    // undefined y fallaría con TypeError antes de llegar a los expects.
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 0 }));
    mock.rpc.mockResolvedValue({ data: { tutores_creados: 53 }, error: null });

    const r = await aplicar(42, { crear_tutores: [{ ref: 't0' }] }, { filas: 54 });

    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith('aplicar_importacion', {
      plan: { importacion_id: 42, crear_tutores: [{ ref: 't0' }] },
    });
    expect(r).toEqual({ tutores_creados: 53 });
  });

  // El resumen es para que seis meses después la clínica pueda leer POR QUÉ
  // "Nube" quedó sin fecha de nacimiento, en vez de pensar que la app se la
  // comió. Va antes de escribir: si la escritura falla, el porqué queda.
  it('guarda el resumen del paso 3 antes de llamar', async () => {
    const orden = [];
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 0, orden }));
    mock.rpc.mockImplementation(() => { orden.push('rpc'); return Promise.resolve({ data: {}, error: null }); });

    await aplicar(42, {}, { avisos: ['Nube sin fecha'] });
    expect(orden).toEqual(['resumen', 'rpc']);
  });

  it('el error de Postgres sale en español y con el id adentro', async () => {
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 0 }));
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    await expect(aplicar(42, {}, {})).rejects.toThrow(/importación 42/);
  });
});

describe('aplicar · tapón del reintento', () => {
  // El caso real: la llamada llegó y Postgres la commiteó, pero se cayó
  // el wifi antes de la respuesta. Para el navegador eso es igual a un
  // fallo. Reenviar el mismo plan duplicaría la base entera.
  it('no reenvía el plan si esa importación ya tiene filas colgadas', async () => {
    mock.from.mockImplementation(fromQueCuenta({ duenos: 53, mascotas: 61 }));
    await expect(aplicar(42, {}, {})).rejects.toThrow(/ya entró/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  // Un archivo que solo le agrega mascotas a clientes que ya existían
  // escribe 0 dueños. Contar solo `duenos` diría "no escribió nada".
  it('cuenta las mascotas aunque no haya escrito ningún dueño', async () => {
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 12 }));
    await expect(aplicar(42, {}, {})).rejects.toThrow(/12 mascotas/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('manda el plan cuando las dos tablas están en cero', async () => {
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 0 }));
    mock.rpc.mockResolvedValue({ data: { tutores_creados: 3 }, error: null });
    const r = await aplicar(42, { crear_tutores: [] }, {});
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ tutores_creados: 3 });
  });
});

describe('yaEscribio', () => {
  // La pantalla del paso 4 también la llama directo para poder decir
  // cuántas filas ya entraron, así que es interfaz pública y no un detalle
  // de `aplicar`.
  it('cuenta por importacion_id y devuelve las dos tablas', async () => {
    const filtros = [];
    mock.from.mockImplementation((t) => ({
      select: (cols, opts) => ({
        eq: (col, val) => {
          filtros.push(`${t}.${col}=${val}`);
          return Promise.resolve({ count: t === 'duenos' ? 7 : 9, error: null });
        },
      }),
    }));

    const r = await yaEscribio(42);

    expect(r).toEqual({ duenos: 7, mascotas: 9 });
    // El filtro es por importacion_id y no por user_id: el aislamiento
    // entre clínicas lo hace RLS, y ponerlo también acá sería un segundo
    // lugar donde se puede equivocar.
    expect(filtros).toEqual(['duenos.importacion_id=42', 'mascotas.importacion_id=42']);
  });

  // Supabase devuelve `count: null` cuando la tabla no tiene filas que
  // cuenten. Para el tapón de `aplicar` da igual —`null || null` y
  // `0 || 0` son los dos falsy— pero la pantalla del paso 4 muestra estos
  // números, y "0 clientes" se lee y "null clientes" no. El `?? 0` es
  // presentación, no lógica, y el título lo dice para que nadie crea que
  // este test cubre el borde del tapón.
  it('traduce el count nulo de Supabase a cero, que es lo que la pantalla muestra', async () => {
    mock.from.mockImplementation(() => ({
      select: () => ({ eq: () => Promise.resolve({ count: null, error: null }) }),
    }));
    expect(await yaEscribio(42)).toEqual({ duenos: 0, mascotas: 0 });
  });
});

describe('listarImportaciones', () => {
  // Si el nombre de la columna del orden estuviera mal, Postgres devuelve
  // error y el historial queda vacío sin decir por qué. Es `creado_en`
  // (012:38), no `created_at`.
  it('ordena por creado_en descendente', async () => {
    let ordenPedido = null;
    mock.from.mockImplementation(() => ({
      select: () => ({
        order: (col, opts) => {
          ordenPedido = { col, opts };
          return Promise.resolve({ data: [{ id: 3 }], error: null });
        },
      }),
    }));

    const r = await listarImportaciones();

    expect(r).toEqual([{ id: 3 }]);
    expect(ordenPedido).toEqual({ col: 'creado_en', opts: { ascending: false } });
  });

  // La pantalla de historial necesita el resumen para mostrar qué entró, y
  // el estado para saber si ofrecer el botón de deshacer.
  it('trae el resumen y el estado, que es lo que la pantalla muestra', async () => {
    let cols = '';
    mock.from.mockImplementation(() => ({
      select: (c) => {
        cols = c;
        const p = Promise.resolve({ data: [], error: null });
        p.order = () => p;
        return p;
      },
    }));

    await listarImportaciones();

    expect(cols).toContain('resumen');
    expect(cols).toContain('estado');
    expect(cols).toContain('cerrado_en');
  });
});

describe('obtenerImportacion', () => {
  // La pantalla de detalle necesita `anteriores`, que la lista no trae: es
  // lo que el import pisó al completar, y es lo que se devuelve si se
  // deshace. Y necesita `mapeo` para poder decir de qué columna salió cada
  // cosa seis meses después.
  it('trae anteriores y mapeo, que la lista no trae', async () => {
    let cols = '';
    let filtro = null;
    mock.from.mockImplementation(() => ({
      select: (c) => {
        cols = c;
        return {
          eq: (col, val) => {
            filtro = `${col}=${val}`;
            return { single: () => Promise.resolve({ data: { id: 7 }, error: null }) };
          },
        };
      },
    }));

    const r = await obtenerImportacion(7);

    expect(r).toEqual({ id: 7 });
    expect(cols).toContain('anteriores');
    expect(cols).toContain('mapeo');
    expect(filtro).toBe('id=7');
  });

  it('el error sale en español', async () => {
    mock.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'no rows' } }),
        }),
      }),
    }));
    await expect(obtenerImportacion(7)).rejects.toThrow(/No se pudo leer la importación/);
  });
});

describe('marcarFallida', () => {
  // Sin esto, una importación que reventó se queda en 'en_curso' para
  // siempre y la pantalla de historial no puede distinguirla de una que
  // está corriendo ahora mismo.
  it('deja el estado en fallido y el motivo guardado', async () => {
    const update = vi.fn();
    mock.from.mockImplementation(fromQueCuenta({ duenos: 0, mascotas: 0, update }));

    await marcarFallida(42, 'se cayó el wifi', { tutores_nuevos: 53 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'fallido' }));
    expect(JSON.stringify(update.mock.calls[0][0])).toContain('se cayó el wifi');
    // El resumen del paso 3 no se pierde: es el dato que sirve justo
    // cuando falla. `update` reemplaza el jsonb entero, así que si no se
    // volviera a mandar quedaría solo el error.
    expect(update.mock.calls[0][0].resumen.tutores_nuevos).toBe(53);
  });

  // El caso de la respuesta perdida: Postgres commiteó —y dejó la clave
  // 'escrito' adentro de `resumen`— pero el navegador no recibió nada y
  // para él fue un fallo. Marcar 'fallido' acá pondría el registro en un
  // estado que contradice las filas que sí están colgadas, y el update
  // plano borraría 'escrito' de paso.
  it('no marca fallida una importación que sí escribió', async () => {
    const update = vi.fn();
    mock.from.mockImplementation(fromQueCuenta({ duenos: 53, mascotas: 61, update }));

    await marcarFallida(42, 'se cayó el wifi', { tutores_nuevos: 53 });

    expect(update).not.toHaveBeenCalled();
  });

  // Si marcarFallida tira, tapa el error de verdad que la pantalla tiene
  // que mostrar. El import ya falló; que el registro quede mal es menos
  // grave que no saber por qué falló.
  it('no tira si tampoco puede escribir el estado', async () => {
    mock.from.mockImplementation(fromQueCuenta({
      duenos: 0, mascotas: 0, errorUpdate: { message: 'sin red' },
    }));
    await expect(marcarFallida(42, 'x')).resolves.toBeUndefined();
  });

  // El guard nuevo hace una lectura más antes de escribir, sobre una
  // conexión que ya demostró estar fallando. Si esa lectura revienta,
  // marcarFallida tiene que seguir sin tirar: el contrato del módulo es
  // que esta función nunca tape el error que la pantalla va a mostrar.
  it('no tira si ni siquiera puede contar las filas', async () => {
    mock.from.mockImplementation(() => ({
      select: () => ({ eq: () => Promise.resolve({ count: null, error: { message: 'sin red' } }) }),
    }));
    await expect(marcarFallida(42, 'x')).resolves.toBeUndefined();
  });
});

describe('deshacer', () => {
  it('llama a la función de Postgres con el id', async () => {
    mock.rpc.mockResolvedValue({ data: { mascotas_borradas: 3 }, error: null });
    const r = await deshacer(7);
    expect(mock.rpc).toHaveBeenCalledWith('deshacer_importacion', { p_importacion: 7 });
    expect(r).toEqual({ mascotas_borradas: 3 });
  });

  it('el "ya se deshizo" de Postgres llega tal cual', async () => {
    mock.rpc.mockResolvedValue({
      data: null, error: { message: 'La importación 7 ya se deshizo' },
    });
    await expect(deshacer(7)).rejects.toThrow(/ya se deshizo/);
  });
});
