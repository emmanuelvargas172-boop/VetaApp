import { useState, useEffect, useRef } from 'react';
import { X, PawPrint, Upload, Loader2 } from 'lucide-react';
import api from '../api/axios';

const INICIAL = {
  nombre: '', especie: 'perro', raza: '',
  edad_anios: '', edad_meses: '', peso: '',
  dueno_nombre: '', dueno_telefono: '', dueno_direccion: '',
  foto: null,
};

export default function ModalMascota({ isOpen, onClose, onSuccess, mascotaEditar }) {
  const [form, setForm] = useState(INICIAL);
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [buscandoDueno, setBuscandoDueno] = useState(false);
  const fileRef = useRef();

  const editando = !!mascotaEditar;

  useEffect(() => {
    if (!isOpen) return;
    if (mascotaEditar) {
      setForm({
        nombre: mascotaEditar.nombre || '',
        especie: mascotaEditar.especie || 'perro',
        raza: mascotaEditar.raza || '',
        edad_anios: mascotaEditar.edad_anios ?? '',
        edad_meses: mascotaEditar.edad_meses ?? '',
        peso: mascotaEditar.peso ?? '',
        dueno_nombre: mascotaEditar.dueno_nombre || '',
        dueno_telefono: mascotaEditar.dueno_telefono || '',
        dueno_direccion: mascotaEditar.dueno_direccion || '',
        foto: null,
      });
      setPreview(mascotaEditar.foto || null);
    } else {
      setForm(INICIAL);
      setPreview(null);
    }
    setError('');
  }, [isOpen, mascotaEditar]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const handleFoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm((f) => ({ ...f, foto: file }));
    setPreview(URL.createObjectURL(file));
  };

  const buscarDuenoPorTelefono = async () => {
    const tel = form.dueno_telefono.trim();
    if (!tel || editando) return;
    setBuscandoDueno(true);
    try {
      const { data } = await api.get(`/duenos/buscar?telefono=${tel}`);
      if (data) {
        setForm((f) => ({
          ...f,
          dueno_nombre: data.nombre,
          dueno_direccion: data.direccion || '',
        }));
      }
    } catch (_) {}
    setBuscandoDueno(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.dueno_nombre.trim() || !form.dueno_telefono.trim()) {
      setError('Nombre de la mascota, nombre y teléfono del dueño son requeridos.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      let dueno_id;

      if (editando) {
        await api.put(`/duenos/${mascotaEditar.dueno_id}`, {
          nombre: form.dueno_nombre,
          telefono: form.dueno_telefono,
          direccion: form.dueno_direccion,
        });
        dueno_id = mascotaEditar.dueno_id;
      } else {
        const { data: existente } = await api.get(`/duenos/buscar?telefono=${form.dueno_telefono.trim()}`);
        if (existente) {
          dueno_id = existente.id;
        } else {
          const { data: nuevo } = await api.post('/duenos', {
            nombre: form.dueno_nombre,
            telefono: form.dueno_telefono,
            direccion: form.dueno_direccion,
          });
          dueno_id = nuevo.id;
        }
      }

      const fd = new FormData();
      fd.append('nombre', form.nombre.trim());
      fd.append('especie', form.especie);
      fd.append('raza', form.raza.trim());
      fd.append('edad_anios', form.edad_anios || 0);
      fd.append('edad_meses', form.edad_meses || 0);
      fd.append('peso', form.peso || '');
      fd.append('dueno_id', dueno_id);
      if (form.foto) fd.append('foto', form.foto);

      if (editando) {
        await api.put(`/mascotas/${mascotaEditar.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/mascotas', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Ocurrió un error. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-verde-fondo rounded-lg flex items-center justify-center">
              <PawPrint className="w-4 h-4 text-verde-claro" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {editando ? 'Editar Mascota' : 'Registrar Mascota'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Foto */}
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl bg-verde-fondo border-2 border-dashed border-verde-suave flex items-center justify-center cursor-pointer overflow-hidden hover:bg-verde-fondo/80 transition-colors flex-shrink-0"
              onClick={() => fileRef.current?.click()}
            >
              {preview
                ? <img src={preview} alt="preview" className="w-full h-full object-cover" />
                : <Upload className="w-6 h-6 text-verde-claro" />
              }
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Foto de la mascota</p>
              <p className="text-xs text-gray-400 mt-0.5">Opcional · JPG, PNG hasta 5MB</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 text-xs text-verde-claro hover:text-verde-medio font-medium"
              >
                Seleccionar foto
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
          </div>

          {/* Sección mascota */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Datos de la Mascota
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Nombre *</label>
                <input className="input" placeholder="Ej: Firulais" value={form.nombre} onChange={set('nombre')} required />
              </div>
              <div>
                <label className="label">Especie *</label>
                <select className="input" value={form.especie} onChange={set('especie')}>
                  <option value="perro">🐶 Perro</option>
                  <option value="gato">🐱 Gato</option>
                  <option value="ave">🐦 Ave</option>
                  <option value="conejo">🐰 Conejo</option>
                  <option value="reptil">🦎 Reptil</option>
                  <option value="otro">🐾 Otro</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Raza</label>
                <input className="input" placeholder="Ej: Golden Retriever" value={form.raza} onChange={set('raza')} />
              </div>
              <div>
                <label className="label">Edad — Años</label>
                <input className="input" type="number" min="0" max="30" placeholder="0" value={form.edad_anios} onChange={set('edad_anios')} />
              </div>
              <div>
                <label className="label">Edad — Meses</label>
                <input className="input" type="number" min="0" max="11" placeholder="0" value={form.edad_meses} onChange={set('edad_meses')} />
              </div>
              <div>
                <label className="label">Peso (kg)</label>
                <input className="input" type="number" step="0.1" min="0" placeholder="Ej: 12.5" value={form.peso} onChange={set('peso')} />
              </div>
            </div>
          </div>

          {/* Sección dueño */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Datos del Dueño
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Teléfono WhatsApp *</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    placeholder="Ej: 3001234567"
                    value={form.dueno_telefono}
                    onChange={set('dueno_telefono')}
                    onBlur={buscarDuenoPorTelefono}
                    required
                  />
                  {buscandoDueno && (
                    <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-verde-claro animate-spin" />
                  )}
                </div>
                {!editando && (
                  <p className="text-xs text-gray-400 mt-1">Si el dueño ya existe, sus datos se autocompletarán.</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="label">Nombre del dueño *</label>
                <input className="input" placeholder="Ej: Carlos Martínez" value={form.dueno_nombre} onChange={set('dueno_nombre')} required />
              </div>
              <div className="col-span-2">
                <label className="label">Dirección</label>
                <input className="input" placeholder="Ej: Calle 45 #12-30, Bucaramanga" value={form.dueno_direccion} onChange={set('dueno_direccion')} />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={cargando} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
              {editando ? 'Guardar cambios' : 'Registrar mascota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
