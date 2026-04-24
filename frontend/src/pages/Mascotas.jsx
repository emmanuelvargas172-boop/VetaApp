import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, PawPrint, Phone, MapPin, ArrowLeft,
  Edit2, Trash2, Calendar, FileText, MessageCircle,
  Weight, Clock, User, ChevronRight, X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import ModalMascota from '../components/ModalMascota';

const ESPECIES = {
  perro:  { emoji: '🐶', color: 'bg-blue-100 text-blue-700',   label: 'Perro' },
  gato:   { emoji: '🐱', color: 'bg-purple-100 text-purple-700', label: 'Gato' },
  ave:    { emoji: '🐦', color: 'bg-yellow-100 text-yellow-700', label: 'Ave' },
  conejo: { emoji: '🐰', color: 'bg-pink-100 text-pink-700',   label: 'Conejo' },
  reptil: { emoji: '🦎', color: 'bg-verde-fondo text-verde-claro', label: 'Reptil' },
  otro:   { emoji: '🐾', color: 'bg-gray-100 text-gray-600',   label: 'Otro' },
};

function formatEdad(anios, meses) {
  const a = Number(anios) || 0;
  const m = Number(meses) || 0;
  if (a === 0 && m === 0) return '—';
  if (a === 0) return `${m} mes${m !== 1 ? 'es' : ''}`;
  if (m === 0) return `${a} año${a !== 1 ? 's' : ''}`;
  return `${a}a ${m}m`;
}

function Avatar({ mascota, size = 'md' }) {
  const esp = ESPECIES[mascota.especie] || ESPECIES.otro;
  const sizes = { sm: 'w-9 h-9 text-lg', md: 'w-12 h-12 text-2xl', lg: 'w-20 h-20 text-4xl' };
  if (mascota.foto) {
    return <img src={mascota.foto} alt={mascota.nombre} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${sizes[size]} ${esp.color} rounded-full flex items-center justify-center flex-shrink-0`}>
      {esp.emoji}
    </div>
  );
}

// ─── Vista: Perfil de mascota ────────────────────────────────────────────────
function PerfilMascota({ mascota, onVolver, onEditar, onEliminar }) {
  const esp = ESPECIES[mascota.especie] || ESPECIES.otro;
  const waLink = `https://wa.me/57${mascota.dueno_telefono?.replace(/\D/g, '')}`;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Barra superior */}
      <button
        onClick={onVolver}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-medium mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a la lista
      </button>

      {/* Header perfil */}
      <div className="card p-6 mb-5">
        <div className="flex items-start gap-5">
          <Avatar mascota={mascota} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{mascota.nombre}</h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${esp.color}`}>
                    {esp.emoji} {esp.label}
                  </span>
                  {mascota.raza && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                      {mascota.raza}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={onEditar}
                  className="btn-secondary text-sm py-1.5 px-3"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={onEliminar}
                  className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              </div>
            </div>

            {/* Stats rápidas */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <Clock className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Edad</p>
                <p className="font-semibold text-gray-900 text-sm">{formatEdad(mascota.edad_anios, mascota.edad_meses)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <Weight className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Peso</p>
                <p className="font-semibold text-gray-900 text-sm">{mascota.peso ? `${mascota.peso} kg` : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <Calendar className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Registro</p>
                <p className="font-semibold text-gray-900 text-sm">
                  {new Date(mascota.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Datos del dueño */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-verde-claro" /> Datos del Dueño
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Nombre</p>
                <p className="font-medium text-gray-900">{mascota.dueno_nombre}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Teléfono</p>
                <p className="font-medium text-gray-900">{mascota.dueno_telefono}</p>
              </div>
            </div>
            {mascota.dueno_direccion && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Dirección</p>
                  <p className="font-medium text-gray-900">{mascota.dueno_direccion}</p>
                </div>
              </div>
            )}
          </div>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe59] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors w-full"
          >
            <MessageCircle className="w-4 h-4" />
            Enviar WhatsApp
          </a>
        </div>

        {/* Acciones */}
        <div className="space-y-3">
          <Link
            to="/citas"
            className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group cursor-pointer"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Agendar Cita</p>
              <p className="text-xs text-gray-400">Programar consulta</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-verde-claro" />
          </Link>

          <Link
            to={`/historias/${mascota.id}`}
            className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group cursor-pointer"
          >
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">Nueva Historia Clínica</p>
              <p className="text-xs text-gray-400">Registrar consulta médica</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-verde-claro" />
          </Link>

          <div className="card p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ID del registro</p>
            <p className="font-mono text-sm text-gray-500">MASC-{String(mascota.id).padStart(4, '0')}</p>
            <p className="text-xs text-gray-400 mt-1">
              Registrada el {new Date(mascota.created_at).toLocaleDateString('es-CO', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Historia y vacunas - próximamente */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Historial Clínico</h2>
          <Link to={`/historias/${mascota.id}`} className="text-xs text-verde-claro hover:text-verde-medio font-medium">Ver historial →</Link>
        </div>
        <div className="py-8 text-center text-gray-300">
          <FileText className="w-10 h-10 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No hay registros clínicos todavía</p>
          <p className="text-xs text-gray-300 mt-1">El historial aparecerá aquí una vez que registres consultas</p>
        </div>
      </div>
    </div>
  );
}

// ─── Vista: Lista de mascotas ────────────────────────────────────────────────
export default function Mascotas() {
  const [mascotas, setMascotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [mascotaEditar, setMascotaEditar] = useState(null);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState(null);

  const cargar = () => {
    setCargando(true);
    api.get('/mascotas')
      .then((r) => setMascotas(r.data))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return mascotas;
    const q = busqueda.toLowerCase();
    return mascotas.filter(
      (m) =>
        m.nombre.toLowerCase().includes(q) ||
        m.dueno_nombre.toLowerCase().includes(q) ||
        m.raza?.toLowerCase().includes(q) ||
        m.especie.toLowerCase().includes(q)
    );
  }, [mascotas, busqueda]);

  const abrirEditar = (m, e) => {
    e?.stopPropagation();
    setMascotaEditar(m);
    setShowModal(true);
  };

  const eliminar = async (m, e) => {
    e?.stopPropagation();
    if (!window.confirm(`¿Eliminar a ${m.nombre}? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/mascotas/${m.id}`);
    if (mascotaSeleccionada?.id === m.id) setMascotaSeleccionada(null);
    cargar();
  };

  const handleSuccess = () => {
    cargar();
    setMascotaEditar(null);
    if (mascotaSeleccionada) {
      // Actualizar mascota seleccionada con datos frescos
      api.get(`/mascotas/${mascotaSeleccionada.id}`)
        .then((r) => setMascotaSeleccionada(r.data))
        .catch(() => setMascotaSeleccionada(null));
    }
  };

  // Vista perfil
  if (mascotaSeleccionada) {
    return (
      <>
        <PerfilMascota
          mascota={mascotaSeleccionada}
          onVolver={() => setMascotaSeleccionada(null)}
          onEditar={() => abrirEditar(mascotaSeleccionada)}
          onEliminar={async () => {
            if (!window.confirm(`¿Eliminar a ${mascotaSeleccionada.nombre}?`)) return;
            await api.delete(`/mascotas/${mascotaSeleccionada.id}`);
            setMascotaSeleccionada(null);
            cargar();
          }}
        />
        <ModalMascota
          isOpen={showModal}
          onClose={() => { setShowModal(false); setMascotaEditar(null); }}
          onSuccess={handleSuccess}
          mascotaEditar={mascotaEditar}
        />
      </>
    );
  }

  // Vista lista
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mascotas y Dueños</h1>
          <p className="text-gray-400 text-sm mt-1">{mascotas.length} mascota{mascotas.length !== 1 ? 's' : ''} registrada{mascotas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setMascotaEditar(null); setShowModal(true); }}
          className="btn-primary flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Registrar Mascota
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-300" />
        <input
          className="input pl-10 py-3 text-sm"
          placeholder="Buscar por nombre de mascota, dueño, raza o especie..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="absolute right-3 top-3">
            <X className="w-4 h-4 text-gray-300 hover:text-gray-500" />
          </button>
        )}
      </div>

      {/* Tabla / lista */}
      {cargando ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-8 h-8 border-4 border-verde-claro border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Cargando mascotas...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-verde-fondo rounded-2xl flex items-center justify-center mb-4 text-3xl">
            🐾
          </div>
          <p className="font-semibold text-gray-700">
            {busqueda ? 'Sin resultados para tu búsqueda' : 'Aún no hay mascotas registradas'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {busqueda
              ? `No encontramos mascotas que coincidan con "${busqueda}"`
              : 'Registra la primera mascota para comenzar'}
          </p>
          {!busqueda && (
            <button
              onClick={() => { setMascotaEditar(null); setShowModal(true); }}
              className="btn-primary mt-5 text-sm"
            >
              <Plus className="w-4 h-4" /> Registrar primera mascota
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Cabecera tabla */}
          <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_1.5fr_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>Mascota</span>
            <span>Especie / Raza</span>
            <span>Edad / Peso</span>
            <span>Dueño</span>
            <span>Teléfono</span>
            <span></span>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-50">
            {filtradas.map((m) => {
              const esp = ESPECIES[m.especie] || ESPECIES.otro;
              return (
                <div
                  key={m.id}
                  onClick={() => setMascotaSeleccionada(m)}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_1.5fr_1fr_auto] gap-4 px-5 py-4 hover:bg-gray-50/60 cursor-pointer transition-colors items-center group"
                >
                  {/* Mascota */}
                  <div className="flex items-center gap-3">
                    <Avatar mascota={m} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate group-hover:text-verde-claro transition-colors">
                        {m.nombre}
                      </p>
                      <p className="text-xs text-gray-400 md:hidden">{esp.emoji} {esp.label} · {m.raza || 'Sin raza'}</p>
                    </div>
                  </div>

                  {/* Especie/Raza */}
                  <div className="hidden md:block">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${esp.color}`}>
                      {esp.emoji} {esp.label}
                    </span>
                    <p className="text-xs text-gray-400 mt-1 truncate">{m.raza || '—'}</p>
                  </div>

                  {/* Edad/Peso */}
                  <div className="hidden md:block">
                    <p className="text-sm text-gray-700">{formatEdad(m.edad_anios, m.edad_meses)}</p>
                    <p className="text-xs text-gray-400">{m.peso ? `${m.peso} kg` : '—'}</p>
                  </div>

                  {/* Dueño */}
                  <div className="hidden md:flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-700 truncate">{m.dueno_nombre}</p>
                  </div>

                  {/* Teléfono */}
                  <div className="hidden md:flex items-center gap-1.5 text-sm text-gray-500">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{m.dueno_telefono}</span>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => abrirEditar(m, e)}
                      className="p-1.5 rounded-lg hover:bg-verde-fondo text-gray-300 hover:text-verde-claro transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => eliminar(m, e)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ModalMascota
        isOpen={showModal}
        onClose={() => { setShowModal(false); setMascotaEditar(null); }}
        onSuccess={handleSuccess}
        mascotaEditar={mascotaEditar}
      />
    </div>
  );
}
