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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <p className="text-gray-400">Cargando módulo... ({citas.length} citas)</p>
    </div>
  );
}
