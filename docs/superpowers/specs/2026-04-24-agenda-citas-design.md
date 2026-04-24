# Diseño: Módulo Agenda de Citas — VetaApp

**Fecha:** 2026-04-24  
**Estado:** Aprobado  

---

## Contexto

VetaApp es un software de gestión para clínicas veterinarias pequeñas en Colombia. Stack: React + Tailwind + Node.js + SQLite. El backend de citas ya está completo (`/api/citas` con GET, POST, PUT, PATCH, DELETE). Solo falta el frontend.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Vista principal | Lista con filtros (no calendario) |
| Formulario nueva cita | Panel lateral deslizable (no modal) |
| Campo veterinario | Texto libre con autocompletado desde citas anteriores |
| Cambio de estado | Clic en badge → dropdown inline |
| Arquitectura | Un solo archivo `Citas.jsx` |

---

## Arquitectura

### Componentes internos de `Citas.jsx`

```
Citas.jsx
├── estado local
│   ├── citas[]           — lista cargada del API
│   ├── filtroFecha       — 'hoy' | 'semana' | 'todas'
│   ├── filtroEstado      — '' | 'pendiente' | 'confirmada' | 'atendida' | 'cancelada'
│   ├── panelAbierto      — boolean
│   ├── citaEditando      — objeto cita | null
│   ├── dropdownEstadoId  — id de cita con dropdown abierto | null
│   └── cargando          — boolean
├── <BarraFiltros>
├── <TablaCitas>
├── <DropdownEstado>      — flotante, posicionado en la fila
└── <PanelNuevaCita>      — deslizable desde la derecha
```

El panel lateral (`w-96`) se anima con `translate-x-full` → `translate-x-0` via Tailwind. No bloquea la tabla.

---

## Flujo de datos

### Carga y filtros
- Montaje: `GET /api/citas` → todas las citas
- Filtro "Hoy": `GET /api/citas?fecha=YYYY-MM-DD`
- Filtro "Esta semana": `GET /api/citas?semana=YYYY-MM-DD`
- Filtro "Todas": `GET /api/citas`
- Filtro estado: se añade `&estado=X` al query activo

### Crear / editar cita
- `POST /api/citas` → refresca lista completa → cierra panel
- `PUT /api/citas/:id` → refresca lista completa → cierra panel

### Cambiar estado
- `PATCH /api/citas/:id/estado` → actualiza solo esa cita en el estado local (sin recargar toda la lista)

### Autocompletado veterinario
- Se extrae la lista de veterinarios únicos del array `citas` en memoria
- Sin llamada extra al backend

### Selector de mascota
- `GET /api/mascotas` una vez al abrir el panel → filtrado local por nombre
- Muestra: emoji especie + nombre mascota + nombre dueño

---

## UI

### Barra superior
- Título "Agenda de Citas" + contador: "X citas"
- Pills de filtro: `Hoy` | `Esta semana` | `Todas`
- Dropdown estado: Todos / Pendiente / Confirmada / Atendida / Cancelada
- Botón `+ Nueva Cita`

### Tabla
Columnas: **Hora** | **Mascota** (emoji + nombre) | **Motivo** | **Veterinario** | **Estado** (badge clickeable) | **Acciones** (hover)

- Estado vacío: ilustración + mensaje contextual según filtro activo
- Acciones en hover: editar (lápiz), eliminar (tacho)

### Badge de estado → Dropdown
- Clic en badge abre menú flotante con las 4 opciones
- Clic fuera cierra el menú
- Colores: Pendiente=amber, Confirmada=blue, Atendida=green, Cancelada=red

### Panel lateral
- Ancho: `w-96` (384px), altura completa de la pantalla
- Animación: `transition-transform translate-x-full` → `translate-x-0`
- Overlay oscuro detrás al abrir
- Campos:
  1. **Mascota** — input búsqueda + lista desplegable (nombre + especie + dueño)
  2. **Fecha** — `<input type="date">`
  3. **Hora** — `<input type="time">`
  4. **Veterinario** — texto libre con datalist para autocompletado
  5. **Motivo** — texto libre, requerido
  6. **Notas** — textarea, opcional
- Botones: Cancelar | Agendar / Guardar cambios

---

## Estados del sistema

| Estado cita | Badge | Transiciones posibles |
|---|---|---|
| pendiente | amber | → confirmada, atendida, cancelada |
| confirmada | blue | → atendida, cancelada |
| atendida | green | (ninguna — estado final) |
| cancelada | red | (ninguna — estado final) |

---

## Manejo de errores

- Si el backend no responde al cargar: banner de aviso + lista vacía (igual que Dashboard)
- Si POST/PUT falla: mensaje de error inline en el panel, panel permanece abierto
- Si PATCH estado falla: revertir el cambio visualmente con un toast (alert simple para MVP)
