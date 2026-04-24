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
