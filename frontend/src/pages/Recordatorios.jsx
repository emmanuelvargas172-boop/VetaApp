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
}
