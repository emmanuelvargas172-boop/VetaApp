# Recordatorios WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el placeholder de Recordatorios.jsx con un módulo funcional que lista vacunas próximas a vencer y genera enlaces de WhatsApp con mensaje pre-llenado para el dueño.

**Architecture:** Un solo componente `Recordatorios.jsx`. El backend ya está completo: `GET /api/recordatorios/vacunas?dias=N` devuelve vacunas con JOIN a mascotas y dueños. El frontend calcula días restantes en el cliente y construye el enlace `wa.me` con el mensaje codificado.

**Tech Stack:** React 18, Tailwind CSS 3, axios (instancia en `frontend/src/api/axios.js` con baseURL `/api`), lucide-react para íconos, Vite proxy redirige `/api` → `http://localhost:3001`.

---

## Archivos

| Acción | Archivo | Descripción |
|---|---|---|
| Modificar | `frontend/src/pages/Recordatorios.jsx` | Reemplazar placeholder (18 líneas) con módulo completo |

El backend ya está listo — `backend/src/routes/recordatorios.js` existe y funciona.

---

## Contexto del proyecto

**Tailwind custom classes disponibles** (definidas en `frontend/src/index.css`):
- `.card` → `bg-white rounded-xl shadow-sm border border-gray-100`
- `.btn-primary` → botón verde principal
- `.btn-secondary` → botón blanco con borde
- `.input` → campo de texto estilizado
- `.label` → label de formulario

**Colores custom** (en `tailwind.config.js`):
- `verde-oscuro` = #1B4332
- `verde-claro` = #40916C
- `verde-medio` = variante intermedia
- `verde-fondo` = fondo verde suave

**Respuesta del API** (`GET /api/recordatorios/vacunas?dias=30`):
```json
[
  {
    "id": 1,
    "nombre": "Rabia",
    "proxima_dosis": "2026-04-27",
    "mascota_id": 3,
    "mascota_nombre": "Rex",
    "especie": "perro",
    "dueno_nombre": "Juan Pérez",
    "dueno_telefono": "3001234567"
  }
]
```
Nota: el campo de teléfono es `dueno_telefono` (no `telefono`).

---

### Task 1: Esqueleto con estado, helpers y carga de datos

**Archivos:**
- Modify: `frontend/src/pages/Recordatorios.jsx`

- [ ] **Step 1: Reemplazar el archivo con el esqueleto**

```jsx
import { useState, useEffect } from 'react';
import { MessageCircle, AlertCircle } from 'lucide-react';
import api from '../api/axios';

const ESPECIES = { perro: '🐶', gato: '🐱', ave: '🐦', conejo: '🐰', reptil: '🦎', otro: '🐾' };

function calcDias(proxima_dosis) {
  const hoy = new Date().toISOString().split('T')[0];
  return Math.ceil(
    (new Date(proxima_dosis + 'T12:00:00') - new Date(hoy + 'T12:00:00'))
    / (1000 * 60 * 60 * 24)
  );
}

function badgeConfig(dias) {
  if (dias <= 7)  return { cls: 'bg-red-100 text-red-700',    label: dias === 0 ? 'Hoy' : `${dias} día${dias === 1 ? '' : 's'}` };
  if (dias <= 15) return { cls: 'bg-amber-100 text-amber-700', label: `${dias} días` };
  return              { cls: 'bg-green-100 text-green-700',   label: `${dias} días` };
}

function waLink(item) {
  const tel = item.dueno_telefono.replace(/\D/g, '');
  const fecha = new Date(item.proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const msg = `Hola ${item.dueno_nombre}, le recordamos que ${item.mascota_nombre} tiene pendiente su vacuna de ${item.nombre} el ${fecha}. Por favor comuníquese con nosotros para agendar su cita. 🐾`;
  return `https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`;
}

export default function Recordatorios() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [filtroDias, setFiltroDias]       = useState(30);
  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const { data } = await api.get('/recordatorios/vacunas', { params: { dias: filtroDias } });
      setRecordatorios(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [filtroDias]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Recordatorios WhatsApp</h1>
      <p className="text-gray-400 text-sm mt-1">
        {cargando ? 'Cargando...' : `${recordatorios.length} vacunas próximas`}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que el servidor frontend está corriendo y navegar a `/recordatorios`**

Si no está corriendo, desde la raíz del proyecto:
```bash
npm run dev
```

Abrir `http://localhost:3000/recordatorios` en el navegador.
Esperado: se ve "Recordatorios WhatsApp" y un texto que dice "0 vacunas próximas" o "Cargando..." y luego el conteo real.

- [ ] **Step 3: Verificar en consola del navegador que el API responde**

Abrir DevTools → Network → filtrar por `recordatorios`.
Esperado: request `GET /api/recordatorios/vacunas?dias=30` con status 200 y array JSON (puede estar vacío si no hay vacunas con proxima_dosis registrada).

- [ ] **Step 4: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Recordatorios.jsx
git commit -m "feat(recordatorios): esqueleto con estado y carga de datos"
```

---

### Task 2: UI completa — header, filtros, lista y estados

**Archivos:**
- Modify: `frontend/src/pages/Recordatorios.jsx`

- [ ] **Step 1: Reemplazar el return con la UI completa**

Reemplazar el `return (...)` actual con:

```jsx
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recordatorios WhatsApp</h1>
        <p className="text-gray-400 text-sm mt-1">
          {cargando
            ? 'Cargando...'
            : `${recordatorios.length} vacuna${recordatorios.length !== 1 ? 's' : ''} próxima${recordatorios.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">No se pudo conectar al servidor.</p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-6">
        {[7, 15, 30].map((d) => (
          <button
            key={d}
            onClick={() => setFiltroDias(d)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtroDias === d
                ? 'bg-verde-oscuro text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-verde-claro hover:text-verde-claro'
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="card p-16 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Cargando recordatorios...</p>
        </div>
      ) : recordatorios.length === 0 ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">
            ✅
          </div>
          <p className="font-semibold text-gray-700">Todo al día</p>
          <p className="text-gray-400 text-sm mt-1">
            No hay vacunas próximas en los próximos {filtroDias} días
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
          {recordatorios.map((item) => {
            const dias = calcDias(item.proxima_dosis);
            const badge = badgeConfig(dias);
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors"
              >
                {/* Especie */}
                <span className="text-2xl flex-shrink-0">{ESPECIES[item.especie] || '🐾'}</span>

                {/* Mascota + vacuna */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{item.mascota_nombre}</p>
                  <p className="text-xs text-gray-400">{item.nombre}</p>
                </div>

                {/* Badge días */}
                <span className={`text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0 ${badge.cls}`}>
                  {badge.label}
                </span>

                {/* Dueño */}
                <div className="text-right hidden sm:block flex-shrink-0">
                  <p className="text-sm text-gray-700">{item.dueno_nombre}</p>
                  <p className="text-xs text-gray-400">{item.dueno_telefono}</p>
                </div>

                {/* WhatsApp */}
                <a
                  href={waLink(item)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                  title={`Enviar WhatsApp a ${item.dueno_nombre}`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
```

- [ ] **Step 2: Verificar en el navegador**

Navegar a `http://localhost:3000/recordatorios`.

Verificar:
- Si no hay vacunas con `proxima_dosis` registrada → se ve el estado vacío con "✅ Todo al día"
- Los pills `7 días` / `15 días` / `30 días` cambian el filtro
- El pill activo se ve en verde-oscuro

**Para probar con datos reales**, insertar una vacuna de prueba desde la terminal:

```bash
curl -s -X POST http://localhost:3001/api/historias/vacunas \
  -H "Content-Type: application/json" \
  -d '{
    "mascota_id": 1,
    "nombre": "Rabia",
    "fecha_aplicacion": "2026-01-15",
    "proxima_dosis": "2026-05-10"
  }' | cat
```

Si `mascota_id: 1` no existe, primero verificar qué IDs hay:
```bash
curl -s http://localhost:3001/api/mascotas | python3 -c "import sys,json; [print(m['id'], m['nombre']) for m in json.load(sys.stdin)]"
```

Luego usar un ID válido en el curl anterior.

Esperado tras insertar: la fila aparece con el badge de color correcto según los días hasta `2026-05-10`.

- [ ] **Step 3: Verificar botón WhatsApp**

Hacer clic en el botón WhatsApp de una fila.
Esperado: abre nueva pestaña con `https://wa.me/57XXXXXXXXXX?text=...` y el mensaje pre-llenado en español con nombre del dueño, nombre de la mascota, nombre de la vacuna y fecha en formato largo ("lunes 10 de mayo").

- [ ] **Step 4: Commit**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add frontend/src/pages/Recordatorios.jsx
git commit -m "feat(recordatorios): módulo completo con lista, filtros y enlaces WhatsApp"
```

---

### Task 3: Verificación final

**Archivos:** Solo lectura — no hay cambios de código en esta tarea.

- [ ] **Step 1: Verificar todos los estados de la UI**

**Estado vacío:**
- Cambiar el filtro a `7 días` con pocos datos — si no hay vacunas en 7 días, debe mostrar "✅ Todo al día" con el texto "No hay vacunas próximas en los próximos 7 días"

**Estado con datos:**
- Insertar vacunas con distintas fechas para cubrir los tres rangos:

```bash
# Vacuna urgente (≤7 días) — ajustar fecha según hoy
curl -s -X POST http://localhost:3001/api/historias/vacunas \
  -H "Content-Type: application/json" \
  -d '{"mascota_id": 1, "nombre": "Triple viral", "fecha_aplicacion": "2026-01-01", "proxima_dosis": "2026-04-26"}' | cat

# Vacuna próxima (8-15 días)
curl -s -X POST http://localhost:3001/api/historias/vacunas \
  -H "Content-Type: application/json" \
  -d '{"mascota_id": 1, "nombre": "Parvovirus", "fecha_aplicacion": "2026-01-01", "proxima_dosis": "2026-05-04"}' | cat

# Vacuna planificar (16-30 días)
curl -s -X POST http://localhost:3001/api/historias/vacunas \
  -H "Content-Type: application/json" \
  -d '{"mascota_id": 1, "nombre": "Bordetella", "fecha_aplicacion": "2026-01-01", "proxima_dosis": "2026-05-18"}' | cat
```

Esperado: tres filas con badges rojo, ámbar y verde respectivamente.

- [ ] **Step 2: Verificar que el Dashboard no se rompió**

Navegar a `http://localhost:3000/` y confirmar que el Dashboard carga correctamente.

- [ ] **Step 3: Verificar mensaje WhatsApp con acento correcto**

El mensaje debe verse así (ejemplo):
```
Hola María López, le recordamos que Max tiene pendiente su vacuna de Rabia el sábado 10 de mayo. Por favor comuníquese con nosotros para agendar su cita. 🐾
```

Verificar en la URL del enlace que los acentos y el emoji están correctamente codificados (`%C3%B3` para ó, etc.).

- [ ] **Step 4: Commit final**

```bash
cd "/Users/emmanuelvv/Desktop/CLAUDE PROYECTOS/VetaApp"
git add -A
git commit -m "feat(recordatorios): módulo recordatorios whatsapp completo"
```

Si no hubo cambios de código en este task, omitir el commit.
