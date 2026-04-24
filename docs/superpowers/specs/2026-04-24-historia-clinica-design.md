# Diseño: Módulo Historia Clínica — VetaApp

**Fecha:** 2026-04-24  
**Estado:** Aprobado  

---

## Contexto

VetaApp es un software de gestión para clínicas veterinarias pequeñas en Colombia. Stack: React + Tailwind + Node.js + SQLite. El módulo Historia Clínica permite registrar y consultar el historial de consultas médicas y vacunas de cada mascota.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Navegación | Dos rutas: `/historias` (buscar mascota) + `/historias/:mascotaId` (historial) |
| Layout historial | Pestañas: Consultas \| Vacunas |
| Formularios | Panel lateral deslizable (mismo patrón que Citas) |
| Editar vacunas | No — backend solo tiene POST y DELETE para vacunas |
| Arquitectura | Un solo archivo `Historias.jsx` con routing interno via `useParams` |

---

## Cambios en backend

### 1. Agregar campo `peso` a `historias_clinicas`

La tabla `historias_clinicas` no tiene el campo `peso`. Hay que agregarlo:

```sql
ALTER TABLE historias_clinicas ADD COLUMN peso REAL;
```

Ejecutado en `backend/src/database/db.js` con `db.exec(...)` al iniciar (idempotente: usar `IF NOT EXISTS` o try/catch).

### 2. Actualizar rutas en `backend/src/routes/historias.js`

**`POST /`** — agregar `peso` al destructuring y al INSERT:
```js
const { mascota_id, fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas } = req.body;
// INSERT: agregar peso como campo y parámetro
```

**`PUT /:id`** — agregar `peso` al destructuring y al UPDATE:
```js
const { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas } = req.body;
// UPDATE: agregar peso=? en SET y como parámetro
```

---

## Frontend

### Archivos

| Acción | Archivo | Descripción |
|---|---|---|
| Modificar | `frontend/src/pages/Historias.jsx` | Reemplazar placeholder (18 líneas) con módulo completo |
| Modificar | `frontend/src/pages/Mascotas.jsx` | Actualizar links `/historias` → `/historias/${mascota.id}` |

### Routing interno en `Historias.jsx`

`App.jsx` ya tiene `<Route path="/historias/*" element={<Historias />} />`.

`Historias.jsx` usa `useRoutes` de react-router-dom:

```jsx
const elemento = useRoutes([
  { path: '/',        element: <BuscarMascota /> },
  { path: '/:mascotaId', element: <HistorialMascota /> },
]);
return elemento;
```

---

## Vista 1: BuscarMascota (`/historias`)

### Estado local
```
mascotas[]     — lista completa cargada del API
busqueda       — string de filtro
cargando       — boolean
```

### Flujo de datos
- Montaje: `GET /api/mascotas` → carga todas las mascotas
- Filtro por `busqueda`: local, por `nombre` de mascota
- Clic en mascota → `navigate('/historias/:mascotaId')`

### UI
- Header: "Historias Clínicas"
- Input de búsqueda con ícono lupa
- Lista de mascotas: emoji especie + nombre (bold) + nombre dueño
- Hover → fondo verde suave, cursor pointer
- Estado vacío: "No se encontraron mascotas"
- Error de carga: banner ámbar

---

## Vista 2: HistorialMascota (`/historias/:mascotaId`)

### Estado local
```
mascota        — objeto mascota cargado del API
consultas[]    — lista de historias_clinicas
vacunas[]      — lista de vacunas
tabActiva      — 'consultas' | 'vacunas'
panelAbierto   — boolean
consultaEditando — objeto | null  (null = nueva consulta)
panelTipo      — 'consulta' | 'vacuna'
formConsulta   — { fecha, motivo, diagnostico, tratamiento, medicamentos, veterinario, peso, notas }
formVacuna     — { nombre, fecha_aplicacion, proxima_dosis, veterinario }
errorPanel     — string
guardando      — boolean
cargando       — boolean
error          — boolean
```

### Flujo de datos

**Carga:**
- `GET /api/mascotas/:mascotaId` → info de la mascota (nombre, especie, dueño)
- `GET /api/historias/mascota/:mascotaId` → consultas (orden DESC por fecha — backend)
- `GET /api/historias/vacunas/mascota/:mascotaId` → vacunas (orden DESC por fecha_aplicacion — backend)

**Consultas:**
- `POST /api/historias` → recarga consultas → cierra panel
- `PUT /api/historias/:id` → recarga consultas → cierra panel
- `DELETE /api/historias/:id` → confirm → recarga consultas

**Vacunas:**
- `POST /api/historias/vacunas` → recarga vacunas → cierra panel
- `DELETE /api/historias/vacunas/:id` → confirm → recarga vacunas

**Autocompletado veterinario:** lista única de veterinarios extraída de `consultas` + `vacunas` en memoria, usando `datalist`.

---

## UI — Historial

### Banner mascota (header)
Fondo verde-oscuro (`bg-verde-oscuro`), texto blanco:
- Emoji especie + nombre mascota (bold, lg) + especie/raza
- Nombre dueño en texto más pequeño
- Botón "← Volver" a la izquierda → `navigate('/historias')`

### Pestañas
```
[📋 Consultas (N)]  [💉 Vacunas (N)]
```
Activa: borde inferior verde-claro + texto verde-claro. Inactiva: texto gris.

### Botón de acción
Arriba a la derecha, cambia según pestaña activa:
- Pestaña Consultas → `+ Nueva Consulta`
- Pestaña Vacunas → `+ Nueva Vacuna`

---

## Pestaña Consultas

### Tarjeta de consulta
```
[Fecha]          [Veterinario]       [Peso: X kg]   [✏️ 🗑️ en hover]
[Motivo en negrita]
[Dx: diagnóstico]
[Tto: tratamiento]
[Med: medicamentos]
[Notas (si hay)]
```

- Ordenadas por fecha DESC (más reciente arriba)
- Hover en fila → muestra íconos editar (lápiz) y eliminar (tacho)
- Estado vacío: "Sin consultas registradas · Registra la primera consulta"

---

## Pestaña Vacunas

### Tarjeta de vacuna
```
[💉 Nombre vacuna]   [Fecha aplicación]   [Badge próxima dosis]   [🗑️ en hover]
[Veterinario]
```

**Badge próxima dosis:**
- Si no hay próxima dosis: no se muestra
- ≤ 30 días: badge rojo/ámbar/verde (mismo cálculo que Recordatorios)
- > 30 días: texto gris "Próxima: fecha"

- Solo eliminar (no editar) — backend no tiene PUT para vacunas
- Estado vacío: "Sin vacunas registradas · Registra la primera vacuna"

---

## Panel lateral

Mismo patrón que Citas:
- `w-96`, `fixed top-0 right-0 h-full`, z-40
- Animación `translate-x-full` → `translate-x-0` (300ms)
- Overlay `bg-black/30 z-30` al fondo → clic cierra panel
- Header del panel: título dinámico ("Nueva Consulta" / "Editar Consulta" / "Nueva Vacuna")

### Formulario Consulta
| Campo | Tipo | Requerido |
|---|---|---|
| Fecha | `<input type="date">` | ✓ |
| Motivo | `<input type="text">` | ✓ |
| Diagnóstico | `<textarea>` | — |
| Tratamiento | `<textarea>` | — |
| Medicamentos | `<textarea>` | — |
| Veterinario | `<input>` + datalist | ✓ |
| Peso (kg) | `<input type="number" step="0.1">` | — |
| Notas | `<textarea>` | — |

### Formulario Vacuna
| Campo | Tipo | Requerido |
|---|---|---|
| Nombre vacuna | `<input type="text">` | ✓ |
| Fecha de aplicación | `<input type="date">` | ✓ |
| Próxima dosis | `<input type="date">` | — |
| Veterinario | `<input>` + datalist | — |

---

## Cambio en `Mascotas.jsx`

En la vista `PerfilMascota`, hay dos `Link` que apuntan a `/historias`:

```jsx
// Línea ~175 — actualizar a:
<Link to={`/historias/${mascota.id}`} ...>
  Ver Historia Clínica
</Link>

// Línea ~204 — actualizar a:
<Link to={`/historias/${mascota.id}`} ...>
  Ver módulo →
</Link>
```

---

## Manejo de errores

- Carga de mascota o historial falla: banner ámbar + contenido vacío
- POST/PUT falla: error inline en el panel, panel permanece abierto
- DELETE falla: `alert()` simple
- Mascota no encontrada (`mascotaId` inválido): mensaje "Mascota no encontrada" + botón volver
