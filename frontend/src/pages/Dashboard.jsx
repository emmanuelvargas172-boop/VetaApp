import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, CheckCircle2, PawPrint, Bell,
  Clock, ArrowRight, Plus, TrendingUp,
  AlertCircle, FileText
} from 'lucide-react';
import api from '../api/axios';

const ESTADO_CONFIG = {
  pendiente:  { label: 'Pendiente',  clase: 'bg-amber-100 text-amber-700' },
  confirmada: { label: 'Confirmada', clase: 'bg-blue-100 text-blue-700' },
  atendida:   { label: 'Atendida',   clase: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',  clase: 'bg-red-100 text-red-700' },
};

function TarjetaStat({ titulo, valor, icono, colorFondo, colorIcono, descripcion }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`${colorFondo} rounded-xl p-3 flex-shrink-0`}>
        <div className={colorIcono}>{icono}</div>
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{titulo}</p>
        <p className="text-3xl font-bold text-gray-900 mt-0.5">{valor}</p>
        {descripcion && <p className="text-xs text-gray-400 mt-1">{descripcion}</p>}
      </div>
    </div>
  );
}

function BadgeEstado({ estado }) {
  const config = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${config.clase}`}>
      {config.label}
    </span>
  );
}

function AccesoRapido({ to, icono, titulo, descripcion, color }) {
  return (
    <Link
      to={to}
      className={`card p-5 flex items-center gap-4 hover:shadow-md transition-shadow duration-150 group cursor-pointer`}
    >
      <div className={`${color} rounded-xl p-3`}>
        {icono}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900 text-sm">{titulo}</p>
        <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-verde-claro group-hover:translate-x-1 transition-all" />
    </Link>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    api.get('/dashboard')
      .then(res => { setDatos(res.data); setCargando(false); })
      .catch(() => { setError(true); setCargando(false); });
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-verde-claro border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = datos || { citasHoy: 0, atendidosHoy: 0, totalMascotas: 0, vacunasProximas: 0, citasDelDia: [] };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1 capitalize">{fechaHoy}</p>
        </div>
        <Link
          to="/citas"
          className="btn-primary text-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva cita
        </Link>
      </div>

      {error && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-sm">
            No se pudo conectar al servidor. Asegúrate de que el backend esté corriendo en el puerto 3001.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <TarjetaStat
          titulo="Citas Hoy"
          valor={stats.citasHoy}
          icono={<Calendar className="w-5 h-5" />}
          colorFondo="bg-blue-50"
          colorIcono="text-blue-500"
          descripcion="Programadas para hoy"
        />
        <TarjetaStat
          titulo="Pacientes Atendidos"
          valor={stats.atendidosHoy}
          icono={<CheckCircle2 className="w-5 h-5" />}
          colorFondo="bg-verde-fondo"
          colorIcono="text-verde-claro"
          descripcion="Completadas hoy"
        />
        <TarjetaStat
          titulo="Total Mascotas"
          valor={stats.totalMascotas}
          icono={<PawPrint className="w-5 h-5" />}
          colorFondo="bg-purple-50"
          colorIcono="text-purple-500"
          descripcion="Registradas en el sistema"
        />
        <TarjetaStat
          titulo="Vacunas Próximas"
          valor={stats.vacunasProximas}
          icono={<Bell className="w-5 h-5" />}
          colorFondo="bg-orange-50"
          colorIcono="text-orange-500"
          descripcion="Vencen en 30 días"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Citas del día */}
        <div className="lg:col-span-2 card">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Citas de Hoy</h2>
              <p className="text-xs text-gray-400 mt-0.5">{stats.citasDelDia?.length || 0} programadas</p>
            </div>
            <Link
              to="/citas"
              className="text-verde-claro text-sm font-medium flex items-center gap-1 hover:text-verde-medio transition-colors"
            >
              Ver todas <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {!stats.citasDelDia?.length ? (
            <div className="py-14 flex flex-col items-center text-center px-6">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Calendar className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium text-sm">Sin citas para hoy</p>
              <p className="text-gray-400 text-xs mt-1">Puedes agregar una nueva cita desde el módulo de agenda</p>
              <Link to="/citas" className="mt-4 btn-primary text-sm">
                <Plus className="w-4 h-4" /> Agendar cita
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.citasDelDia.map((cita) => (
                <div key={cita.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-1.5 text-gray-400 w-14 flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs font-mono font-medium">{cita.hora}</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-verde-fondo flex items-center justify-center flex-shrink-0">
                    <PawPrint className="w-4 h-4 text-verde-claro" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{cita.mascota_nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{cita.motivo}</p>
                  </div>
                  <p className="text-xs text-gray-400 hidden sm:block truncate max-w-[100px]">{cita.veterinario}</p>
                  <BadgeEstado estado={cita.estado} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acceso rápido */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 px-1">Acceso Rápido</h2>
          <AccesoRapido
            to="/mascotas"
            icono={<PawPrint className="w-5 h-5 text-verde-claro" />}
            titulo="Registrar Mascota"
            descripcion="Agregar nueva mascota y dueño"
            color="bg-verde-fondo"
          />
          <AccesoRapido
            to="/citas"
            icono={<Calendar className="w-5 h-5 text-blue-500" />}
            titulo="Agendar Cita"
            descripcion="Programar nueva cita"
            color="bg-blue-50"
          />
          <AccesoRapido
            to="/historias"
            icono={<FileText className="w-5 h-5 text-purple-500" />}
            titulo="Historia Clínica"
            descripcion="Registrar consulta médica"
            color="bg-purple-50"
          />
          <AccesoRapido
            to="/recordatorios"
            icono={<Bell className="w-5 h-5 text-orange-500" />}
            titulo="Recordatorios"
            descripcion={`${stats.vacunasProximas} vacunas por vencer`}
            color="bg-orange-50"
          />

          {/* Progreso del día */}
          {stats.citasHoy > 0 && (
            <div className="card p-5 mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Progreso del día</p>
                <TrendingUp className="w-4 h-4 text-verde-claro" />
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-verde-claro h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((stats.atendidosHoy / stats.citasHoy) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {stats.atendidosHoy} de {stats.citasHoy} citas completadas (
                {Math.round((stats.atendidosHoy / stats.citasHoy) * 100)}%)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
