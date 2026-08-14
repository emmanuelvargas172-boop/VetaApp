import { useState, useEffect } from 'react';
import { Package, Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import api from '../api/axios';

const CATEGORIAS = ['Medicamentos', 'Vacunas', 'Antiparasitarios', 'Accesorios', 'Alimentos', 'Otros'];
const UNIDADES   = ['unidad', 'caja', 'frasco', 'ampolla'];

const FORM_INICIAL = {
  nombre: '', categoria: 'Medicamentos', unidad: 'unidad',
  cantidad: '', cantidad_minima: '', precio_compra: '', precio_venta: '',
};

function estadoBadge(cantidad, cantidad_minima) {
  if (cantidad <= 0)                               return { cls: 'bg-red-100 text-red-700',    label: 'Agotado' };
  if (cantidad > 0 && cantidad <= cantidad_minima) return { cls: 'bg-amber-100 text-amber-700', label: 'Por agotarse' };
  return                                                  { cls: 'bg-green-100 text-green-700',  label: 'OK' };
}

function formatCOP(val) {
  if (val == null || val === '') return '—';
  return Number(val).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
}

export default function Operaciones() {
  const [productos,        setProductos]        = useState([]);
  const [filtroCategoria,  setFiltroCategoria]  = useState('Todos');
  const [cargando,         setCargando]         = useState(true);
  const [error,            setError]            = useState(false);
  const [panelAbierto,     setPanelAbierto]     = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [guardando,        setGuardando]        = useState(false);
  const [errorPanel,       setErrorPanel]       = useState('');
  const [formProducto,     setFormProducto]     = useState(FORM_INICIAL);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargarProductos(); }, []);

  async function cargarProductos() {
    setCargando(true);
    setError(false);
    try {
      const { data } = await api.get('/inventario');
      setProductos(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  function abrirNuevo() {
    setProductoEditando(null);
    setFormProducto(FORM_INICIAL);
    setErrorPanel('');
    setPanelAbierto(true);
  }

  function abrirEditar(p) {
    setProductoEditando(p);
    setFormProducto({
      nombre:          p.nombre,
      categoria:       p.categoria,
      unidad:          p.unidad,
      cantidad:        String(p.cantidad),
      cantidad_minima: String(p.cantidad_minima),
      precio_compra:   p.precio_compra != null ? String(p.precio_compra) : '',
      precio_venta:    p.precio_venta  != null ? String(p.precio_venta)  : '',
    });
    setErrorPanel('');
    setPanelAbierto(true);
  }

  function cerrarPanel() {
    setPanelAbierto(false);
    setProductoEditando(null);
  }

  async function guardarProducto(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setErrorPanel('');
    const body = {
      nombre:          formProducto.nombre.trim(),
      categoria:       formProducto.categoria,
      unidad:          formProducto.unidad,
      cantidad:        parseInt(formProducto.cantidad, 10),
      cantidad_minima: parseInt(formProducto.cantidad_minima, 10),
      precio_compra:   formProducto.precio_compra !== '' ? parseFloat(formProducto.precio_compra) : null,
      precio_venta:    formProducto.precio_venta  !== '' ? parseFloat(formProducto.precio_venta)  : null,
    };
    if (isNaN(body.cantidad) || isNaN(body.cantidad_minima)) {
      setErrorPanel('Cantidad y cantidad mínima deben ser números enteros válidos');
      setGuardando(false);
      return;
    }
    try {
      if (productoEditando) await api.put(`/inventario/${productoEditando.id}`, body);
      else                  await api.post('/inventario', body);
      cerrarPanel();
      cargarProductos();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || err.message || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarProducto(p) {
    if (!window.confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/inventario/${p.id}`);
      cargarProductos();
    } catch {
      alert('No se pudo eliminar el producto. Intenta de nuevo.');
    }
  }

  const productosFiltrados = filtroCategoria === 'Todos'
    ? productos
    : productos.filter(p => p.categoria === filtroCategoria);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-7 h-7 text-verde-oscuro" />
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Agregar producto
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">No se pudo cargar el inventario. Verifica la conexión.</span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['Todos', ...CATEGORIAS].map(cat => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtroCategoria === cat
                ? 'bg-verde-oscuro text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-verde-claro hover:text-verde-oscuro'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="card text-center py-12 text-gray-400">Cargando inventario…</div>
      ) : productosFiltrados.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin productos registrados</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Agrega el primer producto al inventario</p>
          <button onClick={abrirNuevo} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Agregar producto
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Stock</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Mín.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">P. Compra</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">P. Venta</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p, i) => {
                const badge = estadoBadge(p.cantidad, p.cantidad_minima);
                return (
                  <tr
                    key={p.id}
                    className={`group border-b border-gray-100 hover:bg-verde-fondo transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.nombre}
                      <span className="ml-1.5 text-xs text-gray-400">({p.unidad})</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.categoria}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">{p.cantidad}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{p.cantidad_minima}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCOP(p.precio_compra)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCOP(p.precio_venta)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          onClick={() => abrirEditar(p)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-verde-oscuro transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => eliminarProducto(p)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
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
      {panelAbierto && (
        <div className="fixed inset-0 bg-black/20 z-30" onClick={cerrarPanel} />
      )}

      {/* Panel lateral */}
      <aside
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ${
          panelAbierto ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header panel */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {productoEditando ? 'Editar Producto' : 'Nuevo Producto'}
          </h2>
          <button onClick={cerrarPanel} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form id="form-producto" onSubmit={guardarProducto} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {errorPanel && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {errorPanel}
            </div>
          )}

          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              value={formProducto.nombre}
              onChange={e => setFormProducto(f => ({ ...f, nombre: e.target.value }))}
              required
              placeholder="Ej: Amoxicilina 500mg"
            />
          </div>

          <div>
            <label className="label">Categoría *</label>
            <select
              className="input"
              value={formProducto.categoria}
              onChange={e => setFormProducto(f => ({ ...f, categoria: e.target.value }))}
              required
            >
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Unidad *</label>
            <select
              className="input"
              value={formProducto.unidad}
              onChange={e => setFormProducto(f => ({ ...f, unidad: e.target.value }))}
              required
            >
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cantidad actual *</label>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={formProducto.cantidad}
                onChange={e => setFormProducto(f => ({ ...f, cantidad: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Cantidad mínima *</label>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={formProducto.cantidad_minima}
                onChange={e => setFormProducto(f => ({ ...f, cantidad_minima: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio de compra</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={formProducto.precio_compra}
                onChange={e => setFormProducto(f => ({ ...f, precio_compra: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="label">Precio de venta</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={formProducto.precio_venta}
                onChange={e => setFormProducto(f => ({ ...f, precio_venta: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button type="button" onClick={cerrarPanel} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="submit"
            form="form-producto"
            className="btn-primary flex-1"
            disabled={guardando}
          >
            {guardando ? 'Guardando…' : productoEditando ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </aside>
    </div>
  );
}
