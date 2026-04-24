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

  const abrirPanel = (cita = null) => {
    setCitaEditando(cita);
    setPanelAbierto(true);
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

      <p className="text-gray-400 text-sm">Tabla de citas aquí...</p>
    </div>
  );
}
