# Importador de base de clientes · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una clínica suba su propio `.xlsx` desde Configuración y la app integre tutores, mascotas e historial — con vista previa, emparejado contra lo que ya existe, y deshacer.

**Architecture:** La lógica que hoy vive en `importar/armar-sql.mjs` se parte en dos. Un núcleo de funciones puras (`frontend/src/importador/nucleo/`) que comparten el navegador y el script de terminal, y dos capas que no se comparten: lectura de `.xlsx` con SheetJS y escritura con `supabase-js`. La escritura no son 180 inserts sueltos sino **una** llamada a una función de Postgres `security invoker`, para que entre todo o no entre nada.

**Tech Stack:** React 18 · Vite 5 · Supabase (Postgres + RLS) · SheetJS (`xlsx`) · Vitest

**Spec:** `docs/superpowers/specs/2026-10-15-importador-base-clientes-design.md` (commit `3dd42b3`)

## Global Constraints

- **Español de Colombia** en todo lo que ve la clínica. Sin inglés, sin jerga técnica.
- **Los comentarios del código explican POR QUÉ, no QUÉ.** Es la convención del repo; mirá `armar-sql.mjs` o `001_init.sql` como referencia.
- **Nada de `security definer`** en las funciones nuevas. Solo `security invoker`. La excepción que ya existe es el trigger de `008_codigo_mascota.sql` y no se toca.
- **Nunca escribir `mascotas.codigo`.** Lo asigna ese trigger y descarta lo que le manden.
- **`duenos.telefono` es `NOT NULL`.** Nunca recibe `null`. Cadena vacía antes que `null`.
- **`mascotas.especie` es `NOT NULL`** y solo vale `'perro'` o `'gato'` en la práctica.
- **`tratamientos.tipo`** tiene `check (tipo in ('vacunacion','desparasitacion','bano','consulta'))`.
- **Los archivos de `importar/`** (`*.csv`, `*.sql`, `revisar.md`) están en `.gitignore` porque traen datos personales reales de 53 clientes de una clínica. **Nunca commitear uno, ni pegar su contenido en un mensaje, ni usarlo como fixture.**
- **Fixtures inventados.** Reproducen las patologías del archivo real con nombres falsos.
- **Cuenta de pruebas:** `emmanuelvargas1722@gmail.com`, que ya tiene 53 tutores / 54 mascotas / 74 tratamientos / 13 vacunas. Ahí se prueba contra Postgres de verdad.
- **Nunca escribir en `lahuella.vetamor@gmail.com`.** Es la cuenta de una clínica en producción. Cualquier cambio ahí lo avisa Emmanuel.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `frontend/src/importador/nucleo/normalizar.js` | Teléfonos, fechas, pesos, razas. Funciones puras, estado por corrida | 1, 2 |
| `frontend/src/importador/nucleo/mapear.js` | Adivinar qué columna del archivo es qué campo | 3 |
| `frontend/src/importador/nucleo/filas.js` | Una fila de la grilla → un objeto, con las validaciones imposibles | 4 |
| `frontend/src/importador/nucleo/agrupar.js` | Filas sueltas → tutores / mascotas / eventos | 4 |
| `frontend/src/importador/nucleo/plan.js` | Lo agrupado + lo que ya hay en la base → crear / completar / dudoso | 9 |
| `frontend/src/importador/leerXlsx.js` | SheetJS: hojas, filas, tipos de celda | 8 |
| `frontend/src/importador/escribir.js` | Llama a las funciones de Postgres | 10 |
| `frontend/src/importador/Importar.jsx` | Los cuatro pasos | 11, 12, 13 |
| `frontend/src/importador/Importaciones.jsx` | Lista e historial, con deshacer | 14 |
| `importar/armar-sql.mjs` | Se queda. Pasa a importar del núcleo | 5 |
| `supabase/migrations/012_importaciones.sql` | Tabla, columnas, RLS | 6 |
| `supabase/migrations/013_aplicar_importacion.sql` | La función transaccional | 7 |
| `supabase/migrations/014_deshacer_importacion.sql` | Deshacer con protección de cascada | 7 |

**Orden:** las tareas 1–5 no tocan ni la base ni la pantalla y terminan con el script de terminal funcionando igual que hoy pero sobre el núcleo nuevo. Las 6–7 son solo SQL. Las 8–14 son el navegador. La 15 verifica todo junto.

---

## Tarea 1: Vitest y el núcleo de normalizaciones

Mover las funciones puras de `armar-sql.mjs` a un módulo compartido, **sin estado global**. Hoy `avisos`, `fechasVistas`, `fechasRotas` y `razasDesconocidas` son variables sueltas del módulo (líneas 125, 140, 279): en un script que corre una vez da igual, en el navegador la segunda importación arranca con los avisos de la primera adentro.

**Files:**
- Create: `frontend/src/importador/nucleo/normalizar.js`
- Create: `frontend/src/importador/nucleo/normalizar.test.js`
- Modify: `frontend/package.json` (script `test` y `vitest` en devDependencies)

**Interfaces:**
- Consumes: `normalizarTelefonoCO` de `frontend/src/utils/whatsapp.js` (ya existe, ya la usa el script)
- Produces:
  - `nuevoEstado() → { avisos: [], fechasVistas: 0, fechasRotas: 0, razasDesconocidas: Set, sinRaza: 0 }`
  - `aviso(estado, ctx, texto, clase = 'dato')` donde `ctx = { fila: number, hoja: string }` y `clase` es `'dato'` | `'descarte'`. Empuja `{ fila, hoja, texto, clase }`
  - `sinTildes(s) → string`
  - `fechaISO(estado, valor, ctx) → 'YYYY-MM-DD' | null`, `ctx = { fila, hoja, campo }`
  - `horaDe(valor) → 'HH:MM' | null`
  - `pesos(estado, valor, ctx) → number | null`
  - `telefonos(estado, valor, ctx) → [string|null, string|null]`
  - `tipoBano(valor) → string | null`
  - `riqueza(fila) → number`

- [ ] **Step 1: Instalar Vitest**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm install --save-dev vitest@^2
```

Agregar a `frontend/package.json`, dentro de `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Escribir el test que falla**

Crear `frontend/src/importador/nucleo/normalizar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  nuevoEstado, sinTildes, fechaISO, horaDe, pesos, telefonos, tipoBano, riqueza,
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
    expect(telefonos(nuevoEstado(), '3000000200-3000000201', ctx))
      .toEqual(['573000000200', '573000000201']);
  });

  it('separa con espacios alrededor del guion', () => {
    expect(telefonos(nuevoEstado(), '3000000202 - 3000000203', ctx))
      .toEqual(['573000000202', '573000000203']);
  });

  // Dato real de la hoja. Tiene que avisar y NO reventar: este tutor
  // entra igual a la base, solo que con el botón de WhatsApp apagado.
  it('rechaza el "0" y avisa', () => {
    const e = nuevoEstado();
    expect(telefonos(e, '0', ctx)).toEqual([null, null]);
    expect(e.avisos.length).toBeGreaterThan(0);
  });

  it('no duplica cuando el mismo número viene dos veces', () => {
    expect(telefonos(nuevoEstado(), '3000000200 / 3000000200', ctx))
      .toEqual(['573000000200', null]);
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
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: FAIL. `Failed to resolve import "./normalizar.js"`.

- [ ] **Step 4: Escribir `normalizar.js`**

Crear `frontend/src/importador/nucleo/normalizar.js`. Es el bloque 2 de `armar-sql.mjs` (líneas 84–270) con una sola diferencia: el estado entra por parámetro.

```js
// ============================================================
// VetaApp · importador/nucleo/normalizar.js
// Lo que hay que hacerle a una celda antes de que sea un dato.
//
// Cada función existe por un valor concreto que ya apareció en la hoja de
// una clínica real. Ninguna adivina: lo que no entiende lo manda a los
// avisos, que la clínica ve en el paso 3 antes de confirmar.
//
// El estado va por parámetro y no en variables del módulo porque esto
// corre en el navegador. Allá el módulo NO se muere entre una importación
// y la siguiente: con estado global, el segundo archivo arrancaría con
// los avisos del primero adentro y los contadores inflados.
// ============================================================

import { normalizarTelefonoCO } from '../../utils/whatsapp.js';

export function nuevoEstado() {
  return {
    avisos: [],
    fechasVistas: 0,
    fechasRotas: 0,
    razasDesconocidas: new Set(),
    sinRaza: 0,
  };
}

// `clase` separa dos cosas que la pantalla NO puede mostrar juntas:
// 'descarte' es una fila que no va a entrar, y 'dato' es algo raro de una
// fila que sí entra. En el paso 3 la primera va bajo "No voy a importar"
// y la segunda bajo los avisos. Si fueran la misma lista, la pantalla
// tendría que adivinar por el texto del mensaje cuál es cuál, y el día que
// alguien reescriba un mensaje el contador de filas perdidas se cae en
// silencio.
export const aviso = (estado, ctx, texto, clase = 'dato') =>
  estado.avisos.push({ fila: ctx.fila, hoja: ctx.hoja, texto, clase });

export const sinTildes = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// "12/09/2026 10:18:09", "07-07-2026", "22--04-2026" (doble guion, dato
// real), "1/06/2021" y "2018-07-26" → ISO o null.
export function fechaISO(estado, valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  estado.fechasVistas++;
  const malo = (texto) => { estado.fechasRotas++; aviso(estado, ctx, texto); return null; };

  const soloFecha = s.split(/\s+/)[0].replace(/[-.]+/g, '/').replace(/\/{2,}/g, '/');
  const partes = soloFecha.split('/').filter(Boolean);
  if (partes.length !== 3) return malo(`fecha ilegible en ${ctx.campo}: "${s}"`);

  // Cuál número es el año no se adivina: si el primero tiene cuatro cifras
  // solo puede ser el año, y si no, es el día (d/m/Y, que es como escribe
  // Google Forms en es-CO).
  let d, m, a;
  if (partes[0].length === 4) [a, m, d] = partes.map((p) => parseInt(p, 10));
  else                        [d, m, a] = partes.map((p) => parseInt(p, 10));
  if (a < 100) a += 2000;

  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 1990 && a <= 2100)) {
    return malo(`fecha fuera de rango en ${ctx.campo}: "${s}"`);
  }
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Verifica que el día exista de verdad: "31/02/2026" pasa los rangos.
  const prueba = new Date(a, m - 1, d);
  if (prueba.getMonth() !== m - 1 || prueba.getDate() !== d) {
    return malo(`fecha que no existe en ${ctx.campo}: "${s}"`);
  }
  return iso;
}

// Hora de la marca temporal, para `tratamientos.hora`. Es dato real: a esa
// hora se llenó el formulario.
export function horaDe(valor) {
  const m = String(valor ?? '').match(/\b(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// "40000", "$60.000", "88.000", "88.000 sí 72" → entero en pesos.
// Los puntos son separadores de miles, no decimales: en las hojas vistas
// no hay un solo precio con centavos y todos los valores con punto son de
// 5 ó 6 cifras ("35.000", "110.000").
export function pesos(estado, valor, ctx) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const token = s.split(/\s+/)[0];
  const n = parseInt(token.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n === 0) {
    aviso(estado, ctx, `costo ilegible: "${s}"`);
    return null;
  }
  // Lo que sobró después del primer token es texto que alguien escribió a
  // mano. No se pierde: queda en los avisos y en las notas del tratamiento.
  if (s !== token) aviso(estado, ctx, `costo con texto extra: "${s}" → se tomó ${n}`);
  if (n < 1000) aviso(estado, ctx, `costo sospechosamente bajo: "${s}" → ${n}`);
  return n;
}

// "3000000200-3000000201", "3000000202 - 3000000203", "" → [tel1, tel2].
// Valida con la MISMA función que usa la app para armar el enlace de
// WhatsApp, así no hay dos ideas de qué es un número válido.
export function telefonos(estado, valor, ctx) {
  const crudos = String(valor ?? '')
    .split(/[-/;,]| y | Y |\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const buenos = [];
  for (const c of crudos) {
    const n = normalizarTelefonoCO(c);
    if (n) { if (!buenos.includes(n)) buenos.push(n); }
    else aviso(estado, ctx, `teléfono que WhatsApp no acepta: "${c}"`);
  }
  if (!buenos.length && String(valor ?? '').trim()) {
    aviso(estado, ctx, `ningún teléfono usable en "${valor}"`);
  }
  return [buenos[0] ?? null, buenos[1] ?? null];
}

// "Clasico" / "Clásico" → una sola forma, con tilde, que es como se
// escribe. Sin esto la clínica vería dos servicios distintos.
export function tipoBano(valor) {
  const t = sinTildes(valor);
  if (!t) return null;
  if (t.startsWith('clasico'))  return 'Clásico';
  if (t.startsWith('hydra'))    return 'Hydra';
  if (t.startsWith('medicado')) return 'Medicado';
  return String(valor).trim(); // forma nueva: se respeta tal cual
}

// Cuántos campos útiles trae una fila. Es el criterio para decidir cuál
// gana cuando la misma mascota aparece dos veces.
export const riqueza = (r) => [
  r.cedula, r.tutor, r.direccion, r.tel1, r.tel2, r.mascota, r.raza,
  r.nacimiento, r.tipo_bano, r.costo, r.observaciones, r.ultima_vacuna, r.ultima_desp,
].filter((x) => x !== null && x !== '' && x !== undefined).length;
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: PASS, 20 tests.

- [ ] **Step 6: Verificar que el build sigue pasando**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run build
```

Esperado: `✓ built in ...`. Vitest es `devDependency`, no entra al bundle.

- [ ] **Step 7: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/package.json frontend/package-lock.json frontend/src/importador/
git commit -m "Saca las normalizaciones del importador a un núcleo con tests

El importador va a correr en el navegador, donde el módulo no se muere
entre una importación y la siguiente. Las variables sueltas del módulo
—avisos, contadores de fechas, razas desconocidas— harían que el segundo
archivo arrancara con los avisos del primero adentro. Pasan a ir por
parámetro.

Entra Vitest: el smoke test que se le hizo al script encontró cuatro
bugs, uno que abortaba el import completo. Eso no se ve leyendo el código."
```

---

## Tarea 2: La especie deja de adivinarse

`clasificar()` hoy tiene una suposición que es cierta para La Huella y falsa para cualquier otra clínica. Línea 257 de `armar-sql.mjs`:

```js
if (!r) return { especie: 'perro', raza: null }; // sin raza: la hoja entera es de una peluquería canina
```

Una celda de raza vacía se vuelve **perro**, en silencio. En una peluquería canina está bien. En una veterinaria con gatos, cada gato sin raza anotada entra como perro — y la especie decide la dosis.

El núcleo pasa a devolver `especie: null` en los dos casos sin certeza (raza vacía y raza desconocida) y **quien llama decide**: el script de terminal se detiene y pregunta a Emmanuel, el navegador lo pregunta en el paso 3.

**Files:**
- Modify: `frontend/src/importador/nucleo/normalizar.js`
- Modify: `frontend/src/importador/nucleo/normalizar.test.js`

**Interfaces:**
- Produces: `clasificar(estado, razaCruda) → { especie: 'perro'|'gato'|null, raza: string|null }`
  - `especie: null` significa **no sé**, nunca "probablemente perro"
  - acumula en `estado.razasDesconocidas` (Set) y `estado.sinRaza` (contador)
- Produces: `RAZAS_PERRO`, `RAZAS_GATO`, `ESPECIE_ESCRITA` exportados, para que la pantalla pueda mostrar qué conoce

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `frontend/src/importador/nucleo/normalizar.test.js`:

```js
import { clasificar } from './normalizar.js';

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
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test -- -t clasificar
```

Esperado: FAIL. `clasificar is not exported` o, si ya se movió, los dos casos de "no sé" devuelven `perro`.

- [ ] **Step 3: Escribir `clasificar` en `normalizar.js`**

Agregar a `frontend/src/importador/nucleo/normalizar.js`:

```js
// Razas que sabemos que son de perro: las que aparecieron en hojas reales
// más las comunes en Colombia.
export const RAZAS_PERRO = new Set([
  'mestizo', 'mestiza', 'criollo', 'criolla', 'shitzu', 'shih tzu', 'schnauzer',
  'tequel', 'teckel', 'salchicha', 'pug', 'pinscher', 'poodle', 'french poodle',
  'cocker', 'westhly', 'west highland', 'golden', 'golden retriever', 'yorkie',
  'yorkshire', 'pomerania', 'pomeranian', 'husky', 'labrador', 'beagle',
  'bulldog', 'chihuahua', 'maltes', 'bichon', 'boxer', 'pastor aleman',
  'pastor', 'border collie', 'dalmata', 'rottweiler', 'pitbull', 'pit bull',
  'basset', 'san bernardo', 'gran danes', 'doberman', 'akita', 'chow chow',
]);

export const RAZAS_GATO = new Set([
  'persa', 'siames', 'angora', 'criollo gato', 'mestizo gato', 'bengali',
  'maine coon', 'esfinge', 'sphynx',
]);

// Algunas celdas de "Raza" traen la ESPECIE y no la raza. No es un dato
// malo —dice lo más importante— pero "Gato" no es una raza. Se lee como
// especie y la raza queda vacía, que es la verdad: no la dijeron.
export const ESPECIE_ESCRITA = {
  gato: 'gato', gata: 'gato', felino: 'gato', felina: 'gato',
  perro: 'perro', perra: 'perro', canino: 'perro', canina: 'perro',
};

// Devuelve las dos cosas juntas porque se deciden juntas: qué especie es y
// qué queda escrito en `raza`.
//
// `especie: null` quiere decir NO SÉ, y nunca "probablemente perro". La
// versión anterior devolvía 'perro' cuando la celda venía vacía, porque la
// primera hoja que importamos era de una peluquería canina. En una
// veterinaria con gatos eso mete cada gato sin raza anotada como perro, y
// la especie es lo que decide la dosis. Quien llama decide: el script de
// terminal se detiene, la app lo pregunta antes de escribir nada.
export function clasificar(estado, razaCruda) {
  const r = sinTildes(razaCruda);
  const raza = String(razaCruda ?? '').trim() || null;
  if (!r) { estado.sinRaza++; return { especie: null, raza: null }; }
  if (ESPECIE_ESCRITA[r]) return { especie: ESPECIE_ESCRITA[r], raza: null };
  for (const p of RAZAS_PERRO) if (r.startsWith(p) || p.startsWith(r)) return { especie: 'perro', raza };
  for (const g of RAZAS_GATO)  if (r.startsWith(g) || g.startsWith(r)) return { especie: 'gato',  raza };
  estado.razasDesconocidas.add(raza);
  return { especie: null, raza };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: PASS, 26 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/nucleo/
git commit -m "Deja de adivinar que una mascota sin raza es un perro

La versión anterior devolvía 'perro' para la celda vacía, con el
argumento de que la hoja entera era de una peluquería canina. Es cierto
para esa hoja y falso para cualquier veterinaria con gatos: cada gato sin
raza anotada entraría como perro, y la especie es lo que decide la dosis.

Ahora devuelve null —no sé— y decide quien llama."
```

---

## Tarea 3: Adivinar las columnas de cualquier clínica

`COLUMNAS` en `armar-sql.mjs` (líneas 91–107) reconoce los encabezados **de una hoja**: `'nombre y apellidos del tutor'`, `'contacto telefonos'`, `'costo final del servicio'`. Otra clínica va a escribir "Propietario", "Celular", "Valor" — y no se reconocería nada.

Pasa a una tabla de sinónimos por campo, con puntaje. La clínica corrige lo que la app adivinó mal en el paso 2, así que no tiene que acertar siempre: tiene que acertar lo obvio y no inventar lo demás.

**Files:**
- Create: `frontend/src/importador/nucleo/mapear.js`
- Create: `frontend/src/importador/nucleo/mapear.test.js`

**Interfaces:**
- Consumes: `sinTildes` de `./normalizar.js`
- Produces:
  - `CAMPOS` — arreglo de `{ clave, etiqueta, requerido, pistas: string[] }`. La pantalla arma los desplegables con esto.
  - `mapearEncabezados(encabezados: string[]) → { [clave]: number }` — índice de columna por campo. Lo que no reconoce no aparece.
  - `faltanRequeridos(mapa) → string[]` — etiquetas de los campos obligatorios sin columna.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/nucleo/mapear.test.js`:

```js
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
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: FAIL. `Failed to resolve import "./mapear.js"`.

- [ ] **Step 3: Escribir `mapear.js`**

```js
// ============================================================
// VetaApp · importador/nucleo/mapear.js
// Qué columna del archivo es qué campo.
//
// La versión anterior reconocía los encabezados EXACTOS de una hoja
// ("nombre y apellidos del tutor"). Servía para esa clínica y para
// ninguna otra: la de al lado escribe "Propietario".
//
// Esto no tiene que acertar siempre. La clínica corrige el mapeo en el
// paso 2 antes de seguir. Tiene que acertar lo obvio y, sobre todo, NO
// inventar: una columna que no reconoce se queda fuera, no se mete al
// campo más parecido.
// ============================================================

import { sinTildes } from './normalizar.js';

// Las pistas van de la más específica a la más general. El orden no
// decide por sí solo —gana la que calza mejor, ver `puntaje`— pero deja
// claro cuál es el encabezado "de verdad" de cada campo.
export const CAMPOS = [
  { clave: 'tutor', etiqueta: 'Nombre del dueño', requerido: true,
    pistas: ['nombre y apellidos del tutor', 'nombre del tutor', 'nombre del cliente',
             'nombre del propietario', 'propietario', 'responsable', 'tutor', 'dueno', 'cliente'] },

  { clave: 'mascota', etiqueta: 'Nombre de la mascota', requerido: true,
    pistas: ['nombre completo de la mascota', 'nombre de la mascota', 'nombre del paciente',
             'nombre mascota', 'mascota', 'paciente', 'animal'] },

  { clave: 'cedula', etiqueta: 'Cédula',
    pistas: ['numero de documento', 'identificacion', 'documento', 'cedula', 'nit', 'cc'] },

  { clave: 'telefonos', etiqueta: 'Teléfono',
    pistas: ['contacto telefonos', 'numero de contacto', 'telefono', 'celular',
             'whatsapp', 'movil', 'contacto'] },

  { clave: 'direccion', etiqueta: 'Dirección',
    pistas: ['direccion y barrio', 'direccion', 'residencia', 'barrio'] },

  { clave: 'raza', etiqueta: 'Raza',
    pistas: ['raza o especie', 'raza', 'especie'] },

  { clave: 'nacimiento', etiqueta: 'Fecha de nacimiento',
    pistas: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'fecha de nac'] },

  { clave: 'ts', etiqueta: 'Fecha del servicio',
    pistas: ['marca temporal', 'fecha del servicio', 'fecha de atencion', 'fecha de ingreso', 'fecha'] },

  { clave: 'tipo_bano', etiqueta: 'Tipo de servicio',
    pistas: ['tipo de bano', 'tipo bano', 'tipo de servicio', 'servicio'] },

  { clave: 'costo', etiqueta: 'Costo',
    pistas: ['costo final del servicio', 'valor del servicio', 'costo', 'valor', 'precio', 'total'] },

  { clave: 'observaciones', etiqueta: 'Observaciones',
    pistas: ['otras observaciones', 'observaciones', 'observacion', 'comentario', 'nota'] },

  { clave: 'extra_vacuna', etiqueta: 'Contrató vacuna anual',
    pistas: ['extra [vacunas anual]', 'extra vacunas anual', 'vacuna anual'] },

  { clave: 'extra_tos', etiqueta: 'Contrató tos de las perreras',
    pistas: ['extra [tos de las perreras]', 'extra tos de las perreras', 'tos de las perreras'] },

  { clave: 'ultima_vacuna', etiqueta: 'Última vacuna',
    pistas: ['ultima vacuna', 'fecha ultima vacuna', 'vacuna'] },

  { clave: 'ultima_desp', etiqueta: 'Última desparasitación',
    pistas: ['ultima desparasitacion', 'fecha ultima desparasitacion', 'desparasitacion'] },
];

// Qué tan bien calza una pista con un encabezado. Devuelve `null` si no
// calza. El segundo número es el largo de la pista: entre dos pistas que
// calzan, gana la más específica. Eso es lo que evita que "Fecha
// nacimiento" se vaya a la fecha del servicio por la pista 'fecha'.
function puntaje(encabezado, pista) {
  if (encabezado === pista)            return [3, pista.length];
  if (encabezado.startsWith(pista))    return [2, pista.length];
  if (encabezado.includes(pista))      return [1, pista.length];
  return null;
}

export function mapearEncabezados(encabezados) {
  const limpios = encabezados.map(sinTildes);

  // Todas las combinaciones posibles, ordenadas de la que mejor calza a
  // la que peor. Se resuelve globalmente y no columna por columna: si se
  // decidiera en orden de aparición, la primera columna se quedaría con
  // un campo que le calza apenas y se lo robaría a otra que le calza
  // exacto.
  const candidatos = [];
  limpios.forEach((h, i) => {
    if (!h) return;
    for (const campo of CAMPOS) {
      let mejor = null;
      for (const pista of campo.pistas) {
        const p = puntaje(h, pista);
        if (p && (!mejor || p[0] > mejor[0] || (p[0] === mejor[0] && p[1] > mejor[1]))) mejor = p;
      }
      if (mejor) candidatos.push({ col: i, clave: campo.clave, nivel: mejor[0], largo: mejor[1] });
    }
  });

  candidatos.sort((a, b) => b.nivel - a.nivel || b.largo - a.largo || a.col - b.col);

  const mapa = {};
  const columnasUsadas = new Set();
  for (const c of candidatos) {
    if (mapa[c.clave] !== undefined || columnasUsadas.has(c.col)) continue;
    mapa[c.clave] = c.col;
    columnasUsadas.add(c.col);
  }
  return mapa;
}

export function faltanRequeridos(mapa) {
  return CAMPOS.filter((c) => c.requerido && mapa[c.clave] === undefined).map((c) => c.etiqueta);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: PASS. Si falla la regresión de La Huella, **el bug está en las pistas, no en el test**: ese mapeo es el que produjo la única importación verificada.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/nucleo/
git commit -m "Reconoce las columnas de cualquier clínica, no las de una hoja

La tabla anterior tenía los encabezados exactos de la hoja de La Huella.
La clínica de al lado escribe Propietario, Celular, Valor y no se
reconocería ni una columna.

Pasa a sinónimos con puntaje, resuelto globalmente: entre dos pistas que
calzan gana la más específica, que es lo que evita que Fecha nacimiento
se vaya al campo de la fecha del servicio. El test de regresión fija el
mapeo de La Huella, que es la única importación verificada que existe."
```

---

## Tarea 4: De la grilla a tutores, mascotas y eventos

Dos pasos que van juntos: leer cada fila con el mapeo de la tarea 3, y agrupar las filas repetidas. Son los bloques 3 y 4 de `armar-sql.mjs` (líneas 272–479), sin terminal.

Acá vive la validación que más importa del importador: **una vacuna con fecha anterior al nacimiento prueba que el nacimiento está mal.** Se descarta la fecha, no el evento. Con la fecha falsa, la mascota entra con "Recién nacida" en la ficha de un perro adulto, eso se lee como dato cierto, y de ahí sale una dosis.

**Files:**
- Create: `frontend/src/importador/nucleo/filas.js`
- Create: `frontend/src/importador/nucleo/agrupar.js`
- Create: `frontend/src/importador/nucleo/agrupar.test.js`

**Interfaces:**
- Consumes: todo `./normalizar.js`
- Produces:
  - `leerFilas(estado, { grilla, mapa, hoja }) → Fila[]`
    `grilla` es `string[][]` **sin** el encabezado. `Fila` tiene: `nFila, hoja, cedula, tutor, direccion, tel1, tel2, mascota, especie, raza, nacimiento, ts, hora, tipo_bano, costo, costoCrudo, observaciones, extra_vacuna, extra_tos, ultima_vacuna, ultima_desp`
  - `formatoDeFechasRoto(estado) → boolean` — `true` si vio ≥10 fechas y falló en más de la mitad
  - `agrupar(estado, filas) → { tutores: Map, mascotas: Map, eventos: Array }`
    - tutor: `{ clave, cedula, nombre, direccion, tel1, tel2, origen: string[] }`
    - mascota: `{ clave, tutor, nombre, especie, raza, nacimiento, origen: string[] }`
    - evento tratamiento: `{ tipo: 'tratamiento', mascota, t, fecha, hora, notas }`
    - evento vacuna: `{ tipo: 'vacuna', mascota, nombre, fecha, proxima, notas }`
      `nombre` queda en `'Anual'` cuando el archivo no dice cuál fue — es lo que trae una columna "última vacuna", y `vacunas.nombre` es `NOT NULL`, así que algo tiene que ir

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/nucleo/agrupar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { nuevoEstado } from './normalizar.js';
import { leerFilas, formatoDeFechasRoto } from './filas.js';
import { agrupar } from './agrupar.js';

// Mapeo fijo para los tests: columna 0 tutor, 1 mascota, 2 teléfono,
// 3 cédula, 4 raza, 5 nacimiento, 6 fecha del servicio, 7 última vacuna.
const MAPA = { tutor: 0, mascota: 1, telefonos: 2, cedula: 3, raza: 4,
               nacimiento: 5, ts: 6, ultima_vacuna: 7 };
const leer = (grilla, estado = nuevoEstado()) =>
  ({ estado, filas: leerFilas(estado, { grilla, mapa: MAPA, hoja: 'Hoja1' }) });

describe('leerFilas', () => {
  it('lee una fila completa', () => {
    const { filas } = leer([['Ana Gómez', 'Max', '3000000200', '1000000200', 'Poodle', '26/07/2018', '', '']]);
    expect(filas[0]).toMatchObject({
      tutor: 'Ana Gómez', mascota: 'Max', tel1: '573000000200',
      cedula: '1000000200', raza: 'Poodle', especie: 'perro', nacimiento: '2018-07-26',
    });
  });

  it('salta la fila completamente vacía sin avisar', () => {
    const { estado, filas } = leer([['', '', '', '', '', '', '', '']]);
    expect(filas).toHaveLength(0);
    expect(estado.avisos).toHaveLength(0);
  });

  // Una fila con teléfono y costo pero sin nombres es una visita que se
  // cobró. No se importa, pero NO se desaparece en silencio.
  it('descarta la fila sin nombres pero la avisa', () => {
    const { estado, filas } = leer([['', '', '3000000200', '', '', '', '', '']]);
    expect(filas).toHaveLength(0);
    expect(estado.avisos[0].texto).toContain('sin nombres');
    // 'descarte' y no 'dato': el paso 3 cuenta estos aparte para poder
    // decir "no voy a importar 3 filas" sin leer el texto del mensaje.
    expect(estado.avisos[0].clase).toBe('descarte');
  });

  it('avisa cuando la mascota nació el mismo día del registro', () => {
    const { estado } = leer([['Ana', 'Max', '', '', 'Poodle', '17/09/2026', '17/09/2026', '']]);
    expect(estado.avisos.some((a) => a.texto.includes('mismo día del registro'))).toBe(true);
  });

  // El caso "Nube": vacuna el 2026-07-14, nacimiento el 2026-09-17.
  // Imposible. Lo probado es que el nacimiento es falso.
  it('descarta el nacimiento cuando hay una vacuna anterior, no la vacuna', () => {
    const { estado, filas } = leer([['Ana', 'Nube', '', '', 'Poodle', '17/09/2026', '', '14/07/2026']]);
    expect(filas[0].nacimiento).toBeNull();
    expect(filas[0].ultima_vacuna).toBe('2026-07-14');
    expect(estado.avisos.some((a) => a.texto.startsWith('IMPOSIBLE'))).toBe(true);
  });

  // Leer las fechas dos veces duplicaría cada aviso y falsearía el
  // contador que decide si la hoja viene en otro formato.
  it('no repite el aviso de una fecha mala', () => {
    const { estado } = leer([['Ana', 'Max', '', '', 'Poodle', '31/02/2026', '', '']]);
    expect(estado.avisos.filter((a) => a.texto.includes('31/02/2026'))).toHaveLength(1);
  });
});

describe('formatoDeFechasRoto', () => {
  it('con pocas fechas no decide nada', () => {
    const e = nuevoEstado();
    e.fechasVistas = 4; e.fechasRotas = 4;
    expect(formatoDeFechasRoto(e)).toBe(false);
  });

  it('con muchas fechas y la mayoría rotas, la hoja está en otro formato', () => {
    const e = nuevoEstado();
    e.fechasVistas = 20; e.fechasRotas = 15;
    expect(formatoDeFechasRoto(e)).toBe(true);
  });
});

describe('agrupar', () => {
  it('une al mismo tutor por cédula aunque el nombre esté escrito distinto', () => {
    const { estado, filas } = leer([
      ['Ana Gómez',  'Max',  '3000000200', '1000000200', 'Poodle', '', '', ''],
      ['ana gomez',  'Luna', '3000000200', '1000000200', 'Pug',    '', '', ''],
    ]);
    const { tutores, mascotas } = agrupar(estado, filas);
    expect(tutores.size).toBe(1);
    expect(mascotas.size).toBe(2);
  });

  // Dos personas distintas con el mismo nombre y teléfonos distintos.
  // Pasó de verdad: hay dos "Teofilo Arboleda" en la base de La Huella.
  it('NO une dos tutores del mismo nombre con teléfonos distintos', () => {
    const { estado, filas } = leer([
      ['Teofilo Arboleda', 'Max',  '3000000202', '', '', '', '', ''],
      ['Teofilo Arboleda', 'Luna', '3000000203', '', '', '', '', ''],
    ]);
    expect(agrupar(estado, filas).tutores.size).toBe(2);
  });

  it('la dirección más larga gana porque dice más del mismo lugar', () => {
    const grilla = [
      ['Ana', 'Max', '3000000200', '1000000200', '', '', '', ''],
      ['Ana', 'Max', '3000000200', '1000000200', '', '', '', ''],
    ];
    const estado = nuevoEstado();
    const filas = leerFilas(estado, { grilla, mapa: { ...MAPA, direccion: 8 }, hoja: 'Hoja1' });
    filas[0].direccion = 'Calle 11 #20-30 Barrio Prueba';
    filas[1].direccion = 'Calle 10 #20-30 Barrio Prueba';
    expect(agrupar(estado, filas).tutores.values().next().value.direccion)
      .toBe('Calle 10 #20-30 Barrio Prueba');
  });

  // "Noah" y "Noah Emiliano" son dos perros. Decisión del dueño.
  it('no junta dos mascotas con nombres parecidos del mismo tutor', () => {
    const { estado, filas } = leer([
      ['Ángela', 'Noah',          '3000000200', '', '', '', '', ''],
      ['Ángela', 'Noah Emiliano', '3000000200', '', '', '', '', ''],
    ]);
    expect(agrupar(estado, filas).mascotas.size).toBe(2);
  });

  it('cada fila con fecha de servicio es un baño distinto', () => {
    const { estado, filas } = leer([
      ['Ana', 'Max', '3000000200', '', '', '', '12/09/2026', ''],
      ['Ana', 'Max', '3000000200', '', '', '', '19/09/2026', ''],
    ]);
    const banos = agrupar(estado, filas).eventos.filter((e) => e.t === 'bano');
    expect(banos).toHaveLength(2);
  });

  it('la vacuna queda con la próxima dosis un año después', () => {
    const { estado, filas } = leer([['Ana', 'Max', '3000000200', '', '', '', '', '14/07/2026']]);
    const v = agrupar(estado, filas).eventos.find((e) => e.tipo === 'vacuna');
    expect(v).toMatchObject({ fecha: '2026-07-14', proxima: '2027-07-14' });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: FAIL. `Failed to resolve import "./filas.js"`.

- [ ] **Step 3: Escribir `filas.js`**

```js
// ============================================================
// VetaApp · importador/nucleo/filas.js
// Una fila de la grilla → una fila con los datos ya limpios.
//
// Las cuatro fechas se leen UNA vez por fila y se reusan. Leerlas dos
// veces repetiría cada aviso y falsearía el contador que decide si la
// hoja entera viene en un formato que no reconocemos.
// ============================================================

import { aviso, fechaISO, horaDe, pesos, telefonos, tipoBano, clasificar } from './normalizar.js';

const siNo = (v) => /^s[ií]$/i.test(String(v ?? '').trim());

export function leerFilas(estado, { grilla, mapa, hoja }) {
  const salida = [];

  grilla.forEach((c, i) => {
    const nFila = i + 2; // +1 por el encabezado, +1 porque las hojas cuentan desde 1
    const get = (clave) => (mapa[clave] === undefined ? '' : String(c[mapa[clave]] ?? '').trim());
    const ctx = { fila: nFila, hoja };

    // La condición mira la fila ENTERA y no solo tutor+mascota, porque
    // una fila con teléfono y costo pero sin nombres sí es un problema:
    // es una visita que se cobró y que se iba a perder sin que nadie lo
    // supiera.
    if (c.every((x) => !String(x ?? '').trim())) return;

    const tutor = get('tutor');
    const mascota = get('mascota');
    if (!tutor || !mascota) {
      aviso(estado, ctx, `fila con datos pero sin nombres (tutor="${tutor}", mascota="${mascota}") → NO se importa, hay que mirarla en la hoja`, 'descarte');
      return;
    }

    const [tel1, tel2] = telefonos(estado, get('telefonos'), ctx);
    const nacimiento   = fechaISO(estado, get('nacimiento'),    { ...ctx, campo: 'fecha nacimiento' });
    const ts           = fechaISO(estado, get('ts'),            { ...ctx, campo: 'fecha del servicio' });
    const ultimaVacuna = fechaISO(estado, get('ultima_vacuna'), { ...ctx, campo: 'última vacuna' });
    const ultimaDesp   = fechaISO(estado, get('ultima_desp'),   { ...ctx, campo: 'última desparasitación' });

    if (nacimiento && ts && nacimiento === ts) {
      aviso(estado, ctx, `"${mascota}" nació el mismo día del registro (${ts}) — ¿es un recién nacido o se copió la fecha de hoy?`);
    }

    // Se descarta la FECHA, no el evento: lo que está probado es que el
    // nacimiento es falso. Sin fecha la mascota entra con edad 0 y un
    // campo vacío que la clínica puede llenar; con la fecha falsa entra
    // con "Recién nacida" en la ficha de un perro adulto, que se lee
    // como un dato cierto y de ahí sale una dosis.
    let nacimientoUsable = nacimiento;
    for (const [cual, f] of [['la última vacuna', ultimaVacuna], ['la última desparasitación', ultimaDesp]]) {
      // Comparar las ISO como texto alcanza: YYYY-MM-DD ordena igual
      // alfabéticamente que cronológicamente.
      if (nacimiento && f && f < nacimiento) {
        aviso(estado, ctx, `IMPOSIBLE: "${mascota}" tiene ${cual} el ${f}, anterior a su nacimiento (${nacimiento}) → la fecha de nacimiento está mal, se importa SIN ella`);
        nacimientoUsable = null;
      }
    }

    const { especie, raza } = clasificar(estado, get('raza'));
    const costoCrudo = get('costo');

    salida.push({
      nFila, hoja,
      cedula: get('cedula').replace(/\D/g, '') || null,
      tutor, direccion: get('direccion') || null, tel1, tel2,
      mascota, especie, raza,
      nacimiento: nacimientoUsable,
      ts, hora: horaDe(get('ts')),
      tipo_bano: tipoBano(get('tipo_bano')),
      costo: pesos(estado, costoCrudo, ctx), costoCrudo,
      observaciones: get('observaciones') || null,
      extra_vacuna: siNo(get('extra_vacuna')),
      extra_tos: siNo(get('extra_tos')),
      ultima_vacuna: ultimaVacuna,
      ultima_desp: ultimaDesp,
    });
  });

  return salida;
}

// Diez fechas malas sueltas son filas sucias. Quince de veinte es otra
// cosa: la hoja está en un formato que no reconocemos, y seguir dejaría
// un import entero sin una sola fecha.
export const formatoDeFechasRoto = (estado) =>
  estado.fechasVistas >= 10 && estado.fechasRotas > estado.fechasVistas / 2;
```

- [ ] **Step 4: Escribir `agrupar.js`**

```js
// ============================================================
// VetaApp · importador/nucleo/agrupar.js
// Filas repetidas → un tutor, sus mascotas y sus eventos.
//
// Tutor: por cédula, que es la llave que la clínica misma usa. Sin
// cédula se cae al nombre sin tildes MÁS el primer teléfono, no al
// nombre solo: en una base real hay dos "Teofilo Arboleda" que son dos
// personas distintas.
// ============================================================

import { aviso, sinTildes } from './normalizar.js';

export const claveTutor = (r) =>
  (r.cedula ? `c:${r.cedula}` : `n:${sinTildes(r.tutor)}|${r.tel1 ?? ''}`);

// Dentro del tutor, por nombre sin tildes. "Ángel" y "angel " son la
// misma; "Max" de dos tutores distintos son dos mascotas.
export const claveMascota = (r) => `${claveTutor(r)}|m:${sinTildes(r.mascota)}`;

export function agrupar(estado, filas) {
  const tutores = new Map();
  const mascotas = new Map();
  const eventos = [];

  for (const r of filas) {
    const kt = claveTutor(r), km = claveMascota(r);
    const ctx = { fila: r.nFila, hoja: r.hoja };

    // Gana el registro con más datos, PERO campo por campo: reemplazar
    // la fila entera es como se pierde la dirección larga de una hoja al
    // llegar la corta de otra.
    const prev = tutores.get(kt);
    if (!prev) {
      tutores.set(kt, {
        clave: kt, cedula: r.cedula, nombre: r.tutor, direccion: r.direccion,
        tel1: r.tel1, tel2: r.tel2, origen: [`${r.hoja}:${r.nFila}`],
      });
    } else {
      if (sinTildes(prev.nombre) !== sinTildes(r.tutor)) {
        const queda = prev.nombre.length >= r.tutor.length ? prev.nombre : r.tutor;
        aviso(estado, ctx, `misma cédula ${r.cedula} con dos nombres: "${prev.nombre}" y "${r.tutor}" → quedó "${queda}"`);
        if (r.tutor.length > prev.nombre.length) prev.nombre = r.tutor;
      }
      // "Calle 10 #20-30 Barrio Prueba" dice más que "Calle 11 #20-30 Barrio Prueba" y
      // es el mismo lugar.
      if (r.direccion && (!prev.direccion || r.direccion.length > prev.direccion.length)) prev.direccion = r.direccion;
      if (!prev.tel1 && r.tel1) prev.tel1 = r.tel1;
      if (!prev.tel2 && r.tel2 && r.tel2 !== prev.tel1) prev.tel2 = r.tel2;
      if (!prev.cedula && r.cedula) prev.cedula = r.cedula;
      prev.origen.push(`${r.hoja}:${r.nFila}`);
    }

    const pm = mascotas.get(km);
    if (!pm) {
      mascotas.set(km, {
        clave: km, tutor: kt, nombre: r.mascota.trim(), especie: r.especie,
        raza: r.raza, nacimiento: r.nacimiento, origen: [`${r.hoja}:${r.nFila}`],
      });
    } else {
      if (!pm.raza && r.raza) pm.raza = r.raza;
      if (!pm.especie && r.especie) pm.especie = r.especie;
      if (!pm.nacimiento && r.nacimiento) pm.nacimiento = r.nacimiento;
      if (pm.nacimiento && r.nacimiento && pm.nacimiento !== r.nacimiento) {
        aviso(estado, ctx, `"${r.mascota}" tiene dos fechas de nacimiento: ${pm.nacimiento} y ${r.nacimiento} → quedó ${pm.nacimiento}`);
      }
      pm.origen.push(`${r.hoja}:${r.nFila}`);
    }

    // Un baño por fila: cada fila del formulario ES una visita, con su
    // fecha y su precio. Si la misma mascota vino dos veces, son dos.
    if (r.ts && (r.tipo_bano || r.costo)) {
      const extras = [r.extra_vacuna ? 'vacuna anual' : null,
                      r.extra_tos ? 'tos de las perreras' : null].filter(Boolean);
      const notas = [
        r.tipo_bano ? `Baño ${r.tipo_bano}` : null,
        r.costo ? `Costo ${r.costo.toLocaleString('es-CO')}` : null,
        r.costoCrudo && r.costo && r.costoCrudo.split(/\s+/)[0] !== r.costoCrudo
          ? `Anotado en la hoja: "${r.costoCrudo}"` : null,
        r.observaciones,
        extras.length ? `Extras: ${extras.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
      eventos.push({ tipo: 'tratamiento', mascota: km, t: 'bano', fecha: r.ts, hora: r.hora, notas });
    }

    if (r.ultima_desp) {
      eventos.push({ tipo: 'tratamiento', mascota: km, t: 'desparasitacion',
                     fecha: r.ultima_desp, hora: null,
                     notas: 'Última desparasitación según el formulario de ingreso' });
    }

    // Solo con fecha. "Vacunas anual = Si" dice que contrató el
    // servicio, NO que se la aplicaron: crear una vacuna con eso sería
    // inventarle un antecedente clínico a un animal.
    if (r.ultima_vacuna) {
      const [a, m, d] = r.ultima_vacuna.split('-').map(Number);
      const prox = `${a + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      eventos.push({ tipo: 'vacuna', mascota: km, fecha: r.ultima_vacuna, proxima: prox });
    }
  }

  return { tutores, mascotas, eventos };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/nucleo/
git commit -m "Agrupa filas repetidas en tutores, mascotas y eventos

Mueve al núcleo la lectura por fila y la deduplicación, con la
validación que más importa: una vacuna con fecha anterior al nacimiento
prueba que el nacimiento está mal, así que se descarta la fecha y no el
evento. Con la fecha falsa la mascota entra con Recién nacida en la
ficha de un perro adulto, eso se lee como dato cierto, y de ahí sale una
dosis."
```

---

## Tarea 5: El script de terminal pasa a usar el núcleo

Sin esto quedan dos copias de la misma lógica, y el día que se arregle el teléfono `"0"` se arregla en un lado y queda roto en el otro, sin que nadie se entere hasta que a una clínica le quede el WhatsApp apagado.

La verificación es la fuerte del plan: **regenerar el SQL de La Huella y compararlo con el que ya se ejecutó.** Si sale idéntico, el núcleo hace exactamente lo mismo que el código que produjo los 53 / 54 / 74 / 13 que están en producción.

**Files:**
- Modify: `importar/armar-sql.mjs` (borra los bloques 1–4, importa del núcleo; quedan la lectura de CSV, el SQL y `revisar.md`)

**Interfaces:**
- Consumes: todo lo de las tareas 1–4
- Produces: nada nuevo. `q`, `qNoNulo` y la generación de SQL se quedan en el script y **no** se comparten.

- [ ] **Step 1: Guardar el SQL de hoy como referencia**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
cp importar/datos_emmanuelvargas1722.sql /tmp/referencia_antes.sql
wc -l /tmp/referencia_antes.sql
```

Esperado: `1603`. Si el archivo no existe, regeneralo antes con el script actual:
`node importar/armar-sql.mjs --cuenta=emmanuelvargas1722@gmail.com importar/base.csv`

- [ ] **Step 2: Reemplazar los bloques 1–4 por imports**

En `importar/armar-sql.mjs`, borrar desde `// ---------- 2. NORMALIZACIONES ----------` hasta el final del bloque 4 (`// ---------- 5. SQL ----------` queda), y `COLUMNAS` / `mapearEncabezados` del bloque 1. `leerCSV` se queda: es específico de la terminal.

Agregar arriba:

```js
import { nuevoEstado, sinTildes } from '../frontend/src/importador/nucleo/normalizar.js';
import { mapearEncabezados } from '../frontend/src/importador/nucleo/mapear.js';
import { leerFilas, formatoDeFechasRoto } from '../frontend/src/importador/nucleo/filas.js';
import { agrupar } from '../frontend/src/importador/nucleo/agrupar.js';

// Todo el estado de esta corrida en un objeto. En la terminal daría igual
// una variable suelta, pero el núcleo es el mismo que corre en el
// navegador, donde el módulo no se muere entre una importación y otra.
const estado = nuevoEstado();
const avisos = estado.avisos;   // el bloque de revisar.md ya lo usa así
```

Reemplazar el bucle de lectura del bloque 3 por:

```js
const todas = [];
for (const archivo of archivos) {
  const hoja = basename(archivo);
  const [encabezados, ...grilla] = leerCSV(readFileSync(archivo, 'utf8'));
  todas.push(...leerFilas(estado, { grilla, mapa: mapearEncabezados(encabezados), hoja }));
}

// En la terminal el que decide es Emmanuel, no una pantalla: si el
// núcleo no sabe la especie, el script se detiene en vez de meter un
// gato como perro.
if (estado.razasDesconocidas.size || estado.sinRaza) {
  console.error('\nNo sé si esto es perro o gato:\n');
  for (const r of [...estado.razasDesconocidas].sort()) console.error(`  · ${r}`);
  if (estado.sinRaza) console.error(`  · ${estado.sinRaza} fila(s) sin raza anotada`);
  console.error('\nAgregá cada una a RAZAS_PERRO o RAZAS_GATO en');
  console.error('frontend/src/importador/nucleo/normalizar.js y volvé a correr esto.');
  process.exit(1);
}

if (formatoDeFechasRoto(estado)) {
  console.error(`\nDe ${estado.fechasVistas} fechas no pude leer ${estado.fechasRotas}. Eso no son filas sucias:`);
  console.error('la hoja está en un formato de fecha que no reconozco. Ejemplos:\n');
  for (const a of avisos.filter((x) => x.texto.startsWith('fecha')).slice(0, 5)) {
    console.error(`  · fila ${a.fila}: ${a.texto}`);
  }
  console.error('\nEn Sheets: seleccionar las columnas de fecha → Formato → Número → Fecha,');
  console.error('volver a exportar el CSV y correr esto otra vez.');
  process.exit(1);
}

const { tutores, mascotas, eventos } = agrupar(estado, todas);
```

- [ ] **Step 3: Agregar las razas de La Huella y correr**

El bloque 4 anterior metía las razas vacías como perro. Ahora el script se detiene. Para la base de La Huella eso significa agregar a `RAZAS_PERRO` lo que aparezca, y para las filas sin raza decidir a mano. Correr:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
node importar/armar-sql.mjs --cuenta=emmanuelvargas1722@gmail.com importar/base.csv
```

Si se detiene listando razas, agregarlas al Set correspondiente en `normalizar.js` y repetir hasta que termine.

- [ ] **Step 4: Comparar contra el SQL que ya se ejecutó**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
diff /tmp/referencia_antes.sql importar/datos_emmanuelvargas1722.sql && echo "IDÉNTICO"
```

Esperado: `IDÉNTICO`.

Si hay diferencias, **no son aceptables salvo una**: las filas sin raza, que antes entraban como `'perro'` por la suposición de la peluquería canina y ahora dependen de lo que se haya decidido en el paso 3. Cualquier otra diferencia es un bug del núcleo. Revisar línea por línea antes de seguir.

- [ ] **Step 5: Verificar los conteos**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
grep -c "insert into public.duenos"       importar/datos_emmanuelvargas1722.sql
grep -c "insert into public.mascotas"     importar/datos_emmanuelvargas1722.sql
grep -c "insert into public.tratamientos" importar/datos_emmanuelvargas1722.sql
grep -c "insert into public.vacunas"      importar/datos_emmanuelvargas1722.sql
grep -c "mascotas.*codigo"                importar/datos_emmanuelvargas1722.sql || echo "0 codigo · bien"
```

Esperado: `53`, `54`, `74`, `13`, y **cero** apariciones de `codigo`.

- [ ] **Step 6: Commit**

`importar/*.sql` está en `.gitignore`: se commitea solo el script.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add importar/armar-sql.mjs frontend/src/importador/nucleo/
git commit -m "El script de terminal pasa a usar el núcleo compartido

Deja de tener su propia copia de las normalizaciones y la
deduplicación. Con dos copias, arreglar el teléfono 0 lo arregla en un
lado y lo deja roto en el otro hasta que a una clínica le queda el
WhatsApp apagado.

Verificado regenerando el SQL de la cuenta de pruebas y comparándolo
con el que ya se ejecutó: idéntico, 53/54/74/13."
```

---

## Tarea 6: Migración 012 — de dónde salió cada fila

**Files:**
- Create: `supabase/migrations/012_importaciones.sql`

**Interfaces:**
- Produces: tabla `public.importaciones`; columna `importacion_id bigint` en `duenos`, `mascotas`, `tratamientos`, `vacunas`

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================
-- VetaApp · 012_importaciones.sql
-- De dónde salió cada fila que entró por un archivo.
--
-- No es solo para poder deshacer. Es para que la ficha pueda decir "este
-- cliente entró del archivo que subiste el 15/10, no lo escribió nadie".
-- El día que un dato esté raro, saber de dónde salió es la diferencia
-- entre arreglarlo y adivinar.
-- ============================================================

create table if not exists public.importaciones (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  archivo     text not null,
  hoja        text,

  -- La fila se crea en 'en_curso' ANTES de escribir nada. Un import que
  -- se cortó a mitad y que nadie registró no se puede ni diagnosticar ni
  -- limpiar. 'deshecho_parcial' existe porque un deshacer que dejó
  -- mascotas atrás no se puede ver igual que uno completo.
  estado      text not null default 'en_curso'
              check (estado in ('en_curso','listo','deshecho','deshecho_parcial','fallido')),

  -- Qué columna fue a qué campo. Si sube el mismo archivo actualizado en
  -- tres meses, se le propone el mapeo de la vez pasada.
  mapeo       jsonb not null default '{}'::jsonb,

  -- Lo que vio en el paso 3, guardado. Seis meses después puede volver a
  -- leer POR QUÉ una mascota quedó sin fecha de nacimiento, en vez de
  -- pensar que la app se la comió.
  resumen     jsonb not null default '{}'::jsonb,

  -- El valor que tenía cada campo que el import COMPLETÓ. Sin esto,
  -- deshacer borra lo creado pero deja lo modificado: queda a medias y
  -- ella cree que volvió todo atrás.
  anteriores  jsonb not null default '[]'::jsonb,

  creado_en   timestamptz not null default now(),
  cerrado_en  timestamptz
);

create index if not exists idx_importaciones_user on public.importaciones(user_id);

-- `on delete set null` a propósito: si algún día se borra el registro de
-- la importación, los datos se quedan. Se pierde el rastro, no los
-- clientes.
do $$
declare t text;
begin
  foreach t in array array['duenos','mascotas','tratamientos','vacunas']
  loop
    execute format(
      'alter table public.%I add column if not exists importacion_id bigint
         references public.importaciones(id) on delete set null;', t);
    execute format(
      'create index if not exists idx_%1$s_importacion on public.%1$I(importacion_id);', t);
  end loop;
end $$;

-- Misma política que las otras siete tablas: cada quien solo ve lo suyo.
alter table public.importaciones enable row level security;

drop policy if exists "own_rows_importaciones" on public.importaciones;
create policy "own_rows_importaciones" on public.importaciones
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Ejecutarla**

Supabase → SQL Editor → New query → pegar → Run.

Para copiarla al portapapeles sin dañar las tildes (`LANG` está vacío en este Mac y sin eso `pbcopy` lee MacRoman):

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
LANG=en_US.UTF-8 pbcopy < supabase/migrations/012_importaciones.sql
```

Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar que quedó**

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='importaciones')            as tabla,
  (select count(*) from information_schema.columns
     where table_schema='public' and column_name='importacion_id')          as columnas,
  (select count(*) from pg_policies
     where tablename='importaciones')                                      as politicas;
```

Esperado: `1 | 4 | 1`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add supabase/migrations/012_importaciones.sql
git commit -m "Registra de dónde salió cada fila importada

No es solo para deshacer: con esto la ficha puede decir que un cliente
entró de un archivo y no lo escribió nadie. El día que un dato esté raro,
saber de dónde salió es la diferencia entre arreglarlo y adivinar.

anteriores guarda el valor previo de cada campo completado, porque sin
eso deshacer borra lo creado pero deja lo modificado: queda a medias y
la clínica cree que volvió todo atrás."
```

---

## Tarea 7: Las dos funciones de Postgres — escribir y deshacer

La tarea más delicada del plan. Dos funciones, una migración cada una, y las pruebas se corren contra Postgres de verdad porque es lo único que prueba que una transacción es una transacción.

**Por qué una función y no 180 inserts:** desde el navegador `supabase-js` manda cada insert como un pedido HTTP suelto. No hay transacción. Si el wifi de la clínica se cae en la mitad —y se va a caer— quedan 30 tutores escritos, 0 mascotas, y una base peor que antes de empezar. El paso 4 manda **una** llamada con el plan completo en JSON: o entra todo o no entra nada.

**Por qué `security invoker` y nunca `security definer`:** la función corre con los permisos de la clínica, así que RLS sigue aplicando igual que siempre. Una `security definer` acá sería un camino para escribir en la cuenta de otra clínica — exactamente lo que RLS está para impedir.

**Files:**
- Create: `supabase/migrations/013_aplicar_importacion.sql`
- Create: `supabase/migrations/014_deshacer_importacion.sql`

**Interfaces:**
- Consumes: tabla `importaciones` y las columnas `importacion_id` de la tarea 6
- Produces:
  - `public.aplicar_importacion(plan jsonb) → jsonb`
  - `public.deshacer_importacion(p_importacion bigint) → jsonb`

### El contrato del JSON

Esto es lo que la tarea 9 (`plan.js`) tiene que armar y lo que la tarea 10 (`escribir.js`) manda. Los nombres de acá son los que valen; si no coinciden, no falla con un error claro, falla con campos en `null`.

```json
{
  "importacion_id": 7,
  "crear_tutores": [
    { "ref": "t0", "nombre": "Ana Gómez", "telefono": "573000000200",
      "telefono2": null, "cedula": "1000000200", "direccion": "Calle 1 #2-3" }
  ],
  "completar_tutores": [
    { "id": 41, "campos": { "cedula": "1000000200", "direccion": "Calle 1 #2-3" } }
  ],
  "crear_mascotas": [
    { "ref": "m0", "tutor_ref": "t0", "tutor_id": null, "nombre": "Max",
      "especie": "perro", "raza": "Poodle", "fecha_nacimiento": "2018-07-26",
      "edad_anios": 8, "edad_meses": 2 }
  ],
  "completar_mascotas": [
    { "id": 77, "campos": { "raza": "Poodle", "fecha_nacimiento": "2018-07-26",
                            "edad_anios": 8, "edad_meses": 2 } }
  ],
  "tratamientos": [
    { "mascota_ref": "m0", "mascota_id": null, "tipo": "bano",
      "fecha": "2026-09-12", "hora": "10:18", "notas": "Baño y corte" }
  ],
  "vacunas": [
    { "mascota_ref": "m0", "mascota_id": null, "nombre": "Refuerzo anual",
      "fecha_aplicacion": "2026-07-14", "proxima_dosis": "2027-07-14", "notas": null }
  ]
}
```

Reglas del contrato:

- **`ref` es de mentira y dura lo que dura la llamada.** Las mascotas y los eventos de un tutor nuevo lo señalan por `ref`, porque el `id` real lo asigna Postgres adentro de la transacción. Una mascota que va contra un tutor que ya existe usa `tutor_id` y deja `tutor_ref` en `null`.
- **`importacion_id` lo crea el navegador antes de llamar**, con un insert suelto en `importaciones` que queda en `'en_curso'`. No lo crea la función a propósito: si lo creara adentro, una llamada que revienta se lleva el registro con ella y queda un import que nadie puede ni diagnosticar ni limpiar.
- **`anteriores` no viaja en el JSON.** Lo calcula la función, que es la única que puede leer el valor viejo adentro de la misma transacción en la que lo pisa. Si el navegador mandara lo que creyó ver en el paso 3, bastaría con que alguien edite ese cliente desde otra pestaña mientras tanto para que "deshacer" restaure un valor que ya no era el que estaba.
- **`mascotas.codigo` no está y no va.** Lo pone el trigger de `008_codigo_mascota.sql`, que es `security definer` e ignora cualquier código que le manden. Mandarlo no rompe nada, pero deja a alguien creyendo que ese campo lo controla el import.

### Una corrección al spec

El spec, en §5 "Completar", lista `especie` entre los campos que el import completa en `mascotas`. **No se puede.** `mascotas.especie` es `NOT NULL`: una mascota que ya existe siempre tiene especie, así que no hay vacío que llenar — exactamente el mismo razonamiento por el que `duenos.telefono` sí está excluido en el spec. La lista blanca de la función es `raza`, `fecha_nacimiento`, `edad_anios`, `edad_meses`, y el porqué queda comentado en el SQL.

- [ ] **Step 1: Escribir `013_aplicar_importacion.sql`**

```sql
-- ============================================================
-- VetaApp · 013_aplicar_importacion.sql
-- El paso 4 del importador: una llamada, una transacción.
--
-- ---------- POR QUÉ UNA FUNCIÓN ----------
-- Desde el navegador, supabase-js manda cada insert como un pedido HTTP
-- suelto. No hay transacción. El wifi de una clínica de barrio se cae, y
-- cuando se cae en la mitad de un import quedan 30 tutores escritos, 0
-- mascotas, y una base peor que antes de empezar — sin forma de saber por
-- dónde iba. Con una sola llamada: o entra todo o no entra nada.
--
-- ---------- POR QUÉ security invoker ----------
-- Corre con los permisos de la clínica que llama, así que RLS aplica
-- igual que en cualquier otra escritura. `security definer` acá sería un
-- camino para escribir en la cuenta de otra clínica, que es justo lo que
-- RLS está para impedir. No se cambia nunca.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create or replace function public.aplicar_importacion(plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_imp         bigint := (plan->>'importacion_id')::bigint;
  v_user        uuid   := auth.uid();

  -- ref de mentira → id real. El plan no puede traer los id de lo que
  -- todavía no existe, así que las mascotas y los eventos señalan a su
  -- tutor por un ref que solo vale adentro de esta llamada.
  v_ids_tutor   jsonb  := '{}'::jsonb;
  v_ids_masc    jsonb  := '{}'::jsonb;

  -- El valor que tenía cada campo ANTES de completarlo. Sin esto,
  -- deshacer borra lo creado pero deja lo modificado: queda a medias y la
  -- clínica cree que volvió todo atrás.
  v_anteriores  jsonb  := '[]'::jsonb;

  -- Lo que no se pudo hacer sin reventar el import entero. Viaja de vuelta
  -- para que el paso 4 lo muestre en vez de que desaparezca.
  v_omitidos    jsonb  := '[]'::jsonb;

  v_item        jsonb;
  v_campo       text;
  v_valor       text;
  v_antes       text;
  v_toco        boolean;
  v_id          bigint;
  v_dueno       bigint;

  n_tut_nuevos  int := 0;
  n_tut_compl   int := 0;
  n_mas_nuevos  int := 0;
  n_mas_compl   int := 0;
  n_trat        int := 0;
  n_vac         int := 0;
  n_repetidos   int := 0;
begin
  -- La importación tiene que existir y ser de quien llama. RLS ya frenaría
  -- la escritura, pero el error que da no explica nada; este sí.
  if not exists (select 1 from importaciones where id = v_imp and user_id = v_user) then
    raise exception 'La importación % no existe o no es de esta cuenta', v_imp;
  end if;

  -- ---------- 1. TUTORES NUEVOS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'crear_tutores', '[]'::jsonb)) loop
    begin
      insert into duenos (user_id, nombre, telefono, telefono2, cedula, direccion, importacion_id)
      values (
        v_user,
        v_item->>'nombre',
        -- telefono es NOT NULL. Cadena vacía antes que null: el archivo
        -- real trae una fila sin ningún teléfono usable, y esa persona
        -- entra igual con el botón de WhatsApp apagado.
        coalesce(v_item->>'telefono', ''),
        v_item->>'telefono2',
        v_item->>'cedula',
        v_item->>'direccion',
        v_imp
      )
      returning id into v_id;
    exception when unique_violation then
      -- idx_duenos_user_cedula (011) es único por cuenta. Si el archivo
      -- trae una cédula que ya es de otro cliente, lo que NO puede pasar
      -- es que se caiga el import entero por una celda: entra sin cédula
      -- y el paso 4 lo dice.
      insert into duenos (user_id, nombre, telefono, telefono2, direccion, importacion_id)
      values (v_user, v_item->>'nombre', coalesce(v_item->>'telefono', ''),
              v_item->>'telefono2', v_item->>'direccion', v_imp)
      returning id into v_id;
      v_omitidos := v_omitidos || jsonb_build_object(
        'que', 'cedula_repetida', 'quien', v_item->>'nombre', 'valor', v_item->>'cedula');
    end;

    v_ids_tutor  := v_ids_tutor || jsonb_build_object(v_item->>'ref', v_id);
    n_tut_nuevos := n_tut_nuevos + 1;
  end loop;

  -- ---------- 2. TUTORES QUE YA EXISTÍAN ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'completar_tutores', '[]'::jsonb)) loop
    v_id   := (v_item->>'id')::bigint;
    v_toco := false;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- Lista blanca y no "lo que venga": el nombre del campo entra en un
      -- format() y de ahí a SQL. Y telefono NO está — es NOT NULL, siempre
      -- tiene algo, así que completarlo es imposible por definición. Si el
      -- archivo trae otro número, el paso 3 lo avisa y no lo pisa.
      if v_campo not in ('cedula', 'direccion', 'telefono2') then
        raise exception 'Campo no completable en duenos: %', v_campo;
      end if;

      execute format('select %I from duenos where id = $1 and user_id = $2', v_campo)
        into v_antes using v_id, v_user;

      -- Solo donde haya vacío. Entre la vista previa y este momento alguien
      -- pudo llenarlo desde otra pestaña, y pisarlo sería exactamente lo
      -- que se le prometió que no iba a pasar.
      if v_antes is null or v_antes = '' then
        begin
          execute format('update duenos set %I = $1 where id = $2 and user_id = $3', v_campo)
            using v_valor, v_id, v_user;
          v_anteriores := v_anteriores || jsonb_build_object(
            'tabla', 'duenos', 'id', v_id, 'campo', v_campo, 'antes', v_antes);
          v_toco := true;
        exception when unique_violation then
          v_omitidos := v_omitidos || jsonb_build_object(
            'que', 'cedula_repetida', 'quien', v_id::text, 'valor', v_valor);
        end;
      end if;
    end loop;

    if v_toco then n_tut_compl := n_tut_compl + 1; end if;
  end loop;

  -- ---------- 3. MASCOTAS NUEVAS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'crear_mascotas', '[]'::jsonb)) loop
    v_dueno := coalesce(
      (v_item->>'tutor_id')::bigint,
      (v_ids_tutor->>(v_item->>'tutor_ref'))::bigint
    );
    if v_dueno is null then
      raise exception 'La mascota "%" no tiene tutor (ref %)',
        v_item->>'nombre', v_item->>'tutor_ref';
    end if;

    -- `codigo` no se escribe. Lo pone el trigger de 008, que es
    -- security definer e ignora lo que le manden; ponerlo acá dejaría a
    -- alguien creyendo que ese campo lo controla el import.
    insert into mascotas (user_id, nombre, especie, raza, fecha_nacimiento,
                          edad_anios, edad_meses, dueno_id, importacion_id)
    values (
      v_user,
      v_item->>'nombre',
      -- especie es NOT NULL y acá no se adivina. El paso 3 no deja pasar
      -- una mascota sin especie resuelta, así que si llega null el que
      -- está mal es el plan y tiene que doler.
      v_item->>'especie',
      v_item->>'raza',
      v_item->>'fecha_nacimiento',
      coalesce((v_item->>'edad_anios')::int, 0),
      coalesce((v_item->>'edad_meses')::int, 0),
      v_dueno,
      v_imp
    )
    returning id into v_id;

    v_ids_masc   := v_ids_masc || jsonb_build_object(v_item->>'ref', v_id);
    n_mas_nuevos := n_mas_nuevos + 1;
  end loop;

  -- ---------- 4. MASCOTAS QUE YA EXISTÍAN ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'completar_mascotas', '[]'::jsonb)) loop
    v_id   := (v_item->>'id')::bigint;
    v_toco := false;

    for v_campo, v_valor in select key, value from jsonb_each_text(v_item->'campos') loop
      -- especie NO está: es NOT NULL, una mascota que ya existe siempre
      -- tiene especie, no hay vacío que llenar. (El spec la lista por
      -- error; el razonamiento es el mismo que para duenos.telefono.)
      if v_campo not in ('raza', 'fecha_nacimiento', 'edad_anios', 'edad_meses') then
        raise exception 'Campo no completable en mascotas: %', v_campo;
      end if;

      execute format('select %I::text from mascotas where id = $1 and user_id = $2', v_campo)
        into v_antes using v_id, v_user;

      -- edad_anios y edad_meses son NOT NULL default 0, así que nunca
      -- están "vacías": el 0 cuenta como vacío porque es lo que deja un
      -- registro al que nunca le pusieron la edad.
      if v_antes is null or v_antes = ''
         or (v_campo in ('edad_anios', 'edad_meses') and v_antes = '0') then
        execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
          using (case when v_campo in ('edad_anios', 'edad_meses')
                      then coalesce(v_valor, '0') else v_valor end), v_id, v_user;
        v_anteriores := v_anteriores || jsonb_build_object(
          'tabla', 'mascotas', 'id', v_id, 'campo', v_campo, 'antes', v_antes);
        v_toco := true;
      end if;
    end loop;

    if v_toco then n_mas_compl := n_mas_compl + 1; end if;
  end loop;

  -- ---------- 5. TRATAMIENTOS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'tratamientos', '[]'::jsonb)) loop
    v_id := coalesce(
      (v_item->>'mascota_id')::bigint,
      (v_ids_masc->>(v_item->>'mascota_ref'))::bigint
    );
    if v_id is null then
      raise exception 'Un tratamiento del % no tiene mascota (ref %)',
        v_item->>'fecha', v_item->>'mascota_ref';
    end if;

    -- Misma mascota + mismo tipo + misma fecha = ya está. La comprobación
    -- va acá y no solo en el navegador: el navegador comparó contra una
    -- foto de hace un minuto; esto compara contra lo que hay. Sin esto, el
    -- mismo archivo dos veces deja 148 baños donde hubo 74.
    --
    -- Costo conocido: si bañaron al mismo perro dos veces el mismo día, el
    -- segundo se pierde. Se acepta — es rarísimo y se arregla a mano en
    -- diez segundos; el caso contrario es frecuente y es un desastre.
    if exists (
      select 1 from tratamientos
       where mascota_id = v_id
         and tipo  = v_item->>'tipo'
         and fecha = v_item->>'fecha'
    ) then
      n_repetidos := n_repetidos + 1;
      continue;
    end if;

    insert into tratamientos (user_id, mascota_id, tipo, fecha, hora, notas, importacion_id)
    values (v_user, v_id, v_item->>'tipo', v_item->>'fecha',
            v_item->>'hora', v_item->>'notas', v_imp);
    n_trat := n_trat + 1;
  end loop;

  -- ---------- 6. VACUNAS ----------
  for v_item in select * from jsonb_array_elements(coalesce(plan->'vacunas', '[]'::jsonb)) loop
    v_id := coalesce(
      (v_item->>'mascota_id')::bigint,
      (v_ids_masc->>(v_item->>'mascota_ref'))::bigint
    );
    if v_id is null then
      raise exception 'Una vacuna del % no tiene mascota (ref %)',
        v_item->>'fecha_aplicacion', v_item->>'mascota_ref';
    end if;

    -- Misma regla que los tratamientos, con el nombre adentro: a una
    -- mascota se le pueden aplicar dos vacunas distintas el mismo día.
    if exists (
      select 1 from vacunas
       where mascota_id = v_id
         and nombre = v_item->>'nombre'
         and fecha_aplicacion = v_item->>'fecha_aplicacion'
    ) then
      n_repetidos := n_repetidos + 1;
      continue;
    end if;

    insert into vacunas (user_id, mascota_id, nombre, fecha_aplicacion,
                         proxima_dosis, notas, importacion_id)
    values (v_user, v_id, v_item->>'nombre', v_item->>'fecha_aplicacion',
            v_item->>'proxima_dosis', v_item->>'notas', v_imp);
    n_vac := n_vac + 1;
  end loop;

  -- ---------- 7. CERRAR EL REGISTRO ----------
  update importaciones
     set estado     = 'listo',
         anteriores = v_anteriores,
         resumen    = resumen || jsonb_build_object(
                        'tutores_creados',      n_tut_nuevos,
                        'tutores_completados',  n_tut_compl,
                        'mascotas_creadas',     n_mas_nuevos,
                        'mascotas_completadas', n_mas_compl,
                        'tratamientos',         n_trat,
                        'vacunas',              n_vac,
                        'repetidos',            n_repetidos,
                        'omitidos',             v_omitidos),
         cerrado_en = now()
   where id = v_imp and user_id = v_user;

  -- Los números salen de la base, no de la predicción del paso 3. Es la
  -- diferencia entre "esto hice" y "esto creía que iba a hacer".
  return jsonb_build_object(
    'importacion_id',       v_imp,
    'tutores_creados',      n_tut_nuevos,
    'tutores_completados',  n_tut_compl,
    'mascotas_creadas',     n_mas_nuevos,
    'mascotas_completadas', n_mas_compl,
    'tratamientos',         n_trat,
    'vacunas',              n_vac,
    'repetidos',            n_repetidos,
    'omitidos',             v_omitidos
  );
end
$fn$;

-- Una función es ejecutable por PUBLIC por defecto. Sin JWT auth.uid() es
-- null y la primera comprobación ya la frena, pero dejarlo explícito es
-- más barato que confiar en eso.
revoke all on function public.aplicar_importacion(jsonb) from public;
grant execute on function public.aplicar_importacion(jsonb) to authenticated;
```

- [ ] **Step 2: Correrla y probar que una transacción es una transacción**

Copiar al portapapeles sin dañar las tildes (`LANG` está vacío en este Mac y sin eso `pbcopy` lee MacRoman: `Importación` llega como `Importaci√≥n`):

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
LANG=en_US.UTF-8 pbcopy < supabase/migrations/013_aplicar_importacion.sql
```

Supabase → SQL Editor → New query → pegar → Run. Esperado: `Success. No rows returned`.

Ahora la prueba. **Cada bloque termina en `raise exception`, así que la transacción se aborta y todo lo que insertó se deshace solo**: el resultado viaja en el mensaje de error. Es la forma de probar contra la base real sin dejar basura — la misma convención de `011_ficha_completa.sql`.

Hay un detalle que no es obvio: en el SQL Editor la sesión corre como `postgres`, y ahí `auth.uid()` es `null`. Por eso cada bloque **se hace pasar por la cuenta de pruebas** con `set_config('request.jwt.claims', ...)` y `set local role authenticated`, que es lo que lee `auth.uid()`. Efecto de regalo: la prueba también ejercita RLS, no solo la función.

Correr de a uno, descomentado:

```sql
-- ---------- PRUEBA A · entra todo, y lo repetido no entra dos veces ----------
do $$
declare
  v_u uuid; v_imp bigint; r jsonb;
  v_tut bigint; v_mas bigint; v_trat int; v_vac int;
begin
  -- auth.users se lee ANTES de cambiar de rol: authenticated no la ve.
  select id into v_u from auth.users where email = 'emmanuelvargas1722@gmail.com';
  if v_u is null then raise exception 'no está la cuenta de pruebas'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into importaciones (user_id, archivo, hoja)
    values (v_u, 'prueba-A.xlsx', 'Hoja1') returning id into v_imp;

  -- El mismo baño dos veces y la misma vacuna dos veces, a propósito.
  select aplicar_importacion(jsonb_build_object(
    'importacion_id', v_imp,
    'crear_tutores', jsonb_build_array(jsonb_build_object(
      'ref','t0','nombre','ZZ Prueba Tutor','telefono','573000000001',
      'cedula',null,'direccion','Calle Falsa 123')),
    'crear_mascotas', jsonb_build_array(jsonb_build_object(
      'ref','m0','tutor_ref','t0','nombre','ZZ Firulais','especie','perro',
      'raza','Poodle','fecha_nacimiento','2018-07-26','edad_anios',8,'edad_meses',2)),
    'tratamientos', jsonb_build_array(
      jsonb_build_object('mascota_ref','m0','tipo','bano','fecha','2026-09-12','hora','10:18'),
      jsonb_build_object('mascota_ref','m0','tipo','bano','fecha','2026-09-12','hora','15:00')),
    'vacunas', jsonb_build_array(
      jsonb_build_object('mascota_ref','m0','nombre','Refuerzo','fecha_aplicacion','2026-07-14'),
      jsonb_build_object('mascota_ref','m0','nombre','Refuerzo','fecha_aplicacion','2026-07-14'))
  )) into r;

  select count(*) into v_tut  from duenos       where importacion_id = v_imp;
  select count(*) into v_mas  from mascotas     where importacion_id = v_imp;
  select v_mas, count(*) into v_mas, v_trat from tratamientos where importacion_id = v_imp;
  select count(*) into v_vac  from vacunas      where importacion_id = v_imp;

  raise exception E'A\n  devolvió: %\n  en la base: tutores=% mascotas=% tratamientos=% vacunas=%\n  esperado:  1 / 1 / 1 / 1, repetidos=2, estado=%',
    r, (select count(*) from duenos where importacion_id = v_imp),
       (select count(*) from mascotas where importacion_id = v_imp),
       v_trat, v_vac,
       (select estado from importaciones where id = v_imp);
end $$;
```

Esperado en el mensaje: `tutores=1 mascotas=1 tratamientos=1 vacunas=1`, el JSON con `"repetidos": 2`, y `estado=listo`. **Y que el código de la mascota exista**: lo puso el trigger, no la función.

```sql
-- ---------- PRUEBA B · completar solo donde hay vacío, y guardar el antes ----------
do $$
declare
  v_u uuid; v_imp bigint; v_d bigint; r jsonb;
  v_ced text; v_dir text; v_ant jsonb;
begin
  select id into v_u from auth.users where email = 'emmanuelvargas1722@gmail.com';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Un tutor que ya existe: dirección puesta, cédula vacía.
  insert into duenos (user_id, nombre, telefono, direccion)
    values (v_u, 'ZZ Ya Existia', '573000000002', 'La que ya tenía')
    returning id into v_d;

  insert into importaciones (user_id, archivo) values (v_u, 'prueba-B.xlsx')
    returning id into v_imp;

  select aplicar_importacion(jsonb_build_object(
    'importacion_id', v_imp,
    'completar_tutores', jsonb_build_array(jsonb_build_object(
      'id', v_d,
      'campos', jsonb_build_object('cedula','999000111','direccion','LA DEL ARCHIVO')))
  )) into r;

  select cedula, direccion into v_ced, v_dir from duenos where id = v_d;
  select anteriores into v_ant from importaciones where id = v_imp;

  raise exception E'B\n  cedula=%  (esperado 999000111)\n  direccion=%  (esperado "La que ya tenía", SIN pisar)\n  anteriores=%  (esperado un solo elemento, campo cedula, antes null)',
    v_ced, v_dir, v_ant;
end $$;
```

Esperado: `cedula=999000111`, `direccion=La que ya tenía`, y `anteriores` con **un** elemento: `[{"id":N,"antes":null,"campo":"cedula","tabla":"duenos"}]`. Si la dirección aparece pisada, la promesa central del importador está rota.

```sql
-- ---------- PRUEBA C · si algo revienta, no queda nada ----------
do $$
declare v_u uuid; v_imp bigint; v_tut int; v_estado text; v_msg text;
begin
  select id into v_u from auth.users where email = 'emmanuelvargas1722@gmail.com';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into importaciones (user_id, archivo) values (v_u, 'prueba-C.xlsx')
    returning id into v_imp;

  -- Dos tutores buenos y una mascota que señala a un tutor que no existe.
  -- La mascota se procesa DESPUÉS de los tutores: si no hay transacción,
  -- los dos tutores quedan escritos.
  begin
    perform aplicar_importacion(jsonb_build_object(
      'importacion_id', v_imp,
      'crear_tutores', jsonb_build_array(
        jsonb_build_object('ref','t0','nombre','ZZ Uno','telefono','573000000003'),
        jsonb_build_object('ref','t1','nombre','ZZ Dos','telefono','573000000004')),
      'crear_mascotas', jsonb_build_array(jsonb_build_object(
        'ref','m0','tutor_ref','NO_EXISTE','nombre','ZZ Huerfana','especie','perro'))
    ));
  exception when others then
    v_msg := sqlerrm;
  end;

  select count(*) into v_tut from duenos where importacion_id = v_imp;
  select estado into v_estado from importaciones where id = v_imp;

  raise exception E'C\n  error=%\n  tutores escritos=%  (esperado 0)\n  estado=%  (esperado en_curso: la función no lo cerró)',
    v_msg, v_tut, v_estado;
end $$;
```

Esperado: el error dice `no tiene tutor`, **`tutores escritos=0`** y `estado=en_curso`. Ese cero es toda la tarea. Si sale 2, la función no está siendo una transacción y no se sigue adelante.

> Nota de por qué funciona: el `begin ... exception` de adentro arma una subtransacción, así que al capturar el error Postgres deshace lo que la función hizo y deja en pie el `insert into importaciones` de antes. Es el mismo comportamiento que ve el navegador: la fila de `importaciones` queda en `'en_curso'` y los datos no entraron.

- [ ] **Step 3: Escribir `014_deshacer_importacion.sql`**

```sql
-- ============================================================
-- VetaApp · 014_deshacer_importacion.sql
-- Deshacer una importación sin llevarse por delante meses de trabajo.
--
-- ---------- POR QUÉ ESTO NO ES UN DELETE ----------
-- En 001_init.sql todo está en cascada:
--
--   mascotas.dueno_id             → duenos(id)    on delete cascade
--   citas.mascota_id              → mascotas(id)  on delete cascade
--   vacunas.mascota_id            → mascotas(id)  on delete cascade
--   tratamientos.mascota_id       → mascotas(id)  on delete cascade
--   historias_clinicas.mascota_id → mascotas(id)  on delete cascade
--
-- El escenario: la clínica importa en octubre, atiende a "Killer" seis
-- veces, le escribe la historia clínica, le agenda cita. En marzo entra a
-- Importaciones, le da Deshacer para limpiar otra cosa, y se va el trabajo
-- de cinco meses. Sin aviso, porque la cascada la hace Postgres en
-- silencio.
--
-- Entonces deshacer es: borrar solo lo que no tiene nada encima, y frenar
-- en lo demás mostrándoselo.
--
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create or replace function public.deshacer_importacion(p_importacion bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user        uuid := auth.uid();
  v_estado      text;
  v_conservadas jsonb := '[]'::jsonb;
  m             record;
  v_item        jsonb;
  v_campo       text;

  n_trat        int := 0;
  n_vac         int := 0;
  n_mas         int := 0;
  n_duenos      int := 0;
  n_restaurados int := 0;
  v_hist        int; v_citas int; v_vac_m int; v_trat_m int;
begin
  select estado into v_estado
    from importaciones where id = p_importacion and user_id = v_user;
  if v_estado is null then
    raise exception 'La importación % no existe o no es de esta cuenta', p_importacion;
  end if;

  -- Deshacer dos veces restauraría los `anteriores` encima de lo que la
  -- clínica tecleó después del primer deshacer: le borraría datos que ella
  -- escribió a mano. Es más simple frenar que intentar distinguirlo.
  if v_estado in ('deshecho', 'deshecho_parcial') then
    raise exception 'La importación % ya se deshizo', p_importacion;
  end if;

  -- ---------- 1. LOS EVENTOS DEL IMPORT ----------
  -- Se van siempre y van primero. Un baño importado no tiene nada colgado
  -- abajo, y sacarlos antes es lo que deja ver si a una mascota le queda
  -- historia propia o solo tenía lo que trajo el archivo.
  with d as (delete from tratamientos where importacion_id = p_importacion returning 1)
  select count(*) into n_trat from d;

  with d as (delete from vacunas where importacion_id = p_importacion returning 1)
  select count(*) into n_vac from d;

  -- ---------- 2. LAS MASCOTAS, UNA POR UNA ----------
  for m in select id, nombre, dueno_id from mascotas
            where importacion_id = p_importacion loop

    select count(*) into v_hist   from historias_clinicas where mascota_id = m.id;
    select count(*) into v_citas  from citas              where mascota_id = m.id;
    select count(*) into v_vac_m  from vacunas            where mascota_id = m.id;
    select count(*) into v_trat_m from tratamientos       where mascota_id = m.id;

    if v_hist + v_citas + v_vac_m + v_trat_m = 0 then
      delete from mascotas where id = m.id and user_id = v_user;
      n_mas := n_mas + 1;
    else
      -- No se toca. Borrarla se llevaría por cascada todo lo que la
      -- clínica escribió DESPUÉS del import. Se devuelve con los números
      -- para que la pantalla pueda decir "Killer tiene 6 consultas y 2
      -- citas escritas después del import" en vez de un número pelado.
      v_conservadas := v_conservadas || jsonb_build_object(
        'id', m.id, 'nombre', m.nombre,
        'historias', v_hist, 'citas', v_citas,
        'vacunas', v_vac_m, 'tratamientos', v_trat_m);
    end if;
  end loop;

  -- ---------- 3. LOS TUTORES ----------
  -- Solo los que se quedaron sin ninguna mascota. Si una mascota se
  -- conservó, su dueño se conserva: no es una elección, mascotas.dueno_id
  -- es NOT NULL y borrar al dueño la arrastraría por la cascada — justo la
  -- que se acaba de decidir conservar. El `not exists` cubre además el
  -- caso de un tutor importado al que la clínica le registró una mascota
  -- nueva después.
  with d as (
    delete from duenos
     where importacion_id = p_importacion
       and user_id = v_user
       and not exists (select 1 from mascotas where mascotas.dueno_id = duenos.id)
     returning 1)
  select count(*) into n_duenos from d;

  -- ---------- 4. LO QUE EL IMPORT COMPLETÓ ----------
  for v_item in select * from jsonb_array_elements(
                  (select anteriores from importaciones
                    where id = p_importacion and user_id = v_user)) loop
    v_campo := v_item->>'campo';

    if v_item->>'tabla' = 'duenos' and v_campo in ('cedula','direccion','telefono2') then
      execute format('update duenos set %I = $1 where id = $2 and user_id = $3', v_campo)
        using v_item->>'antes', (v_item->>'id')::bigint, v_user;

    elsif v_item->>'tabla' = 'mascotas' and v_campo in ('edad_anios','edad_meses') then
      -- NOT NULL default 0: restaurar null reventaría. El valor anterior
      -- de una edad siempre es un número, y si no estaba, era 0.
      execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
        using coalesce((v_item->>'antes')::int, 0), (v_item->>'id')::bigint, v_user;

    elsif v_item->>'tabla' = 'mascotas' and v_campo in ('raza','fecha_nacimiento') then
      execute format('update mascotas set %I = $1 where id = $2 and user_id = $3', v_campo)
        using v_item->>'antes', (v_item->>'id')::bigint, v_user;

    else
      -- Un campo que no está en ninguna lista blanca llegó a `anteriores`
      -- de alguna versión vieja de la función. Se salta en silencio: la
      -- alternativa es que el deshacer entero falle por un dato histórico.
      continue;
    end if;

    n_restaurados := n_restaurados + 1;
  end loop;

  -- ---------- 5. CERRAR ----------
  -- Un deshacer que dejó mascotas atrás tiene que poder distinguirse de uno
  -- completo, o seis meses después nadie entiende por qué siguen ahí esos
  -- tres clientes.
  update importaciones
     set estado = case when jsonb_array_length(v_conservadas) > 0
                       then 'deshecho_parcial' else 'deshecho' end,
         resumen = resumen || jsonb_build_object('deshecho', jsonb_build_object(
                     'mascotas_borradas', n_mas, 'tutores_borrados', n_duenos,
                     'tratamientos', n_trat, 'vacunas', n_vac,
                     'conservadas', v_conservadas)),
         cerrado_en = now()
   where id = p_importacion and user_id = v_user;

  return jsonb_build_object(
    'mascotas_borradas', n_mas,
    'tutores_borrados',  n_duenos,
    'tratamientos',      n_trat,
    'vacunas',           n_vac,
    'campos_restaurados', n_restaurados,
    'conservadas',       v_conservadas,
    'estado', (select estado from importaciones where id = p_importacion)
  );
end
$fn$;

revoke all on function public.deshacer_importacion(bigint) from public;
grant execute on function public.deshacer_importacion(bigint) to authenticated;
```

- [ ] **Step 4: Correrla y probar que NO borra lo que tiene trabajo encima**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
LANG=en_US.UTF-8 pbcopy < supabase/migrations/014_deshacer_importacion.sql
```

SQL Editor → pegar → Run. Esperado: `Success. No rows returned`.

```sql
-- ---------- PRUEBA D · la mascota con historia se queda, y su dueño con ella ----------
do $$
declare
  v_u uuid; v_imp bigint; r jsonb;
  v_lim bigint; v_suc bigint; v_dsuc bigint;
  v_quedan_mas int; v_quedan_due int; v_estado text;
begin
  select id into v_u from auth.users where email = 'emmanuelvargas1722@gmail.com';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into importaciones (user_id, archivo) values (v_u, 'prueba-D.xlsx')
    returning id into v_imp;

  -- Dos tutores con una mascota cada uno, y un baño para cada mascota.
  perform aplicar_importacion(jsonb_build_object(
    'importacion_id', v_imp,
    'crear_tutores', jsonb_build_array(
      jsonb_build_object('ref','t0','nombre','ZZ Limpio','telefono','573000000005'),
      jsonb_build_object('ref','t1','nombre','ZZ Con Trabajo','telefono','573000000006')),
    'crear_mascotas', jsonb_build_array(
      jsonb_build_object('ref','m0','tutor_ref','t0','nombre','ZZ Nadie','especie','perro'),
      jsonb_build_object('ref','m1','tutor_ref','t1','nombre','ZZ Killer','especie','perro')),
    'tratamientos', jsonb_build_array(
      jsonb_build_object('mascota_ref','m0','tipo','bano','fecha','2026-09-01'),
      jsonb_build_object('mascota_ref','m1','tipo','bano','fecha','2026-09-01'))
  ));

  select id into v_lim from mascotas where importacion_id = v_imp and nombre = 'ZZ Nadie';
  select id, dueno_id into v_suc, v_dsuc
    from mascotas where importacion_id = v_imp and nombre = 'ZZ Killer';

  -- Lo que la clínica escribió DESPUÉS del import. Sin importacion_id:
  -- es trabajo suyo, no del archivo.
  insert into historias_clinicas (user_id, mascota_id, fecha, motivo)
    values (v_u, v_suc, '2026-11-02', 'Otitis'), (v_u, v_suc, '2026-11-20', 'Control');
  insert into citas (user_id, mascota_id, veterinario, fecha, hora, motivo)
    values (v_u, v_suc, 'Dra. Ruiz', '2027-01-10', '09:00', 'Revisión');

  select deshacer_importacion(v_imp) into r;

  select count(*) into v_quedan_mas from mascotas where importacion_id = v_imp;
  select count(*) into v_quedan_due from duenos   where id = v_dsuc;
  select estado into v_estado from importaciones where id = v_imp;

  raise exception E'D\n  devolvió: %\n  mascotas que quedan=%  (esperado 1: ZZ Killer)\n  dueño de ZZ Killer sigue=%  (esperado 1)\n  mascota limpia sigue=%  (esperado 0)\n  historias que quedan=%  (esperado 2: NO se tocaron)\n  citas que quedan=%  (esperado 1)\n  estado=%  (esperado deshecho_parcial)',
    r, v_quedan_mas, v_quedan_due,
    (select count(*) from mascotas where id = v_lim),
    (select count(*) from historias_clinicas where mascota_id = v_suc),
    (select count(*) from citas where mascota_id = v_suc),
    v_estado;
end $$;
```

Esperado, todo junto: `mascotas que quedan=1`, `dueño de ZZ Killer sigue=1`, `mascota limpia sigue=0`, `historias que quedan=2`, `citas que quedan=1`, `estado=deshecho_parcial`, y `conservadas` con `"nombre": "ZZ Killer", "historias": 2, "citas": 1`.

Las dos historias y la cita son el centro de la prueba: si salen en 0, la cascada se llevó cinco meses de trabajo y la función no sirve.

```sql
-- ---------- PRUEBA E · restaura el valor anterior, y no se deshace dos veces ----------
do $$
declare
  v_u uuid; v_imp bigint; v_d bigint;
  v_ced text; v_dir text; v_estado text; v_msg text;
begin
  select id into v_u from auth.users where email = 'emmanuelvargas1722@gmail.com';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into duenos (user_id, nombre, telefono, direccion)
    values (v_u, 'ZZ Restaurar', '573000000007', 'La que ya tenía')
    returning id into v_d;
  insert into importaciones (user_id, archivo) values (v_u, 'prueba-E.xlsx')
    returning id into v_imp;

  perform aplicar_importacion(jsonb_build_object(
    'importacion_id', v_imp,
    'completar_tutores', jsonb_build_array(jsonb_build_object(
      'id', v_d, 'campos', jsonb_build_object('cedula','999000222')))
  ));

  perform deshacer_importacion(v_imp);

  select cedula, direccion into v_ced, v_dir from duenos where id = v_d;
  select estado into v_estado from importaciones where id = v_imp;

  -- El segundo deshacer tiene que negarse.
  begin
    perform deshacer_importacion(v_imp);
  exception when others then v_msg := sqlerrm;
  end;

  raise exception E'E\n  cedula=[%]  (esperado vacío: volvió a null)\n  direccion=%  (esperado "La que ya tenía", intacta)\n  tutor sigue=%  (esperado 1: no lo creó el import, no se borra)\n  estado=%  (esperado deshecho)\n  segundo deshacer=%  (esperado "ya se deshizo")',
    coalesce(v_ced,''), v_dir,
    (select count(*) from duenos where id = v_d), v_estado, v_msg;
end $$;
```

Esperado: `cedula=[]` vacía, `direccion=La que ya tenía`, `tutor sigue=1`, `estado=deshecho`, y el segundo deshacer rechazado con `ya se deshizo`.

El `tutor sigue=1` importa: ese tutor **no lo creó el import**, solo lo completó. Su `importacion_id` es `null` y el paso 3 de la función no lo toca. Si saliera 0, deshacer estaría borrando clientes que la clínica tenía desde antes.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add supabase/migrations/013_aplicar_importacion.sql supabase/migrations/014_deshacer_importacion.sql
git commit -m "Importar y deshacer en una sola transacción

El navegador no tiene transacciones: supabase-js manda cada insert como
un pedido HTTP suelto. Cuando el wifi de la clínica se cae en la mitad de
un import quedan 30 tutores y 0 mascotas, y nadie sabe por dónde iba. El
paso 4 pasa a ser una sola llamada con el plan completo en JSON.

Las dos funciones son security invoker a propósito: corren como la
clínica, así que RLS sigue aplicando. Una security definer acá sería un
camino para escribir en la cuenta de otra clínica.

Deshacer no es un DELETE. Todo está en cascada, así que borrar una
mascota importada se lleva la historia clínica, las citas y los
tratamientos que la clínica escribió después — meses de trabajo, en
silencio. Borra solo lo que no tiene nada encima y devuelve lo demás con
los números para poder decir por qué no lo borró.

Completar solo escribe donde encuentra vacío, y el valor anterior lo lee
la función adentro de la misma transacción en la que lo pisa. Si lo
mandara el navegador, bastaría con que alguien edite ese cliente desde
otra pestaña entre la vista previa y el Confirmar para que deshacer
restaure un valor que ya no era el que estaba."
```

---

## Tarea 8: Leer el `.xlsx` en el navegador

La capa que no se comparte con el script de terminal. Es el gemelo en navegador de `importar/xlsx-a-csv.py`, y existe por el mismo motivo que ese archivo: **el `.xlsx` guarda los TIPOS de cada celda y el CSV los pierde**.

Tres datos dependen de eso, y los tres fallan en silencio:

- **La cédula es un número.** Escrita mal queda `"1000000200.0"`, el importador normaliza a solo dígitos y la lee como `10000002000` — un cero de más. Esa cédula no identifica a nadie, y el índice único de `011` la deja pasar porque es otro texto.
- **El costo es un número.** `40000.0` escrito mal queda `"400000"`. Diez veces más caro, en la columna de la que vive la peluquería.
- **Las fechas son fechas, no texto.** En un CSV salen `26/07/2018` o `2018-07-26` según el idioma de la cuenta de Google, y hay que adivinar cuál número es el día. Acá no hay nada que adivinar.

**Files:**
- Create: `frontend/src/importador/leerXlsx.js`
- Create: `frontend/src/importador/leerXlsx.test.js`
- Modify: `frontend/package.json` (dependencia `xlsx`)

**Interfaces:**
- Produces:
  - `leerLibro(bytes) → Libro` — `bytes` es un `ArrayBuffer` o `Uint8Array`. Tira `Error` en español si el archivo no es un Excel
  - `hojas(libro) → [{ nombre: string, filas: number }]` — `filas` **no cuenta el encabezado ni las filas en blanco**
  - `leerHoja(libro, nombre) → { encabezados: string[], grilla: string[][] }` — `grilla[i]` es la fila `i + 2` de la hoja
  - `celda(c) → string` — una celda de SheetJS al texto que recibe el núcleo

- [ ] **Step 1: Instalar SheetJS desde el CDN de SheetJS, no del registro público**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

**Por qué no `npm install xlsx`:** el paquete `xlsx` del registro público de npm quedó en la versión 0.18.5 y tiene avisos de seguridad abiertos; SheetJS publica las versiones nuevas en su propio CDN y lo documenta así. Acá importa más que en cualquier otra dependencia: esta librería es la que parsea **un archivo que trae alguien de afuera**. Es el único lugar del importador donde entra algo que no controlamos.

Verificar que entró la versión correcta:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
node -e "console.log(require('xlsx').version)"
```

Esperado: `0.20.3`.

- [ ] **Step 2: Escribir el test que falla**

Crear `frontend/src/importador/leerXlsx.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { celda, leerLibro, hojas, leerHoja } from './leerXlsx.js';

describe('celda', () => {
  it('un texto queda igual, sin espacios de sobra', () => {
    expect(celda({ t: 's', v: '  Ana Gómez  ' })).toBe('Ana Gómez');
  });

  it('la celda que no está es cadena vacía, no undefined', () => {
    expect(celda(undefined)).toBe('');
  });

  // El caso de la cédula. 1000000200 escrito como "1000000200.0" lo lee el
  // importador —que normaliza a solo dígitos— como 10000002000: un cero de
  // más, y una cédula que no identifica a nadie.
  it('un entero grande no sale con decimal ni en notación científica', () => {
    expect(celda({ t: 'n', v: 1000000200 })).toBe('1000000200');
  });

  // El caso del costo. 40000.0 mal escrito queda "400000": diez veces más
  // caro, en la columna de la que vive la peluquería.
  it('un costo entero sale sin decimal', () => {
    expect(celda({ t: 'n', v: 40000 })).toBe('40000');
  });

  // Un precio con centavos no hay ninguno hoy, pero puede llegar, y
  // truncarlo en silencio sería peor que dejarlo pasar: se escribe tal cual
  // y el núcleo decide.
  it('un decimal de verdad no se trunca', () => {
    expect(celda({ t: 'n', v: 40000.5 })).toBe('40000.5');
  });

  // Acá está toda la gracia de leer el .xlsx y no un CSV: el número 43307
  // con formato de fecha ES una fecha, y no hay que adivinar si 26/07 es
  // julio o febrero.
  it('un número con formato de fecha sale en ISO', () => {
    expect(celda({ t: 'n', v: 43307, z: 'dd/mm/yyyy' })).toBe('2018-07-26');
  });

  // La marca temporal del formulario. La hora importa: es la hora real a la
  // que la clínica atendió, y va a tratamientos.hora.
  it('una fecha con hora sale completa', () => {
    expect(celda({ t: 'n', v: 46275.42921, z: 'yyyy-mm-dd hh:mm:ss' }))
      .toMatch(/^2026-09-12 10:18:/);
  });

  it('un booleano sale como lo escribe la clínica', () => {
    expect(celda({ t: 'b', v: true })).toBe('Si');
    expect(celda({ t: 'b', v: false })).toBe('No');
  });

  // #REF! y #N/A son errores de la hoja, no datos. Escribirlos dejaría
  // "#N/A" guardado como el nombre de un perro.
  it('una celda con error de fórmula queda vacía', () => {
    expect(celda({ t: 'e', v: 0x07, w: '#DIV/0!' })).toBe('');
  });
});

// Una hoja armada a mano: es la forma de probar los tipos sin un .xlsx
// binario en el repo (y sin usar el archivo real, que trae datos de 53
// personas de verdad).
const hojaDePrueba = () => ({
  '!ref': 'A1:C6',
  A1: { t: 's', v: 'Tutor' },
  B1: { t: 's', v: 'Mascota' },
  C1: { t: 's', v: 'Nacimiento' },

  A2: { t: 's', v: 'Ana Gómez' },
  B2: { t: 's', v: 'Max' },
  C2: { t: 'n', v: 43307, z: 'dd/mm/yyyy' },

  // Fila 3 en blanco a propósito: las hojas de Google vienen con huecos.

  A4: { t: 's', v: 'Luis Peña' },
  B4: { t: 's', v: 'Nube' },

  // Filas 5 y 6 en blanco: la cola estirada hasta la 155 que deja Google.
});

const libroDePrueba = () => ({
  SheetNames: ['Respuestas de formulario 1', 'Vacía'],
  Sheets: {
    'Respuestas de formulario 1': hojaDePrueba(),
    'Vacía': { '!ref': 'A1:A1' },
  },
});

describe('hojas', () => {
  // Es el número que la clínica va a usar para elegir hoja. Si dice 155
  // porque Google estiró el rango, elige a ciegas.
  it('cuenta las filas con datos, sin el encabezado ni los blancos', () => {
    expect(hojas(libroDePrueba())).toEqual([
      { nombre: 'Respuestas de formulario 1', filas: 2 },
      { nombre: 'Vacía', filas: 0 },
    ]);
  });
});

describe('leerHoja', () => {
  it('separa el encabezado de los datos', () => {
    const { encabezados } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(encabezados).toEqual(['Tutor', 'Mascota', 'Nacimiento']);
  });

  // El aviso dice "fila 4" y ella mira la fila 4 en Excel. Si se saltaran
  // los blancos, diría "fila 3" y no habría nada ahí: el aviso más
  // importante del importador sería el que no se puede seguir.
  it('deja el hueco de la fila en blanco para no correr la numeración', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(grilla[0]).toEqual(['Ana Gómez', 'Max', '2018-07-26']);
    expect(grilla[1]).toEqual(['', '', '']);          // fila 3 de la hoja
    expect(grilla[2]).toEqual(['Luis Peña', 'Nube', '']);
  });

  // Y la cola SÍ se corta: 150 filas vacías al final son 150 avisos de
  // "fila sin nombres" que no significan nada.
  it('corta las filas en blanco del final', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(grilla).toHaveLength(3);
  });

  it('todas las filas tienen el mismo ancho', () => {
    const { grilla } = leerHoja(libroDePrueba(), 'Respuestas de formulario 1');
    expect(new Set(grilla.map((f) => f.length))).toEqual(new Set([3]));
  });

  it('dice en español que la hoja no está', () => {
    expect(() => leerHoja(libroDePrueba(), 'No Existe'))
      .toThrow(/La hoja "No Existe" no está/);
  });
});

describe('leerLibro', () => {
  // Esta es la prueba que importa de verdad: que `cellNF: true` traiga el
  // formato de la celda. Sin ese formato, una fecha es un número suelto y
  // vuelve el problema que este archivo existe para resolver.
  it('un .xlsx de verdad vuelve con la fecha en ISO', () => {
    const ws = XLSX.utils.aoa_to_sheet(
      // Medianoche local y no UTC: en Colombia (UTC-5) un Date.UTC se
      // convierte al día anterior y el test pasaría a fallar por el huso.
      [['Nacimiento', 'Cedula'], [new Date(2018, 6, 26), 1000000200]],
      { cellDates: true },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const { grilla } = leerHoja(leerLibro(bytes), 'Hoja1');
    expect(grilla[0]).toEqual(['2018-07-26', '1000000200']);
  });

  it('dice en español que el archivo no es un Excel', () => {
    expect(() => leerLibro(new Uint8Array([1, 2, 3, 4, 5])))
      .toThrow(/no se pudo leer|no parece un archivo de Excel/i);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/leerXlsx.test.js
```

Esperado: FALLA con `Failed to resolve import "./leerXlsx.js"`.

- [ ] **Step 4: Escribir `frontend/src/importador/leerXlsx.js`**

```js
// ============================================================
// VetaApp · importador/leerXlsx.js
// Un .xlsx que subió la clínica → una grilla de texto para el núcleo.
//
// ---------- POR QUÉ NO SE LEE UN CSV ----------
// Es el mismo argumento de importar/xlsx-a-csv.py, acá en el navegador:
// el .xlsx guarda los TIPOS de cada celda y el CSV los pierde. Con los
// tipos a la vista, tres datos que en un CSV serían una adivinanza quedan
// resueltos de entrada — y los tres fallan en silencio si se adivina mal:
// la cédula con un cero de más, el costo diez veces más caro, y las
// fechas en d/m/Y o m/d/Y según el idioma de la cuenta de Google.
//
// ---------- LO QUE NO HACE ----------
// No valida nada del contenido. Esto entrega texto; quién es tutor y qué
// fecha es válida lo decide nucleo/. Esa separación es la que va a dejar
// enchufar el lector de PDF más adelante sin tocar ni el emparejado ni la
// vista previa.
// ============================================================

import * as XLSX from 'xlsx';

const dos = (n) => String(n).padStart(2, '0');

/**
 * Una celda de SheetJS al texto que va al núcleo, sin inventar ni perder.
 */
export function celda(c) {
  if (!c || c.t === 'z') return '';

  // #REF!, #N/A, #DIV/0!: son errores de la hoja, no datos. Escribirlos
  // dejaría "#N/A" guardado como el nombre de un perro.
  if (c.t === 'e') return '';

  if (c.t === 'b') return c.v ? 'Si' : 'No';

  // Ya viene como Date si alguien llamó a XLSX.read con cellDates. Acá no
  // se usa (ver leerLibro), pero una celda así no puede caer al String()
  // del final: saldría "Thu Jul 26 2018 00:00:00 GMT-0500".
  if (c.t === 'd' && c.v instanceof Date) {
    const d = c.v;
    const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
    if (!d.getHours() && !d.getMinutes() && !d.getSeconds()) return fecha;
    return `${fecha} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
  }

  if (c.t === 'n') {
    // Acá está toda la gracia. En Excel una fecha es un número, y lo único
    // que la distingue de un precio es el FORMATO de la celda (c.z, que
    // llega porque leerLibro pide cellNF). SSF.parse_date_code lo convierte
    // sin pasar por Date, así que no hay huso horario que corra un día.
    if (c.z && XLSX.SSF.is_date(c.z)) {
      const d = XLSX.SSF.parse_date_code(c.v);
      if (!d) return '';
      const fecha = `${d.y}-${dos(d.m)}-${dos(d.d)}`;
      if (!d.H && !d.M && !d.S) return fecha;
      return `${fecha} ${dos(d.H)}:${dos(d.M)}:${dos(d.S)}`;
    }

    // toFixed(0) y no String(): String(1e21) devuelve "1e+21". Ninguna
    // cédula llega a eso, pero el día que una celda traiga un número
    // enorme, "1e+21" normalizado a dígitos es basura silenciosa.
    if (Number.isInteger(c.v)) return c.v.toFixed(0);

    // Un precio con centavos no hay ninguno hoy, pero puede llegar, y
    // truncarlo en silencio sería peor: se escribe tal cual y el núcleo
    // decide qué hacer con él.
    return String(c.v);
  }

  return String(c.v ?? '').trim();
}

/**
 * Los bytes del archivo → el libro de SheetJS.
 * @param {ArrayBuffer|Uint8Array} bytes
 */
export function leerLibro(bytes) {
  try {
    return XLSX.read(bytes, {
      type: 'array',
      // Las fechas se quedan como número + formato. cellDates las
      // convertiría a Date usando el huso del navegador, y en Colombia
      // (UTC-5) eso corre un día para atrás en algunos casos. El número
      // crudo no tiene huso.
      cellDates: false,
      // Sin esto no llega c.z, y sin c.z una fecha es un número suelto:
      // vuelve exactamente el problema que este archivo existe para
      // resolver.
      cellNF: true,
      // No hace falta el texto ya formateado y en archivos grandes es
      // memoria de más.
      cellText: false,
    });
  } catch (e) {
    // Lo que ve la clínica, no el stack de SheetJS.
    throw new Error(
      'Ese archivo no parece un archivo de Excel. Si lo tenés en Google Sheets, ' +
      'usá Archivo → Descargar → Microsoft Excel (.xlsx).',
    );
  }
}

/** La última columna que tiene algo en toda la hoja. */
const ancho = (hoja) => {
  const ref = hoja?.['!ref'];
  if (!ref) return 0;
  return XLSX.utils.decode_range(ref).e.c + 1;
};

/**
 * Todas las filas de la hoja como texto, cortando la cola en blanco.
 *
 * Se recorre desde la fila 1 y la columna A SIEMPRE, aunque el rango de la
 * hoja empiece más adelante: así el índice de la fila que se devuelve es el
 * número de fila que la clínica ve en Excel, que es el que va a buscar
 * cuando un aviso le diga "fila 35".
 */
const todasLasFilas = (hoja) => {
  const ref = hoja?.['!ref'];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  const cols = ancho(hoja);

  const filas = [];
  for (let r = 0; r <= rango.e.r; r++) {
    const fila = [];
    for (let c = 0; c < cols; c++) {
      fila.push(celda(hoja[XLSX.utils.encode_cell({ r, c })]));
    }
    filas.push(fila);
  }

  // La cola sí se corta. Las hojas de Google vienen estiradas con filas en
  // blanco hasta la 155: dejarlas serían 150 avisos de "fila sin nombres"
  // que no significan nada y que esconden los que sí.
  while (filas.length && filas[filas.length - 1].every((x) => x === '')) filas.pop();

  return filas;
};

/**
 * Las hojas del archivo, con cuántas filas con datos tiene cada una.
 *
 * El número es para que la clínica elija hoja sabiendo. Si dijera 155
 * porque Google estiró el rango, elegiría a ciegas.
 */
export function hojas(libro) {
  return libro.SheetNames.map((nombre) => {
    const conDatos = todasLasFilas(libro.Sheets[nombre])
      .filter((f) => f.some((x) => x !== '')).length;
    // -1 por el encabezado. Una hoja de una sola fila es solo encabezado:
    // 0 filas con datos, no -1.
    return { nombre, filas: Math.max(0, conDatos - 1) };
  });
}

/**
 * Una hoja → encabezados + grilla.
 *
 * `grilla[i]` es la fila `i + 2` de la hoja: el encabezado es la 1, y las
 * filas en blanco del medio SE CONSERVAN. Saltarlas correría la numeración
 * y los avisos apuntarían a filas equivocadas — el aviso más importante
 * del importador ("fila 35: la vacuna es anterior al nacimiento") sería el
 * que no se puede seguir. El núcleo ya sabe saltar la fila vacía sin
 * avisar.
 */
export function leerHoja(libro, nombre) {
  const hoja = libro.Sheets?.[nombre];
  if (!hoja) {
    throw new Error(`La hoja "${nombre}" no está en el archivo.`);
  }

  const [encabezados = [], ...grilla] = todasLasFilas(hoja);
  return { encabezados, grilla };
}
```

- [ ] **Step 5: Correr el test**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/leerXlsx.test.js
```

Esperado: PASA, 15 tests.

Y que no se haya roto nada del núcleo:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: todo verde.

- [ ] **Step 6: Verificar contra el archivo real**

El `.xlsx` de La Huella está en `~/Downloads`. Esto compara lo que lee el navegador contra lo que leyó el script de Python, que es el que produjo el import verificado.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { leerLibro, hojas, leerHoja } from './src/importador/leerXlsx.js';
const ruta = process.env.HOME + '/Downloads/Base Clientes.xlsx';
const libro = leerLibro(readFileSync(ruta));
console.log(hojas(libro));
const { encabezados, grilla } = leerHoja(libro, 'Respuestas de formulario 1');
console.log('columnas:', encabezados.length);
console.log('filas:', grilla.length);
"
```

Esperado: la hoja `Respuestas de formulario 1` con **54** filas — el mismo número que imprime `xlsx-a-csv.py`. Si no coincide, el que está mal es el lector nuevo.

> **Nada de esto se commitea.** Ni la salida, ni el `.xlsx`, ni un recorte de una fila. Son 53 personas reales con cédula y dirección de casa.

- [ ] **Step 7: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/leerXlsx.js frontend/src/importador/leerXlsx.test.js frontend/package.json frontend/package-lock.json
git commit -m "Lee el .xlsx en el navegador conservando los tipos de celda

Es el gemelo de importar/xlsx-a-csv.py y existe por lo mismo: el .xlsx
guarda el tipo de cada celda y un CSV lo pierde. Sin el tipo, tres datos
quedan en una adivinanza y los tres fallan sin ruido — la cédula con un
cero de más, el costo diez veces más caro, y la fecha en d/m/Y o m/d/Y
según el idioma de la cuenta de Google.

Las fechas se leen del número + el formato de la celda, no convirtiendo a
Date: en Colombia (UTC-5) esa conversión corre un día para atrás.

Las filas en blanco del medio se conservan para que el número de fila que
dice un aviso sea el que la clínica ve en Excel. La cola estirada de
Google sí se corta.

SheetJS se instala del CDN de SheetJS y no del registro público de npm,
donde el paquete quedó en 0.18.5 con avisos abiertos. Esta librería
parsea un archivo que trae alguien de afuera: es el único lugar del
importador donde entra algo que no controlamos."
```

---

## Tarea 9: Emparejar contra lo que ya existe

El cerebro del importador. Entra lo agrupado de la tarea 4 más lo que la cuenta ya tiene, y sale el JSON que consume la función de la tarea 7 — más la lista de dudas que el paso 3 le pone adelante.

Tres cosas se juegan acá, y las tres son irreversibles si salen mal:

1. **Equivocarse duplicando se arregla; equivocarse uniendo, no.** Unir a dos clientes que no son el mismo deja una sola ficha con el historial de dos animales adentro, y eso no se desarma. Por eso el dudoso viene marcado **"son dos personas distintas"** por defecto: si le dan Confirmar sin leer, el resultado son dos fichas repetidas que se juntan después.
2. **Nunca pisar lo lleno.** Es la promesa central. Si falla, la clínica pierde datos que tenía bien por subir un archivo.
3. **El mismo archivo dos veces no hace nada.** Sin la regla de eventos, 74 baños se vuelven 148: historial duplicado e informe de caja con el doble de servicios.

**Files:**
- Create: `frontend/src/importador/nucleo/plan.js`
- Create: `frontend/src/importador/nucleo/plan.test.js`

**Interfaces:**
- Consumes: `sinTildes`, `aviso` de `./normalizar.js`; `edadDesde` de `../../utils/edad.js`
- Produces:
  - `nombresSeParecen(a, b) → boolean`
  - `indexar(existentes) → Indice`
  - `emparejarTutor(idx, tutor) → { certeza: 'misma'|'nueva'|'duda', existente, motivo }`
  - `armarPlan(estado, agrupado, existentes, decisiones, hoy) → Plan`

### Lo que se trae de la base

El spec, en §5 "Contra qué se compara", lista solo las columnas que sirven para emparejar. **Hacen falta más**, y es un error del spec: para decir en el paso 3 "les completo cédula y dirección" hay que saber si esa cédula y esa dirección están vacías. Sin leerlas, el número del paso 3 es una adivinanza y la clínica confirma a ciegas.

```js
// duenos
id, nombre, telefono, telefono2, cedula, direccion
// mascotas
id, dueno_id, nombre, raza, fecha_nacimiento, edad_anios, edad_meses
// tratamientos  (solo de las mascotas que existen)
mascota_id, tipo, fecha
// vacunas
mascota_id, nombre, fecha_aplicacion
```

Los eventos también hacen falta, y por lo mismo: sin ellos, subir el mismo archivo dos veces muestra "74 eventos para crear" y después crea 0. El número correcto es 0 desde el principio — si no, nadie cree en el paso 3.

### La forma del `Plan`

```js
{
  // Lo que va a la función de Postgres, tal cual. `importacion_id` lo
  // pone escribir.js cuando crea la fila en 'en_curso'.
  envio: {
    importacion_id: null,
    crear_tutores: [], completar_tutores: [],
    crear_mascotas: [], completar_mascotas: [],
    tratamientos: [], vacunas: [],
  },

  // Lo que el paso 3 tiene que preguntar. Hasta que no estén todas
  // resueltas, el botón de Confirmar no existe.
  dudas: [{
    id: 'tutor:c:1000000200',
    clase: 'tutor',
    motivo: 'nombre_tel_distinto' | 'cedula_otro_nombre',
    archivo: { nombre, tel1, cedula, direccion, mascotas: ['Max'] },
    existente: { id, nombre, telefono, cedula },
  }],
  // `clave` es la raza pasada por sinTildes() y es la llave de
  // `decisiones.especies`; `raza` es la original, tal como la escribieron,
  // para mostrar. Van las dos a propósito: si la pantalla tuviera que
  // normalizar la raza por su cuenta para armar la llave, el día que las
  // dos normalizaciones se separen la respuesta de la clínica no le llega
  // a armarPlan — se vería contestada en pantalla y la mascota entraría
  // sin especie.
  especies: [{ clave: 'criollo', raza: 'Criollo', cuantas: 3, mascotas: ['Rocky', 'Luna', 'Toby'] }],

  // Los números del paso 3. Salen de contar `envio`, no de estimar.
  resumen: {
    tutores_nuevos, tutores_a_completar,
    mascotas_nuevas, mascotas_a_completar,
    tratamientos, vacunas, eventos_repetidos,
    dudas, especies_sin_resolver,
  },
}
```

### `decisiones`, lo que contesta el paso 3

```js
{
  // Por cada duda.id: 'misma' une, 'distinta' crea una nueva.
  dudas:   { 'tutor:n:Teofilo Quintanilla': 'distinta' },
  // Por cada raza que clasificar() no reconoció. La pantalla la deja en
  // 'perro' marcada de entrada: en la base real 51 de 54 son perros.
  especies: { 'criollo': 'perro' },
}
```

`armarPlan` se llama **dos veces**: una con `decisiones` vacío para saber qué preguntar, y otra con las respuestas para armar el envío. Es la misma función pura corrida dos veces, no dos caminos distintos — así no hay forma de que lo que se muestra y lo que se escribe se separen.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/nucleo/plan.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { nuevoEstado } from './normalizar.js';
import { nombresSeParecen, indexar, emparejarTutor, armarPlan } from './plan.js';

const HOY = new Date(2026, 9, 15); // 15/10/2026, fijo para que la edad no cambie

// Un tutor y una mascota del archivo, con lo mínimo. `clave` es lo que
// devuelve agrupar(): la mascota señala a su tutor por esa clave.
const delArchivo = (over = {}) => ({
  tutores: new Map([['t1', {
    clave: 't1', nombre: 'Ana Gómez', cedula: null, direccion: null,
    tel1: '573000000200', tel2: null, origen: ['Hoja1:2'], ...over.tutor,
  }]]),
  mascotas: new Map([['m1', {
    clave: 'm1', tutor: 't1', nombre: 'Max', especie: 'perro',
    raza: 'Poodle', nacimiento: '2018-07-26', origen: ['Hoja1:2'], ...over.mascota,
  }]]),
  eventos: over.eventos ?? [],
});

const vacia = { duenos: [], mascotas: [], tratamientos: [], vacunas: [] };
const sinDecidir = { dudas: {}, especies: {} };

describe('nombresSeParecen', () => {
  it('"Eulalia Ruth Trujillo" y "Ana Araque" son parecidos', () => {
    expect(nombresSeParecen('Eulalia Ruth Trujillo', 'Ana Araque')).toBe(true);
  });

  it('las tildes y las mayúsculas no cuentan', () => {
    expect(nombresSeParecen('Teofilo Quintanilla', 'Anselmo Zambrano')).toBe(true);
  });

  it('"Ana Araque" y "Pedro Gómez" no se parecen en nada', () => {
    expect(nombresSeParecen('Ana Araque', 'Pedro Gómez')).toBe(false);
  });

  // "de", "la", "y" están en medio mundo. Si contaran, cualquier par de
  // nombres se parecería y la duda de la cédula mal tecleada nunca saltaría.
  it('las palabras de dos letras o menos no alcanzan', () => {
    expect(nombresSeParecen('Maria de la Cruz', 'Pedro de la Torre')).toBe(false);
  });
});

describe('emparejarTutor', () => {
  it('misma cédula, nombre parecido: es la misma persona', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 7, nombre: 'Eulalia Ruth Trujillo', telefono: '573000000202', cedula: '1000000200' }] });
    const r = emparejarTutor(idx, { nombre: 'Ana Araque', cedula: '1000000200', tel1: '573000000000' });
    expect(r).toMatchObject({ certeza: 'misma', existente: { id: 7 } });
  });

  // No es un parecido, es un error: o la cédula está mal tecleada o es de
  // otra persona. Unirlos metería el historial de un animal en la ficha de
  // alguien que no es su dueño.
  it('misma cédula, nombre completamente distinto: pregunta', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 7, nombre: 'Eulalia Ruth Trujillo', telefono: '573000000202', cedula: '1000000200' }] });
    const r = emparejarTutor(idx, { nombre: 'Pedro Castaño', cedula: '1000000200', tel1: null });
    expect(r).toMatchObject({ certeza: 'duda', motivo: 'cedula_otro_nombre' });
  });

  it('mismo nombre y mismo teléfono, sin cédulas: es la misma', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Ana Gómez', telefono: '573000000200', cedula: null }] });
    const r = emparejarTutor(idx, { nombre: 'ana gomez', cedula: null, tel1: '573000000200' });
    expect(r).toMatchObject({ certeza: 'misma', existente: { id: 9 } });
  });

  // El caso real de la base de La Huella: dos "Teofilo Arboleda" que son dos
  // personas distintas (Araque y Casimiro Carvajalino).
  it('mismo nombre con teléfono distinto: pregunta', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Teofilo Arboleda', telefono: '573000000202', cedula: null }] });
    const r = emparejarTutor(idx, { nombre: 'Teofilo Arboleda', cedula: null, tel1: '573000000203' });
    expect(r).toMatchObject({ certeza: 'duda', motivo: 'nombre_tel_distinto' });
  });

  it('nadie parecido: es alguien nuevo', () => {
    const idx = indexar({ ...vacia, duenos: [
      { id: 9, nombre: 'Otra Persona', telefono: '573100000000', cedula: null }] });
    expect(emparejarTutor(idx, { nombre: 'Ana Gómez', cedula: null, tel1: '573000000200' }))
      .toMatchObject({ certeza: 'nueva', existente: null });
  });

  it('una cuenta vacía: todos son nuevos', () => {
    expect(emparejarTutor(indexar(vacia), { nombre: 'Ana', cedula: '1', tel1: '2' }))
      .toMatchObject({ certeza: 'nueva' });
  });
});

describe('armarPlan · una cuenta vacía', () => {
  it('crea el tutor y la mascota con la edad calculada', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), vacia, sinDecidir, HOY);

    expect(p.envio.crear_tutores).toEqual([{
      ref: 't1', nombre: 'Ana Gómez', telefono: '573000000200',
      telefono2: null, cedula: null, direccion: null,
    }]);
    expect(p.envio.crear_mascotas).toEqual([{
      ref: 'm1', tutor_ref: 't1', tutor_id: null, nombre: 'Max',
      especie: 'perro', raza: 'Poodle', fecha_nacimiento: '2018-07-26',
      edad_anios: 8, edad_meses: 2,
    }]);
    expect(p.resumen).toMatchObject({ tutores_nuevos: 1, mascotas_nuevas: 1, dudas: 0 });
  });

  // duenos.telefono es NOT NULL. La base real tiene una fila sin ningún
  // número usable, y esa persona entra igual: con el botón de WhatsApp
  // apagado, no afuera de la base.
  it('un tutor sin teléfono entra con cadena vacía, nunca con null', () => {
    const a = delArchivo({ tutor: { tel1: null, tel2: null } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_tutores[0].telefono).toBe('');
  });

  // Sin fecha de nacimiento la edad NO se inventa: queda 0, que es lo que
  // ya hace la app para las mascotas viejas, y se corrige a mano.
  it('sin fecha de nacimiento la edad queda en 0', () => {
    const a = delArchivo({ mascota: { nacimiento: null } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_mascotas[0]).toMatchObject({
      fecha_nacimiento: null, edad_anios: 0, edad_meses: 0,
    });
  });
});

describe('armarPlan · la especie que no se reconoció', () => {
  // mascotas.especie es NOT NULL. El script de terminal se detiene y
  // obliga a decidir; en el navegador eso no sirve, pasa a ser una
  // pregunta del paso 3.
  it('pregunta por la raza desconocida y no manda la mascota', () => {
    const a = delArchivo({ mascota: { especie: null, raza: 'Criollo' } });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);

    expect(p.especies).toEqual([{ clave: 'criollo', raza: 'Criollo', cuantas: 1, mascotas: ['Max'] }]);
    expect(p.envio.crear_mascotas).toHaveLength(0);
    // El tutor sí: no tiene nada que ver con la raza de su perro.
    expect(p.envio.crear_tutores).toHaveLength(1);
  });

  it('con la especie resuelta, la mascota entra y la raza se guarda tal cual', () => {
    const a = delArchivo({ mascota: { especie: null, raza: 'Criollo' } });
    const p = armarPlan(nuevoEstado(), a, vacia, { dudas: {}, especies: { criollo: 'gato' } }, HOY);

    expect(p.especies).toHaveLength(0);
    expect(p.envio.crear_mascotas[0]).toMatchObject({ especie: 'gato', raza: 'Criollo' });
  });
});

describe('armarPlan · completar sin pisar', () => {
  const yaExiste = {
    ...vacia,
    duenos: [{ id: 7, nombre: 'Ana Gómez', telefono: '573999999999',
               telefono2: null, cedula: null, direccion: 'La que ya tenía' }],
    mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: null,
                 fecha_nacimiento: null, edad_anios: 0, edad_meses: 0 }],
  };

  it('completa la cédula vacía y deja la dirección que ya estaba', () => {
    const a = delArchivo({
      tutor: { cedula: '1000000200', direccion: 'LA DEL ARCHIVO', tel1: '573999999999' },
    });
    const p = armarPlan(nuevoEstado(), a, yaExiste, sinDecidir, HOY);

    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.completar_tutores).toEqual([
      { id: 7, campos: { cedula: '1000000200' } },
    ]);
  });

  // duenos.telefono es NOT NULL: nunca está vacío, así que completarlo es
  // imposible por definición. Si el archivo trae otro número no lo cambia
  // — y lo dice, porque callarlo dejaría a la clínica creyendo que el
  // número nuevo entró.
  it('no cambia el teléfono y lo avisa', () => {
    const e = nuevoEstado();
    const a = delArchivo({ tutor: { tel1: '573000000200' } });
    const p = armarPlan(e, a, yaExiste, sinDecidir, HOY);

    expect(JSON.stringify(p.envio.completar_tutores)).not.toContain('telefono"');
    expect(e.avisos.some((x) => x.texto.includes('Dejo el que ya estaba'))).toBe(true);
  });

  it('completa raza y nacimiento de la mascota que ya existe, con la edad', () => {
    const p = armarPlan(nuevoEstado(), delArchivo({ tutor: { tel1: '573999999999' } }),
                        yaExiste, sinDecidir, HOY);

    expect(p.envio.crear_mascotas).toHaveLength(0);
    expect(p.envio.completar_mascotas).toEqual([{
      id: 70,
      campos: { raza: 'Poodle', fecha_nacimiento: '2018-07-26',
                edad_anios: 8, edad_meses: 2 },
    }]);
  });

  it('una edad ya escrita a mano no se pisa', () => {
    const conEdad = { ...yaExiste, mascotas: [
      { ...yaExiste.mascotas[0], edad_anios: 5, edad_meses: 3 }] };
    const p = armarPlan(nuevoEstado(), delArchivo({ tutor: { tel1: '573999999999' } }),
                        conEdad, sinDecidir, HOY);

    const campos = p.envio.completar_mascotas[0].campos;
    expect(campos).not.toHaveProperty('edad_anios');
    expect(campos.fecha_nacimiento).toBe('2018-07-26');
  });

  it('nada que completar es completar_tutores vacío, no un objeto sin campos', () => {
    const lleno = { ...vacia, duenos: [{ id: 7, nombre: 'Ana Gómez',
      telefono: '573000000200', telefono2: '573000000001',
      cedula: '1000000200', direccion: 'Ya' }] };
    const a = delArchivo({ tutor: { cedula: '1000000200' } });
    const p = armarPlan(nuevoEstado(), a, lleno, sinDecidir, HOY);

    expect(p.envio.completar_tutores).toHaveLength(0);
    expect(p.resumen.tutores_a_completar).toBe(0);
  });
});

describe('armarPlan · los dudosos', () => {
  const dosAnas = { ...vacia, duenos: [
    { id: 9, nombre: 'Ana Gómez', telefono: '573000000202', cedula: null,
      telefono2: null, direccion: null }] };

  it('devuelve la duda y no manda nada de ese tutor hasta que la contesten', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY);

    expect(p.dudas).toHaveLength(1);
    expect(p.dudas[0]).toMatchObject({
      clase: 'tutor', motivo: 'nombre_tel_distinto',
      existente: { id: 9, telefono: '573000000202' },
    });
    expect(p.dudas[0].archivo).toMatchObject({ nombre: 'Ana Gómez', tel1: '573000000200' });
    // La mascota tampoco: no se sabe de quién es.
    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.crear_mascotas).toHaveLength(0);
    expect(p.resumen.dudas).toBe(1);
  });

  it('"distinta" crea una segunda ficha', () => {
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas,
      { dudas: { [armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY).dudas[0].id]: 'distinta' },
        especies: {} }, HOY);

    expect(p.dudas).toHaveLength(0);
    expect(p.envio.crear_tutores).toHaveLength(1);
    expect(p.envio.crear_mascotas[0].tutor_ref).toBe('t1');
  });

  it('"misma" la une a la que ya existe', () => {
    const id = armarPlan(nuevoEstado(), delArchivo(), dosAnas, sinDecidir, HOY).dudas[0].id;
    const p = armarPlan(nuevoEstado(), delArchivo(), dosAnas,
      { dudas: { [id]: 'misma' }, especies: {} }, HOY);

    expect(p.envio.crear_tutores).toHaveLength(0);
    expect(p.envio.crear_mascotas[0]).toMatchObject({ tutor_id: 9, tutor_ref: null });
  });
});

describe('armarPlan · mascotas dentro del mismo tutor', () => {
  // Lo que el dueño decidió cuando se le preguntó: la app no adivina que
  // uno es el apodo del otro, y está bien que no lo haga.
  it('"Noah" y "Noah Emiliano" son dos mascotas', () => {
    const a = delArchivo();
    a.mascotas = new Map([
      ['m1', { clave: 'm1', tutor: 't1', nombre: 'Noah', especie: 'perro', raza: null, nacimiento: null, origen: [] }],
      ['m2', { clave: 'm2', tutor: 't1', nombre: 'Noah Emiliano', especie: 'perro', raza: null, nacimiento: null, origen: [] }],
    ]);
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.crear_mascotas.map((m) => m.nombre)).toEqual(['Noah', 'Noah Emiliano']);
  });

  it('el mismo nombre en otro tutor es otra mascota', () => {
    const otra = { ...vacia,
      duenos: [{ id: 7, nombre: 'Otro Señor', telefono: '573111111111', cedula: null,
                 telefono2: null, direccion: null }],
      mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: null,
                   fecha_nacimiento: null, edad_anios: 0, edad_meses: 0 }] };
    const p = armarPlan(nuevoEstado(), delArchivo(), otra, sinDecidir, HOY);
    expect(p.envio.crear_mascotas).toHaveLength(1);
    expect(p.envio.completar_mascotas).toHaveLength(0);
  });
});

describe('armarPlan · subir dos veces el mismo archivo', () => {
  const unBano = [{ tipo: 'tratamiento', mascota: 'm1', t: 'bano',
                    fecha: '2026-09-12', hora: '10:18', notas: 'Baño completo' }];
  const unaVacuna = [{ tipo: 'vacuna', mascota: 'm1', nombre: 'Anual',
                       fecha: '2026-07-14', proxima: '2027-07-14', notas: 'Según el tutor' }];

  it('la primera vez los eventos entran', () => {
    const a = delArchivo({ eventos: [...unBano, ...unaVacuna] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(1);
    expect(p.envio.vacunas).toHaveLength(1);
    expect(p.envio.tratamientos[0]).toMatchObject({
      mascota_ref: 'm1', mascota_id: null, tipo: 'bano', fecha: '2026-09-12', hora: '10:18',
    });
  });

  // Sin esto, el mismo archivo dos veces deja 148 baños donde hubo 74:
  // historial duplicado e informe de caja con el doble de servicios.
  it('la segunda vez no entra nada: 0 para crear y 0 para completar', () => {
    const yaTodo = {
      duenos: [{ id: 7, nombre: 'Ana Gómez', telefono: '573000000200',
                 telefono2: null, cedula: null, direccion: null }],
      mascotas: [{ id: 70, dueno_id: 7, nombre: 'Max', raza: 'Poodle',
                   fecha_nacimiento: '2018-07-26', edad_anios: 8, edad_meses: 2 }],
      tratamientos: [{ mascota_id: 70, tipo: 'bano', fecha: '2026-09-12' }],
      vacunas: [{ mascota_id: 70, nombre: 'Anual', fecha_aplicacion: '2026-07-14' }],
    };
    const a = delArchivo({ eventos: [...unBano, ...unaVacuna] });
    const p = armarPlan(nuevoEstado(), a, yaTodo, sinDecidir, HOY);

    expect(p.resumen).toMatchObject({
      tutores_nuevos: 0, tutores_a_completar: 0,
      mascotas_nuevas: 0, mascotas_a_completar: 0,
      tratamientos: 0, vacunas: 0, eventos_repetidos: 2,
    });
  });

  // Costo conocido y aceptado: si bañaron al mismo perro dos veces el mismo
  // día, el segundo se pierde. Es rarísimo y se arregla a mano en diez
  // segundos; el caso contrario es frecuente y es un desastre para limpiar.
  it('dos baños del mismo día en el mismo archivo son uno', () => {
    const a = delArchivo({ eventos: [
      ...unBano,
      { tipo: 'tratamiento', mascota: 'm1', t: 'bano', fecha: '2026-09-12', hora: '15:00', notas: 'Otro' },
    ] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(1);
    expect(p.resumen.eventos_repetidos).toBe(1);
  });

  // A una mascota se le pueden aplicar dos vacunas distintas el mismo día.
  it('dos vacunas distintas el mismo día son dos', () => {
    const a = delArchivo({ eventos: [
      { tipo: 'vacuna', mascota: 'm1', nombre: 'Anual', fecha: '2026-07-14', proxima: null, notas: null },
      { tipo: 'vacuna', mascota: 'm1', nombre: 'Tos de las perreras', fecha: '2026-07-14', proxima: null, notas: null },
    ] });
    const p = armarPlan(nuevoEstado(), a, vacia, sinDecidir, HOY);
    expect(p.envio.vacunas).toHaveLength(2);
  });

  // Un evento de una mascota que quedó colgada de una duda no puede ir: no
  // se sabe a qué mascota pegarlo.
  it('el evento de una mascota sin resolver no se manda', () => {
    const dosAnas = { ...vacia, duenos: [{ id: 9, nombre: 'Ana Gómez',
      telefono: '573000000202', cedula: null, telefono2: null, direccion: null }] };
    const a = delArchivo({ eventos: unBano });
    const p = armarPlan(nuevoEstado(), a, dosAnas, sinDecidir, HOY);
    expect(p.envio.tratamientos).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/nucleo/plan.test.js
```

Esperado: FALLA con `Failed to resolve import "./plan.js"`.

- [ ] **Step 3: Escribir `frontend/src/importador/nucleo/plan.js`**

Una aclaración antes del código, porque es una **corrección a la regla 2 del spec**. El spec dice que "mismo nombre + mismo teléfono" solo cuenta como la misma persona "sin cédula en ninguno de los dos". Tomado al pie de la letra, el caso más común del importador no funciona: la clínica tiene a Ana Gómez sin cédula, el archivo trae a Ana Gómez con el mismo teléfono **y con cédula** — que es exactamente el "ya existen 2 tutores → les completo cédula" del paso 3. Con la regla literal eso sería una duda, y la clínica tendría que contestar una pregunta obvia por cada cliente.

La regla queda: **mismo nombre + mismo teléfono, y la cédula no se contradice** — o el que existe no tiene, o tiene la misma. Si el que existe tiene **otra** cédula, sí es duda: dos personas con el mismo nombre que comparten teléfono son una familia, y la cédula dice que no son la misma.

```js
// ============================================================
// VetaApp · importador/nucleo/plan.js
// Lo que trae el archivo + lo que la cuenta ya tiene → qué hacer.
//
// ---------- LA REGLA QUE ORDENA TODO ----------
// Equivocarse duplicando se arregla; equivocarse uniendo, no.
//
// Unir a dos clientes que no son el mismo deja una sola ficha con el
// historial de dos animales adentro: dos pesos, dos fechas de vacuna, dos
// tratamientos. Eso no se desarma — hay que borrar y reescribir a mano. Al
// revés, dos fichas repetidas se juntan en un minuto.
//
// Por eso solo se une cuando no hay nada que dudar, y cuando hay algo que
// dudar se pregunta con "son dos personas distintas" ya marcado.
//
// ---------- ES PURA, Y SE CORRE DOS VECES ----------
// Una con `decisiones` vacío, para saber qué preguntar. Otra con las
// respuestas, para armar el envío. No son dos caminos: es la misma función,
// así que lo que la clínica vio en el paso 3 y lo que se escribe en el paso
// 4 no se pueden separar.
// ============================================================

import { sinTildes, aviso } from './normalizar.js';
import { edadDesde } from '../../utils/edad.js';

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Las palabras de un nombre que sirven para comparar.
 *
 * Se descartan las de dos letras o menos: "de", "la", "y" están en medio
 * mundo, y si contaran cualquier par de nombres se parecería — la duda de
 * la cédula mal tecleada nunca saltaría.
 */
const palabras = (nombre) => sinTildes(nombre).split(' ').filter((p) => p.length >= 3);

/**
 * Si dos nombres pueden ser de la misma persona.
 *
 * Una palabra compartida alcanza, y a propósito: esto NO se usa para
 * emparejar. Se usa solo cuando la cédula ya dijo que son el mismo, para
 * distinguir "Eulalia Ruth Trujillo" / "Ana Araque" —el mismo cliente escrito
 * de dos formas— de "Ana Araque" / "Pedro Castaño", que con la misma cédula
 * es una cédula mal tecleada y hay que preguntar.
 */
export function nombresSeParecen(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return false;
  return pa.some((p) => pb.includes(p));
}

/**
 * Lo que la cuenta ya tiene, en mapas para no recorrer listas por cada fila.
 *
 * Un archivo de 300 filas contra 300 clientes son 90.000 comparaciones si se
 * hace a lo bruto, en el hilo que dibuja la pantalla.
 */
export function indexar(existentes) {
  const porCedula = new Map();
  const porNombre = new Map();

  for (const d of existentes.duenos ?? []) {
    if (!vacio(d.cedula)) porCedula.set(String(d.cedula), d);
    const k = sinTildes(d.nombre);
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(d);
  }

  // Las mascotas se emparejan DENTRO de un tutor, nunca entre tutores: hay
  // nueve "Max" en una base de 300 y son nueve perros distintos.
  const mascotasPorDueno = new Map();
  for (const m of existentes.mascotas ?? []) {
    if (!mascotasPorDueno.has(m.dueno_id)) mascotasPorDueno.set(m.dueno_id, new Map());
    mascotasPorDueno.get(m.dueno_id).set(sinTildes(m.nombre), m);
  }

  // Los eventos no tienen nada que los identifique, así que la identidad se
  // construye: mascota + tipo + fecha. Sin esto, el mismo archivo dos veces
  // deja 148 baños donde hubo 74.
  const eventos = new Set();
  for (const t of existentes.tratamientos ?? []) {
    eventos.add(`t|${t.mascota_id}|${t.tipo}|${t.fecha}`);
  }
  for (const v of existentes.vacunas ?? []) {
    eventos.add(`v|${v.mascota_id}|${sinTildes(v.nombre)}|${v.fecha_aplicacion}`);
  }

  return { porCedula, porNombre, mascotasPorDueno, eventos };
}

/**
 * Un tutor del archivo contra la base. Tres respuestas: `misma`, `nueva`,
 * `duda`. Solo `duda` llega a la pantalla.
 */
export function emparejarTutor(idx, tutor) {
  // 1. Misma cédula. Dos personas no comparten cédula.
  if (!vacio(tutor.cedula) && idx.porCedula.has(String(tutor.cedula))) {
    const d = idx.porCedula.get(String(tutor.cedula));
    if (nombresSeParecen(d.nombre, tutor.nombre)) {
      return { certeza: 'misma', existente: d, motivo: 'cedula' };
    }
    // Esto no es un parecido, es un error: o la cédula está mal tecleada o
    // es de otra persona. Unirlos metería el historial de un animal en la
    // ficha de alguien que no es su dueño.
    return { certeza: 'duda', existente: d, motivo: 'cedula_otro_nombre' };
  }

  const candidatos = idx.porNombre.get(sinTildes(tutor.nombre)) ?? [];
  if (!candidatos.length) return { certeza: 'nueva', existente: null, motivo: null };

  // 2. Mismo nombre + mismo teléfono, y la cédula no se contradice.
  //
  // "No se contradice" y no "ninguno tiene": el caso más común del
  //  importador es la clínica que tiene a alguien sin cédula y el archivo
  //  que la trae. Con la regla estricta eso sería una pregunta obvia por
  //  cada cliente. Si el que existe tiene OTRA cédula sí se pregunta: dos
  //  personas con el mismo nombre que comparten teléfono son una familia.
  const mismoTel = candidatos.find((d) =>
    !vacio(d.telefono) && !vacio(tutor.tel1) && String(d.telefono) === String(tutor.tel1)
    && (vacio(d.cedula) || vacio(tutor.cedula) || String(d.cedula) === String(tutor.cedula)));
  if (mismoTel) return { certeza: 'misma', existente: mismoTel, motivo: 'nombre_y_telefono' };

  // 3. Mismo nombre, teléfono distinto. El caso real de la base de La
  //    Huella: dos "Teofilo Arboleda" que son Araque y Casimiro Carvajalino.
  return { certeza: 'duda', existente: candidatos[0], motivo: 'nombre_tel_distinto' };
}

/** 'Hoja1:35' → { hoja: 'Hoja1', fila: 35 }, para que el aviso apunte a algo. */
const ctxDe = (origen) => {
  const uno = String((origen ?? [])[0] ?? '');
  const corte = uno.lastIndexOf(':');
  if (corte < 0) return { hoja: uno, fila: 0 };
  return { hoja: uno.slice(0, corte), fila: Number(uno.slice(corte + 1)) || 0 };
};

/**
 * Los campos de `duenos` que este archivo puede completar.
 *
 * `telefono` NO está: es NOT NULL, siempre tiene algo, así que completarlo
 * es imposible por definición. Cuando el archivo trae otro número se avisa
 * y no se cambia — callarlo dejaría a la clínica creyendo que el número
 * nuevo entró, y el recordatorio por WhatsApp saldría al viejo.
 */
const completarTutor = (estado, existente, tutor) => {
  const campos = {};
  if (vacio(existente.cedula)    && !vacio(tutor.cedula))    campos.cedula    = tutor.cedula;
  if (vacio(existente.direccion) && !vacio(tutor.direccion)) campos.direccion = tutor.direccion;
  if (vacio(existente.telefono2) && !vacio(tutor.tel2))      campos.telefono2 = tutor.tel2;

  if (!vacio(tutor.tel1) && !vacio(existente.telefono)
      && String(tutor.tel1) !== String(existente.telefono)) {
    aviso(estado, ctxDe(tutor.origen),
      `${existente.nombre} ya tiene el teléfono ${existente.telefono}. ` +
      `El archivo trae ${tutor.tel1}. Dejo el que ya estaba.`);
  }

  return campos;
};

/**
 * Los campos de `mascotas` que este archivo puede completar.
 *
 * `especie` NO está, aunque el spec la liste: es NOT NULL, una mascota que
 * ya existe siempre tiene especie, no hay vacío que llenar. Mismo
 * razonamiento que `duenos.telefono`.
 *
 * `edad_anios`/`edad_meses` solo se tocan si el archivo trae fecha de
 * nacimiento —ahí la edad deja de ser un dato tecleado y pasa a ser una
 * resta— y solo si están en 0, que es lo que deja un registro al que nunca
 * le pusieron la edad. Una edad escrita a mano no se pisa.
 */
const completarMascota = (existente, masc, hoy) => {
  const campos = {};
  if (vacio(existente.raza) && !vacio(masc.raza)) campos.raza = masc.raza;

  if (vacio(existente.fecha_nacimiento) && !vacio(masc.nacimiento)) {
    campos.fecha_nacimiento = masc.nacimiento;
    const edad = edadDesde(masc.nacimiento, hoy);
    if (edad && !(existente.edad_anios || existente.edad_meses)) {
      campos.edad_anios = edad.anios;
      campos.edad_meses = edad.meses;
    }
  }

  return campos;
};

/**
 * El plan completo.
 *
 * @param {object} estado      el de nuevoEstado(); acá se le agregan avisos
 * @param {object} agrupado    { tutores: Map, mascotas: Map, eventos: [] } de agrupar()
 * @param {object} existentes  { duenos, mascotas, tratamientos, vacunas } de la base
 * @param {object} decisiones  { dudas: {}, especies: {} } lo que contestó el paso 3
 * @param {Date}   hoy         entra por parámetro para que la edad sea probable
 */
export function armarPlan(estado, agrupado, existentes, decisiones = {}, hoy = new Date()) {
  const idx = indexar(existentes);
  const respuestas = decisiones.dudas ?? {};
  const especiesDecididas = decisiones.especies ?? {};

  const envio = {
    importacion_id: null,
    crear_tutores: [], completar_tutores: [],
    crear_mascotas: [], completar_mascotas: [],
    tratamientos: [], vacunas: [],
  };
  const dudas = [];
  const especies = new Map();

  // clave del tutor en el archivo → { id } si ya existe, { ref } si es
  // nuevo, o nada si quedó colgado de una duda sin contestar.
  const destinoTutor = new Map();
  const mascotasDe = new Map();
  for (const m of agrupado.mascotas.values()) {
    if (!mascotasDe.has(m.tutor)) mascotasDe.set(m.tutor, []);
    mascotasDe.get(m.tutor).push(m.nombre);
  }

  // ---------- TUTORES ----------
  for (const tutor of agrupado.tutores.values()) {
    const m = emparejarTutor(idx, tutor);
    let certeza = m.certeza;

    if (certeza === 'duda') {
      const id = `tutor:${tutor.clave}`;
      const respuesta = respuestas[id];

      if (!respuesta) {
        dudas.push({
          id,
          clase: 'tutor',
          motivo: m.motivo,
          archivo: {
            nombre: tutor.nombre, tel1: tutor.tel1, cedula: tutor.cedula,
            direccion: tutor.direccion, mascotas: mascotasDe.get(tutor.clave) ?? [],
          },
          existente: {
            id: m.existente.id, nombre: m.existente.nombre,
            telefono: m.existente.telefono, cedula: m.existente.cedula,
          },
        });
        // Y no se decide nada de este tutor. Ni él ni sus mascotas ni sus
        // eventos entran al envío hasta que la pregunta esté contestada.
        continue;
      }

      certeza = respuesta === 'misma' ? 'misma' : 'nueva';
    }

    if (certeza === 'misma') {
      const campos = completarTutor(estado, m.existente, tutor);
      // Un objeto sin campos adentro haría que el paso 3 diga "1 tutor
      // para completar" y después no complete nada.
      if (Object.keys(campos).length) {
        envio.completar_tutores.push({ id: m.existente.id, campos });
      }
      destinoTutor.set(tutor.clave, { id: m.existente.id });
    } else {
      envio.crear_tutores.push({
        ref: tutor.clave,
        nombre: tutor.nombre,
        // NOT NULL. La base real tiene una fila sin ningún número usable, y
        // esa persona entra igual: con el botón de WhatsApp apagado, no
        // afuera de la base.
        telefono: tutor.tel1 ?? '',
        telefono2: tutor.tel2 ?? null,
        cedula: tutor.cedula ?? null,
        direccion: tutor.direccion ?? null,
      });
      destinoTutor.set(tutor.clave, { ref: tutor.clave });
    }
  }

  // ---------- MASCOTAS ----------
  const destinoMascota = new Map();

  for (const masc of agrupado.mascotas.values()) {
    const tut = destinoTutor.get(masc.tutor);
    if (!tut) continue; // su tutor quedó en una duda sin contestar

    // mascotas.especie es NOT NULL y acá no se adivina. El script de
    // terminal se detiene y obliga a decidir; en el navegador es una
    // pregunta del paso 3.
    const especie = masc.especie ?? especiesDecididas[sinTildes(masc.raza ?? '')] ?? null;
    if (!especie) {
      const k = sinTildes(masc.raza ?? '');
      // `clave: k` viaja en el grupo y no se recalcula en la pantalla: es
      // la misma llave con la que `decisiones.especies` va a volver.
      if (!especies.has(k)) especies.set(k, { clave: k, raza: masc.raza ?? '', cuantas: 0, mascotas: [] });
      const g = especies.get(k);
      g.cuantas += 1;
      g.mascotas.push(masc.nombre);
      continue;
    }

    // Solo dentro de ese tutor, y solo si el tutor ya existía.
    const yaEsta = tut.id
      ? idx.mascotasPorDueno.get(tut.id)?.get(sinTildes(masc.nombre))
      : null;

    if (yaEsta) {
      const campos = completarMascota(yaEsta, masc, hoy);
      if (Object.keys(campos).length) {
        envio.completar_mascotas.push({ id: yaEsta.id, campos });
      }
      destinoMascota.set(masc.clave, { id: yaEsta.id });
    } else {
      const edad = masc.nacimiento ? edadDesde(masc.nacimiento, hoy) : null;
      envio.crear_mascotas.push({
        ref: masc.clave,
        tutor_ref: tut.ref ?? null,
        tutor_id: tut.id ?? null,
        nombre: masc.nombre,
        especie,
        raza: masc.raza ?? null,
        fecha_nacimiento: masc.nacimiento ?? null,
        // Sin fecha la edad NO se inventa: queda 0, que es lo que ya tienen
        // las mascotas viejas de la app, y se corrige a mano.
        edad_anios: edad?.anios ?? 0,
        edad_meses: edad?.meses ?? 0,
      });
      destinoMascota.set(masc.clave, { ref: masc.clave });
    }
  }

  // ---------- EVENTOS ----------
  // La misma clave se usa contra lo que hay en la base Y contra lo que ya
  // se agregó en esta corrida: dos baños del mismo día en el mismo archivo
  // también son uno.
  let repetidos = 0;

  for (const ev of agrupado.eventos) {
    const dest = destinoMascota.get(ev.mascota);
    if (!dest) continue; // mascota colgada de una duda o de una especie sin resolver

    const quien = dest.id ?? `ref:${dest.ref}`;
    const clave = ev.tipo === 'vacuna'
      // Con el nombre adentro: a una mascota se le pueden aplicar dos
      // vacunas distintas el mismo día.
      ? `v|${quien}|${sinTildes(ev.nombre)}|${ev.fecha}`
      : `t|${quien}|${ev.t}|${ev.fecha}`;

    if (idx.eventos.has(clave)) {
      repetidos += 1;
      continue;
    }
    idx.eventos.add(clave);

    if (ev.tipo === 'vacuna') {
      envio.vacunas.push({
        mascota_ref: dest.ref ?? null,
        mascota_id: dest.id ?? null,
        nombre: ev.nombre,
        fecha_aplicacion: ev.fecha,
        proxima_dosis: ev.proxima ?? null,
        notas: ev.notas ?? null,
      });
    } else {
      envio.tratamientos.push({
        mascota_ref: dest.ref ?? null,
        mascota_id: dest.id ?? null,
        tipo: ev.t,
        fecha: ev.fecha,
        hora: ev.hora ?? null,
        notas: ev.notas ?? null,
      });
    }
  }

  // Los números salen de contar el envío, no de estimar aparte. Si se
  // calcularan por su cuenta, el día que una rama cambie el paso 3 mostraría
  // una cosa y el paso 4 haría otra.
  return {
    envio,
    dudas,
    especies: [...especies.values()],
    resumen: {
      tutores_nuevos:         envio.crear_tutores.length,
      tutores_a_completar:    envio.completar_tutores.length,
      mascotas_nuevas:        envio.crear_mascotas.length,
      mascotas_a_completar:   envio.completar_mascotas.length,
      tratamientos:           envio.tratamientos.length,
      vacunas:                envio.vacunas.length,
      eventos_repetidos:      repetidos,
      dudas:                  dudas.length,
      especies_sin_resolver:  especies.size,
    },
  };
}
```

- [ ] **Step 4: Correr el test**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/nucleo/plan.test.js
```

Esperado: PASA, 23 tests.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm test
```

Esperado: todo verde, incluido lo de las tareas 1–4 y 8.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/nucleo/plan.js frontend/src/importador/nucleo/plan.test.js
git commit -m "Empareja el archivo contra los clientes que ya existen

La regla que ordena todo: equivocarse duplicando se arregla, equivocarse
uniendo no. Unir a dos clientes que no son el mismo deja una sola ficha
con el historial de dos animales adentro y eso no se desarma; dos fichas
repetidas se juntan en un minuto. Así que solo une cuando no hay nada que
dudar, y cuando hay algo que dudar pregunta.

Completar escribe solo donde encuentra vacío. El teléfono no se completa
nunca —es NOT NULL, siempre tiene algo— y cuando el archivo trae otro
número lo avisa en vez de callarlo: callarlo dejaría el recordatorio de
WhatsApp saliendo al número viejo sin que nadie lo sepa.

Los eventos se identifican por mascota + tipo + fecha, porque no tienen
nada propio con qué identificarlos. Sin esa regla el mismo archivo dos
veces deja 148 baños donde hubo 74.

La función es pura y se corre dos veces: una para saber qué preguntar y
otra con las respuestas. Es la misma función, así que lo que la clínica ve
en el paso 3 y lo que se escribe en el paso 4 no se pueden separar."
```

---

## Tarea 10: Hablar con la base

La otra capa que no se comparte con el script de terminal. Cuatro cosas: traer lo que ya existe, abrir el registro de la importación, llamar a la función, y cerrarla si algo falló.

**Files:**
- Create: `frontend/src/importador/escribir.js`
- Create: `frontend/src/importador/escribir.test.js`

**Interfaces:**
- Consumes: `supabase` de `../lib/supabase.js`; la función `aplicar_importacion` de la tarea 7
- Produces:
  - `traerExistentes() → { duenos, mascotas, tratamientos, vacunas }`
  - `abrirImportacion({ archivo, hoja, mapeo }) → number` — el `id` de la fila en `'en_curso'`
  - `aplicar(importacionId, envio, resumen) → Resultado` — lo que devolvió Postgres
  - `marcarFallida(importacionId, mensaje, resumen = {}) → void` — nunca tira
  - `listarImportaciones() → Importacion[]`
  - `deshacer(importacionId) → Resultado`

### El orden importa y no es el obvio

```
1. abrirImportacion()   → la fila queda en 'en_curso'
2. aplicar()            → una sola llamada, una sola transacción
3. si revienta: marcarFallida()
```

La fila se abre **antes** de escribir, en una llamada aparte. Si se creara adentro de la función, una llamada que revienta se lleva el registro con ella: no quedaría ni rastro de que alguien intentó importar algo. Así, si el wifi se corta entre el paso 1 y el paso 2, queda una fila en `'en_curso'` con 0 filas colgadas — y eso se puede mirar y entender.

**No hay reintento automático.** Si falla, el paso 4 lo dice y ofrece el botón de volver a intentar. Un reintento automático sobre una llamada que no se sabe si llegó o no es la forma de duplicar un import entero.

- [ ] **Step 1: Escribir el test que falla**

Los tests de este archivo son con `supabase` falso: lo que se prueba es que las llamadas se armen bien y en el orden correcto, no Postgres —eso ya se probó en la tarea 7 contra la base de verdad.

Crear `frontend/src/importador/escribir.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// El mock va antes del import del módulo que lo usa.
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: mock, default: mock }));

const {
  traerExistentes, abrirImportacion, aplicar, marcarFallida, deshacer,
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
    mock.from.mockImplementation(() => ({
      update: () => { orden.push('resumen'); return { eq: () => Promise.resolve({ error: null }) }; },
    }));
    mock.rpc.mockImplementation(() => { orden.push('rpc'); return Promise.resolve({ data: {}, error: null }); });

    await aplicar(42, {}, { avisos: ['Nube sin fecha'] });
    expect(orden).toEqual(['resumen', 'rpc']);
  });

  it('el error de Postgres sale en español y con el id adentro', async () => {
    mock.from.mockImplementation(() => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }));
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    await expect(aplicar(42, {}, {})).rejects.toThrow(/importación 42/);
  });
});

describe('marcarFallida', () => {
  // Sin esto, una importación que reventó se queda en 'en_curso' para
  // siempre y la pantalla de historial no puede distinguirla de una que
  // está corriendo ahora mismo.
  it('deja el estado en fallido y el motivo guardado', async () => {
    const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    mock.from.mockReturnValue({ update });

    await marcarFallida(42, 'se cayó el wifi', { tutores_nuevos: 53 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'fallido' }));
    expect(JSON.stringify(update.mock.calls[0][0])).toContain('se cayó el wifi');
    // El resumen del paso 3 no se pierde: es el dato que sirve justo
    // cuando falla. `update` reemplaza el jsonb entero, así que si no se
    // volviera a mandar quedaría solo el error.
    expect(update.mock.calls[0][0].resumen.tutores_nuevos).toBe(53);
  });

  // Si marcarFallida tira, tapa el error de verdad que la pantalla tiene
  // que mostrar. El import ya falló; que el registro quede mal es menos
  // grave que no saber por qué falló.
  it('no tira si tampoco puede escribir el estado', async () => {
    mock.from.mockReturnValue({
      update: () => ({ eq: () => Promise.resolve({ error: { message: 'sin red' } }) }),
    });
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/escribir.test.js
```

Esperado: FALLA con `Failed to resolve import "./escribir.js"`.

- [ ] **Step 3: Escribir `frontend/src/importador/escribir.js`**

```js
// ============================================================
// VetaApp · importador/escribir.js
// Lo único de todo el importador que habla con la base.
//
// ---------- POR QUÉ EL REGISTRO SE ABRE ANTES ----------
// La fila de `importaciones` se crea en una llamada aparte, ANTES de
// escribir nada. Si se creara adentro de aplicar_importacion, una llamada
// que revienta se lleva el registro con ella: no quedaría ni rastro de que
// alguien intentó importar algo, y un import que nadie registró no se puede
// ni diagnosticar ni limpiar.
//
// Así, si el wifi se corta entre abrir y aplicar, queda una fila en
// 'en_curso' con cero filas colgadas. Eso se puede mirar y entender.
//
// ---------- NO HAY REINTENTO AUTOMÁTICO ----------
// Si falla, el paso 4 lo dice y ofrece el botón de volver a intentar. Un
// reintento automático sobre una llamada que no se sabe si llegó es la
// forma de duplicar un import entero. Y cuando el usuario reintenta, los
// tutores y mascotas ya escritos se emparejan solos y los eventos caen en
// la regla de repetidos: el reintento continúa, no duplica.
// ============================================================

import { supabase } from '../lib/supabase.js';

// Solo lo que sirve para emparejar Y para decidir qué está vacío. Nada más:
// `foto` son kilobytes por mascota, y una base de 300 clientes se baja
// entera cada vez que alguien abre el importador.
const COLS_DUENOS   = 'id, nombre, telefono, telefono2, cedula, direccion';
const COLS_MASCOTAS = 'id, dueno_id, nombre, raza, fecha_nacimiento, edad_anios, edad_meses';
const COLS_TRATAM   = 'mascota_id, tipo, fecha';
const COLS_VACUNAS  = 'mascota_id, nombre, fecha_aplicacion';

const reventar = (error, que) => {
  if (!error) return;
  // El mensaje crudo de Postgres no le dice nada a nadie en el mostrador.
  throw new Error(`${que}: ${error.message}`);
};

/**
 * Lo que la cuenta ya tiene. RLS filtra por user_id solo: no hace falta
 * ningún where acá, y no se pone uno a propósito — sería un segundo lugar
 * donde se puede equivocar el aislamiento entre clínicas.
 */
export async function traerExistentes() {
  const [d, m, t, v] = await Promise.all([
    supabase.from('duenos').select(COLS_DUENOS),
    supabase.from('mascotas').select(COLS_MASCOTAS),
    supabase.from('tratamientos').select(COLS_TRATAM),
    supabase.from('vacunas').select(COLS_VACUNAS),
  ]);

  reventar(d.error, 'No se pudieron leer los clientes que ya tenés');
  reventar(m.error, 'No se pudieron leer las mascotas que ya tenés');
  reventar(t.error, 'No se pudo leer el historial de tratamientos');
  reventar(v.error, 'No se pudo leer el historial de vacunas');

  return {
    duenos: d.data ?? [],
    mascotas: m.data ?? [],
    tratamientos: t.data ?? [],
    vacunas: v.data ?? [],
  };
}

/**
 * Abre el registro. Queda en 'en_curso' por el default de la tabla.
 *
 * `mapeo` se guarda acá y no al final: sirve para que el día que suba el
 * mismo archivo actualizado la app le proponga el mapeo de la vez pasada en
 * vez de hacerla elegir de nuevo. Si el import falla, el mapeo igual queda
 * — y es justo cuando más sirve, porque va a volver a intentar.
 */
export async function abrirImportacion({ archivo, hoja, mapeo }) {
  // `estado` no se manda: el default de la tabla es 'en_curso'. Repetirlo
  // acá sería un segundo lugar donde se puede desincronizar.
  const { data, error } = await supabase
    .from('importaciones')
    .insert({ archivo, hoja: hoja ?? null, mapeo: mapeo ?? {} })
    .select('id')
    .single();

  reventar(error, 'No se pudo abrir el registro de la importación');
  return data.id;
}

/**
 * El paso 4. Una llamada, una transacción: o entra todo o no entra nada.
 */
export async function aplicar(importacionId, envio, resumen) {
  // El resumen va ANTES de escribir. Es lo que la clínica vio en el paso 3,
  // y si la escritura falla el porqué tiene que quedar igual: seis meses
  // después poder leer por qué "Nube" quedó sin fecha de nacimiento es la
  // diferencia entre entenderlo y pensar que la app se la comió.
  const guardado = await supabase
    .from('importaciones')
    .update({ resumen: resumen ?? {} })
    .eq('id', importacionId);
  reventar(guardado.error, 'No se pudo guardar el resumen de la importación');

  const { data, error } = await supabase.rpc('aplicar_importacion', {
    plan: { ...envio, importacion_id: importacionId },
  });

  if (error) {
    throw new Error(
      `No se pudo escribir la importación ${importacionId}: ${error.message}. ` +
      'No entró nada: podés volver a intentar.',
    );
  }

  return data;
}

/**
 * Cierra el registro de una que falló.
 *
 * NO tira nunca. Si tirara, taparía el error de verdad que la pantalla
 * tiene que mostrar — y el import ya falló: que el registro quede en
 * 'en_curso' es menos grave que no saber por qué falló.
 */
export async function marcarFallida(importacionId, mensaje, resumen = {}) {
  try {
    const { error } = await supabase
      .from('importaciones')
      .update({
        estado: 'fallido',
        // El resumen del paso 3 viaja de nuevo y se funde con el error.
        // Escribir solo `{ error }` pisaría el jsonb que `aplicar` guardó
        // antes de intentar, y ése es justo el dato que sirve cuando algo
        // falla: qué se le mostró a quien confirmó. `update` reemplaza la
        // columna entera, no la mezcla, así que la mezcla se hace acá —
        // leer la fila primero sería una llamada más sobre una conexión
        // que ya demostró estar fallando.
        resumen: { ...resumen, error: String(mensaje ?? 'sin detalle') },
        cerrado_en: new Date().toISOString(),
      })
      .eq('id', importacionId);
    if (error) console.warn('[importador] no se pudo marcar como fallida:', error.message);
  } catch (e) {
    console.warn('[importador] no se pudo marcar como fallida:', e?.message);
  }
}

/** El historial, lo más nuevo arriba. */
export async function listarImportaciones() {
  const { data, error } = await supabase
    .from('importaciones')
    .select('id, archivo, hoja, estado, resumen, creado_en, cerrado_en')
    .order('creado_en', { ascending: false });

  reventar(error, 'No se pudo leer el historial de importaciones');
  return data ?? [];
}

/**
 * Deshacer. Toda la lógica —qué se borra y qué no— está en Postgres, que es
 * el único lugar donde se puede mirar si una mascota tiene algo encima
 * adentro de la misma transacción en la que se decide borrarla.
 */
export async function deshacer(importacionId) {
  const { data, error } = await supabase.rpc('deshacer_importacion', {
    p_importacion: importacionId,
  });
  // El mensaje de la función ya está en español y explica el caso ("ya se
  // deshizo"), así que pasa tal cual en vez de envolverlo en otro.
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 4: Correr el test**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/escribir.test.js
```

Esperado: PASA, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/escribir.js frontend/src/importador/escribir.test.js
git commit -m "Única capa del importador que habla con la base

El registro de la importación se abre en una llamada aparte, antes de
escribir. Si se creara adentro de la función transaccional, una llamada
que revienta se lo lleva con ella y no queda rastro de que alguien
intentó importar algo. Así, si el wifi se corta en el medio, queda una
fila en en_curso con cero filas colgadas: eso se puede mirar.

El resumen del paso 3 se guarda antes de escribir y no después, porque es
cuando falla cuando más sirve saber qué se le mostró.

No hay reintento automático: sobre una llamada que no se sabe si llegó,
reintentar solo es la forma de duplicar un import entero. Cuando el
usuario reintenta a mano, los tutores y mascotas ya escritos se emparejan
solos y los eventos caen en la regla de repetidos, así que continúa en
vez de duplicar.

marcarFallida no tira nunca: si tirara taparía el error de verdad que la
pantalla tiene que mostrar."
```

---

## Tarea 11: La pantalla, pasos 1 y 2 — el archivo y las columnas

**Files:**
- Create: `frontend/src/importador/Importar.jsx`
- Create: `frontend/src/importador/paso1Archivo.jsx`
- Create: `frontend/src/importador/paso2Columnas.jsx`
- Modify: `frontend/src/App.jsx:17` (import) y `:97` (ruta)
- Modify: `frontend/src/pages/Configuracion.jsx:560` (la entrada, en la pestaña Datos)
- Test: `frontend/src/importador/paso2Columnas.test.jsx`

**Interfaces:**
- Consumes:
  - `leerLibro`, `hojas`, `leerHoja` de `./leerXlsx.js` (tarea 8)
  - `mapearEncabezados`, `faltanRequeridos`, `CAMPOS` de `./nucleo/mapear.js` (tarea 3)
  - `useAuth()` de `../lib/AuthContext` — de ahí salen `bloqueado`, `enPrueba`, `diasPrueba`, `recargarPerfil`
  - `Topbar`, `Page`, `Button`, `Card` de `../components/ui.jsx`
- Produces:
  - `<Importar />` por defecto desde `Importar.jsx` — monta la ruta `/app/importar`
  - `<Paso1Archivo onListo={({ libro, archivo, hoja }) => void} />` — `libro` es el objeto de SheetJS, `archivo` el nombre del archivo, `hoja` el nombre de la hoja elegida
  - `<Paso2Columnas libro archivo hoja onAtras onListo={({ hoja, mapa, encabezados, grilla }) => void} />`
  - `columnasConEjemplo(encabezados, grilla, mapa) → [{ i, encabezado, clave, ejemplo }]` exportada desde `paso2Columnas.jsx` para poder testearla sin montar React

### Por qué son tres archivos y no uno

Los cuatro pasos juntos son unas 700 líneas de JSX con cinco estados
distintos. `Importar.jsx` se queda solo con la máquina de estados —qué paso
se ve, qué trae cada paso del anterior— y cada paso es un archivo que recibe
props y avisa para arriba. Ningún paso lee el estado de otro.

Eso no es prolijidad: el paso 3 es el único que hay que poder leer completo
sin scroll para auditarlo, porque es el que decide qué se escribe.

### Dónde entra la clínica

La pestaña **Datos y backups** de Configuración ya tiene "Descargar tus
datos". Importar es la misma pestaña por el otro lado: datos que entran.
Pero el flujo es de cuatro pasos y no cabe adentro de un `ConfigSection`
entre los demás, así que es una ruta propia (`/app/importar`) y en
Configuración queda el botón que lleva.

Así, además, volver atrás desde el paso 1 devuelve a Configuración y no
rompe nada.

### El freno de la suscripción, y por qué `bloqueado` no alcanza

`<Privado>` ya manda a `PantallaBloqueo` cuando `bloqueado` es `true`
(`App.jsx:118`), así que la ruta ni se monta con la suscripción vencida.
Parecería suficiente. No lo es:

`bloqueado` se calcula del perfil que se leyó **al montar la app**, y
`pruebaVencida` compara contra `Date.now()` solo cuando algo provoca un
render. Una pestaña abierta desde ayer con la prueba venciendo a medianoche
sigue mostrando la app entera. En cualquier otra pantalla eso es inofensivo
—el primer `insert` falla y se ve el error—. Acá no: el paso 4 escribe
cincuenta y cuatro clientes en una llamada, y el error crudo de Postgres
aparecería a mitad de camino, después de que la clínica ya invirtió cinco
minutos mapeando columnas.

Por eso el paso 1 llama a `recargarPerfil()` al montar y mira el resultado.
Es la única pantalla de la app que lo hace, y es porque es la única donde
empezar con un dato viejo cuesta cinco minutos de trabajo de alguien.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/paso2Columnas.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { columnasConEjemplo } from './paso2Columnas.jsx';

// Los encabezados de la hoja de La Huella, recortados. Los espacios al
// final están a propósito: así vienen.
const ENCABEZADOS = [
  'Marca temporal',
  'Nombre y apellidos del Tutor ',
  'Cedula',
  'Contacto telefonos (2)',
  'Nombre de la mascota',
  'Raza',
  'Otras observaciones',
];

const GRILLA = [
  ['2026-09-12 10:18:00', 'Hector Fabio Arboleda', '1000000200', '3000000200 - 3000000201', 'Max', 'Poodle', ''],
  ['2026-09-13 09:02:00', 'Eulalia Ruth Trujillo',     '',           '3000000202',               'Luna', 'Criollo', 'Muy nerviosa'],
];

describe('columnasConEjemplo', () => {
  it('trae una entrada por columna del archivo, en el orden del archivo', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, {});
    expect(cols).toHaveLength(7);
    expect(cols.map((c) => c.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cols[1].encabezado).toBe('Nombre y apellidos del Tutor ');
  });

  it('marca cada columna con el campo al que la mandó el mapa', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, { tutor: 1, cedula: 2 });
    expect(cols[1].clave).toBe('tutor');
    expect(cols[2].clave).toBe('cedula');
  });

  // "Columna 7" no le dice nada a nadie. El ejemplo es lo que hace que la
  // clínica pueda corregir el mapeo sin abrir el Excel al lado.
  it('el ejemplo es el primer valor con datos, no el de la primera fila', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, {});
    // La observación está vacía en la fila 1 y llena en la 2.
    expect(cols[6].ejemplo).toBe('Muy nerviosa');
  });

  it('una columna vacía de punta a punta queda sin ejemplo, no con "undefined"', () => {
    const cols = columnasConEjemplo(['Vacía'], [[''], ['']], {});
    expect(cols[0].ejemplo).toBe('');
  });

  // Dos columnas no pueden ir al mismo campo: el segundo pisaría al primero
  // en silencio y la clínica no vería por qué le falta un dato.
  it('no deja dos columnas en el mismo campo', () => {
    const cols = columnasConEjemplo(ENCABEZADOS, GRILLA, { tutor: 1 });
    expect(cols[1].clave).toBe('tutor');
    expect(cols[4].clave).toBe(null);
  });

  it('un encabezado en blanco se muestra como "Columna N" y no vacío', () => {
    const cols = columnasConEjemplo(['', 'Raza'], [['Max', 'Poodle']], {});
    expect(cols[0].encabezado).toBe('Columna 1');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/paso2Columnas.test.jsx
```

Esperado: FALLA con `Failed to resolve import "./paso2Columnas.jsx"`.

- [ ] **Step 3: Escribir el paso 1**

Crear `frontend/src/importador/paso1Archivo.jsx`:

```jsx
// ============================================================
// VetaApp · importador/paso1Archivo.jsx
// El archivo y la hoja.
//
// Dos cosas pueden frenar acá, y son las únicas dos de todo el importador
// que frenan:
//   · la suscripción no está activa → RLS no la deja escribir
//   · el archivo no se puede leer   → no hay nada que mapear
//
// Todo lo demás (fechas raras, teléfonos imposibles, razas desconocidas)
// avisa y sigue. Cincuenta y tres clientes sin fecha de nacimiento siguen
// siendo cincuenta y tres clientes.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui.jsx';
import { useAuth } from '../lib/AuthContext';
import { leerLibro, hojas } from './leerXlsx.js';

const ACEPTA = '.xlsx,.xls,.csv';

export default function Paso1Archivo({ onListo }) {
  const { bloqueado, enPrueba, diasPrueba, recargarPerfil } = useAuth();
  const [verificando, setVerificando] = useState(true);
  const [error, setError] = useState('');
  const [libro, setLibro] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [lista, setLista] = useState([]);
  const [hoja, setHoja] = useState('');
  const ref = useRef();

  // Se relee el perfil al entrar. Ver el comentario largo de la tarea 11:
  // `bloqueado` sale del perfil que se leyó al abrir la app, y una pestaña
  // vieja con la prueba ya vencida pasaría la puerta y reventaría recién en
  // el paso 4, con el trabajo de mapeo ya hecho.
  useEffect(() => {
    let vivo = true;
    recargarPerfil().finally(() => { if (vivo) setVerificando(false); });
    return () => { vivo = false; };
  }, [recargarPerfil]);

  const elegir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // para que elegir el mismo archivo otra vez dispare el evento
    if (!f) return;
    setError(''); setLibro(null); setLista([]); setHoja('');
    try {
      const bytes = await f.arrayBuffer();
      const lib = leerLibro(bytes);
      const hs = hojas(lib);
      const conDatos = hs.filter((h) => h.filas > 0);
      if (conDatos.length === 0) {
        setError('El archivo se abrió pero no tiene ninguna fila con datos debajo del encabezado.');
        return;
      }
      setLibro(lib); setArchivo(f.name); setLista(hs);
      // Con una sola hoja con datos no se pregunta nada: se elige sola.
      setHoja(conDatos.length === 1 ? conDatos[0].nombre : '');
    } catch (err) {
      setError(err.message);
    }
  };

  if (verificando) return <Card>Un momento…</Card>;

  if (bloqueado) {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>Tu plan está vencido</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Importar escribe en tu base, y con el plan vencido la base no deja
          escribir. Renová y volvé acá: el archivo no se pierde, lo subís de
          nuevo y seguís.
        </p>
        <Link to="/app/configuracion?tab=plan"><Button>Ver mi plan</Button></Link>
      </Card>
    );
  }

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>1 · El archivo</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Excel (<code>.xlsx</code>, <code>.xls</code>) o <code>.csv</code>. El
        archivo no se sube a ninguna parte: se lee acá en tu computador y lo
        único que viaja son los clientes que confirmes en el paso 4.
      </p>

      {/* Se dice que el archivo no se sube porque es verdad y porque es lo
          que la clínica necesita oír: esa hoja tiene las cédulas y las
          direcciones de casa de sus clientes. */}

      {enPrueba && diasPrueba !== null && diasPrueba <= 3 && (
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
          Te quedan {diasPrueba} día{diasPrueba === 1 ? '' : 's'} de prueba.
          Lo que importes ahora queda guardado.
        </p>
      )}

      <input ref={ref} type="file" accept={ACEPTA} onChange={elegir} style={{ display: 'none' }} />
      <Button onClick={() => ref.current?.click()}>
        {libro ? 'Elegir otro archivo' : 'Elegir archivo'}
      </Button>
      {archivo && <span style={{ marginLeft: 10, fontSize: 13 }}>{archivo}</span>}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>{error}</p>
      )}

      {lista.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>
            {lista.length === 1 ? 'La hoja' : 'Elegí la hoja'}
          </p>
          {/* El número es de filas CON DATOS. La hoja de La Huella venía
              estirada hasta la 155 con 101 vacías: decir "155 filas" es
              mentir, y con ese número al lado la clínica elige la hoja
              equivocada confiando en él. */}
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.map((h) => (
              <label key={h.nombre} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', fontSize: 13,
                border: `1px solid ${hoja === h.nombre ? 'var(--verde-500)' : 'var(--border)'}`,
                borderRadius: 'var(--r-md)',
                opacity: h.filas === 0 ? 0.5 : 1,
                cursor: h.filas === 0 ? 'default' : 'pointer',
              }}>
                <input
                  type="radio" name="hoja" value={h.nombre}
                  checked={hoja === h.nombre} disabled={h.filas === 0}
                  onChange={() => setHoja(h.nombre)}
                />
                <span style={{ flex: 1, fontWeight: 600 }}>{h.nombre}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {h.filas === 0 ? 'sin datos' : `${h.filas} fila${h.filas === 1 ? '' : 's'} con datos`}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <Link to="/app/configuracion?tab=datos"><Button variant="secondary">Cancelar</Button></Link>
        <Button disabled={!hoja} onClick={() => onListo({ libro, archivo, hoja })}>
          Siguiente
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Escribir el paso 2**

Crear `frontend/src/importador/paso2Columnas.jsx`:

```jsx
// ============================================================
// VetaApp · importador/paso2Columnas.jsx
// Qué columna del archivo es qué campo de VetaApp.
//
// La app adivina y MUESTRA lo que entendió, con un ejemplo real al lado.
// Lo que no reconoce entra como "No importar", nunca como basura: una
// columna de observaciones metida en `cedula` deja 54 cédulas inventadas
// que nadie va a notar hasta que haya que buscar a alguien por la suya.
// ============================================================

import { useMemo, useState } from 'react';
import { Button, Card } from '../components/ui.jsx';
import { CAMPOS, mapearEncabezados, faltanRequeridos } from './nucleo/mapear.js';
import { leerHoja } from './leerXlsx.js';

/**
 * Una entrada por columna del archivo, en el orden del archivo.
 *
 * Mira el archivo y no el mapa, porque la pantalla se lee de izquierda a
 * derecha igual que el Excel. Al revés —una fila por campo de VetaApp— las
 * columnas que no se importan desaparecerían de la vista, y ésas son
 * justo las que hay que revisar.
 *
 * Exportada aparte de la vista para poder probarla sin montar React.
 */
export function columnasConEjemplo(encabezados, grilla, mapa) {
  // Del mapa { clave: indice } al inverso { indice: clave }. Si dos claves
  // apuntaran al mismo índice gana la primera, pero eso no pasa:
  // mapearEncabezados no repite índices y la pantalla libera el anterior
  // antes de asignar.
  const porIndice = {};
  for (const [clave, i] of Object.entries(mapa)) {
    if (porIndice[i] === undefined) porIndice[i] = clave;
  }

  return encabezados.map((enc, i) => {
    // El primer valor con datos, no el de la primera fila: la columna de
    // observaciones suele estar vacía arriba y llena abajo, y un ejemplo
    // vacío no sirve para decidir nada.
    let ejemplo = '';
    for (const fila of grilla) {
      const v = String(fila[i] ?? '').trim();
      if (v) { ejemplo = v; break; }
    }
    return {
      i,
      // Un encabezado en blanco se muestra como "Columna 3" y no vacío:
      // hay que poder nombrar la fila para poder cambiarla.
      encabezado: String(enc ?? '').trim() || `Columna ${i + 1}`,
      clave: porIndice[i] ?? null,
      ejemplo,
    };
  });
}

export default function Paso2Columnas({ libro, archivo, hoja, onAtras, onListo }) {
  // Leer la hoja es lo más caro de la pantalla. `useMemo` para que cambiar
  // un desplegable no vuelva a parsear 54 filas en cada tecla.
  const { encabezados, grilla } = useMemo(() => leerHoja(libro, hoja), [libro, hoja]);
  const [mapa, setMapa] = useState(() => mapearEncabezados(encabezados));

  const cols = columnasConEjemplo(encabezados, grilla, mapa);
  const faltan = faltanRequeridos(mapa);

  /**
   * Mandar la columna `i` al campo `clave`.
   *
   * Dos columnas en el mismo campo no es un error que valga la pena
   * explicar: se libera la que lo tenía. La alternativa —dejar las dos y
   * que el núcleo use una— es un dato perdido sin aviso.
   */
  const asignar = (i, clave) => setMapa((m) => {
    const sig = {};
    for (const [k, v] of Object.entries(m)) {
      if (v === i) continue;      // la columna cambió de campo
      if (k === clave) continue;  // el campo cambió de columna
      sig[k] = v;
    }
    if (clave) sig[clave] = i;
    return sig;
  });

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>2 · Las columnas</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Esto es lo que entendí de <strong>{archivo}</strong>, hoja{' '}
        <strong>{hoja}</strong>. Corregí lo que esté mal. Lo que diga
        <em> No importar</em> se queda en el archivo y no entra a VetaApp.
      </p>

      <div style={{ display: 'grid', gap: 6 }}>
        {cols.map((c) => (
          <div key={c.i} style={{
            display: 'grid', gridTemplateColumns: '1fr 180px 1fr', gap: 10,
            alignItems: 'center', padding: '8px 10px', fontSize: 13,
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          }}>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{c.encabezado}</span>
            <select
              value={c.clave ?? ''}
              onChange={(e) => asignar(c.i, e.target.value || null)}
              style={{ fontSize: 13, padding: '5px 7px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}
            >
              <option value="">No importar</option>
              {CAMPOS.map((f) => (
                <option key={f.clave} value={f.clave}>
                  {f.etiqueta}{f.requerido ? ' *' : ''}
                </option>
              ))}
            </select>
            {/* El ejemplo va cortado: una observación de 200 caracteres
                desarma la grilla y tapa las columnas de abajo. */}
            <span style={{ color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ejemplo}>
              {c.ejemplo ? `"${c.ejemplo.slice(0, 60)}"` : 'columna vacía'}
            </span>
          </div>
        ))}
      </div>

      {/* El único freno del paso 2, y dice QUÉ falta. "No se puede
          continuar" a secas obliga a adivinar entre catorce desplegables. */}
      {faltan.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>
          {/* El `join` con etiquetas adentro NO sirve: JSX escapa el texto
              de un nodo y la clínica leería los `<strong>` literales.
              La coma y el "y" se arman con nodos, no con una cadena. */}
          Falta decirme cuál columna es{' '}
          {faltan.map((f, i) => (
            <span key={f}>
              {i > 0 && (i === faltan.length - 1 ? ' y ' : ', ')}
              <strong>{f}</strong>
            </span>
          ))}.
          Sin eso no hay nada que crear: son el nombre del dueño y el nombre
          de la mascota.
        </p>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
        <Button
          disabled={faltan.length > 0}
          onClick={() => onListo({ hoja, mapa, encabezados, grilla })}
        >
          Siguiente
        </Button>
      </div>
    </Card>
  );
}

```

- [ ] **Step 5: Escribir el armazón de los cuatro pasos**

Crear `frontend/src/importador/Importar.jsx`. Los pasos 3 y 4 entran en las
tareas 12 y 13; acá quedan montados como un marcador de posición que muestra
lo que recibió, para poder probar 1→2 de punta a punta hoy.

```jsx
// ============================================================
// VetaApp · importador/Importar.jsx
// La máquina de estados de los cuatro pasos. Nada más.
//
// Cada paso recibe lo que armó el anterior y avisa para arriba. Ningún
// paso lee el estado de otro: así el paso 3 —el único que decide qué se
// escribe— se puede leer completo y auditar sin seguir hilos.
//
// No existe un botón que salte del 1 al 4. Es a propósito: el paso 3 es
// la pantalla que hace que esto sea seguro, y una base de clientes ajena
// subida por error solo se nota ahí.
// ============================================================

import { useState } from 'react';
import { Topbar, Page } from '../components/ui.jsx';
import Paso1Archivo from './paso1Archivo.jsx';
import Paso2Columnas from './paso2Columnas.jsx';

export default function Importar() {
  // `null` = todavía no pasó por ese paso. Volver atrás BORRA lo de
  // adelante: si se guardara, cambiar la hoja en el paso 1 dejaría el
  // mapeo de la hoja vieja apuntando a columnas que ya no existen.
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);  // { libro, archivo, hoja }
  const [columnas, setColumnas] = useState(null); // { hoja, mapa, encabezados, grilla }

  const titulos = {
    1: 'Elegí el archivo',
    2: 'Revisá las columnas',
    3: 'Mirá qué va a pasar',
    4: 'Listo',
  };

  return (
    <>
      <Topbar
        title="Importar base de clientes"
        subtitle={`Paso ${paso} de 4 · ${titulos[paso]}`}
      />
      <Page>
        <div style={{ maxWidth: 820 }}>
          {paso === 1 && (
            <Paso1Archivo onListo={(a) => { setArchivo(a); setColumnas(null); setPaso(2); }} />
          )}
          {paso === 2 && archivo && (
            <Paso2Columnas
              libro={archivo.libro}
              archivo={archivo.archivo}
              hoja={archivo.hoja}
              onAtras={() => setPaso(1)}
              onListo={(c) => { setColumnas(c); setPaso(3); }}
            />
          )}
          {paso === 3 && columnas && (
            // Tarea 12.
            <pre style={{ fontSize: 12 }}>
              {JSON.stringify({ hoja: columnas.hoja, mapa: columnas.mapa, filas: columnas.grilla.length }, null, 2)}
            </pre>
          )}
        </div>
      </Page>
    </>
  );
}
```

- [ ] **Step 6: Montar la ruta**

En `frontend/src/App.jsx`, agregar el import con los demás:

```jsx
import Importar from './importador/Importar';
```

y la ruta junto a `/configuracion`:

```jsx
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/importar" element={<Importar />} />
```

**Sin `<ConPlan>`:** importar su propia base no es un módulo del plan. El
plan Esencial no incluye inventario ni caja; sí incluye clientes y mascotas,
que es todo lo que esto escribe. Envolverlo le negaría a la clínica más
chica justo lo que la hace quedarse.

- [ ] **Step 7: La entrada en Configuración**

En `frontend/src/pages/Configuracion.jsx`, en la pestaña `datos`, **arriba**
de `<SeccionDatos />`:

```jsx
                <ConfigSection
                  title="Importar base de clientes"
                  subtitle="Pasá tu Excel o tu CSV a VetaApp, sin escribir nada a mano"
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Te muestro qué entendí del archivo y cuántos clientes,
                        mascotas y baños voy a crear. No escribo nada hasta que
                        lo confirmes, y después se puede deshacer.
                      </p>
                    </div>
                    <Link to="/app/importar">
                      <Button variant="secondary" size="sm">Importar un archivo</Button>
                    </Link>
                  </div>
                </ConfigSection>
```

Y en los imports del archivo, agregar `Link`:

```jsx
import { useSearchParams, Link } from 'react-router-dom';
```

Verificar que `useSearchParams` ya viene de ahí (línea 2 del archivo). Si el
import es `import { useSearchParams } from 'react-router-dom';`, queda como
arriba.

- [ ] **Step 8: Correr el test**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/paso2Columnas.test.jsx
```

Esperado: PASA, 6 tests.

Si falla con `Cannot find module '@vitejs/plugin-react'` o con un error de
JSX, el entorno de Vitest no está transformando `.jsx`. Es la primera prueba
del proyecto que importa un archivo JSX. Se arregla en `vite.config.js`
agregando el bloque `test`:

```js
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
```

`environment: 'node'` y no `jsdom` a propósito: `columnasConEjemplo` es una
función pura y no toca el DOM. El día que haya que montar un componente se
agrega `jsdom` y `@testing-library/react`, y no antes — dependencias que no
se usan son dependencias que igual hay que mantener.

- [ ] **Step 9: Probar 1→2 a mano**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run dev
```

Entrar a `http://localhost:5173/app/configuracion?tab=datos`, click en
**Importar un archivo**, y subir el `.xlsx` de La Huella.

Lo que tiene que pasar:

| Qué | Esperado |
|---|---|
| Las hojas | `Respuestas de formulario 1 · 54 filas con datos` — **54, no 155** |
| El mapeo | `Nombre y apellidos del Tutor` → Nombre del dueño; `Cedula` → Cédula; `Contacto telefonos (2)` → Teléfono |
| Los ejemplos | `"Jorge Enrique Pinzon"`, `"1000000200"` — **sin** el `.0` |
| `Otras observaciones` | `No importar` |
| Mandar `Raza` a Cédula | la fila de `Cedula` se queda en `No importar` sola |
| Poner el tutor en `No importar` | aparece "Falta decirme cuál columna es Nombre del dueño" y el botón se apaga |

**El archivo con las cédulas y direcciones de 53 personas no se commitea
nunca.** Se usa, se cierra la pestaña, y listo: nunca sale del navegador —
este paso no escribe nada en ninguna parte.

- [ ] **Step 10: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/Importar.jsx \
        frontend/src/importador/paso1Archivo.jsx \
        frontend/src/importador/paso2Columnas.jsx \
        frontend/src/importador/paso2Columnas.test.jsx \
        frontend/src/App.jsx \
        frontend/src/pages/Configuracion.jsx \
        frontend/vite.config.js
git commit -m "Primeros dos pasos del importador: el archivo y las columnas

El conteo de hojas dice filas CON DATOS. La hoja de La Huella venía
estirada hasta la 155 con 101 en blanco: con \"155 filas\" al lado, la
clínica elige la hoja equivocada confiando en ese número.

El paso 1 relee el perfil al entrar. El guardia de /app ya revisa la
suscripción, pero la revisa contra el perfil que se leyó al abrir la app:
una pestaña de ayer con la prueba vencida a medianoche pasa igual. En
cualquier otra pantalla eso es inofensivo. Acá el error de Postgres
aparecería en el paso 4, después de cinco minutos de mapeo.

El mapeo se muestra con un ejemplo real de cada columna. \"Columna 7\" no
le dice nada a nadie, y sin el ejemplo hay que tener el Excel abierto al
lado para poder corregir.

Lo que no se reconoce entra como No importar y no como basura: una
columna de observaciones metida en cedula deja 54 cédulas falsas que
nadie nota hasta el día que haya que buscar a alguien por la suya.

Sin ConPlan: importar la base propia no es un módulo del plan. Esencial
incluye clientes y mascotas, que es todo lo que esto escribe."
```

---

## Tarea 12: La pantalla, paso 3 — qué va a pasar

**Files:**
- Create: `frontend/src/importador/paso3Revisar.jsx`
- Create: `frontend/src/importador/paso3Revisar.test.jsx`
- Modify: `frontend/src/importador/Importar.jsx` (reemplazar el `<pre>` marcador por el paso real)

**Interfaces:**
- Consumes:
  - `nuevoEstado` de `./nucleo/normalizar.js` (tarea 1)
  - `leerFilas`, `formatoDeFechasRoto`, `agrupar` de `./nucleo/filas.js` y `./nucleo/agrupar.js` (tarea 4)
  - `armarPlan` de `./nucleo/plan.js` (tarea 9)
  - `traerExistentes` de `./escribir.js` (tarea 10)
- Produces:
  - `<Paso3Revisar columnas onAtras onListo={({ envio, resumen, decisiones }) => void} />`
  - `calcular({ columnas, existentes, decisiones, hoy }) → { estado, plan }` exportada aparte para testear sin React

### Por qué `calcular` sale del componente

Es la función que decide qué se escribe. Adentro de un `useMemo` con cuatro
dependencias no se puede probar sin montar React, y es la última cosa del
importador que debería estar sin probar.

Afuera es una función pura de cuatro argumentos, y el componente queda con
una sola línea de lógica: `useMemo(() => calcular({...}), [...])`.

### Se llama dos veces y es la misma llamada

```
calcular(decisiones = {})     → qué preguntar (dudas, especies)
calcular(decisiones = {...})  → qué escribir  (envio)
```

Es la misma función con otro argumento, no dos caminos. Si fueran dos
funciones —una que estima para mostrar y otra que arma para escribir— podrían
separarse, y el día que se separen la clínica confirma un número y se escribe
otro. Ese es el peor error posible de este módulo y así no puede pasar.

En la práctica el componente la corre una vez por render con las decisiones
que hay en ese momento. Al principio el objeto está vacío, al final está
lleno. Mismo código.

### Lo que frena y lo que no

**Frenan dos cosas**, y las dos son preguntas sin contestar:

- una duda de tutor sin decidir
- una raza sin especie

Ninguna es un error: son cosas que la máquina no puede saber. El botón de
Confirmar no existe hasta que estén todas.

**No frena nada más.** Las fechas raras, los teléfonos imposibles, los costos
con texto, las filas descartadas: todo eso avisa y sigue. Cincuenta y tres
clientes sin fecha de nacimiento siguen siendo cincuenta y tres clientes, y
un importador que se niega a importarlos no sirve para nada.

**El formato de fechas roto es el único caso raro:** si `formatoDeFechasRoto`
dice que vio diez fechas o más y falló en más de la mitad, el problema no son
las fechas sino la hoja —probablemente se guardó el CSV de Google en otro
idioma—. Ahí sí se avisa fuerte y arriba, porque importar 54 clientes con
todas las fechas en blanco es peor que no importar.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/paso3Revisar.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { calcular } from './paso3Revisar.jsx';

const HOY = new Date(2026, 9, 15);
const vacia = { duenos: [], mascotas: [], tratamientos: [], vacunas: [] };
const sinDecidir = { dudas: {}, especies: {} };

// Los encabezados y el mapa que deja el paso 2, recortados a lo que
// necesita cada caso.
const ENC = ['Tutor', 'Mascota', 'Telefono', 'Cedula', 'Raza', 'Nacimiento', 'Marca temporal'];
const MAPA = { tutor: 0, mascota: 1, telefonos: 2, cedula: 3, raza: 4, nacimiento: 5, ts: 6 };

const cols = (grilla) => ({ hoja: 'Hoja1', mapa: MAPA, encabezados: ENC, grilla });

const UNA = [['Ana Gómez', 'Max', '3000000200', '1000000200', 'Poodle', '26/07/2018', '12/09/2026 10:18:00']];

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
      duenos: [{ id: 1, nombre: 'Ana Gómez', telefono: '573000000200', telefono2: null, cedula: '1000000200', direccion: 'Calle 1' }],
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
      ['', '', '3000000202', '', '', '', '13/09/2026 09:02:00'],
    ];
    const { estado } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(estado.avisos.filter((a) => a.clase === 'descarte')).toHaveLength(1);
  });

  it('una raza desconocida se pregunta, no se adivina', () => {
    const grilla = [['Ana Gómez', 'Max', '3000000200', '', 'Criollo', '', '12/09/2026 10:18:00']];
    const { plan } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(plan.especies).toHaveLength(1);
    expect(plan.especies[0].raza).toBe('Criollo');
    expect(plan.resumen.especies_sin_resolver).toBe(1);
  });

  it('contestada la especie, deja de preguntar y la mascota entra', () => {
    const grilla = [['Ana Gómez', 'Max', '3000000200', '', 'Criollo', '', '12/09/2026 10:18:00']];
    const { plan } = calcular({
      columnas: cols(grilla), existentes: vacia, hoy: HOY,
      decisiones: { dudas: {}, especies: { criollo: 'gato' } },
    });
    expect(plan.resumen.especies_sin_resolver).toBe(0);
    expect(plan.envio.crear_mascotas[0].especie).toBe('gato');
    // La raza se guarda tal como la escribieron: lo único que se
    // preguntó fue la especie.
    expect(plan.envio.crear_mascotas[0].raza).toBe('Criollo');
  });

  // Correr dos veces sobre el mismo archivo no puede acumular avisos: el
  // estado se crea adentro de calcular, no afuera.
  it('dos corridas no comparten avisos', () => {
    const grilla = [['Ana Gómez', 'Max', '3000000200', '', 'Poodle', '31/02/2026', '12/09/2026 10:18:00']];
    const a = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    const b = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(a.estado.avisos.length).toBe(b.estado.avisos.length);
    expect(a.estado.avisos.length).toBeGreaterThan(0);
  });

  it('avisa cuando el formato de fechas de la hoja entero no se entiende', () => {
    // Doce filas con fechas que no son fechas: no es un dato suelto malo,
    // es la hoja equivocada.
    const grilla = Array.from({ length: 12 }, (_, i) => (
      [`Tutor ${i}`, `Mascota ${i}`, '3000000200', '', 'Poodle', 'ayer', 'pasado mañana']
    ));
    const { estado } = calcular({ columnas: cols(grilla), existentes: vacia, decisiones: sinDecidir, hoy: HOY });
    expect(estado.fechasRotas).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/paso3Revisar.test.jsx
```

Esperado: FALLA con `Failed to resolve import "./paso3Revisar.jsx"`.

- [ ] **Step 3: Escribir el paso 3**

Crear `frontend/src/importador/paso3Revisar.jsx`:

```jsx
// ============================================================
// VetaApp · importador/paso3Revisar.jsx
// La pantalla que hace que esto sea seguro.
//
// Números concretos de lo que va a pasar, antes de tocar nada. Las
// preguntas que la máquina no puede contestar sola. Y las filas que se
// van a quedar afuera, a la vista.
//
// ---------- LO QUE FRENA ----------
// Dos cosas, las dos preguntas sin contestar: una duda de tutor, una raza
// sin especie. Nada más frena. Las fechas raras, los teléfonos imposibles
// y los costos con texto avisan y siguen: un importador que se niega a
// importar 53 clientes porque les falta la fecha de nacimiento no sirve.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '../components/ui.jsx';
import { nuevoEstado } from './nucleo/normalizar.js';
import { leerFilas, formatoDeFechasRoto } from './nucleo/filas.js';
import { agrupar } from './nucleo/agrupar.js';
import { armarPlan } from './nucleo/plan.js';
import { traerExistentes } from './escribir.js';

/**
 * De la grilla del paso 2 al plan, en una función pura.
 *
 * El `estado` se crea ACÁ y no afuera. En el script de terminal era una
 * variable de módulo y daba igual porque el proceso termina; en el
 * navegador, mover un desplegable vuelve a correr esto, y un estado de
 * afuera acumularía los mismos avisos una vez por render.
 */
export function calcular({ columnas, existentes, decisiones, hoy }) {
  const estado = nuevoEstado();
  const filas = leerFilas(estado, {
    grilla: columnas.grilla,
    mapa: columnas.mapa,
    hoja: columnas.hoja,
  });
  const agrupado = agrupar(estado, filas);
  const plan = armarPlan(estado, agrupado, existentes, decisiones, hoy);
  return { estado, plan };
}

const Fila = ({ etiqueta, valor, detalle }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0' }}>
    <span style={{ width: 150, fontSize: 13, color: 'var(--text-muted)' }}>{etiqueta}</span>
    <span style={{ fontSize: 14, fontWeight: 700 }}>{valor}</span>
    {detalle && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{detalle}</span>}
  </div>
);

export default function Paso3Revisar({ columnas, onAtras, onListo }) {
  const [existentes, setExistentes] = useState(null);
  const [errorBase, setErrorBase] = useState('');
  const [decisiones, setDecisiones] = useState({ dudas: {}, especies: {} });
  const [verDescartes, setVerDescartes] = useState(false);

  // Lo que ya tiene la cuenta. Sin esto el paso 3 muestra "54 tutores
  // nuevos" en una base que ya los tiene y la clínica confirma un
  // duplicado completo de su propia base.
  useEffect(() => {
    let vivo = true;
    traerExistentes()
      .then((e) => { if (vivo) setExistentes(e); })
      .catch((err) => { if (vivo) setErrorBase(err.message); });
    return () => { vivo = false; };
  }, []);

  // `hoy` fijo por montaje y no `new Date()` en cada render: la edad que
  // se calcula tiene que ser la misma en el paso 3 y en el paso 4, y una
  // importación hecha a las 23:59 no puede cambiar de edad a mitad.
  const hoy = useMemo(() => new Date(), []);

  const calculado = useMemo(() => {
    if (!existentes) return null;
    return calcular({ columnas, existentes, decisiones, hoy });
  }, [columnas, existentes, decisiones, hoy]);

  if (errorBase) {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>No pude leer lo que ya tenés</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {errorBase}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Sin eso no puedo decirte cuáles de estos clientes ya están cargados,
          y no voy a importar a ciegas. Revisá la conexión y volvé a entrar.
        </p>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
      </Card>
    );
  }

  if (!calculado) return <Card>Comparando con lo que ya tenés…</Card>;

  const { estado, plan } = calculado;
  const r = plan.resumen;
  const descartes = estado.avisos.filter((a) => a.clase === 'descarte');
  const avisos = estado.avisos.filter((a) => a.clase !== 'descarte');
  const faltaDecidir = r.dudas > 0 || r.especies_sin_resolver > 0;
  const nada = r.tutores_nuevos === 0 && r.mascotas_nuevas === 0
    && r.tutores_a_completar === 0 && r.mascotas_a_completar === 0
    && r.tratamientos === 0 && r.vacunas === 0;

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>3 · Qué va a pasar</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Todavía no escribí nada. Esto es lo que voy a hacer si confirmás.
      </p>

      {/* Los nombres son de la clínica, no del archivo. Si estos 54
          nombres no son sus clientes, acá se nota — y es lo único que
          protege de subir la base de otra veterinaria por error. */}

      <div style={{ padding: '6px 0', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
        <Fila
          etiqueta="Voy a crear"
          valor={`${r.tutores_nuevos} tutores · ${r.mascotas_nuevas} mascotas`}
        />
        <Fila
          etiqueta="Les voy a agregar"
          valor={`${r.tratamientos} baños y desparasitaciones · ${r.vacunas} vacunas`}
          detalle={r.eventos_repetidos > 0 ? `${r.eventos_repetidos} ya estaban, esos no los repito` : ''}
        />
        {(r.tutores_a_completar > 0 || r.mascotas_a_completar > 0) && (
          <Fila
            etiqueta="Ya existen"
            valor={`${r.tutores_a_completar} tutores · ${r.mascotas_a_completar} mascotas`}
            detalle="les completo lo que tengan en blanco, no les piso nada"
          />
        )}
        {r.dudas > 0 && (
          <Fila etiqueta="Tengo dudas" valor={`${r.dudas} caso${r.dudas === 1 ? '' : 's'}`} detalle="decidilas abajo" />
        )}
        {descartes.length > 0 && (
          <Fila etiqueta="No voy a importar" valor={`${descartes.length} fila${descartes.length === 1 ? '' : 's'}`} detalle="mirá por qué" />
        )}
      </div>

      {/* Diez fechas vistas y más de la mitad ilegibles no es un dato
          suelto malo: es la hoja equivocada, o un CSV guardado en otro
          idioma. Importar 54 clientes con todas las fechas en blanco es
          peor que no importar, así que esto va arriba y en rojo. */}
      {formatoDeFechasRoto(estado) && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
            No entiendo las fechas de esta hoja
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            De {estado.fechasVistas} fechas no pude leer {estado.fechasRotas}. Casi
            seguro el archivo es un CSV guardado en otro idioma. Bajalo de Google
            Sheets con <strong>Archivo → Descargar → Microsoft Excel (.xlsx)</strong> y
            subilo otra vez: así las fechas viajan como fechas y no como texto.
            Podés seguir igual, pero las mascotas van a entrar sin fecha de nacimiento.
          </p>
          {/* Cinco ejemplos y no la lista entera. Con cinco se ve el
              patrón —"ah, están todas al revés"— y con cincuenta no se ve
              nada: la pantalla se convierte en un muro y el consejo de
              bajar el .xlsx queda arriba, fuera de la vista. */}
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {avisos.filter((a) => a.texto.startsWith('fecha')).slice(0, 5).map((a, i) => (
              <li key={i}>Fila {a.fila}: {a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Las dudas ─── */}
      {plan.dudas.map((d) => (
        <div key={d.id} style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            <strong>{d.existente.nombre}</strong> ya existe
            {d.existente.telefono ? ` con el teléfono ${d.existente.telefono}` : ' sin teléfono'}
            {d.existente.cedula ? `, cédula ${d.existente.cedula}` : ''}.
            <br />
            El archivo trae <strong>{d.archivo.nombre}</strong>
            {d.archivo.tel1 ? ` con el teléfono ${d.archivo.tel1}` : ' sin teléfono'}
            {d.archivo.cedula ? `, cédula ${d.archivo.cedula}` : ''}
            {d.archivo.mascotas.length > 0 && <> — mascota{d.archivo.mascotas.length === 1 ? '' : 's'}: {d.archivo.mascotas.join(', ')}</>}.
          </p>
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 13 }}>
            {/* "Son dos personas distintas" viene marcada. Equivocarse
                duplicando se arregla borrando un tutor; equivocarse
                uniendo mezcla las mascotas de dos familias y eso no se
                deshace mirando la pantalla. */}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio" name={d.id}
                checked={(decisiones.dudas[d.id] ?? 'distinta') === 'distinta'}
                onChange={() => setDecisiones((s) => ({ ...s, dudas: { ...s.dudas, [d.id]: 'distinta' } }))}
              />
              Son dos personas distintas
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio" name={d.id}
                checked={decisiones.dudas[d.id] === 'misma'}
                onChange={() => setDecisiones((s) => ({ ...s, dudas: { ...s.dudas, [d.id]: 'misma' } }))}
              />
              Es la misma
            </label>
          </div>
        </div>
      ))}

      {/* ─── Las especies ─── */}
      {plan.especies.map((e) => (
        <div key={e.raza} style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            No sé qué es <strong>"{e.raza}"</strong> ({e.cuantas} mascota{e.cuantas === 1 ? '' : 's'}:{' '}
            {e.mascotas.slice(0, 6).join(', ')}{e.mascotas.length > 6 ? '…' : ''}). ¿Perro o gato?
          </p>
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 13 }}>
            {['perro', 'gato'].map((esp) => (
              <label key={esp} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio" name={`esp-${e.raza}`}
                  // "Perro" marcado de entrada: en la base de La Huella 51
                  // de 54 son perros. No es una adivinanza del dato, es la
                  // opción que menos clicks cuesta en el caso normal.
                  checked={(decisiones.especies[e.clave] ?? 'perro') === esp}
                  onChange={() => setDecisiones((s) => ({ ...s, especies: { ...s.especies, [e.clave]: esp } }))}
                />
                {esp === 'perro' ? 'Perro' : 'Gato'}
              </label>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            La raza se guarda igual, tal como la escribieron. Solo me falta la especie.
          </p>
        </div>
      ))}

      {/* ─── Las filas que se quedan afuera ─── */}
      {descartes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setVerDescartes((v) => !v)}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--verde-600)', cursor: 'pointer' }}
          >
            {verDescartes ? 'Ocultar' : 'Ver'} las {descartes.length} filas que no voy a importar
          </button>
          {verDescartes && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {descartes.map((a, i) => (
                <li key={i}>Fila {a.fila} de {a.hoja}: {a.texto}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── Los avisos ─── */}
      {avisos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>
            {avisos.length} cosa{avisos.length === 1 ? '' : 's'} que decidí yo
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, maxHeight: 240, overflowY: 'auto' }}>
            {avisos.map((a, i) => (
              <li key={i}>Fila {a.fila}: {a.texto}</li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            Nada de esto frena la importación. Son datos que la hoja trae raros
            y que se corrigen desde la ficha cuando el tutor vuelva.
          </p>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="secondary" onClick={onAtras}>Atrás</Button>
        {/* El botón no existe mientras falte una respuesta. No es que esté
            apagado: no hay nada que confirmar hasta que la pantalla sepa
            qué hacer con esos casos. */}
        {!faltaDecidir && !nada && (
          <Button onClick={() => onListo({ envio: plan.envio, resumen: r, decisiones })}>
            Confirmar e importar
          </Button>
        )}
        {faltaDecidir && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Contestá {r.dudas > 0 ? `las ${r.dudas} dudas` : ''}
            {r.dudas > 0 && r.especies_sin_resolver > 0 ? ' y ' : ''}
            {r.especies_sin_resolver > 0 ? `las ${r.especies_sin_resolver} razas` : ''} de arriba.
          </span>
        )}
        {!faltaDecidir && nada && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No hay nada nuevo que importar: todo esto ya está cargado.
          </span>
        )}
      </div>
    </Card>
  );
}
```

**Dónde está `e.clave`:** lo pone `armarPlan` en la tarea 9 —es la raza
pasada por `sinTildes`, la misma llave con la que `decisiones.especies`
vuelve—. La pantalla **no** la recalcula a propósito: con dos
normalizaciones separadas, el día que una cambie la respuesta de la clínica
no le llega a `armarPlan` y la mascota entra sin especie habiendo contestado.

- [ ] **Step 4: Enganchar el paso 3 en Importar.jsx**

Reemplazar el bloque `{paso === 3 && columnas && (<pre>…</pre>)}` por:

```jsx
          {paso === 3 && columnas && (
            <Paso3Revisar
              columnas={columnas}
              onAtras={() => setPaso(2)}
              onListo={(c) => { setConfirmado(c); setPaso(4); }}
            />
          )}
```

Agregar el import y el estado nuevo:

```jsx
import Paso3Revisar from './paso3Revisar.jsx';
```

```jsx
  const [confirmado, setConfirmado] = useState(null); // { envio, resumen, decisiones }
```

- [ ] **Step 5: Correr los tests**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run
```

Esperado: PASAN todos. El paso 3 agrega 7.

- [ ] **Step 6: Probar 1→2→3 a mano contra la cuenta de pruebas**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run dev
```

Entrar con `emmanuelvargas1722@gmail.com` —**nunca** con la cuenta de la
clínica— y subir el `.xlsx` de La Huella.

Esa cuenta ya tiene el import de La Huella adentro desde la sesión anterior,
así que es la prueba más valiosa que hay: **el paso 3 tiene que decir 0
tutores nuevos, 0 mascotas nuevas y 74 eventos repetidos.** Si dice 53 y 54,
el emparejamiento no funciona y el bug está en la tarea 9, no acá.

| Qué | Esperado |
|---|---|
| Voy a crear | `0 tutores · 0 mascotas` |
| Les voy a agregar | `0 baños… · 0 vacunas` con `74 ya estaban, esos no los repito` |
| El botón | no aparece; dice "No hay nada nuevo que importar" |
| Las dudas | 0 — los 53 se emparejaron por cédula o por nombre+teléfono |

Después, para ver el camino de verdad, crear una cuenta nueva de prueba y
repetir: ahí sí tiene que decir `53 tutores · 54 mascotas`, `74 baños y
desparasitaciones · 13 vacunas`, `11 cosas que decidí yo`, y `3 filas que no
voy a importar`. Son los mismos números de `importar/revisar.md`, y por eso
ese archivo sirve de respuesta correcta: lo generó el script de terminal
sobre los mismos datos.

- [ ] **Step 7: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/paso3Revisar.jsx \
        frontend/src/importador/paso3Revisar.test.jsx \
        frontend/src/importador/Importar.jsx \
        frontend/src/importador/nucleo/plan.js \
        frontend/src/importador/nucleo/plan.test.js
git commit -m "Paso 3: los números de lo que va a pasar, antes de tocar nada

Esta es la pantalla que hace que el importador sea seguro, y el único
lugar donde se nota que alguien subió la base de otra clínica por error:
los nombres que ve tienen que ser sus clientes.

Los números salen de contar el envío, no de estimar. Es la misma función
pura corrida dos veces —una con las decisiones vacías para saber qué
preguntar, otra con las respuestas para armar el envío—, así que lo que
la clínica confirma y lo que se escribe no pueden separarse.

Compara contra lo que la cuenta ya tiene antes de mostrar un número. Sin
eso, subir el mismo archivo dos veces diría \"54 tutores nuevos\" y
después crearía 0: una pantalla que miente una vez no se usa más.

Solo frenan las preguntas sin contestar. Las fechas raras, los teléfonos
imposibles y los costos con texto avisan y siguen; 53 clientes sin fecha
de nacimiento siguen siendo 53 clientes.

Las filas descartadas se muestran. Una fila con teléfono y costo pero sin
nombres es una visita que se cobró, y hacerla desaparecer en silencio es
el peor error posible de este módulo.

Las dudas vienen marcadas en \"son dos personas distintas\": equivocarse
duplicando se arregla borrando un tutor, equivocarse uniendo mezcla las
mascotas de dos familias."
```

---

## Tarea 13: La pantalla, paso 4 — escribir y poder deshacer

**Files:**
- Create: `frontend/src/importador/paso4Escribir.jsx`
- Create: `frontend/src/importador/textos.js`
- Create: `frontend/src/importador/textos.test.js`
- Modify: `frontend/src/importador/Importar.jsx` (montar el paso 4)

**Interfaces:**
- Consumes:
  - `abrirImportacion`, `aplicar`, `marcarFallida`, `deshacer` de `./escribir.js` (tarea 10)
  - lo que devuelve `aplicar_importacion` (tarea 7): `{ importacion_id, tutores_creados, tutores_completados, mascotas_creadas, mascotas_completadas, tratamientos, vacunas, repetidos, omitidos }`
  - lo que devuelve `deshacer_importacion` (tarea 7): `{ mascotas_borradas, tutores_borrados, tratamientos, vacunas, campos_restaurados, conservadas, estado }`
- Produces:
  - `<Paso4Escribir confirmado archivo onReiniciar />` — `confirmado` es `{ envio, resumen, decisiones }`, `archivo` es `{ archivo, hoja, mapa }`
  - `textoResultado(res) → string[]` — las líneas de "qué quedó"
  - `textoOmitidos(omitidos) → string[]`
  - `textoConservadas(conservadas) → string[]`

### Por qué los textos salen a un archivo aparte

`textoConservadas` es la frase que decide si la clínica entiende o no por qué
"Deshacer" no borró todo. Es la frase más difícil de toda la app, y adentro
del JSX no se puede probar. Afuera son tres funciones puras que toman el
JSON de Postgres y devuelven líneas.

### Lo que se muestra es lo que devolvió Postgres, no lo que predijo el paso 3

Parece lo mismo y no lo es. El paso 3 dijo "54 mascotas"; la función puede
haber escrito 53 porque una cédula estaba repetida, o 54 con una sin cédula.
Mostrar la predicción sería mentir con un número que ya se sabe falso.

Por eso el paso 4 ignora `confirmado.resumen` para el resultado y usa lo que
volvió. El `resumen` del paso 3 se guarda en la fila de `importaciones`
—ahí sí sirve: es el registro de qué se le mostró a quien confirmó— pero no
se muestra como resultado.

### El orden, y qué pasa si se corta el wifi en el medio

```
1. abrirImportacion()  → fila en 'en_curso', sin nada escrito
2. aplicar()           → UNA llamada, UNA transacción, todo o nada
3. si revienta         → marcarFallida() y el error en pantalla
```

Si el wifi se corta entre 1 y 2: queda una fila en `'en_curso'` y cero filas
escritas. Eso es un rastro que se puede mirar, y es mejor que no tener nada.

Si se corta durante 2: la transacción no llegó al `commit` y Postgres la
deshace entera. No hay medio import.

Si se corta entre 2 y 3 —escribió bien pero la respuesta no llegó—: la
pantalla muestra error y la fila queda en `'en_curso'` con los datos
adentro. Es el único caso incómodo, y la salida es la lista de importaciones
(tarea 14): ahí aparece en `'en_curso'` con los datos ya cargados, y se puede
deshacer desde ahí. **No hay reintento automático**, por eso mismo: sobre una
llamada que no se sabe si llegó, reintentar es la forma de duplicar un import
entero.

### Deshacer, ahí mismo

El botón está en esta pantalla y no solo en la lista. Es el momento en que la
clínica mira los números y decide si está bien: obligarla a buscar en otra
pantalla cuando ya vio que está mal es cruel y además es cuando más probable
es que no encuentre dónde.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/textos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { textoResultado, textoOmitidos, textoConservadas } from './textos.js';

describe('textoResultado', () => {
  it('cuenta lo que devolvió Postgres', () => {
    const lineas = textoResultado({
      tutores_creados: 53, tutores_completados: 0,
      mascotas_creadas: 54, mascotas_completadas: 0,
      tratamientos: 74, vacunas: 13, repetidos: 0, omitidos: [],
    });
    expect(lineas).toContain('53 tutores nuevos');
    expect(lineas).toContain('54 mascotas nuevas');
    expect(lineas).toContain('74 baños y desparasitaciones');
    expect(lineas).toContain('13 vacunas');
  });

  // Un cero no se escribe. "0 vacunas" en la pantalla de "quedó listo"
  // se lee como un error, y no lo es: esa hoja no traía vacunas.
  it('no escribe las líneas en cero', () => {
    const lineas = textoResultado({
      tutores_creados: 2, tutores_completados: 0,
      mascotas_creadas: 0, mascotas_completadas: 0,
      tratamientos: 0, vacunas: 0, repetidos: 0, omitidos: [],
    });
    expect(lineas).toEqual(['2 tutores nuevos']);
  });

  it('dice los repetidos, que son los que NO escribió', () => {
    const lineas = textoResultado({
      tutores_creados: 0, tutores_completados: 0,
      mascotas_creadas: 0, mascotas_completadas: 0,
      tratamientos: 0, vacunas: 0, repetidos: 74, omitidos: [],
    });
    expect(lineas).toContain('74 ya estaban cargados, esos no los repetí');
  });

  it('el singular no dice "1 tutores"', () => {
    const lineas = textoResultado({
      tutores_creados: 1, tutores_completados: 0,
      mascotas_creadas: 1, mascotas_completadas: 0,
      tratamientos: 1, vacunas: 1, repetidos: 1, omitidos: [],
    });
    expect(lineas).toContain('1 tutor nuevo');
    expect(lineas).toContain('1 mascota nueva');
    expect(lineas).toContain('1 vacuna');
  });
});

describe('textoOmitidos', () => {
  // La cédula repetida es el único dato que la función deja afuera a
  // propósito. Si no se dice, la clínica cree que entró y busca por esa
  // cédula para siempre sin encontrar a nadie.
  it('dice de quién no pudo guardar la cédula y por qué', () => {
    const lineas = textoOmitidos([
      { que: 'cedula_repetida', quien: 'Ana Gómez', valor: '1000000200' },
    ]);
    expect(lineas[0]).toContain('Ana Gómez');
    expect(lineas[0]).toContain('1000000200');
    expect(lineas[0]).toContain('ya la tenía otro cliente');
  });

  it('sin omitidos no dice nada', () => {
    expect(textoOmitidos([])).toEqual([]);
    expect(textoOmitidos(undefined)).toEqual([]);
  });
});

describe('textoConservadas', () => {
  // La frase más difícil de la app. Tiene que decir tres cosas: qué no
  // borró, por qué, y que eso es lo correcto.
  it('dice la mascota, cuántas cosas tiene y qué son', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Killer', historias: 6, citas: 2, vacunas: 0, tratamientos: 0 },
    ]);
    expect(lineas[0]).toBe('Killer: tiene 6 consultas y 2 citas escritas después del import');
  });

  it('nombra cada cosa en singular cuando hay una sola', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Luna', historias: 1, citas: 0, vacunas: 1, tratamientos: 0 },
    ]);
    expect(lineas[0]).toBe('Luna: tiene 1 consulta y 1 vacuna escritas después del import');
  });

  it('una sola cosa no lleva "y"', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Max', historias: 0, citas: 3, vacunas: 0, tratamientos: 0 },
    ]);
    expect(lineas[0]).toBe('Max: tiene 3 citas escritas después del import');
  });

  it('tres cosas van con comas y una "y" al final', () => {
    const lineas = textoConservadas([
      { id: 9, nombre: 'Toby', historias: 2, citas: 1, vacunas: 0, tratamientos: 4 },
    ]);
    expect(lineas[0]).toBe('Toby: tiene 2 consultas, 1 cita y 4 baños escritas después del import');
  });

  it('sin conservadas no dice nada', () => {
    expect(textoConservadas([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/textos.test.js
```

Esperado: FALLA con `Failed to resolve import "./textos.js"`.

- [ ] **Step 3: Escribir los textos**

Crear `frontend/src/importador/textos.js`:

```js
// ============================================================
// VetaApp · importador/textos.js
// El JSON que devuelve Postgres pasado a frases que se entienden.
//
// Está afuera del JSX porque son las frases que más importan de todo el
// importador —sobre todo textoConservadas, que es la que explica por qué
// "Deshacer" no borró todo— y adentro del componente no se pueden probar.
// ============================================================

/** 1 → "1 vacuna", 3 → "3 vacunas". El plural a mano porque son cuatro casos. */
const n = (cuantos, singular, plural) =>
  `${cuantos} ${cuantos === 1 ? singular : plural}`;

/**
 * Qué quedó escrito, según Postgres.
 *
 * Los ceros NO se escriben. "0 vacunas" en la pantalla de "quedó listo" se
 * lee como un error, y no lo es: esa hoja no traía vacunas.
 */
export function textoResultado(res) {
  const l = [];
  if (res.tutores_creados > 0)      l.push(n(res.tutores_creados, 'tutor nuevo', 'tutores nuevos'));
  if (res.mascotas_creadas > 0)     l.push(n(res.mascotas_creadas, 'mascota nueva', 'mascotas nuevas'));
  if (res.tutores_completados > 0)  l.push(n(res.tutores_completados, 'tutor al que le completé datos', 'tutores a los que les completé datos'));
  if (res.mascotas_completadas > 0) l.push(n(res.mascotas_completadas, 'mascota a la que le completé datos', 'mascotas a las que les completé datos'));
  if (res.tratamientos > 0)         l.push(`${res.tratamientos} baños y desparasitaciones`);
  if (res.vacunas > 0)              l.push(n(res.vacunas, 'vacuna', 'vacunas'));
  // Los repetidos son los que NO escribió. Van igual: son la prueba de que
  // subir el mismo archivo dos veces no duplica nada.
  if (res.repetidos > 0)            l.push(`${res.repetidos} ya estaban cargados, esos no los repetí`);
  return l;
}

/**
 * Lo que la función dejó afuera a propósito.
 *
 * Hoy es un solo caso: dos clientes distintos con la misma cédula en el
 * archivo. El segundo entra SIN cédula en vez de abortar el import entero
 * (ver tarea 7). Si eso no se dijera, la clínica creería que la cédula
 * está cargada y la buscaría para siempre sin encontrar a nadie.
 */
export function textoOmitidos(omitidos) {
  return (omitidos ?? []).map((o) => {
    if (o.que === 'cedula_repetida') {
      return `${o.quien}: no le pude guardar la cédula ${o.valor} porque ya la tenía otro cliente. Entró sin cédula; revisá cuál de los dos es la correcta.`;
    }
    // Un `que` que esta versión de la pantalla no conoce igual se muestra
    // crudo. Esconderlo sería esconder exactamente el caso nuevo.
    return `${o.quien}: ${o.que} (${o.valor})`;
  });
}

const COSAS = [
  ['historias',    'consulta',      'consultas'],
  ['citas',        'cita',          'citas'],
  ['vacunas',      'vacuna',        'vacunas'],
  ['tratamientos', 'baño',          'baños'],
];

/**
 * Por qué estas mascotas NO se borraron al deshacer.
 *
 * La frase más difícil de la app, y tiene que decir tres cosas en una
 * línea: qué no borró, por qué, y —sin decirlo— que eso es lo correcto.
 *
 * Es por la cascada: `historias_clinicas.mascota_id` y `citas.mascota_id`
 * son `on delete cascade`, así que borrar la mascota que entró por el
 * archivo se llevaría las seis consultas que la veterinaria escribió
 * después. Deshacer un import no puede borrar trabajo clínico. Por eso la
 * mascota se queda, y su tutor también.
 */
export function textoConservadas(conservadas) {
  return (conservadas ?? []).map((m) => {
    const partes = COSAS
      .filter(([k]) => (m[k] ?? 0) > 0)
      .map(([k, s, p]) => n(m[k], s, p));
    // "a, b y c". El "y" solo si hay más de una: "tiene 3 citas y escritas"
    // es lo que sale si se concatena sin mirar.
    const lista = partes.length > 1
      ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
      : partes[0];
    return `${m.nombre}: tiene ${lista} escritas después del import`;
  });
}
```

- [ ] **Step 4: Correr el test**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/textos.test.js
```

Esperado: PASA, 12 tests.

- [ ] **Step 5: Escribir el paso 4**

Crear `frontend/src/importador/paso4Escribir.jsx`:

```jsx
// ============================================================
// VetaApp · importador/paso4Escribir.jsx
// El único paso que escribe.
//
// ---------- EL ORDEN, Y POR QUÉ ----------
//   1. abrirImportacion()  → la fila queda en 'en_curso', sin nada escrito
//   2. aplicar()           → UNA llamada, UNA transacción, todo o nada
//   3. si revienta         → marcarFallida() y el error crudo en pantalla
//
// Si el wifi se corta entre 1 y 2 queda una fila en 'en_curso' con cero
// filas colgadas: eso se puede mirar. Si se corta durante 2, la
// transacción no llega al commit y Postgres la deshace entera: no hay
// medio import. Si se corta entre 2 y 3 —escribió y la respuesta no
// volvió— la fila queda en 'en_curso' CON los datos adentro, y la salida
// es deshacerla desde la lista de importaciones.
//
// NO hay reintento automático, y es por ese último caso: sobre una
// llamada que no se sabe si llegó, reintentar solo es la forma de
// duplicar un import entero.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui.jsx';
import { abrirImportacion, aplicar, marcarFallida, deshacer } from './escribir.js';
import { textoResultado, textoOmitidos, textoConservadas } from './textos.js';

export default function Paso4Escribir({ confirmado, archivo, onReiniciar }) {
  const [fase, setFase] = useState('escribiendo'); // escribiendo | listo | error | deshaciendo | deshecho
  const [res, setRes] = useState(null);
  const [desRes, setDesRes] = useState(null);
  const [error, setError] = useState('');
  const [impId, setImpId] = useState(null);

  // React en desarrollo monta cada efecto dos veces. Sin este candado, un
  // `npm run dev` escribiría el import DOS veces en la cuenta real. Es el
  // único lugar de la app donde ese detalle de React cuesta 54 clientes
  // duplicados, así que el candado va acá y no se saca.
  const arrancado = useRef(false);

  useEffect(() => {
    if (arrancado.current) return;
    arrancado.current = true;

    (async () => {
      let id = null;
      try {
        id = await abrirImportacion({
          archivo: archivo.archivo,
          hoja: archivo.hoja,
          mapeo: archivo.mapa,
        });
        setImpId(id);
        const r = await aplicar(id, confirmado.envio, confirmado.resumen);
        setRes(r);
        setFase('listo');
      } catch (err) {
        setError(err.message || String(err));
        setFase('error');
        // Deja constancia de que alguien intentó importar y falló. No tira
        // nunca: si tirara, taparía el error de verdad que está arriba.
        if (id) await marcarFallida(id, err.message || String(err), confirmado.resumen);
      }
    })();
  }, [confirmado, archivo]);

  const hacerDeshacer = async () => {
    if (!impId) return;
    setFase('deshaciendo');
    try {
      const d = await deshacer(impId);
      setDesRes(d);
      setFase('deshecho');
    } catch (err) {
      setError(err.message || String(err));
      setFase('error');
    }
  };

  if (fase === 'escribiendo') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>4 · Importando</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Escribiendo {confirmado.resumen.tutores_nuevos} tutores y{' '}
          {confirmado.resumen.mascotas_nuevas} mascotas. Es una sola operación:
          no cierres esta pestaña.
        </p>
        {/* Una barra que avanza sola sería una mentira: la escritura es una
            sola llamada y no hay progreso que reportar. Un indicador que
            da vueltas dice la verdad —está pasando algo, no sé cuánto
            falta— y es lo que ya usa el resto de la app (Splash). */}
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid var(--verde-100)', borderTopColor: 'var(--verde-500)', animation: 'spin 0.7s linear infinite' }} />
      </Card>
    );
  }

  if (fase === 'error') {
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>No se pudo importar</h3>
        {/* El error de Postgres va crudo. Reemplazarlo por "ocurrió un
            error" borra la única pista que sirve para arreglarlo, y el
            mensaje de las funciones de la tarea 7 ya está escrito en
            español para que se pueda leer. */}
        <p style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{error}</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          No quedó nada a medias: la escritura es una sola operación, así que o
          entró todo o no entró nada.
          {impId && <> Si querés asegurarte, la importación quedó anotada con el número <strong>{impId}</strong> en Configuración → Datos → Importaciones.</>}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onReiniciar}>Empezar de nuevo</Button>
          {impId && <Button variant="secondary" onClick={hacerDeshacer}>Deshacer por si quedó algo</Button>}
        </div>
      </Card>
    );
  }

  if (fase === 'deshaciendo') {
    return <Card>Deshaciendo…</Card>;
  }

  if (fase === 'deshecho') {
    const conservadas = textoConservadas(desRes.conservadas);
    return (
      <Card>
        <h3 style={{ margin: 0, fontSize: 15 }}>
          {desRes.estado === 'deshecho_parcial' ? 'Deshecho, casi todo' : 'Deshecho'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Borré {desRes.tutores_borrados} tutores, {desRes.mascotas_borradas} mascotas,{' '}
          {desRes.tratamientos} baños y {desRes.vacunas} vacunas.
          {desRes.campos_restaurados > 0 && <> Y devolví {desRes.campos_restaurados} datos a como estaban antes.</>}
        </p>

        {/* Lo más importante de esta pantalla. Si no se explica, la clínica
            cree que "Deshacer" falló — y lo que pasó es que NO borró el
            trabajo clínico que ella escribió después. */}
        {conservadas.length > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {conservadas.length} mascota{conservadas.length === 1 ? '' : 's'} no las borré
            </p>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {conservadas.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              Borrarlas se habría llevado esas consultas y esas citas con ellas.
              Se quedaron, y sus dueños también. Si de verdad querés sacarlas,
              hay que borrarlas una por una desde su ficha.
            </p>
          </div>
        )}

        <Button variant="secondary" onClick={onReiniciar}>Importar otro archivo</Button>
      </Card>
    );
  }

  // fase === 'listo'
  // Lo que se muestra es lo que devolvió Postgres, NO lo que predijo el
  // paso 3. El paso 3 dijo 54 mascotas; la función puede haber escrito 53
  // porque una cédula estaba repetida. Mostrar la predicción sería mentir
  // con un número que ya se sabe falso.
  const lineas = textoResultado(res);
  const omitidos = textoOmitidos(res.omitidos);

  return (
    <Card>
      <h3 style={{ margin: 0, fontSize: 15 }}>Listo</h3>
      {lineas.length > 0 ? (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
          {lineas.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No había nada nuevo: todo lo del archivo ya estaba cargado.
        </p>
      )}

      {omitidos.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Un dato que no pude guardar</p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {omitidos.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to="/app/mascotas"><Button>Ver mis clientes</Button></Link>
        <Button variant="secondary" onClick={onReiniciar}>Importar otro archivo</Button>
        {/* Deshacer va ACÁ y no solo en la lista. Este es el momento en que
            la clínica mira los números y decide si está bien; mandarla a
            buscar otra pantalla cuando ya vio que está mal es cuando menos
            va a encontrar dónde. */}
        <Button variant="secondary" onClick={hacerDeshacer}>Deshacer esta importación</Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Montar el paso 4 en Importar.jsx**

Agregar el import:

```jsx
import Paso4Escribir from './paso4Escribir.jsx';
```

y el bloque, después del paso 3:

```jsx
          {paso === 4 && confirmado && archivo && (
            <Paso4Escribir
              confirmado={confirmado}
              archivo={{ archivo: archivo.archivo, hoja: archivo.hoja, mapa: columnas.mapa }}
              onReiniciar={() => {
                setArchivo(null); setColumnas(null); setConfirmado(null); setPaso(1);
              }}
            />
          )}
```

**No hay botón de Atrás en el paso 4.** Volver atrás desde acá no desharía
nada —lo escrito está escrito— y el botón insinuaría que sí. Lo que deshace
se llama Deshacer.

- [ ] **Step 7: Correr todo**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run && npm run build
```

Esperado: todos los tests pasan y el build termina sin errores. El build
importa acá porque es la primera vez que SheetJS entra al bundle de
producción: si el paquete del CDN no resuelve, se ve en este comando y no en
Cloudflare.

- [ ] **Step 8: Probar el import completo contra la cuenta de pruebas**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run dev
```

**Con `emmanuelvargas1722@gmail.com`. Nunca con `lahuella.vetamor@gmail.com`.**

Esa cuenta ya tiene el import adentro, así que para probar el camino de
escritura hay que vaciarla primero. En el SQL Editor de Supabase:

```sql
-- Borra SOLO los clientes de la cuenta de pruebas. La cascada se lleva
-- mascotas, tratamientos, vacunas, citas e historias.
--
-- NO correr esto con otro correo adentro. Es la consulta más peligrosa de
-- todo el proyecto.
delete from public.duenos
where user_id = (select id from auth.users where email = 'emmanuelvargas1722@gmail.com');
```

Después, en la app:

| Paso | Esperado |
|---|---|
| Paso 3 | `53 tutores · 54 mascotas`, `74 baños… · 13 vacunas`, `3 filas que no voy a importar`, `11 cosas que decidí yo` |
| Paso 4, mientras escribe | el indicador girando, sin barra falsa |
| Paso 4, listo | `53 tutores nuevos`, `54 mascotas nuevas`, `74 baños y desparasitaciones`, `13 vacunas` |
| Subir el MISMO archivo otra vez, paso 3 | `0 tutores · 0 mascotas`, `74 ya estaban` |
| El segundo import, paso 4 | el botón de Confirmar no aparece: "No hay nada nuevo que importar" |

- [ ] **Step 9: Probar Deshacer, incluido el caso parcial**

Importar de nuevo en limpio. Antes de darle a Deshacer, escribirle a una
mascota una consulta y una cita desde la app —la ficha de cualquiera de las
54— para forzar el caso que importa:

| Qué | Esperado |
|---|---|
| Deshacer sin tocar nada | "Deshecho", 53 tutores y 54 mascotas borrados |
| Deshacer con 1 consulta y 1 cita escritas | "Deshecho, casi todo" + `Nombre: tiene 1 consulta y 1 cita escritas después del import` |
| Esa mascota en /app/mascotas | **sigue estando**, con su dueño y con la consulta |
| Deshacer dos veces | el segundo tira el mensaje en español de la función, no un error crudo |

El caso parcial es el que hay que ver funcionando con los ojos. Es la única
parte del importador donde un bug borra trabajo clínico real.

- [ ] **Step 10: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/paso4Escribir.jsx \
        frontend/src/importador/textos.js \
        frontend/src/importador/textos.test.js \
        frontend/src/importador/Importar.jsx
git commit -m "Paso 4: escribe, dice qué quedó y se puede deshacer ahí mismo

El resultado que se muestra es el que devolvió Postgres, no el que
predijo el paso 3. Parece lo mismo y no lo es: el paso 3 dice 54
mascotas y la función puede haber escrito 53 porque una cédula estaba
repetida. Mostrar la predicción sería mentir con un número que ya se
sabe falso.

Un candado de useRef alrededor del efecto. React en desarrollo monta
cada efecto dos veces, y sin el candado un npm run dev escribe el import
dos veces. Es el único lugar de la app donde ese detalle de React cuesta
54 clientes duplicados.

Sin reintento automático. Si la respuesta no vuelve no se sabe si la
escritura llegó, y reintentar sobre eso solo es la forma de duplicar un
import entero. La fila queda en en_curso y se deshace desde la lista.

Sin barra de progreso. La escritura es una sola llamada y una barra que
avanza sola sería una mentira; el indicador que gira dice la verdad.

Sin botón de Atrás en el paso 4: volver no desharía nada y el botón
insinuaría que sí. Lo que deshace se llama Deshacer, y está acá mismo
porque este es el momento en que la clínica mira los números y decide.

Los textos salen a su propio archivo con tests. textoConservadas es la
frase que explica por qué Deshacer no borró todo —las consultas y las
citas que la veterinaria escribió después— y es la más difícil de la
app; adentro del JSX no se puede probar."
```

---

## Tarea 14: El historial — qué se importó y cuándo, con deshacer

**Files:**
- Create: `frontend/src/importador/Importaciones.jsx`
- Create: `frontend/src/importador/Importaciones.test.jsx`
- Modify: `frontend/src/pages/Configuracion.jsx` (montar `<Importaciones />` en la pestaña Datos)

**Interfaces:**
- Consumes:
  - `listarImportaciones`, `deshacer` de `./escribir.js` (tarea 10)
  - `textoConservadas` de `./textos.js` (tarea 13)
  - las columnas de `importaciones` (tarea 6): `id, archivo, hoja, estado, resumen, creado_en, cerrado_en`
- Produces:
  - `<Importaciones />` — se monta adentro de un `ConfigSection` en la pestaña Datos
  - `lineaResumen(imp) → string` — qué entró, leído del `resumen` guardado
  - `ESTADOS` — `{ en_curso, listo, deshecho, deshecho_parcial, fallido }` → `{ texto, tono }`

### Para qué sirve esta pantalla, en concreto

Tres cosas, y ninguna es "mostrar un historial porque se ve bien":

1. **Deshacer tarde.** El botón del paso 4 solo existe mientras la pestaña
   esté abierta. Al otro día, cuando la clínica se da cuenta de que importó
   la hoja vieja, esto es lo único que hay.
2. **Leer el `resumen` de hace seis meses.** "¿Por qué Nube no tiene fecha de
   nacimiento?" tiene respuesta: estaba mal en el archivo y se importó sin
   ella. Sin esta pantalla, la respuesta es "la app se la comió".
3. **Ver las que quedaron en `'en_curso'`.** Son las que escribieron y no
   alcanzaron a responder. Es el único lugar donde eso se nota.

### Por qué va adentro de Configuración y no en una ruta propia

Una ruta propia necesita un enlace, y el enlace natural es justo el lugar
donde ya está el botón de importar. Un `ConfigSection` debajo del de
importar es el mismo lugar con una pantalla menos.

Lista plana, sin paginar: una clínica importa su base una vez y la actualiza
un par de veces al año. Paginar diez filas es código que hay que mantener
para un caso que no existe.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/importador/Importaciones.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { lineaResumen, ESTADOS } from './Importaciones.jsx';

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
      '53 tutores · 54 mascotas · 74 baños · 13 vacunas',
    );
  });

  it('no escribe las partes en cero', () => {
    expect(lineaResumen({ resumen: { ...RESUMEN, vacunas: 0, tratamientos: 0 } })).toBe(
      '53 tutores · 54 mascotas',
    );
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run src/importador/Importaciones.test.jsx
```

Esperado: FALLA con `Failed to resolve import "./Importaciones.jsx"`.

- [ ] **Step 3: Escribir la pantalla**

Crear `frontend/src/importador/Importaciones.jsx`:

```jsx
// ============================================================
// VetaApp · importador/Importaciones.jsx
// Qué se importó, cuándo, y poder deshacerlo después.
//
// ---------- PARA QUÉ SIRVE, EN CONCRETO ----------
//   · Deshacer al otro día. El botón del paso 4 vive mientras la pestaña
//     esté abierta; cuando la clínica se da cuenta mañana de que importó
//     la hoja vieja, esto es lo único que hay.
//   · Leer el resumen de hace seis meses. "¿Por qué Nube no tiene fecha
//     de nacimiento?" tiene respuesta acá: estaba mal en el archivo. Sin
//     esta pantalla la respuesta es "la app se la comió".
//   · Ver las que quedaron en 'en_curso': escribieron y no alcanzaron a
//     responder. Es el único lugar donde eso se nota.
// ============================================================

import { useEffect, useState } from 'react';
import { Badge, Button } from '../components/ui.jsx';
import { listarImportaciones, deshacer } from './escribir.js';
import { textoConservadas } from './textos.js';

export const ESTADOS = {
  en_curso:         { texto: 'Sin terminar',    tono: 'warn' },
  listo:            { texto: 'Importada',       tono: 'success' },
  deshecho:         { texto: 'Deshecha',        tono: 'neutral' },
  // No dice lo mismo que 'deshecho' a propósito: hay que poder ver de un
  // vistazo cuál dejó mascotas atrás, porque esas siguen en la base.
  deshecho_parcial: { texto: 'Deshecha en parte', tono: 'warn' },
  fallido:          { texto: 'Falló',           tono: 'danger' },
};

const FECHA = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

/**
 * El `resumen` del paso 3, en una línea.
 *
 * Es lo que la clínica vio y confirmó, no lo que Postgres escribió. Suena
 * peor y es mejor: seis meses después la pregunta es "qué decía el archivo
 * que subí", y eso es exactamente lo que guarda esta columna.
 */
export function lineaResumen(imp) {
  const r = imp?.resumen ?? {};
  // El error vive en el mismo jsonb (ver marcarFallida). En esa fila es el
  // único dato que importa, así que reemplaza a los números.
  if (r.error) return `Falló: ${r.error}`;

  const partes = [];
  if (r.tutores_nuevos > 0)  partes.push(`${r.tutores_nuevos} tutores`);
  if (r.mascotas_nuevas > 0) partes.push(`${r.mascotas_nuevas} mascotas`);
  if (r.tratamientos > 0)    partes.push(`${r.tratamientos} baños`);
  if (r.vacunas > 0)         partes.push(`${r.vacunas} vacunas`);

  // Sin resumen no se inventan ceros: "0 tutores · 0 mascotas" afirma que
  // no entró nada, y en una fila de 'en_curso' eso es justo lo que no se
  // sabe.
  if (partes.length === 0) return 'No quedó registro de qué traía el archivo';
  return partes.join(' · ');
}

export default function Importaciones() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  // Por id: 'deshaciendo' | { conservadas: [], estado } | { error }
  const [accion, setAccion] = useState({});

  const cargar = () => {
    listarImportaciones().then(setFilas).catch((e) => setError(e.message));
  };

  useEffect(cargar, []);

  const hacerDeshacer = async (id) => {
    // Es la única acción destructiva de todo el importador y la única que
    // pide confirmar. No es ceremonia: borra clientes, y el botón está en
    // una lista donde el de al lado es de otra importación.
    const ok = window.confirm(
      'Voy a borrar los clientes y las mascotas que entraron por este archivo. ' +
      'Las que tengan consultas o citas escritas después NO las borro. ¿Sigo?',
    );
    if (!ok) return;

    setAccion((a) => ({ ...a, [id]: 'deshaciendo' }));
    try {
      const d = await deshacer(id);
      setAccion((a) => ({ ...a, [id]: d }));
      cargar(); // el estado de la fila cambió en la base
    } catch (e) {
      setAccion((a) => ({ ...a, [id]: { error: e.message } }));
    }
  };

  if (error) return <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>;
  if (!filas) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cargando…</p>;
  if (filas.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Todavía no importaste ningún archivo. Cuando lo hagas, acá va a quedar
        qué entró y de qué archivo salió, y vas a poder deshacerlo.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {filas.map((imp) => {
        const est = ESTADOS[imp.estado] ?? { texto: imp.estado, tono: 'neutral' };
        const a = accion[imp.id];
        const sePuedeDeshacer = imp.estado === 'listo' || imp.estado === 'en_curso';
        const conservadas = a && a.conservadas ? textoConservadas(a.conservadas) : [];

        return (
          <div key={imp.id} style={{
            padding: '10px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {imp.archivo}
                  {imp.hoja && <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}> · {imp.hoja}</span>}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {new Date(imp.creado_en).toLocaleString('es-CO', FECHA)} · {lineaResumen(imp)}
                </p>
              </div>
              <Badge tone={est.tono} size="sm">{est.texto}</Badge>
              {sePuedeDeshacer && (
                <Button
                  variant="secondary" size="sm"
                  disabled={a === 'deshaciendo'}
                  onClick={() => hacerDeshacer(imp.id)}
                >
                  {a === 'deshaciendo' ? 'Deshaciendo…' : 'Deshacer'}
                </Button>
              )}
            </div>

            {/* Una fila sin terminar se explica, no se deja ahí con una
                etiqueta amarilla. Es el caso más confuso que puede ver la
                clínica: no sabe si sus clientes entraron o no. */}
            {imp.estado === 'en_curso' && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Esta importación se cortó sin confirmar que terminó. Puede que los
                clientes hayan entrado y puede que no: miralo en tu lista de
                clientes. Si están duplicados, dale a Deshacer.
              </p>
            )}

            {a?.error && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--danger)' }}>{a.error}</p>
            )}

            {a && a.estado && (
              <div style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Borré {a.tutores_borrados} tutores y {a.mascotas_borradas} mascotas.
                  {a.campos_restaurados > 0 && <> Devolví {a.campos_restaurados} datos a como estaban.</>}
                </p>
                {/* La frase que explica por qué no borró todo. Sin esto, la
                    clínica cree que Deshacer falló; lo que pasó es que NO
                    borró el trabajo clínico que ella escribió después. */}
                {conservadas.length > 0 && (
                  <>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600 }}>
                      {conservadas.length} mascota{conservadas.length === 1 ? '' : 's'} no las borré:
                    </p>
                    <ul style={{ margin: '2px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {conservadas.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                      Borrarlas se habría llevado esas consultas y esas citas.
                      Se quedaron, y sus dueños también.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Montar en Configuración**

En `frontend/src/pages/Configuracion.jsx`, pestaña `datos`, **debajo** del
`ConfigSection` de "Importar base de clientes" de la tarea 11 y **arriba** de
`<SeccionDatos />`:

```jsx
                <ConfigSection
                  title="Archivos que importaste"
                  subtitle="Qué entró, de qué archivo salió, y cómo deshacerlo"
                >
                  <Importaciones />
                </ConfigSection>
```

Y el import:

```jsx
import Importaciones from '../importador/Importaciones.jsx';
```

- [ ] **Step 5: Correr los tests**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run
```

Esperado: PASAN todos. El historial agrega 6.

- [ ] **Step 6: Probar a mano contra la cuenta de pruebas**

**Con `emmanuelvargas1722@gmail.com`.** Importar, y después entrar a
`/app/configuracion?tab=datos`:

| Qué | Esperado |
|---|---|
| La fila | `Base Clientes.xlsx · Respuestas de formulario 1`, fecha y hora, `53 tutores · 54 mascotas · 74 baños · 13 vacunas` |
| La etiqueta | `Importada` en verde |
| Deshacer | pide confirmar primero |
| Después de deshacer | la etiqueta pasa a `Deshecha` y el botón desaparece |
| Con una consulta escrita antes de deshacer | `Deshecha en parte` en amarillo + la lista de las que no borró |

Para ver la fila de `'en_curso'` sin tener que cortar el wifi a mano, dejarla
a propósito en el SQL Editor:

```sql
-- Simula una importación que escribió y no alcanzó a responder, para ver
-- cómo se muestra. En la cuenta de PRUEBAS.
update public.importaciones set estado = 'en_curso', cerrado_en = null
where id = (
  select max(id) from public.importaciones
  where user_id = (select id from auth.users where email = 'emmanuelvargas1722@gmail.com')
);
```

Esperado en pantalla: etiqueta `Sin terminar` en amarillo, el párrafo que
explica que puede que hayan entrado y puede que no, y el botón de Deshacer
disponible.

- [ ] **Step 7: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/importador/Importaciones.jsx \
        frontend/src/importador/Importaciones.test.jsx \
        frontend/src/pages/Configuracion.jsx
git commit -m "Historial de importaciones, con deshacer tardío

El botón del paso 4 vive mientras la pestaña esté abierta. Cuando la
clínica se da cuenta mañana de que importó la hoja vieja, esta pantalla
es lo único que hay.

La línea de cada fila sale del resumen que guardó el paso 3, no de lo
que escribió Postgres. Suena peor y es mejor: seis meses después la
pregunta es \"qué decía el archivo que subí\", y eso es justo lo que
guarda esa columna. De ahí sale la respuesta a \"¿por qué Nube no tiene
fecha de nacimiento?\" sin que nadie tenga que adivinar.

Sin resumen no se inventan ceros. \"0 tutores · 0 mascotas\" afirma que
no entró nada, y en una fila sin terminar eso es exactamente lo que no
se sabe.

'deshecho_parcial' no dice lo mismo que 'deshecho': hay que poder ver de
un vistazo cuál dejó mascotas atrás, porque esas siguen en la base con
sus dueños.

Las filas en en_curso se explican en vez de quedar con una etiqueta
amarilla. Son las que escribieron y no alcanzaron a responder, y es el
caso más confuso que puede ver la clínica: no sabe si sus clientes
entraron.

Deshacer pide confirmar. Es la única acción destructiva del importador y
está en una lista donde el botón de al lado es de otro archivo."
```

---

## Tarea 15: Verificar todo junto y desplegar

**Files:**
- Modify: `.gitignore` (asegurar que ni el `.xlsx` ni el `.csv` de La Huella puedan entrar)
- Modify: `frontend/package.json` (dejar `npm test` escrito, no solo `npx vitest`)
- Test: todos los existentes, corridos juntos

**Interfaces:**
- Consumes: todo lo de las tareas 1–14
- Produces: nada de código nuevo. Produce la respuesta a "¿esto funciona?"

### Por qué esta tarea existe como tarea

Las catorce anteriores verifican cada pieza por su lado, cada una contra su
propio test. Esta verifica lo que ninguna puede: que las piezas juntas
escriben en una base de verdad lo mismo que el script de terminal escribía,
y que lo que está desplegado es lo que se probó.

Lo último no es un detalle. En este proyecto ya pasó: el apartado de la
cédula estuvo "listo" dos días y no se veía, y el problema no era el código
—era que lo desplegado era de antes.

- [ ] **Step 1: Blindar el `.gitignore`**

El `.xlsx` de La Huella tiene cédula, teléfono y dirección de casa de 53
personas que no son clientes nuestros. Verificar que no haya forma de
commitearlo por accidente:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
cat .gitignore | grep -n "importar\|xlsx\|csv\|\.sql"
```

Hoy el archivo ya trae `importar/*.csv`, `importar/*.sql` y
`importar/revisar.md`, con el comentario que explica por qué. **Faltan
`.xlsx` y `.xls`**, y son justo los que importan ahora: el `.csv` era el
convertido por el script de Python, y lo que la clínica baja de Google
Sheets —y lo que la pantalla nueva lee directo— es el `.xlsx`.

Agregar dos líneas al bloque que ya existe, debajo de `importar/*.csv`:

```
importar/*.xlsx
importar/*.xls
```

Y en el comentario de ese bloque, donde dice "El CSV que exporta la
veterinaria y el SQL que sale de armar-sql.mjs", nombrar también el `.xlsx`.

`importar/revisar.md` ya está cubierto, y es correcto que lo esté: ese
informe trae nombres y teléfonos completos de los 53.

Confirmar que git no los ve:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git status --short importar/
```

Esperado: solo los `.mjs`, el `.py` y el `README` si existe. **Ningún
`.xlsx`, `.csv`, `.sql` ni `revisar.md`.** Si aparece alguno, pararse acá.

- [ ] **Step 2: Correr la suite entera**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npx vitest run
```

Esperado: todos verdes. Al día de esta tarea el total sale de:

| Archivo | Tests |
|---|---|
| `nucleo/normalizar.test.js` | las tareas 1 y 2 |
| `nucleo/mapear.test.js` | tarea 3 |
| `nucleo/agrupar.test.js` | tarea 4 |
| `leerXlsx.test.js` | tarea 8 |
| `nucleo/plan.test.js` | 23 (tarea 9) |
| `escribir.test.js` | 9 (tarea 10) |
| `paso2Columnas.test.jsx` | 6 (tarea 11) |
| `paso3Revisar.test.jsx` | 7 (tarea 12) |
| `textos.test.js` | 12 (tarea 13) |
| `Importaciones.test.jsx` | 6 (tarea 14) |

Si alguno falla, **no seguir**. Un test rojo acá es una pieza que cambió
de forma a mitad del plan y la pieza de al lado todavía la llama como era.

- [ ] **Step 3: Dejar `npm test` escrito**

En `frontend/package.json`, en `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Para que el que venga después no tenga que saber que la herramienta se
llama vitest.

- [ ] **Step 4: Verificar que el script de terminal sigue dando lo mismo**

Es la única prueba que compara el núcleo nuevo contra un resultado conocido
de antes del refactor. La tarea 5 la hizo una vez; se repite acá porque
entre la 5 y la 14 el núcleo cambió nueve veces.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
node importar/armar-sql.mjs --cuenta=emmanuelvargas1722@gmail.com importar/base.csv
diff /tmp/referencia_antes.sql importar/datos_emmanuelvargas1722.sql && echo "IDÉNTICO"
```

Esperado: `IDÉNTICO`. Si hay diferencias, mirarlas una por una: una línea
distinta puede ser una mejora intencional de alguna tarea, pero tiene que
poder nombrarse. "Cambió algo y no sé qué" no pasa.

Si `/tmp/referencia_antes.sql` ya no existe (se reinició la máquina), se
regenera desde el commit anterior a la tarea 5:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git stash
git log --oneline -- importar/armar-sql.mjs | tail -3
# tomar el hash del commit anterior al refactor
git show <hash>:importar/armar-sql.mjs > /tmp/armar-sql-viejo.mjs
node /tmp/armar-sql-viejo.mjs --cuenta=emmanuelvargas1722@gmail.com importar/base.csv
mv importar/datos_emmanuelvargas1722.sql /tmp/referencia_antes.sql
git stash pop
```

- [ ] **Step 5: Los seis casos contra Postgres de verdad**

Son los del spec §8. Van en el SQL Editor de Supabase, **sobre
`emmanuelvargas1722@gmail.com`**, nunca sobre la cuenta de la clínica.

Los bloques completos ya están escritos en la tarea 7 (A a E) y se corren
desde ahí. Acá va el que falta —el 1 y el 3 del spec, que son de pantalla y
no de SQL— y la verificación de que los cinco anteriores siguen pasando
después de los cambios de las tareas 8 a 14:

```sql
-- Los cinco bloques de la tarea 7, uno detrás del otro. Cada uno aborta su
-- propia transacción con `raise exception`, así que no dejan nada: se
-- pueden correr las veces que haga falta.
--
-- Esperado, en el mensaje de error de cada bloque:
--   A → tutores=1 mascotas=1 tratamientos=1 repetidos=1
--   B → cedula completada, telefono intacto, anteriores con el null
--   C → tutores escritos=0
--   D → estado=deshecho_parcial, conservadas=1
--   E → campos_restaurados=2, segundo deshacer rechazado
```

Y los dos de pantalla, en la app con `npm run dev`:

| # del spec | Qué | Esperado |
|---|---|---|
| 1 · Idempotencia | subir el mismo archivo dos veces | el segundo paso 3 dice `0 tutores · 0 mascotas` y el botón no aparece |
| 3 · No pisar | cambiar a mano el teléfono de un tutor importado, reimportar | el teléfono queda como lo dejó la clínica; el paso 3 no cuenta ese tutor en "les completo" |

El caso 3 es el que más importa de los dos: un import que pisa un dato que
la veterinaria corrigió a mano le enseña a no volver a corregir nada.

- [ ] **Step 6: Los cinco casos a mano**

Son los del spec §8 "A mano", con una corrección.

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run dev
```

| Qué | Esperado |
|---|---|
| Un `.xlsx` de varias hojas | las muestra con las filas CON DATOS de cada una; la vacía queda apagada |
| Cambiar un mapeo que adivinó mal | el ejemplo de la derecha cambia de columna; mandar dos columnas al mismo campo libera la primera |
| Los dudosos | aparecen con "Son dos personas distintas" ya marcado |
| Las filas descartadas | se **ven** detrás de "Ver las 3 filas que no voy a importar" |
| ~~Barra de progreso~~ | **no hay, y es a propósito** |

**La corrección:** el spec pedía barra de progreso en un archivo grande. No
la hay. La escritura es **una sola llamada** —una transacción, por diseño— y
no hay progreso que reportar: una barra que avanza sola es una animación que
miente. Queda un indicador girando, que es lo que ya usa el resto de la app.

El día que un archivo de 3.000 filas haga que esa llamada tarde un minuto,
la respuesta no es una barra falsa: es partir el envío en lotes, y eso
rompería la transacción. Es una decisión a tomar con datos, no ahora.

- [ ] **Step 7: Mirar la ficha de un cliente importado**

Lo que ninguna prueba de arriba cubre: que los datos **se vean bien** en las
pantallas que ya existían. El importador puede escribir perfecto y la ficha
mostrar "Recién nacido" en un perro de ocho años.

Con el import hecho, en `/app/mascotas`:

| Qué mirar | Esperado |
|---|---|
| Una mascota con fecha de nacimiento | la edad calculada, no 0 |
| Nube y Pinina (sin fecha) | sin edad, no "0 años"; la ficha no miente |
| Diana Pinzon | sus dos mascotas, Noah y Noah Emiliano, separadas |
| Clara Ines Villamizar | el botón de WhatsApp apagado, no un enlace roto |
| Un tutor con dos teléfonos | los dos se ven; el de WhatsApp es el primero |
| Una cédula | `1000000200`, **sin** el `.0` y **sin** el cero de más |
| `/app/recordatorios` | las próximas dosis de las 13 vacunas importadas |

- [ ] **Step 8: Correr las migraciones en producción**

Las tres migraciones nuevas, en el SQL Editor de Supabase, **en este orden**:

```
012_importaciones.sql
013_aplicar_importacion.sql
014_deshacer_importacion.sql
```

La 013 y la 014 no pueden correr antes de la 012: las dos leen y escriben
`importaciones`, y la columna `importacion_id` de las cuatro tablas la crea
la 012.

Verificar que quedaron:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('aplicar_importacion','deshacer_importacion');

select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'aplicar_importacion';
```

Esperado: las dos funciones, y `authenticated` con `EXECUTE`. **`PUBLIC` no
tiene que aparecer** — una función es ejecutable por `PUBLIC` por defecto, y
el `revoke` de la tarea 7 es lo que lo saca.

- [ ] **Step 9: Build y deploy**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend"
npm run build
cd ..
npx wrangler deploy
```

- [ ] **Step 10: Verificar en producción, no en localhost**

Es el paso que ya se olvidó una vez en este proyecto. El apartado de la
cédula estuvo "listo" dos días sin verse, y el código estaba bien: lo
desplegado era de antes.

Entrar a `https://vetaapp.veta-co.workers.dev/app/configuracion?tab=datos`
con `emmanuelvargas1722@gmail.com`:

| Qué | Esperado |
|---|---|
| La pestaña Datos | aparece "Importar base de clientes" y "Archivos que importaste" |
| El botón | lleva a `/app/importar` y la pantalla carga (no 404 de Workers) |
| Subir el archivo | el paso 1 cuenta las filas con datos |
| El historial | la importación de las pruebas, con su resumen |

El 404 es el riesgo real acá: `/app/importar` es una ruta nueva de React
Router, y Workers tiene que servir el `index.html` para cualquier ruta que
no sea un archivo. Si da 404, no es el importador: es la regla de rewrite
del Worker, y las otras rutas de `/app/*` ya funcionan, así que se arregla
mirando cómo están configuradas ellas.

- [ ] **Step 11: Borrar la copia de prueba de los datos de La Huella**

```sql
-- La cuenta de pruebas tiene las cédulas, los teléfonos y las direcciones
-- de casa de 53 personas reales. Terminadas las pruebas, salen.
--
-- La cascada de 001_init.sql se lleva mascotas, tratamientos, vacunas,
-- citas e historias.
--
-- LEER DOS VECES EL CORREO ANTES DE CORRER ESTO.
delete from public.duenos
where user_id = (select id from auth.users where email = 'emmanuelvargas1722@gmail.com');

delete from public.importaciones
where user_id = (select id from auth.users where email = 'emmanuelvargas1722@gmail.com');
```

**Esto no se corre sin preguntarle a Emmanuel primero.** Esa cuenta es su
banco de pruebas y puede querer seguir usándola. Pero no se deja ahí para
siempre: son datos de gente real en una cuenta que existe para probar cosas.

- [ ] **Step 12: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add .gitignore frontend/package.json
git commit -m "Cierra el importador: npm test, gitignore blindado y deploy

El .gitignore cubre las tres formas en que la base de La Huella puede
entrar al repo: el .xlsx, el .csv convertido y el .sql generado. Y
revisar.md, que trae nombres y teléfonos completos de los 53.

npm test escrito en package.json para que el que venga después no tenga
que saber que la herramienta se llama vitest.

Verificado en producción y no en localhost. En este proyecto ya pasó una
vez que algo estuvo listo dos días sin verse, y el código estaba bien:
lo desplegado era de antes."
```
