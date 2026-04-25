# Historia Clínica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo Historia Clínica completo: landing de búsqueda de mascotas, historial por mascota con pestañas Consultas/Vacunas, y formularios de registro en panel lateral.

**Architecture:** `Historias.jsx` usa `useRoutes` de react-router-dom para manejar dos vistas: `/historias` (buscar mascota) y `/historias/:mascotaId` (historial completo). El backend requiere agregar el campo `peso` a `historias_clinicas`. Se actualiza `Mascotas.jsx` para que los links del perfil lleven directamente a `/historias/:mascotaId`.

**Tech Stack:** React 18, react-router-dom v6 (`useRoutes`, `useParams`, `useNavigate`), Tailwind CSS 3, axios (instancia en `frontend/src/api/axios.js` con baseURL `/api`), lucide-react, Node.js + SQLite (`node:sqlite`).

---

## Archivos

| Acción | Archivo | Descripción |
|---|---|---|
| Modificar | `backend/src/database/db.js` | Agregar `ALTER TABLE historias_clinicas ADD COLUMN peso REAL` |
| Modificar | `backend/src/routes/historias.js` | Incluir `peso` en POST y PUT |
| Modificar | `frontend/src/pages/Mascotas.jsx` | Actualizar 2 links `/historias` → `/historias/${mascota.id}` |
| Modificar | `frontend/src/pages/Historias.jsx` | Reemplazar placeholder de 18 líneas con módulo completo |

---

## Contexto del proyecto

**Tailwind custom classes** (en `frontend/src/index.css`):
- `.card` → `bg-white rounded-xl shadow-sm border border-gray-100`
- `.btn-primary` → botón verde principal con flex y gap
- `.btn-secondary` → botón blanco con borde
- `.input` → campo de texto con focus ring verde
- `.label` → label pequeño gris

**Colores custom** (en `tailwind.config.js`):
- `verde-oscuro` = #1B4332
- `verde-claro` = #40916C
- `verde-fondo` = fondo verde suave (usado en hover)

**Routing en App.jsx:** `<Route path="/historias/*" element={<Historias />} />` — el `/*` permite subrutas internas.

**API endpoints relevantes:**
- `GET /api/mascotas` → array con `id, nombre, especie, dueno_nombre, dueno_telefono, ...`
- `GET /api/mascotas/:id` → objeto mascota individual con JOIN duenos
- `GET /api/historias/mascota/:mascotaId` → consultas ORDER BY fecha DESC
- `POST /api/historias` → crear consulta
- `PUT /api/historias/:id` → editar consulta
- `DELETE /api/historias/:id` → eliminar consulta
- `GET /api/historias/vacunas/mascota/:mascotaId` → vacunas ORDER BY fecha_aplicacion DESC
- `POST /api/historias/vacunas` → crear vacuna
- `DELETE /api/historias/vacunas/:id` → eliminar vacuna

---

### Task 1: Backend — campo peso en historias_clinicas

**Archivos:**
- Modify: `backend/src/database/db.js`
- Modify: `backend/src/routes/historias.js`

- [ ] **Step 1: Agregar ALTER TABLE en db.js**

Leer el archivo actual. Después de la línea `module.exports = db;` no hay nada. La línea 70 es la que cierra el `db.exec(...)` del CREATE TABLE. Agregar **después de la línea 70** (después del `);` que cierra el bloque CREATE TABLE) y **antes del** `module.exports = db;`:

```js
// Agregar campo peso a historias_clinicas si no existe
try { db.exec(`ALTER TABLE historias_clinicas ADD COLUMN peso REAL`); } catch (_) {}
```

El archivo `backend/src/database/db.js` quedará así en las líneas 70-73:
```js
`);

// Agregar campo peso a historias_clinicas si no existe
try { db.exec(`ALTER TABLE historias_clinicas ADD COLUMN peso REAL`); } catch (_) {}

module.exports = db;
```

- [ ] **Step 2: Actualizar POST /historias en historias.js**

Reemplazar el bloque `router.post('/', ...)` completo (líneas 13-23) con:

```js
router.post('/', (req, res) => {
  const { mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas } = req.body;
  if (!mascota_id || !fecha || !motivo) {
    return res.status(400).json({ error: 'Mascota, fecha y motivo son requeridos' });
  }
  const result = db.prepare(
    `INSERT INTO historias_clinicas (mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(mascota_id, fecha, motivo, diagnostico || null, tratamiento || null, medicamentos || null, veterinario || null, peso || null, notas || null);
  res.status(201).json(db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(result.lastInsertRowid));
});
```

- [ ] **Step 3: Actualizar PUT /historias/:id en historias.js**

Reemplazar el bloque `router.put('/:id', ...)` completo (líneas 25-32) con:

```js
router.put('/:id', (req, res) => {
  const { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas } = req.body;
  const result = db.prepare(
    `UPDATE historias_clinicas SET fecha=?, motivo=?, diagnostico=?, tratamiento=?, medicamentos=?, veterinario=?, peso=?, notas=? WHERE id=?`
  ).run(fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso || null, notas, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Historia no encontrada' });
  res.json(db.prepare(`SELECT * FROM historias_clinicas WHERE id = ?`).get(req.params.id));
});
```

- [ ] **Step 4: Verificar que el backend reinicia sin errores**

```bash
lsof -ti :3001 | xargs kill -9 2>/dev/null; sleep 1
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run dev --prefix backend &
sleep 3
curl -s http://localhost:3001/api/historias/mascota/1 | python3 -c "import sys,json; print('OK:', json.load(sys.stdin))"
```

Esperado: `OK: []` (array vacío, o array con consultas si ya hay datos). No debe haber errores de "column not found".

Verificar que el campo `peso` aparece en la respuesta del POST:
```bash
# Usar un mascota_id válido (cambiar 1 por un ID real si es necesario)
curl -s -X POST http://localhost:3001/api/historias \
  -H "Content-Type: application/json" \
  -d '{"mascota_id":1,"fecha":"2026-04-24","motivo":"Test peso","veterinario":"Dr. Test","peso":12.5}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('peso:', d.get('peso','FALTA'))"
```

Esperado: `peso: 12.5`

Si `mascota_id: 1` no existe, primero consultar IDs disponibles:
```bash
curl -s http://localhost:3001/api/mascotas | python3 -c "import sys,json; [print(m['id'], m['nombre']) for m in json.load(sys.stdin)]"
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add backend/src/database/db.js backend/src/routes/historias.js
git commit -m "feat(historias): agregar campo peso a historias_clinicas"
```

---

### Task 2: Mascotas.jsx — actualizar links al historial

**Archivos:**
- Modify: `frontend/src/pages/Mascotas.jsx`

El componente `PerfilMascota` recibe `mascota` como prop y tiene dos links que apuntan a `/historias` sin el ID de la mascota.

- [ ] **Step 1: Leer Mascotas.jsx y ubicar los dos links**

```bash
grep -n 'to="/historias"' "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend/src/pages/Mascotas.jsx"
```

Esperado: dos líneas, aproximadamente líneas 175 y 204.

- [ ] **Step 2: Actualizar el primer link (línea ~175)**

Reemplazar:
```jsx
            to="/historias"
```
con:
```jsx
            to={`/historias/${mascota.id}`}
```

- [ ] **Step 3: Actualizar el segundo link (línea ~204)**

Reemplazar:
```jsx
          <Link to="/historias" className="text-xs text-verde-claro hover:text-verde-medio font-medium">Ver módulo →</Link>
```
con:
```jsx
          <Link to={`/historias/${mascota.id}`} className="text-xs text-verde-claro hover:text-verde-medio font-medium">Ver historial →</Link>
```

- [ ] **Step 4: Verificar que no quedan `/historias` sin ID**

```bash
grep -n 'to="/historias"' "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend/src/pages/Mascotas.jsx"
```

Esperado: sin resultados (ninguna ocurrencia).

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Mascotas.jsx
git commit -m "feat(historias): links perfil mascota → historial directo"
```

---

### Task 3: Historias.jsx — módulo completo

**Archivos:**
- Modify: `frontend/src/pages/Historias.jsx`

Reemplazar el archivo completo (actualmente un placeholder de 18 líneas) con la implementación completa.

- [ ] **Step 1: Escribir el archivo completo**

Escribir el siguiente contenido en `frontend/src/pages/Historias.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useRoutes } from 'react-router-dom';
import {
  ArrowLeft, Plus, Edit2, Trash2, Search, X, Loader2,
  AlertCircle, FileText, Syringe, ChevronRight,
} from 'lucide-react';
import api from '../api/axios';

const ESPECIES = { perro: '🐶', gato: '🐱', ave: '🐦', conejo: '🐰', reptil: '🦎', otro: '🐾' };

function calcDias(fecha) {
  const hoy = new Date().toISOString().split('T')[0];
  return Math.ceil(
    (new Date(fecha + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / (1000 * 60 * 60 * 24)
  );
}

function badgeProxDosis(proxima_dosis) {
  if (!proxima_dosis) return null;
  const dias = calcDias(proxima_dosis);
  const fecha = new Date(proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  if (dias < 0)  return { cls: 'bg-gray-100 text-gray-500',    label: 'Vencida' };
  if (dias === 0) return { cls: 'bg-red-100 text-red-700',      label: 'Hoy' };
  if (dias <= 7)  return { cls: 'bg-red-100 text-red-700',      label: `${dias}d` };
  if (dias <= 15) return { cls: 'bg-amber-100 text-amber-700',  label: `${dias}d` };
  if (dias <= 30) return { cls: 'bg-green-100 text-green-700',  label: `${dias}d` };
  return              { cls: 'bg-gray-100 text-gray-500',    label: fecha };
}

// ─── Vista: Buscar mascota ───────────────────────────────────────────────────
function BuscarMascota() {
  const navigate = useNavigate();
  const [mascotas, setMascotas]   = useState([]);
  const [busqueda, setBusqueda]   = useState('');
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(false);

  useEffect(() => {
    api.get('/mascotas')
      .then(r => setMascotas(r.data))
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return mascotas;
    const q = busqueda.toLowerCase();
    return mascotas.filter(m => m.nombre.toLowerCase().includes(q));
  }, [mascotas, busqueda]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Historias Clínicas</h1>
        <p className="text-gray-400 text-sm mt-1">Selecciona una mascota para ver su historial</p>
      </div>

      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">No se pudo cargar la lista de mascotas.</p>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-300" />
        <input
          className="input pl-9"
          placeholder="Buscar mascota por nombre..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {cargando ? (
        <div className="card p-16 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Cargando mascotas...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">{mascotas.length === 0 ? 'No hay mascotas registradas' : 'No se encontraron mascotas'}</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
          {filtradas.map(m => (
            <button
              key={m.id}
              onClick={() => navigate(`/historias/${m.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-verde-fondo transition-colors text-left"
            >
              <span className="text-2xl">{ESPECIES[m.especie] || '🐾'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{m.nombre}</p>
                <p className="text-xs text-gray-400">{m.dueno_nombre}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vista: Historial de una mascota ────────────────────────────────────────
function HistorialMascota() {
  const { mascotaId } = useParams();
  const navigate      = useNavigate();

  const [mascota, setMascota]     = useState(null);
  const [consultas, setConsultas] = useState([]);
  const [vacunas, setVacunas]     = useState([]);
  const [tabActiva, setTabActiva] = useState('consultas');
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(false);

  const [panelAbierto, setPanelAbierto]         = useState(false);
  const [panelTipo, setPanelTipo]               = useState('consulta');
  const [consultaEditando, setConsultaEditando] = useState(null);
  const [guardando, setGuardando]               = useState(false);
  const [errorPanel, setErrorPanel]             = useState('');

  const HOY = new Date().toISOString().split('T')[0];

  const FORM_C0 = {
    fecha: HOY, motivo: '', diagnostico: '', tratamiento: '',
    medicamentos: '', veterinario: '', peso: '', notas: '',
  };
  const FORM_V0 = { nombre: '', fecha_aplicacion: HOY, proxima_dosis: '', veterinario: '' };

  const [formC, setFormC] = useState(FORM_C0);
  const [formV, setFormV] = useState(FORM_V0);

  const veterinariosUnicos = useMemo(() => {
    const vets = [...consultas.map(c => c.veterinario), ...vacunas.map(v => v.veterinario)].filter(Boolean);
    return [...new Set(vets)];
  }, [consultas, vacunas]);

  const cargarConsultas = async () => {
    const { data } = await api.get(`/historias/mascota/${mascotaId}`);
    setConsultas(data);
  };

  const cargarVacunas = async () => {
    const { data } = await api.get(`/historias/vacunas/mascota/${mascotaId}`);
    setVacunas(data);
  };

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      setError(false);
      try {
        const [mRes, cRes, vRes] = await Promise.all([
          api.get(`/mascotas/${mascotaId}`),
          api.get(`/historias/mascota/${mascotaId}`),
          api.get(`/historias/vacunas/mascota/${mascotaId}`),
        ]);
        setMascota(mRes.data);
        setConsultas(cRes.data);
        setVacunas(vRes.data);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [mascotaId]);

  const abrirPanelConsulta = (consulta = null) => {
    setConsultaEditando(consulta);
    setErrorPanel('');
    setFormC(consulta ? {
      fecha: consulta.fecha, motivo: consulta.motivo,
      diagnostico: consulta.diagnostico || '', tratamiento: consulta.tratamiento || '',
      medicamentos: consulta.medicamentos || '', veterinario: consulta.veterinario || '',
      peso: consulta.peso ?? '', notas: consulta.notas || '',
    } : FORM_C0);
    setPanelTipo('consulta');
    setPanelAbierto(true);
  };

  const abrirPanelVacuna = () => {
    setFormV(FORM_V0);
    setErrorPanel('');
    setPanelTipo('vacuna');
    setPanelAbierto(true);
  };

  const cerrarPanel = () => { setPanelAbierto(false); setConsultaEditando(null); };
  const setFC = f => e => setFormC(p => ({ ...p, [f]: e.target.value }));
  const setFV = f => e => setFormV(p => ({ ...p, [f]: e.target.value }));

  const guardarConsulta = async e => {
    e.preventDefault();
    if (!formC.fecha || !formC.motivo || !formC.veterinario) {
      setErrorPanel('Fecha, motivo y veterinario son requeridos.');
      return;
    }
    setGuardando(true); setErrorPanel('');
    try {
      const payload = {
        mascota_id: mascotaId, fecha: formC.fecha, motivo: formC.motivo,
        diagnostico: formC.diagnostico || null, tratamiento: formC.tratamiento || null,
        medicamentos: formC.medicamentos || null, veterinario: formC.veterinario,
        peso: formC.peso ? parseFloat(formC.peso) : null, notas: formC.notas || null,
      };
      if (consultaEditando) {
        await api.put(`/historias/${consultaEditando.id}`, payload);
      } else {
        await api.post('/historias', payload);
      }
      cerrarPanel();
      await cargarConsultas();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarConsulta = async id => {
    if (!window.confirm('¿Eliminar esta consulta? No se puede deshacer.')) return;
    await api.delete(`/historias/${id}`);
    await cargarConsultas();
  };

  const guardarVacuna = async e => {
    e.preventDefault();
    if (!formV.nombre || !formV.fecha_aplicacion) {
      setErrorPanel('Nombre de vacuna y fecha de aplicación son requeridos.');
      return;
    }
    setGuardando(true); setErrorPanel('');
    try {
      await api.post('/historias/vacunas', {
        mascota_id: mascotaId, nombre: formV.nombre,
        fecha_aplicacion: formV.fecha_aplicacion,
        proxima_dosis: formV.proxima_dosis || null,
        veterinario: formV.veterinario || null,
      });
      cerrarPanel();
      await cargarVacunas();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al registrar vacuna.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarVacuna = async id => {
    if (!window.confirm('¿Eliminar esta vacuna? No se puede deshacer.')) return;
    await api.delete(`/historias/vacunas/${id}`);
    await cargarVacunas();
  };

  if (cargando) return (
    <div className="p-6 flex flex-col items-center justify-center min-h-64">
      <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-gray-400 text-sm">Cargando historial...</p>
    </div>
  );

  if (error || !mascota) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 mb-4">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <p className="text-amber-700 text-sm">No se pudo cargar el historial de esta mascota.</p>
      </div>
      <button onClick={() => navigate('/historias')} className="btn-secondary flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Banner mascota */}
      <div className="bg-verde-oscuro text-white rounded-xl p-5 mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/historias')}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-3xl flex-shrink-0">{ESPECIES[mascota.especie] || '🐾'}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{mascota.nombre}</h1>
          <p className="text-white/70 text-sm">{mascota.especie}{mascota.raza ? ` · ${mascota.raza}` : ''} · {mascota.dueno_nombre}</p>
        </div>
        <button
          onClick={() => tabActiva === 'consultas' ? abrirPanelConsulta() : abrirPanelVacuna()}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          {tabActiva === 'consultas' ? 'Nueva Consulta' : 'Nueva Vacuna'}
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex border-b border-gray-200 mb-6">
        {[
          { key: 'consultas', label: 'Consultas', count: consultas.length, Icon: FileText },
          { key: 'vacunas',   label: 'Vacunas',   count: vacunas.length,   Icon: Syringe  },
        ].map(({ key, label, count, Icon }) => (
          <button
            key={key}
            onClick={() => setTabActiva(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors mr-4 ${
              tabActiva === key
                ? 'border-verde-claro text-verde-claro'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Tab: Consultas */}
      {tabActiva === 'consultas' && (
        consultas.length === 0 ? (
          <div className="card p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-purple-400" />
            </div>
            <p className="font-semibold text-gray-700">Sin consultas registradas</p>
            <p className="text-gray-400 text-sm mt-1">Registra la primera consulta médica</p>
            <button onClick={() => abrirPanelConsulta()} className="btn-primary mt-5 text-sm">
              <Plus className="w-4 h-4" /> Nueva Consulta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {consultas.map(c => (
              <div key={c.id} className="card p-5 group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{c.motivo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      {c.veterinario && ` · ${c.veterinario}`}
                      {c.peso != null && ` · ${c.peso} kg`}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => abrirPanelConsulta(c)} className="p-1.5 rounded-lg hover:bg-verde-fondo text-gray-300 hover:text-verde-claro transition-colors" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => eliminarConsulta(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {(c.diagnostico || c.tratamiento || c.medicamentos) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    {c.diagnostico && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Diagnóstico</p>
                        <p className="text-gray-700 text-sm">{c.diagnostico}</p>
                      </div>
                    )}
                    {c.tratamiento && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tratamiento</p>
                        <p className="text-gray-700 text-sm">{c.tratamiento}</p>
                      </div>
                    )}
                    {c.medicamentos && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Medicamentos</p>
                        <p className="text-gray-700 text-sm">{c.medicamentos}</p>
                      </div>
                    )}
                  </div>
                )}
                {c.notas && (
                  <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">{c.notas}</p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab: Vacunas */}
      {tabActiva === 'vacunas' && (
        vacunas.length === 0 ? (
          <div className="card p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4">
              <Syringe className="w-8 h-8 text-green-400" />
            </div>
            <p className="font-semibold text-gray-700">Sin vacunas registradas</p>
            <p className="text-gray-400 text-sm mt-1">Registra la primera vacuna</p>
            <button onClick={() => abrirPanelVacuna()} className="btn-primary mt-5 text-sm">
              <Plus className="w-4 h-4" /> Nueva Vacuna
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vacunas.map(v => {
              const badge = badgeProxDosis(v.proxima_dosis);
              return (
                <div key={v.id} className="card p-5 flex items-center gap-4 group">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Syringe className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{v.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Aplicada: {new Date(v.fecha_aplicacion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {v.veterinario && ` · ${v.veterinario}`}
                    </p>
                  </div>
                  {badge && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-gray-400 mb-1">Próxima dosis</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </div>
                  )}
                  <button
                    onClick={() => eliminarVacuna(v.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Overlay */}
      {panelAbierto && (
        <div className="fixed inset-0 bg-black/30 z-30" onClick={cerrarPanel} />
      )}

      {/* Panel lateral */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ${panelAbierto ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${panelTipo === 'consulta' ? 'bg-purple-50' : 'bg-green-50'} rounded-lg flex items-center justify-center`}>
              {panelTipo === 'consulta'
                ? <FileText className="w-4 h-4 text-purple-500" />
                : <Syringe className="w-4 h-4 text-green-500" />}
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {panelTipo === 'consulta'
                ? (consultaEditando ? 'Editar Consulta' : 'Nueva Consulta')
                : 'Nueva Vacuna'}
            </h2>
          </div>
          <button onClick={cerrarPanel} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {panelTipo === 'consulta' && (
          <form onSubmit={guardarConsulta} className="flex-1 overflow-y-auto p-6 space-y-4">
            {errorPanel && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{errorPanel}</div>
            )}
            <div>
              <label className="label">Fecha *</label>
              <input type="date" className="input" value={formC.fecha} onChange={setFC('fecha')} required />
            </div>
            <div>
              <label className="label">Motivo *</label>
              <input className="input" placeholder="Ej: Control rutinario, Vacunación..." value={formC.motivo} onChange={setFC('motivo')} required />
            </div>
            <div>
              <label className="label">Diagnóstico <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={2} placeholder="Resultado de la consulta..." value={formC.diagnostico} onChange={setFC('diagnostico')} />
            </div>
            <div>
              <label className="label">Tratamiento <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={2} placeholder="Indicaciones médicas..." value={formC.tratamiento} onChange={setFC('tratamiento')} />
            </div>
            <div>
              <label className="label">Medicamentos <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={2} placeholder="Medicamentos recetados..." value={formC.medicamentos} onChange={setFC('medicamentos')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Veterinario *</label>
                <input className="input" list="vets-list" placeholder="Ej: Dr. García" value={formC.veterinario} onChange={setFC('veterinario')} required />
                <datalist id="vets-list">
                  {veterinariosUnicos.map(v => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Peso (kg) <span className="text-gray-400 font-normal">(opc.)</span></label>
                <input type="number" step="0.1" min="0" className="input" placeholder="12.5" value={formC.peso} onChange={setFC('peso')} />
              </div>
            </div>
            <div>
              <label className="label">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
              <textarea className="input resize-none" rows={2} placeholder="Observaciones adicionales..." value={formC.notas} onChange={setFC('notas')} />
            </div>
          </form>
        )}

        {panelTipo === 'vacuna' && (
          <form onSubmit={guardarVacuna} className="flex-1 overflow-y-auto p-6 space-y-4">
            {errorPanel && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{errorPanel}</div>
            )}
            <div>
              <label className="label">Nombre de la vacuna *</label>
              <input className="input" placeholder="Ej: Rabia, Triple viral..." value={formV.nombre} onChange={setFV('nombre')} required />
            </div>
            <div>
              <label className="label">Fecha de aplicación *</label>
              <input type="date" className="input" value={formV.fecha_aplicacion} onChange={setFV('fecha_aplicacion')} required />
            </div>
            <div>
              <label className="label">Próxima dosis <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="date" className="input" value={formV.proxima_dosis} onChange={setFV('proxima_dosis')} />
            </div>
            <div>
              <label className="label">Veterinario <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input className="input" list="vets-list-v" placeholder="Ej: Dra. López" value={formV.veterinario} onChange={setFV('veterinario')} />
              <datalist id="vets-list-v">
                {veterinariosUnicos.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
          </form>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={cerrarPanel} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button
            onClick={panelTipo === 'consulta' ? guardarConsulta : guardarVacuna}
            disabled={guardando}
            className="btn-primary flex-1 justify-center disabled:opacity-60"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {panelTipo === 'consulta'
              ? (consultaEditando ? 'Guardar cambios' : 'Registrar')
              : 'Registrar vacuna'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente raíz ─────────────────────────────────────────────────────────
export default function Historias() {
  const elemento = useRoutes([
    { path: '/',           element: <BuscarMascota /> },
    { path: '/:mascotaId', element: <HistorialMascota /> },
  ]);
  return elemento;
}
```

- [ ] **Step 2: Verificar que el archivo se guardó correctamente**

```bash
wc -l "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend/src/pages/Historias.jsx"
```

Esperado: entre 280 y 340 líneas (el archivo completo, no el placeholder de 18 líneas).

También verificar que el placeholder fue reemplazado (no debe contener "Construction"):
```bash
grep -c "Construction" "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp/frontend/src/pages/Historias.jsx"
```
Esperado: `0`

- [ ] **Step 3: Verificar que el frontend compila sin errores**

El servidor de Vite en puerto 3000 debería recargar automáticamente. Verificar en los logs de Vite que no haya errores de compilación. Si el servidor no está corriendo:

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
npm run dev --prefix frontend &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Esperado: `200`

- [ ] **Step 4: Verificar navegación básica**

```bash
# Verificar que /api/mascotas devuelve datos (para la landing page)
curl -s http://localhost:3001/api/mascotas | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'Mascotas: {len(data)}')"

# Verificar que el historial de una mascota funciona (cambiar 1 por ID real)
curl -s http://localhost:3001/api/historias/mascota/1 | python3 -c "import sys,json; print('Consultas:', len(json.load(sys.stdin)))"
curl -s http://localhost:3001/api/historias/vacunas/mascota/1 | python3 -c "import sys,json; print('Vacunas:', len(json.load(sys.stdin)))"
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Historias.jsx
git commit -m "feat(historias): módulo historia clínica completo"
```

---

### Task 4: Verificación final

**Archivos:** Solo lectura — no hay cambios de código en esta tarea.

- [ ] **Step 1: Verificar flujo completo de consultas**

Con el frontend en `http://localhost:3000`:

1. Ir a **Historias** en el sidebar → debe mostrar "Historias Clínicas" con buscador
2. Seleccionar una mascota → debe navegar a `/historias/:id` y mostrar el banner verde con datos de la mascota
3. Clic en **+ Nueva Consulta** → panel lateral se desliza desde la derecha
4. Llenar: fecha, motivo (requerido), diagnóstico, tratamiento, medicamentos, veterinario (requerido), peso 12.5, notas
5. Clic **Registrar** → panel cierra, consulta aparece en la lista con todos los campos
6. Clic en ✏️ (editar) → panel abre con datos precargados
7. Cambiar motivo y guardar → lista actualiza
8. Clic en 🗑️ (eliminar) → confirmar → consulta desaparece

- [ ] **Step 2: Verificar flujo de vacunas**

1. Hacer clic en pestaña **Vacunas** → muestra estado vacío
2. Clic **+ Nueva Vacuna** → panel abre con form de vacuna (diferente al de consulta)
3. Registrar: nombre "Rabia", fecha aplicación hoy, próxima dosis en 15 días, veterinario
4. Clic **Registrar vacuna** → vacuna aparece con badge de urgencia (ámbar si es 15 días)
5. Hover sobre la vacuna → aparece ícono 🗑️, confirmar eliminar

- [ ] **Step 3: Verificar links desde perfil de mascota**

1. Ir a **Mascotas** → clic en una mascota → perfil
2. Clic en **Nueva Historia Clínica** → debe navegar a `/historias/:id` (no a `/historias`)
3. Clic en **Ver historial →** → mismo comportamiento

- [ ] **Step 4: Verificar que el Dashboard no se rompió**

```bash
curl -s http://localhost:3001/api/dashboard | python3 -c "import sys,json; d=json.load(sys.stdin); print('Dashboard OK:', list(d.keys()))"
```

Esperado: responde con los campos del dashboard sin errores.

- [ ] **Step 5: Commit si hubo ajustes**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add -A
git status
# Solo hacer commit si hay cambios
git diff --cached --quiet || git commit -m "fix(historias): ajustes verificación final"
```
