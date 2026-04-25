# Operaciones — Inventario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo Inventario bajo "Operaciones": CRUD de productos con stock, alertas de nivel bajo, badge en sidebar, y autocomplete en Historia Clínica que descuenta inventario al prescribir.

**Architecture:** Backend Express con `node:sqlite` (`DatabaseSync`). Nueva tabla `inventario` + migración `medicamentos_ids` en `historias_clinicas`. Frontend React 18 + Tailwind: `Operaciones.jsx` (tabla + panel lateral), badge en `Sidebar.jsx`, tag-input autocomplete en `Historias.jsx`.

**Tech Stack:** Node.js 22 + `node:sqlite` (DatabaseSync, NOT better-sqlite3), React 18, react-router-dom v6, Tailwind CSS 3, lucide-react, axios (instancia en `frontend/src/api/axios.js` con baseURL `/api`).

---

## Archivos

| Acción | Archivo | Descripción |
|---|---|---|
| Modificar | `backend/src/database/db.js` | Nueva tabla `inventario` + migración `medicamentos_ids` |
| Crear | `backend/src/routes/inventario.js` | CRUD + alertas + búsqueda + ajuste de stock |
| Modificar | `backend/src/server.js` | Registrar `/api/inventario` |
| Modificar | `backend/src/routes/historias.js` | POST descuenta inventario; PUT guarda `medicamentos_ids` |
| Modificar | `frontend/src/App.jsx` | Ruta `/operaciones` |
| Modificar | `frontend/src/components/Sidebar.jsx` | Item Operaciones + badge rojo |
| Crear | `frontend/src/pages/Operaciones.jsx` | Módulo inventario completo |
| Modificar | `frontend/src/pages/Historias.jsx` | Tag-input autocomplete en campo medicamentos |

---

## Contexto del proyecto

**`node:sqlite` pattern** (DatabaseSync — síncrono, NO better-sqlite3):
```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, '../../vetaapp.db'));
db.prepare('SELECT * FROM tabla WHERE id = ?').get(id);    // → objeto o undefined
db.prepare('SELECT * FROM tabla').all();                    // → array
db.prepare('INSERT INTO tabla ...').run(...);               // → { lastInsertRowid, changes }
```

**Tailwind custom classes** (en `frontend/src/index.css`):
- `.card` → `bg-white rounded-xl shadow-sm border border-gray-100`
- `.btn-primary` → botón verde con flex + gap
- `.btn-secondary` → botón blanco con borde
- `.input` → campo con focus ring verde
- `.label` → label gris pequeño

**Colores custom** (`tailwind.config.js`): `verde-oscuro` #1B4332, `verde-claro` #40916C, `verde-fondo` (fondo verde suave).

---

### Task 1: DB — tabla inventario y migración historias_clinicas

**Archivos:**
- Modify: `backend/src/database/db.js`

- [ ] **Step 1: Leer db.js**

Leer el archivo actual para ubicar la línea donde termina el bloque `db.exec(...)` del CREATE TABLE y donde está `module.exports = db;`.

- [ ] **Step 2: Agregar CREATE TABLE inventario**

En `backend/src/database/db.js`, dentro del bloque `db.exec(` existente que tiene `CREATE TABLE IF NOT EXISTS citas`, agregar la tabla `inventario` al final (antes del cierre `` ` `` y `);`):

```js
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

El bloque `db.exec(`` ` ``)` completo ahora termina con la tabla `inventario` antes del cierre.

- [ ] **Step 3: Agregar migración medicamentos_ids**

Después del bloque try/catch existente que agrega `peso` (líneas ~72-77), agregar:

```js
// Migración: campo medicamentos_ids en historias_clinicas
try {
  db.exec(`ALTER TABLE historias_clinicas ADD COLUMN medicamentos_ids TEXT`);
} catch (err) {
  if (!err.message.includes('duplicate column name')) throw err;
}
```

- [ ] **Step 4: Verificar que el backend arranca sin errores**

```bash
lsof -ti :3001 | xargs kill -9 2>/dev/null; sleep 1
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run dev --prefix backend &
sleep 3
curl -s http://localhost:3001/api/mascotas | python3 -c "import sys,json; print('OK mascotas:', len(json.load(sys.stdin)))"
```

Esperado: `OK mascotas: N` (número, sin errores).

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add backend/src/database/db.js
git commit -m "feat(inventario): tabla inventario y migracion medicamentos_ids"
```

---

### Task 2: Backend — routes/inventario.js

**Archivos:**
- Create: `backend/src/routes/inventario.js`

- [ ] **Step 1: Crear el archivo**

Crear `backend/src/routes/inventario.js` con el siguiente contenido:

```js
const express = require('express');
const router = express.Router();
const db = require('../database/db');

// IMPORTANT: rutas específicas ANTES de /:id para evitar colisiones

router.get('/alertas', (req, res) => {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM inventario WHERE cantidad <= cantidad_minima`
  ).get();
  res.json({ count: row.count });
});

router.get('/buscar', (req, res) => {
  const q = req.query.q || '';
  const productos = db.prepare(
    `SELECT id, nombre, cantidad, unidad FROM inventario WHERE nombre LIKE ? ORDER BY nombre LIMIT 8`
  ).all(`%${q}%`);
  res.json(productos);
});

router.get('/', (req, res) => {
  const productos = db.prepare(`SELECT * FROM inventario ORDER BY nombre`).all();
  res.json(productos);
});

router.post('/', (req, res) => {
  const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
  if (!nombre || !categoria || cantidad == null || cantidad_minima == null || !unidad) {
    return res.status(400).json({ error: 'Nombre, categoría, unidad, cantidad y cantidad mínima son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO inventario (nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nombre, categoria, parseInt(cantidad), parseInt(cantidad_minima), precio_compra ?? null, precio_venta ?? null, unidad);
  res.status(201).json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { nombre, categoria, cantidad, cantidad_minima, precio_compra, precio_venta, unidad } = req.body;
  const result = db.prepare(
    `UPDATE inventario SET nombre=?, categoria=?, cantidad=?, cantidad_minima=?, precio_compra=?, precio_venta=?, unidad=? WHERE id=?`
  ).run(nombre, categoria, parseInt(cantidad), parseInt(cantidad_minima), precio_compra ?? null, precio_venta ?? null, unidad, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM inventario WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ mensaje: 'Producto eliminado correctamente' });
});

router.post('/:id/ajustar', (req, res) => {
  const { delta } = req.body;
  if (delta == null) return res.status(400).json({ error: 'delta es requerido' });
  const result = db.prepare(
    `UPDATE inventario SET cantidad = cantidad + ? WHERE id = ?`
  ).run(parseInt(delta), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(db.prepare(`SELECT * FROM inventario WHERE id = ?`).get(req.params.id));
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

Leer `backend/src/server.js`. Después de la línea `app.use('/api/recordatorios', ...)`, agregar:

```js
app.use('/api/inventario', require('./routes/inventario'));
```

- [ ] **Step 3: Verificar endpoints**

```bash
lsof -ti :3001 | xargs kill -9 2>/dev/null; sleep 1
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run dev --prefix backend &
sleep 3

# GET /
curl -s http://localhost:3001/api/inventario | python3 -c "import sys,json; print('GET /:', json.load(sys.stdin))"

# GET /alertas
curl -s http://localhost:3001/api/inventario/alertas | python3 -c "import sys,json; print('alertas:', json.load(sys.stdin))"

# POST — crear producto de prueba
PROD=$(curl -s -X POST http://localhost:3001/api/inventario \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Amoxicilina 500mg","categoria":"Medicamentos","cantidad":10,"cantidad_minima":3,"precio_compra":5000,"precio_venta":8000,"unidad":"frasco"}')
echo "POST: $PROD"
PROD_ID=$(echo $PROD | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# GET /buscar
curl -s "http://localhost:3001/api/inventario/buscar?q=amox" | python3 -c "import sys,json; print('buscar:', json.load(sys.stdin))"

# POST /:id/ajustar
curl -s -X POST "http://localhost:3001/api/inventario/$PROD_ID/ajustar" \
  -H "Content-Type: application/json" \
  -d '{"delta":-1}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('ajustar, nueva cantidad:', d['cantidad'])"

# DELETE
curl -s -X DELETE "http://localhost:3001/api/inventario/$PROD_ID" | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

Esperado: cada llamada retorna datos correctos sin errores.

- [ ] **Step 4: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add backend/src/routes/inventario.js backend/src/server.js
git commit -m "feat(inventario): rutas CRUD inventario + alertas + buscar + ajustar"
```

---

### Task 3: Backend — actualizar historias.js para medicamentos_ids

**Archivos:**
- Modify: `backend/src/routes/historias.js`

- [ ] **Step 1: Leer historias.js**

Leer el archivo actual. Las secciones a modificar son:
- `router.post('/')` (líneas ~12-23)
- `router.put('/:id')` (líneas ~25-32)

- [ ] **Step 2: Reemplazar router.post('/')**

Reemplazar el bloque `router.post('/', ...)` completo con:

```js
router.post('/', (req, res) => {
  const { mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas, medicamentos_ids } = req.body;
  if (!mascota_id || !fecha || !motivo) {
    return res.status(400).json({ error: 'Mascota, fecha y motivo son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO historias_clinicas (mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas, medicamentos_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(mascota_id, fecha, motivo, diagnostico || null, tratamiento || null, medicamentos || null, veterinario || null, peso ?? null, notas || null, medicamentos_ids || null);

  // Descontar del inventario (solo en creación, no en edición)
  const ids = JSON.parse(medicamentos_ids || '[]');
  const warnings = [];
  for (const id of ids) {
    db.prepare(`UPDATE inventario SET cantidad = cantidad - 1 WHERE id = ?`).run(id);
    const producto = db.prepare(`SELECT nombre, cantidad FROM inventario WHERE id = ?`).get(id);
    if (producto && producto.cantidad <= 0) {
      warnings.push(`${producto.nombre} quedó sin stock`);
    }
  }

  const historia = db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ ...historia, warnings });
});
```

- [ ] **Step 3: Reemplazar router.put('/:id')**

Reemplazar el bloque `router.put('/:id', ...)` completo con:

```js
router.put('/:id', (req, res) => {
  const { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas, medicamentos_ids } = req.body;
  const result = db.prepare(
    `UPDATE historias_clinicas SET fecha=?, motivo=?, diagnostico=?, tratamiento=?, medicamentos=?, veterinario=?, peso=?, notas=?, medicamentos_ids=? WHERE id=?`
  ).run(fecha || null, motivo || null, diagnostico || null, tratamiento || null, medicamentos || null, veterinario || null, peso ?? null, notas || null, medicamentos_ids || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Historia no encontrada' });
  res.json(db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(req.params.id));
});
```

- [ ] **Step 4: Verificar integración**

```bash
lsof -ti :3001 | xargs kill -9 2>/dev/null; sleep 1
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run dev --prefix backend &
sleep 3

# Crear un producto de prueba
PROD=$(curl -s -X POST http://localhost:3001/api/inventario \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Prueba Test","categoria":"Medicamentos","cantidad":2,"cantidad_minima":1,"unidad":"unidad"}')
PROD_ID=$(echo $PROD | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Producto ID: $PROD_ID, cantidad inicial: 2"

# Obtener un mascota_id válido
MASCOTA_ID=$(curl -s http://localhost:3001/api/mascotas | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id']) if data else print(1)")

# POST consulta con medicamentos_ids
RESULT=$(curl -s -X POST http://localhost:3001/api/historias \
  -H "Content-Type: application/json" \
  -d "{\"mascota_id\":$MASCOTA_ID,\"fecha\":\"2026-04-25\",\"motivo\":\"Test descuento\",\"veterinario\":\"Dr. Test\",\"medicamentos_ids\":\"[$PROD_ID]\"}")
echo "POST historia result:"
echo $RESULT | python3 -c "import sys,json; d=json.load(sys.stdin); print('warnings:', d.get('warnings')); print('medicamentos_ids:', d.get('medicamentos_ids'))"

# Verificar que la cantidad bajó
curl -s "http://localhost:3001/api/inventario/$PROD_ID" 2>/dev/null || \
curl -s http://localhost:3001/api/inventario | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f\"Producto {p['id']}: cantidad={p['cantidad']}\") for p in data if p['id']==$PROD_ID]" 2>/dev/null || \
curl -s "http://localhost:3001/api/inventario/buscar?q=Prueba" | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'cantidad: {p[\"cantidad\"]}') for p in data]"

# Limpiar
HISTORIA_ID=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -X DELETE "http://localhost:3001/api/historias/$HISTORIA_ID" > /dev/null
curl -s -X DELETE "http://localhost:3001/api/inventario/$PROD_ID" > /dev/null
echo "Limpieza completa"
```

Esperado: `warnings: []` (cantidad 2 → 1, no llega a 0). Si se hubiera creado con cantidad 1, esperado: `warnings: ['Prueba Test quedó sin stock']`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add backend/src/routes/historias.js
git commit -m "feat(inventario): historias POST descuenta inventario via medicamentos_ids"
```

---

### Task 4: Frontend — App.jsx + Sidebar.jsx

**Archivos:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Actualizar App.jsx**

Leer `frontend/src/App.jsx`. Agregar el import de Operaciones y la ruta.

Reemplazar el contenido completo con:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Mascotas from './pages/Mascotas';
import Historias from './pages/Historias';
import Citas from './pages/Citas';
import Recordatorios from './pages/Recordatorios';
import Operaciones from './pages/Operaciones';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mascotas/*" element={<Mascotas />} />
            <Route path="/historias/*" element={<Historias />} />
            <Route path="/citas/*" element={<Citas />} />
            <Route path="/recordatorios" element={<Recordatorios />} />
            <Route path="/operaciones" element={<Operaciones />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Actualizar Sidebar.jsx**

Reemplazar el contenido completo de `frontend/src/components/Sidebar.jsx` con:

```jsx
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PawPrint, FileText, Calendar, Bell, Package } from 'lucide-react';
import api from '../api/axios';

const navItems = [
  { path: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/mascotas',      icon: PawPrint,         label: 'Mascotas' },
  { path: '/historias',     icon: FileText,          label: 'Historias' },
  { path: '/citas',         icon: Calendar,          label: 'Citas' },
  { path: '/recordatorios', icon: Bell,              label: 'Recordatorios' },
  { path: '/operaciones',   icon: Package,           label: 'Operaciones' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const [alertaCount, setAlertaCount] = useState(0);

  useEffect(() => {
    api.get('/inventario/alertas')
      .then(r => setAlertaCount(r.data.count))
      .catch(() => {});
  }, [pathname]);

  const isActive = (path) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <aside className="w-64 bg-verde-oscuro flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-3 border-b border-verde-medio/40">
        <div className="w-9 h-9 bg-verde-claro rounded-lg flex items-center justify-center">
          <PawPrint className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-white text-lg font-bold leading-none">VetaApp</span>
          <p className="text-green-400 text-xs mt-0.5">Gestión veterinaria</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
              isActive(path)
                ? 'bg-verde-claro text-white shadow-sm'
                : 'text-green-300 hover:bg-verde-medio/50 hover:text-white'
            }`}
          >
            <div className="relative flex-shrink-0">
              <Icon
                className={`w-5 h-5 ${isActive(path) ? 'text-white' : 'text-green-400 group-hover:text-white'}`}
                strokeWidth={isActive(path) ? 2.5 : 2}
              />
              {path === '/operaciones' && alertaCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {alertaCount > 9 ? '9+' : alertaCount}
                </span>
              )}
            </div>
            <span className="font-medium text-sm">{label}</span>
            {isActive(path) && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
            )}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-verde-medio/40">
        <p className="text-green-500 text-xs">VetaApp MVP v1.0</p>
        <p className="text-green-600 text-xs mt-0.5">© 2025</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Verificar frontend compila**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Esperado: `200`. Si el servidor no está corriendo:
```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp" && npm run dev --prefix frontend &
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(inventario): ruta operaciones y sidebar con badge alertas"
```

---

### Task 5: Frontend — Operaciones.jsx

**Archivos:**
- Create: `frontend/src/pages/Operaciones.jsx`

- [ ] **Step 1: Crear el archivo**

Crear `frontend/src/pages/Operaciones.jsx` con el siguiente contenido:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Loader2, AlertCircle, Package } from 'lucide-react';
import api from '../api/axios';

const CATEGORIAS = ['Medicamentos', 'Vacunas', 'Antiparasitarios', 'Accesorios', 'Alimentos', 'Otros'];
const UNIDADES   = ['unidad', 'caja', 'frasco', 'ampolla'];

function estadoBadge(cantidad, cantidad_minima) {
  if (cantidad === 0)                              return { cls: 'bg-red-100 text-red-700',    label: 'Agotado' };
  if (cantidad > 0 && cantidad <= cantidad_minima) return { cls: 'bg-amber-100 text-amber-700', label: 'Por agotarse' };
  return                                                { cls: 'bg-green-100 text-green-700',  label: 'OK' };
}

const FORM0 = {
  nombre: '', categoria: 'Medicamentos', unidad: 'unidad',
  cantidad: '', cantidad_minima: '', precio_compra: '', precio_venta: '',
};

export default function Operaciones() {
  const [productos, setProductos]       = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [error, setError]               = useState(false);
  const [filtroCategoria, setFiltro]    = useState('Todos');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [productoEditando, setEditando] = useState(null);
  const [guardando, setGuardando]       = useState(false);
  const [errorPanel, setErrorPanel]     = useState('');
  const [form, setForm]                 = useState(FORM0);

  const cargar = async () => {
    try {
      const { data } = await api.get('/inventario');
      setProductos(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    if (filtroCategoria === 'Todos') return productos;
    return productos.filter(p => p.categoria === filtroCategoria);
  }, [productos, filtroCategoria]);

  const abrirPanel = (producto = null) => {
    setEditando(producto);
    setErrorPanel('');
    setForm(producto ? {
      nombre: producto.nombre, categoria: producto.categoria, unidad: producto.unidad,
      cantidad: producto.cantidad, cantidad_minima: producto.cantidad_minima,
      precio_compra: producto.precio_compra ?? '', precio_venta: producto.precio_venta ?? '',
    } : FORM0);
    setPanelAbierto(true);
  };

  const cerrarPanel = () => { setPanelAbierto(false); setEditando(null); };
  const setF = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const guardar = async e => {
    e.preventDefault();
    if (!form.nombre || !form.categoria || !form.unidad || form.cantidad === '' || form.cantidad_minima === '') {
      setErrorPanel('Nombre, categoría, unidad, cantidad y cantidad mínima son requeridos.');
      return;
    }
    setGuardando(true); setErrorPanel('');
    try {
      const payload = {
        nombre: form.nombre, categoria: form.categoria, unidad: form.unidad,
        cantidad: parseInt(form.cantidad), cantidad_minima: parseInt(form.cantidad_minima),
        precio_compra: form.precio_compra !== '' ? parseFloat(form.precio_compra) : null,
        precio_venta:  form.precio_venta  !== '' ? parseFloat(form.precio_venta)  : null,
      };
      if (productoEditando) {
        await api.put(`/inventario/${productoEditando.id}`, payload);
      } else {
        await api.post('/inventario', payload);
      }
      cerrarPanel();
      await cargar();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar este producto? No se puede deshacer.')) return;
    try {
      await api.delete(`/inventario/${id}`);
      await cargar();
    } catch {
      alert('No se pudo eliminar el producto. Intenta de nuevo.');
    }
  };

  const formatPrecio = v => v != null ? `$${Number(v).toLocaleString('es-CO')}` : '—';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-400 text-sm mt-1">Control de productos y medicamentos</p>
        </div>
        <button onClick={() => abrirPanel()} className="btn-primary">
          <Plus className="w-4 h-4" /> Agregar producto
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">No se pudo cargar el inventario.</p>
        </div>
      )}

      {/* Filtros por categoría */}
      <div className="flex flex-wrap gap-2 mb-5">
        {['Todos', ...CATEGORIAS].map(cat => (
          <button
            key={cat}
            onClick={() => setFiltro(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              filtroCategoria === cat
                ? 'bg-verde-oscuro text-white border-verde-oscuro'
                : 'bg-white text-gray-600 border-gray-200 hover:border-verde-claro hover:text-verde-claro'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tabla / Estado */}
      {cargando ? (
        <div className="card p-16 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Cargando inventario...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-700">Sin productos registrados</p>
          <p className="text-gray-400 text-sm mt-1">Agrega el primer producto al inventario</p>
          <button onClick={() => abrirPanel()} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> Agregar producto
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mín.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">P. Compra</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">P. Venta</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const badge = estadoBadge(p.cantidad, p.cantidad_minima);
                return (
                  <tr
                    key={p.id}
                    className={`group border-b border-gray-50 hover:bg-verde-fondo transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-4 py-3 text-gray-500">{p.categoria}</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {p.cantidad} <span className="text-gray-400 font-normal text-xs">{p.unidad}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{p.cantidad_minima}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatPrecio(p.precio_compra)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatPrecio(p.precio_venta)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => abrirPanel(p)} className="p-1.5 rounded-lg hover:bg-verde-fondo text-gray-300 hover:text-verde-claro transition-colors" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => eliminar(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Overlay */}
      {panelAbierto && <div className="fixed inset-0 bg-black/30 z-30" onClick={cerrarPanel} />}

      {/* Panel lateral */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ${panelAbierto ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-verde-fondo rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-verde-claro" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{productoEditando ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          </div>
          <button onClick={cerrarPanel} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form id="form-producto" onSubmit={guardar} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorPanel && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{errorPanel}</div>
          )}
          <div>
            <label className="label">Nombre *</label>
            <input className="input" placeholder="Ej: Amoxicilina 500mg" value={form.nombre} onChange={setF('nombre')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría *</label>
              <select className="input" value={form.categoria} onChange={setF('categoria')}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unidad *</label>
              <select className="input" value={form.unidad} onChange={setF('unidad')}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cantidad actual *</label>
              <input type="number" min="0" step="1" className="input" placeholder="0" value={form.cantidad} onChange={setF('cantidad')} required />
            </div>
            <div>
              <label className="label">Cantidad mínima *</label>
              <input type="number" min="0" step="1" className="input" placeholder="5" value={form.cantidad_minima} onChange={setF('cantidad_minima')} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio compra <span className="text-gray-400 font-normal">(opc.)</span></label>
              <input type="number" min="0" step="0.01" className="input" placeholder="0.00" value={form.precio_compra} onChange={setF('precio_compra')} />
            </div>
            <div>
              <label className="label">Precio venta <span className="text-gray-400 font-normal">(opc.)</span></label>
              <input type="number" min="0" step="0.01" className="input" placeholder="0.00" value={form.precio_venta} onChange={setF('precio_venta')} />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={cerrarPanel} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button type="submit" form="form-producto" disabled={guardando} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {productoEditando ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar línea de conteo y compilación**

```bash
wc -l "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend/src/pages/Operaciones.jsx"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Esperado: más de 150 líneas y HTTP 200.

- [ ] **Step 3: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Operaciones.jsx
git commit -m "feat(inventario): Operaciones.jsx modulo inventario completo"
```

---

### Task 6: Frontend — Historias.jsx tag-input medicamentos

**Archivos:**
- Modify: `frontend/src/pages/Historias.jsx`

Este task modifica `HistorialMascota` para reemplazar el `<textarea>` de medicamentos con un tag-input que busca en inventario.

- [ ] **Step 1: Agregar nuevo estado en HistorialMascota**

Leer el archivo. Ubicar las líneas de estado dentro de `HistorialMascota` (buscar `const [panelAbierto`). Después de la línea `const [errorPanel, setErrorPanel] = useState('');`, agregar:

```jsx
  const [medSeleccionados, setMedSeleccionados] = useState([]);
  const [medBusqueda, setMedBusqueda]           = useState('');
  const [medSugerencias, setMedSugerencias]     = useState([]);
  const [medTimeoutId, setMedTimeoutId]         = useState(null);
  const [stockWarnings, setStockWarnings]       = useState([]);
```

- [ ] **Step 2: Agregar funciones del tag-input**

Después de la función `cerrarPanel` (buscar `const cerrarPanel = () => { setPanelAbierto(false); setConsultaEditando(null); };`), agregar:

```jsx
  const buscarMedicamentos = (q) => {
    setMedBusqueda(q);
    if (medTimeoutId) clearTimeout(medTimeoutId);
    if (!q.trim()) { setMedSugerencias([]); return; }
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get(`/inventario/buscar?q=${encodeURIComponent(q)}`);
        setMedSugerencias(data);
      } catch { setMedSugerencias([]); }
    }, 300);
    setMedTimeoutId(id);
  };

  const agregarMed = (med) => {
    if (!medSeleccionados.find(m => m.id === med.id)) {
      setMedSeleccionados(prev => [...prev, { id: med.id, nombre: med.nombre }]);
    }
    setMedBusqueda('');
    setMedSugerencias([]);
  };

  const quitarMed = (id) => setMedSeleccionados(prev => prev.filter(m => m.id !== id));
```

- [ ] **Step 3: Actualizar abrirPanelConsulta para resetear estado de medicamentos**

Encontrar la función `abrirPanelConsulta`. Actualmente empieza con:
```jsx
  const abrirPanelConsulta = (consulta = null) => {
    setConsultaEditando(consulta);
    setErrorPanel('');
    setFormC(consulta ? {
```

Reemplazarla con:
```jsx
  const abrirPanelConsulta = (consulta = null) => {
    setConsultaEditando(consulta);
    setErrorPanel('');
    setMedSeleccionados([]);
    setMedBusqueda('');
    setMedSugerencias([]);
    setFormC(consulta ? {
      fecha: consulta.fecha, motivo: consulta.motivo,
      diagnostico: consulta.diagnostico || '', tratamiento: consulta.tratamiento || '',
      medicamentos: consulta.medicamentos || '', veterinario: consulta.veterinario || '',
      peso: consulta.peso ?? '', notas: consulta.notas || '',
    } : FORM_C0);
    setPanelTipo('consulta');
    setPanelAbierto(true);
  };
```

- [ ] **Step 4: Actualizar guardarConsulta para incluir medicamentos_ids**

Encontrar la función `guardarConsulta`. La línea del payload actualmente tiene:
```jsx
        medicamentos: formC.medicamentos || null, veterinario: formC.veterinario,
```

Reemplazar el bloque `const guardarConsulta = async e => { ... }` completo con:

```jsx
  const guardarConsulta = async e => {
    e.preventDefault();
    if (!formC.fecha || !formC.motivo || !formC.veterinario) {
      setErrorPanel('Fecha, motivo y veterinario son requeridos.');
      return;
    }
    setGuardando(true); setErrorPanel('');
    try {
      const medicamentosTexto = [
        ...medSeleccionados.map(m => m.nombre),
        formC.medicamentos,
      ].filter(Boolean).join(', ');

      const payload = {
        mascota_id: mascotaId, fecha: formC.fecha, motivo: formC.motivo,
        diagnostico: formC.diagnostico || null, tratamiento: formC.tratamiento || null,
        medicamentos: medicamentosTexto || null, veterinario: formC.veterinario,
        peso: formC.peso ? parseFloat(formC.peso) : null, notas: formC.notas || null,
        medicamentos_ids: consultaEditando ? null : JSON.stringify(medSeleccionados.map(m => m.id)),
      };
      let resp;
      if (consultaEditando) {
        resp = await api.put(`/historias/${consultaEditando.id}`, payload);
      } else {
        resp = await api.post('/historias', payload);
      }
      const warnings = resp.data?.warnings || [];
      cerrarPanel();
      await cargarConsultas();
      if (warnings.length > 0) {
        setStockWarnings(warnings);
        setTimeout(() => setStockWarnings([]), 6000);
      }
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };
```

- [ ] **Step 5: Agregar banner de stockWarnings en el JSX**

En el JSX de `HistorialMascota`, buscar el bloque de pestañas (buscar `{/* Pestañas */}`). Inmediatamente **antes** de ese bloque, agregar:

```jsx
      {/* Alertas de stock */}
      {stockWarnings.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">{stockWarnings.join(' · ')}</p>
        </div>
      )}
```

- [ ] **Step 6: Reemplazar textarea medicamentos con tag-input**

En el formulario de consulta, buscar el bloque del campo "Medicamentos":
```jsx
            <div>
              <label className="label">Medicamentos <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={2} placeholder="Medicamentos recetados..." value={formC.medicamentos} onChange={setFC('medicamentos')} />
            </div>
```

Reemplazar ese bloque con:
```jsx
            <div>
              <label className="label">Medicamentos <span className="text-gray-400 font-normal">(opcional)</span></label>
              {medSeleccionados.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {medSeleccionados.map(m => (
                    <span key={m.id} className="flex items-center gap-1 bg-verde-fondo text-verde-claro text-xs font-medium px-2 py-1 rounded-lg">
                      {m.nombre}
                      <button type="button" onClick={() => quitarMed(m.id)} className="hover:text-red-500 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mb-2">
                <input
                  className="input"
                  placeholder="Buscar medicamento en inventario..."
                  value={medBusqueda}
                  onChange={e => buscarMedicamentos(e.target.value)}
                  autoComplete="off"
                />
                {medSugerencias.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1 max-h-48 overflow-y-auto">
                    {medSugerencias.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => agregarMed(s)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-verde-fondo text-left text-sm"
                      >
                        <span className="font-medium text-gray-800">{s.nombre}</span>
                        <span className="text-xs text-gray-400">{s.cantidad} {s.unidad}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea className="input resize-none" rows={2} placeholder="Notas adicionales sobre medicamentos..." value={formC.medicamentos} onChange={setFC('medicamentos')} />
            </div>
```

- [ ] **Step 7: Verificar que el frontend compila sin errores**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Esperado: `200` sin errores de compilación en la terminal de Vite.

- [ ] **Step 8: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Historias.jsx
git commit -m "feat(inventario): tag-input medicamentos con autocomplete y descuento"
```

---

### Task 7: Verificación final

**Archivos:** Solo verificación — sin cambios de código.

- [ ] **Step 1: Verificar flujo completo de inventario**

Con frontend en `http://localhost:3000`:
1. Ir a **Operaciones** en el sidebar → debe mostrar tabla vacía con botón "Agregar producto"
2. Clic en **+ Agregar producto** → panel lateral se desliza desde la derecha
3. Completar: nombre "Amoxicilina 500mg", Medicamentos, frasco, cantidad 5, mínimo 3, precios
4. Clic **Agregar** → aparece en la tabla con badge "OK"
5. Agregar otro producto con cantidad 2 y mínimo 3 → debe mostrar badge "Por agotarse"
6. Agregar otro con cantidad 0 y mínimo 1 → badge "Agotado"
7. Verificar que el **badge rojo** aparece en el sidebar (en el ícono de Operaciones)
8. Editar el primer producto (✏️ en hover) → panel con datos pre-cargados → guardar cambios
9. Eliminar un producto (🗑️ en hover) → confirmar → desaparece

- [ ] **Step 2: Verificar filtros por categoría**

1. Agregar productos en categorías distintas (Vacunas, Accesorios)
2. Clic en pill "Vacunas" → solo muestra los de esa categoría
3. Clic en "Todos" → vuelve a mostrar todos

- [ ] **Step 3: Verificar autocomplete en Historia Clínica**

1. Ir a **Historias** → seleccionar una mascota → historial
2. Clic en **+ Nueva Consulta** → abrir panel
3. En el campo "Medicamentos", escribir "amox" → debe aparecer dropdown con "Amoxicilina 500mg"
4. Clic en la sugerencia → aparece como tag verde en el formulario
5. El tag tiene botón × para quitarlo
6. Completar fecha, motivo, veterinario → **Registrar**
7. Ir a **Operaciones** → verificar que la cantidad de Amoxicilina bajó en 1

- [ ] **Step 4: Verificar que el Dashboard sigue funcionando**

```bash
curl -s http://localhost:3001/api/dashboard | python3 -c "import sys,json; d=json.load(sys.stdin); print('Dashboard OK:', list(d.keys()))"
```

Esperado: responde con los campos del dashboard sin errores.

- [ ] **Step 5: Commit si hubo ajustes**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git status
git diff --cached --quiet && git diff --quiet || git commit -m "fix(inventario): ajustes verificacion final"
```
