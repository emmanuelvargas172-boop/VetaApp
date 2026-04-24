import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Calendar, Clock, PawPrint, User, Edit2,
  Trash2, ChevronDown, X, Loader2, AlertCircle,
  Search, CheckCircle2
} from 'lucide-react';
import api from '../api/axios';

const ESTADO_CONFIG = {
  pendiente:  { label: 'Pendiente',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400' },
  confirmada: { label: 'Confirmada', badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400' },
  atendida:   { label: 'Atendida',   badge: 'bg-green-100 text-green-700',  dot: 'bg-green-400' },
  cancelada:  { label: 'Cancelada',  badge: 'bg-red-100 text-red-700',      dot: 'bg-red-400' },
};

const ESPECIES = {
  perro: '🐶', gato: '🐱', ave: '🐦', conejo: '🐰', reptil: '🦎', otro: '🐾',
};

const TRANSICIONES = {
  pendiente:  ['confirmada', 'atendida', 'cancelada'],
  confirmada: ['atendida', 'cancelada'],
  atendida:   [],
  cancelada:  [],
};

export default function Citas() {
  const [citas, setCitas]                   = useState([]);
  const [cargando, setCargando]             = useState(true);
  const [error, setError]                   = useState(false);
  const [filtroFecha, setFiltroFecha]       = useState('todas');
  const [filtroEstado, setFiltroEstado]     = useState('');
  const [panelAbierto, setPanelAbierto]     = useState(false);
  const [citaEditando, setCitaEditando]     = useState(null);
  const [dropdownEstadoId, setDropdownEstadoId] = useState(null);

  const hoy = new Date().toISOString().split('T')[0];

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const params = {};
      if (filtroFecha === 'hoy') params.fecha = hoy;
      if (filtroFecha === 'semana') params.semana = hoy;
      if (filtroEstado) params.estado = filtroEstado;
      const { data } = await api.get('/citas', { params });
      setCitas(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [filtroFecha, filtroEstado]);

  const FORM_INICIAL = {
    mascota_id: '', mascota_label: '', fecha: hoy,
    hora: '', veterinario: '', motivo: '', notas: '',
  };
  const [form, setForm]               = useState(FORM_INICIAL);
  const [mascotas, setMascotas]       = useState([]);
  const [busqMascota, setBusqMascota] = useState('');
  const [errorPanel, setErrorPanel]   = useState('');
  const [guardando, setGuardando]     = useState(false);

  const veterinariosUnicos = useMemo(
    () => [...new Set(citas.map((c) => c.veterinario).filter(Boolean))],
    [citas]
  );

  const mascotasFiltradas = useMemo(() => {
    if (!busqMascota.trim()) return mascotas.slice(0, 8);
    const q = busqMascota.toLowerCase();
    return mascotas.filter(
      (m) => m.nombre.toLowerCase().includes(q) || m.dueno_nombre.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [mascotas, busqMascota]);

  const abrirPanel = (cita = null) => {
    setCitaEditando(cita);
    setErrorPanel('');
    if (cita) {
      setForm({
        mascota_id: cita.mascota_id,
        mascota_label: `${ESPECIES[cita.especie] || '🐾'} ${cita.mascota_nombre}`,
        fecha: cita.fecha,
        hora: cita.hora,
        veterinario: cita.veterinario,
        motivo: cita.motivo,
        notas: cita.notas || '',
      });
    } else {
      setForm(FORM_INICIAL);
      setBusqMascota('');
    }
    if (mascotas.length === 0) {
      api.get('/mascotas').then((r) => setMascotas(r.data)).catch(() => {});
    }
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setCitaEditando(null);
  };

  const setF = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta cita? No se puede deshacer.')) return;
    await api.delete(`/citas/${id}`);
    cargar();
  };

  const dropdownRef = useRef(null);

  useEffect(() => {
    const cerrar = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownEstadoId(null);
      }
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const cambiarEstado = async (citaId, nuevoEstado) => {
    const estadoAnterior = citas.find((c) => c.id === citaId)?.estado;
    setCitas((prev) =>
      prev.map((c) => (c.id === citaId ? { ...c, estado: nuevoEstado } : c))
    );
    setDropdownEstadoId(null);
    try {
      await api.patch(`/citas/${citaId}/estado`, { estado: nuevoEstado });
    } catch {
      setCitas((prev) =>
        prev.map((c) => (c.id === citaId ? { ...c, estado: estadoAnterior } : c))
      );
      alert('No se pudo cambiar el estado. Intenta de nuevo.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Cabecera */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Citas</h1>
          <p className="text-gray-400 text-sm mt-1">
            {cargando ? 'Cargando...' : `${citas.length} cita${citas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => abrirPanel()} className="btn-primary flex-shrink-0">
          <Plus className="w-4 h-4" /> Nueva Cita
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">No se pudo conectar al servidor.</p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {['todas', 'hoy', 'semana'].map((f) => (
          <button
            key={f}
            onClick={() => setFiltroFecha(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtroFecha === f
                ? 'bg-verde-oscuro text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-verde-claro hover:text-verde-claro'
            }`}
          >
            {{ todas: 'Todas', hoy: 'Hoy', semana: 'Esta semana' }[f]}
          </button>
        ))}

        <div className="relative ml-auto">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="input py-1.5 pr-8 text-sm appearance-none cursor-pointer"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="card p-16 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Cargando citas...</p>
        </div>
      ) : citas.length === 0 ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">
            📅
          </div>
          <p className="font-semibold text-gray-700">
            {filtroFecha === 'hoy'
              ? 'Sin citas para hoy'
              : filtroFecha === 'semana'
              ? 'Sin citas esta semana'
              : 'No hay citas registradas'}
          </p>
          <p className="text-gray-400 text-sm mt-1">Agenda la primera cita con el botón de arriba</p>
          <button onClick={() => abrirPanel()} className="btn-primary mt-5 text-sm">
            <Plus className="w-4 h-4" /> Nueva Cita
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Cabecera tabla */}
          <div className="hidden md:grid grid-cols-[80px_1.5fr_1.5fr_1fr_120px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>Hora</span>
            <span>Mascota</span>
            <span>Motivo</span>
            <span>Veterinario</span>
            <span>Estado</span>
            <span></span>
          </div>

          <div className="divide-y divide-gray-50">
            {citas.map((cita) => (
              <div
                key={cita.id}
                className="grid grid-cols-1 md:grid-cols-[80px_1.5fr_1.5fr_1fr_120px_80px] gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors items-center group"
              >
                {/* Hora */}
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-sm font-mono font-medium">{cita.hora}</span>
                </div>

                {/* Mascota */}
                <div className="flex items-center gap-2">
                  <span className="text-lg">{ESPECIES[cita.especie] || '🐾'}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{cita.mascota_nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{cita.dueno_nombre}</p>
                  </div>
                </div>

                {/* Motivo */}
                <p className="text-sm text-gray-600 truncate">{cita.motivo}</p>

                {/* Veterinario */}
                <p className="text-sm text-gray-500 truncate hidden md:block">{cita.veterinario}</p>

                {/* Estado con dropdown */}
                <div className="relative" ref={dropdownEstadoId === cita.id ? dropdownRef : null}>
                  <span
                    onClick={() => setDropdownEstadoId(dropdownEstadoId === cita.id ? null : cita.id)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full select-none ${ESTADO_CONFIG[cita.estado]?.badge} ${TRANSICIONES[cita.estado]?.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ESTADO_CONFIG[cita.estado]?.dot}`} />
                    {ESTADO_CONFIG[cita.estado]?.label}
                    {TRANSICIONES[cita.estado]?.length > 0 && <ChevronDown className="w-3 h-3" />}
                  </span>

                  {dropdownEstadoId === cita.id && TRANSICIONES[cita.estado]?.length > 0 && (
                    <div className="absolute left-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                      {TRANSICIONES[cita.estado].map((estado) => (
                        <button
                          key={estado}
                          onClick={() => cambiarEstado(cita.id, estado)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className={`w-2 h-2 rounded-full ${ESTADO_CONFIG[estado]?.dot}`} />
                          {ESTADO_CONFIG[estado]?.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => abrirPanel(cita)}
                    className="p-1.5 rounded-lg hover:bg-verde-fondo text-gray-300 hover:text-verde-claro transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => eliminar(cita.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlay */}
      {panelAbierto && (
        <div
          className="fixed inset-0 bg-black/30 z-30"
          onClick={cerrarPanel}
        />
      )}

      {/* Panel lateral */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ${
          panelAbierto ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header panel */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {citaEditando ? 'Editar Cita' : 'Nueva Cita'}
            </h2>
          </div>
          <button onClick={cerrarPanel} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <p className="p-6 text-gray-400 text-sm">Formulario aquí (Task 6)...</p>
      </div>
    </div>
  );
}
