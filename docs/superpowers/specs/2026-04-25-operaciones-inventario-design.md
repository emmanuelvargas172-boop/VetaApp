# Diseño: Módulo Operaciones — Inventario — VetaApp

**Fecha:** 2026-04-25  
**Estado:** Aprobado  

---

## Contexto

VetaApp es un software de gestión para clínicas veterinarias pequeñas en Colombia. Stack: React + Tailwind + Node.js + SQLite. Este módulo agrega la sección "Operaciones" al sidebar con la primera subsección: Inventario de productos. La segunda subsección (Facturación) se construirá en un ciclo separado.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Navegación | Un item "Operaciones" en sidebar → `/operaciones` → `Operaciones.jsx` |
| Layout | Tabla con filtro por categoría + panel lateral deslizable (mismo patrón que Citas/Historias) |
| Badge sidebar | Badge rojo con conteo de productos agotados/por agotarse |
| Sub-nav Facturación | Se agrega en el ciclo siguiente; por ahora `/operaciones` = Inventario directo |
| Integración Historia Clínica | Autocomplete en campo medicamentos → descuenta al guardar |
| Stock negativo | Permitido — no bloquea el guardado, solo advierte |

---

## Base de datos

### Nueva tabla: `inventario`

```sql
CREATE TABLE IF NOT EXISTS inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  cantidad_minima INTEGER NOT NULL DEFAULT 0,
  precio_compra REAL,
  precio_venta REAL,
  unidad TEXT NOT NULL DEFAULT 'unidad',
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
```

**Categorías válidas:** Medicamentos, Vacunas, Antiparasitarios, Accesorios, Alimentos, Otros

**Unidades válidas:** unidad, caja, frasco, ampolla

**Estado calculado (frontend y backend):**
- `cantidad === 0` → "Agotado" (badge rojo)
- `cantidad > 0 && cantidad <= cantidad_minima` → "Por agotarse" (badge ámbar)
- `cantidad > cantidad_minima` → "OK" (badge verde)

### Migración: `historias_clinicas`

```sql
ALTER TABLE historias_clinicas ADD COLUMN medicamentos_ids TEXT;
-- JSON array de IDs de inventario descontados en esta consulta
-- Ejemplo: "[1, 3, 5]"
```

---

## Backend

### Archivo: `backend/src/routes/inventario.js`

**Endpoints:**

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Todos los productos, ordenados por nombre |
| POST | `/` | Crear producto |
| PUT | `/:id` | Editar producto |
| DELETE | `/:id` | Eliminar producto |
| GET | `/alertas` | `{ count: N }` — productos con cantidad ≤ cantidad_minima (incluye agotados) |
| GET | `/buscar?q=texto` | Búsqueda por nombre (LIKE %q%) para autocomplete, retorna máx. 8 resultados |
| POST | `/:id/ajustar` | `{ delta: -1 }` — ajusta cantidad; permite negativo |

### Registro en `server.js`

```js
app.use('/api/inventario', require('./routes/inventario'));
```

---

## Frontend

### Archivos

| Acción | Archivo | Descripción |
|---|---|---|
| Crear | `frontend/src/pages/Operaciones.jsx` | Módulo completo de inventario |
| Modificar | `frontend/src/components/Sidebar.jsx` | Nuevo item + badge rojo |
| Modificar | `frontend/src/App.jsx` | Nueva ruta `/operaciones` |
| Modificar | `frontend/src/pages/Historias.jsx` | Autocomplete en campo medicamentos |

### Sidebar

- Nuevo item: `{ path: '/operaciones', icon: Package, label: 'Operaciones' }`
- Al montar el Sidebar: `GET /api/inventario/alertas` → guarda `alertaCount` en estado local
- Si `alertaCount > 0`: badge rojo `bg-red-500 text-white` superpuesto sobre el ícono, con el número

### Routing en App.jsx

```jsx
import Operaciones from './pages/Operaciones';
// ...
<Route path="/operaciones" element={<Operaciones />} />
```

---

## Vista: Operaciones.jsx

### Estado local

```
productos[]        — lista completa del API
filtroCategoria    — string ('Todos' | categoría)
cargando           — boolean
error              — boolean
panelAbierto       — boolean
productoEditando   — objeto | null
guardando          — boolean
errorPanel         — string
formProducto       — { nombre, categoria, unidad, cantidad, cantidad_minima, precio_compra, precio_venta }
```

### Flujo de datos

- Montaje: `GET /api/inventario` → carga todos los productos
- Filtro por categoría: local
- CRUD: POST/PUT/DELETE → recarga lista
- Delete: `window.confirm()` → `DELETE /api/inventario/:id`

### UI — Encabezado

```
[📦 Inventario]                    [+ Agregar producto]
[Todos] [Medicamentos] [Vacunas] [Antiparasitarios] [Accesorios] [Alimentos] [Otros]
```

Pills de filtro: activa = `bg-verde-oscuro text-white`, inactiva = `bg-white border text-gray-600`.

### UI — Tabla

Columnas: Producto | Categoría | Stock | Mín. | P. Compra | P. Venta | Estado | Acciones

- Filas zebra: filas impares `bg-white`, pares `bg-gray-50`
- Hover: `hover:bg-verde-fondo`
- Columna "Estado": badge coloreado calculado en frontend
- Columna "Acciones": ✏️ y 🗑️ visibles en hover (`opacity-0 group-hover:opacity-100`)
- Precios formateados como pesos colombianos: `toLocaleString('es-CO')`

### Estado vacío

```
[ícono Package grande]
Sin productos registrados
Agrega el primer producto al inventario
[+ Agregar producto]
```

### Panel lateral

Mismo patrón que Citas e Historias: `fixed top-0 right-0 h-full w-96 z-40`, animación `translate-x-full → translate-x-0`.

**Formulario:**

| Campo | Tipo | Requerido |
|---|---|---|
| Nombre | `input text` | ✓ |
| Categoría | `select` | ✓ |
| Unidad | `select` (unidad / caja / frasco / ampolla) | ✓ |
| Cantidad actual | `input number min=0 step=1` | ✓ |
| Cantidad mínima | `input number min=0 step=1` | ✓ |
| Precio de compra | `input number min=0 step=0.01` | — |
| Precio de venta | `input number min=0 step=0.01` | — |

Título dinámico: "Nuevo Producto" / "Editar Producto".

---

## Integración Historia Clínica

### Cambios en `Historias.jsx`

El campo `medicamentos` del formulario de consulta (`HistorialMascota`) cambia de `<textarea>` a un **tag-input con autocomplete**:

**Estado adicional en `HistorialMascota`:**
```
medicamentosSeleccionados[]  — [{ id, nombre }] — productos del inventario elegidos
medicamentosBusqueda         — string — texto del input de búsqueda
medicamentosSugerencias[]    — resultados del API de búsqueda
```

**Comportamiento:**

1. Usuario escribe en el input → debounce 300ms → `GET /api/inventario/buscar?q=texto`
2. Dropdown muestra hasta 8 sugerencias con nombre y cantidad actual
3. Clic en sugerencia → agrega a `medicamentosSeleccionados` como tag, limpia el input
4. Cada tag tiene botón `×` para quitarlo
5. El usuario también puede escribir texto libre (sin seleccionar) — se guarda como texto en `medicamentos`

**Al guardar (`guardarConsulta`):**
```js
const payload = {
  // ...campos existentes...
  medicamentos: [
    ...medicamentosSeleccionados.map(m => m.nombre),
    formC.medicamentos,        // texto libre adicional
  ].filter(Boolean).join(', '),
  medicamentos_ids: JSON.stringify(medicamentosSeleccionados.map(m => m.id)),
};
// Después de POST/PUT exitoso, el backend descuenta automáticamente
```

**Backend — POST en `historias.js`:**

Al recibir `medicamentos_ids`, el backend hace un bucle:
```js
const ids = JSON.parse(req.body.medicamentos_ids || '[]');
for (const id of ids) {
  db.prepare(`UPDATE inventario SET cantidad = cantidad - 1 WHERE id = ?`).run(id);
}
```

**Para PUT (edición):** no se descuenta inventario. Si el veterinario edita una consulta ya guardada, el stock no se modifica. El descuento solo ocurre al crear una consulta (POST).

**Advertencia de stock bajo:** si algún producto queda con `cantidad <= 0` después del descuento, el backend devuelve `warnings: ["Amoxicilina quedó sin stock"]` en el response. El frontend muestra un banner ámbar temporal.

---

## Manejo de errores

- Carga del inventario falla: banner ámbar + tabla vacía
- POST/PUT falla: error inline en panel, panel permanece abierto
- DELETE falla: `alert()` simple
- Ajuste de stock falla: log en consola, no bloquea la consulta (la historia se guarda igual)
- Búsqueda de autocomplete falla: dropdown no aparece (no bloquea el formulario)

---

## Consideraciones de diseño

- El badge del sidebar se carga al montar el `Sidebar` y se refresca después de cualquier operación de inventario (crear/editar/eliminar producto) y después de guardar una consulta con medicamentos del inventario
- El stock puede quedar negativo — la clínica debe corregirlo manualmente editando la cantidad
- No hay historial de movimientos de stock en esta versión (YAGNI)
- No hay ajuste manual de stock desde el formulario de inventario — el stock solo cambia vía Historia Clínica o editando el producto directamente
