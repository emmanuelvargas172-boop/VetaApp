# Diseño: Módulo Recordatorios WhatsApp — VetaApp

**Fecha:** 2026-04-24  
**Estado:** Aprobado  

---

## Contexto

VetaApp es un software de gestión para clínicas veterinarias pequeñas en Colombia. Stack: React + Tailwind + Node.js + SQLite. El módulo muestra las mascotas con vacunas próximas a vencer y genera un enlace de WhatsApp Web con mensaje pre-llenado para notificar al dueño.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Layout | Lista simple ordenada por urgencia (no tabla, no tarjetas agrupadas) |
| Mensaje WhatsApp | Auto-generado fijo (no editable) |
| Filtro de rango | Pills 7 / 15 / 30 días (defecto: 30) |
| Arquitectura | Un solo archivo `Recordatorios.jsx` + endpoint nuevo en backend |

---

## Backend

### Endpoint nuevo

```
GET /api/historias/vacunas/proximas?dias=30
```

- JOIN: `vacunas` + `mascotas` + `duenos`
- Filtro: `proxima_dosis BETWEEN date('now') AND date('now', '+N days')`
- Orden: `proxima_dosis ASC` (más urgente primero)
- Respuesta por item:

```json
{
  "id": 1,
  "nombre": "Rabia",
  "proxima_dosis": "2026-04-27",
  "mascota_id": 3,
  "mascota_nombre": "Rex",
  "especie": "perro",
  "dueno_nombre": "Juan Pérez",
  "telefono": "3001234567"
}
```

---

## Frontend

### Archivo

`frontend/src/pages/Recordatorios.jsx` — componente único, reemplaza el placeholder actual.

### Estado local

```
recordatorios[]   — lista cargada del API
filtroDias        — 7 | 15 | 30  (defecto: 30)
cargando          — boolean
error             — boolean
```

`diasRestantes` se calcula en el cliente: `proxima_dosis - hoy` en días.

### Flujo de datos

- Montaje: `GET /api/historias/vacunas/proximas?dias=30`
- Cambio de filtro: `GET /api/historias/vacunas/proximas?dias=N`

---

## UI

### Cabecera
- Título "Recordatorios WhatsApp"
- Contador: "X vacunas próximas"

### Filtro de rango
Pills: `7 días` | `15 días` | `30 días` — activo en verde-oscuro, inactivo en borde gris.

### Lista

Cada fila contiene:
- Emoji de especie (🐶🐱🐦🐰🦎🐾)
- Nombre mascota (bold)
- Nombre vacuna
- Badge de urgencia con días restantes:
  - Rojo (`bg-red-100 text-red-700`): ≤ 7 días → "X días" (si 0 → "Hoy")
  - Ámbar (`bg-amber-100 text-amber-700`): 8–15 días → "X días"
  - Verde (`bg-green-100 text-green-700`): 16–30 días → "X días"
- Nombre dueño · teléfono (texto gris)
- Botón WhatsApp (icono verde, abre nueva pestaña)

### Cálculo de días restantes

```js
const hoy = new Date().toISOString().split('T')[0];
const diasRestantes = Math.ceil(
  (new Date(proxima_dosis + 'T12:00:00') - new Date(hoy + 'T12:00:00'))
  / (1000 * 60 * 60 * 24)
);
```

Las vacunas con `proxima_dosis` pasada no aparecen — el SQL filtra `>= date('now')`.

### Estado vacío
Ilustración + "No hay vacunas próximas en los próximos X días".

---

## Enlace WhatsApp

```
https://wa.me/57{telefono_limpio}?text={mensaje_codificado}
```

- `telefono_limpio`: teléfono sin caracteres no numéricos (`replace(/\D/g, '')`)
- Abre en nueva pestaña (`target="_blank"`)

### Mensaje generado

```
Hola {dueno_nombre}, le recordamos que {mascota_nombre} tiene pendiente su vacuna de {nombre_vacuna} el {fecha_larga}. Por favor comuníquese con nosotros para agendar su cita. 🐾
```

- `fecha_larga`: formato "lunes 5 de mayo" (español Colombia)
  ```js
  new Date(proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
  ```

---

## Manejo de errores

- Si el backend no responde: banner de aviso + lista vacía (igual que Dashboard y Citas)
