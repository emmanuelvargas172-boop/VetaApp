import { useState, useEffect, useRef } from 'react';
import { X, PawPrint, Upload, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { normalizarEspecie } from './icons';
import { edadDesde, textoEdad } from '../utils/edad';

const INICIAL = {
  nombre: '', especie: 'perro', especieOtro: '', raza: '',
  fecha_nacimiento: '', edad_anios: '', edad_meses: '', peso: '',
  dueno_cedula: '', dueno_nombre: '', dueno_telefono: '', dueno_telefono2: '', dueno_direccion: '',
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

  // Tope del calendario. Se arma con getFullYear/getMonth/getDate y no con
  // toISOString, que convierte a UTC: en Colombia (UTC-5), de 7pm en
  // adelante toISOString ya devuelve la fecha de mañana y el input dejaría
  // elegir un nacimiento futuro. Se calcula en el render, no en el módulo,
  // para que no se quede en ayer si la pestaña pasa la medianoche abierta.
  const n = new Date();
  const hoyISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;

  // null cuando no hay fecha, o cuando la que hay es imposible o futura
  // (el `max` del input se puede saltar escribiendo a mano). En ese caso
  // vuelven los dos campos de edad escribibles.
  const edadDerivada = edadDesde(form.fecha_nacimiento);

  useEffect(() => {
    if (!isOpen) return;
    if (mascotaEditar) {
      const esp = normalizarEspecie(mascotaEditar.especie) || 'perro';
      const esBase = esp === 'perro' || esp === 'gato';
      setForm({
        nombre: mascotaEditar.nombre || '',
        especie: esBase ? esp : 'otro',
        especieOtro: esBase || esp === 'otro' ? '' : esp,
        raza: mascotaEditar.raza || '',
        fecha_nacimiento: mascotaEditar.fecha_nacimiento || '',
        edad_anios: mascotaEditar.edad_anios ?? '',
        edad_meses: mascotaEditar.edad_meses ?? '',
        peso: mascotaEditar.peso ?? '',
        dueno_cedula: mascotaEditar.dueno_cedula || '',
        dueno_nombre: mascotaEditar.dueno_nombre || '',
        dueno_telefono: mascotaEditar.dueno_telefono || '',
        dueno_telefono2: mascotaEditar.dueno_telefono2 || '',
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
          // Si no se autocompletaran, el formulario los mandaría vacíos y
          // el PUT de más abajo le borraría al tutor la cédula y el
          // segundo teléfono que ya tenía guardados.
          dueno_cedula: data.cedula || '',
          dueno_telefono2: data.telefono2 || '',
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
    // Se guarda normalizado para que "Hámster" y "hamster" no sean dos especies.
    const especieFinal = form.especie === 'otro'
      ? (normalizarEspecie(form.especieOtro) || 'otro')
      : form.especie;
    setCargando(true);
    setError('');
    try {
      let dueno_id;

      // Los cinco campos viajan juntos en los dos caminos. `parseDuenoBody`
      // en axios.js solo escribe las llaves que recibe, así que mandar las
      // cinco es también lo que evita borrar lo que no se tocó.
      const dueno = {
        nombre: form.dueno_nombre,
        telefono: form.dueno_telefono,
        telefono2: form.dueno_telefono2,
        direccion: form.dueno_direccion,
        cedula: form.dueno_cedula,
      };

      if (editando) {
        await api.put(`/duenos/${mascotaEditar.dueno_id}`, dueno);
        dueno_id = mascotaEditar.dueno_id;
      } else {
        const { data: existente } = await api.get(`/duenos/buscar?telefono=${form.dueno_telefono.trim()}`);
        if (existente) {
          dueno_id = existente.id;
        } else {
          const { data: nuevo } = await api.post('/duenos', dueno);
          dueno_id = nuevo.id;
        }
      }

      const fd = new FormData();
      fd.append('nombre', form.nombre.trim());
      fd.append('especie', especieFinal);
      fd.append('raza', form.raza.trim());
      fd.append('fecha_nacimiento', form.fecha_nacimiento || '');
      fd.append('edad_anios', form.edad_anios || 0);
      fd.append('edad_meses', form.edad_meses || 0);
      fd.append('peso', form.peso || '');
      fd.append('dueno_id', dueno_id);
      if (form.foto) fd.append('foto', form.foto);

      const { data } = editando
        ? await api.put(`/mascotas/${mascotaEditar.id}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        : await api.post('/mascotas', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

      // Se devuelve la mascota guardada para que quien abrió el modal pueda
      // usarla de una. Citas la necesita para dejarla ya elegida en la cita
      // que se estaba creando: obligar a buscarla otra vez, parado frente al
      // cliente, es justo donde se pierde el hilo. Mascotas pasa `cargar` y
      // no recibe nada, que es compatible: un argumento de más se ignora.
      onSuccess(data);
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
                  <option value="otro">🐾 Otro</option>
                </select>
              </div>
              {form.especie === 'otro' && (
                <div className="col-span-2">
                  <label className="label">¿Qué animal es?</label>
                  <input
                    className="input"
                    placeholder="Ej: Conejo, Hámster, Loro"
                    value={form.especieOtro}
                    onChange={set('especieOtro')}
                  />
                </div>
              )}
              <div className="col-span-2">
                <label className="label">Raza</label>
                <input className="input" placeholder="Ej: Golden Retriever" value={form.raza} onChange={set('raza')} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Fecha de nacimiento</label>
                <input
                  className="input"
                  type="date"
                  max={hoyISO}
                  value={form.fecha_nacimiento}
                  onChange={set('fecha_nacimiento')}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {edadDerivada
                    ? 'La edad se calcula sola desde esta fecha.'
                    : 'Si la sabe, la edad no se vuelve a desactualizar.'}
                </p>
              </div>

              {/* Con fecha de nacimiento la edad se muestra, no se escribe:
                  dos campos editables que dicen cosas distintas de la misma
                  mascota es peor que un campo menos. Sin fecha —que es el
                  caso de todo lo registrado antes de la migración 011— los
                  dos campos de edad siguen ahí tal como estaban. */}
              {edadDerivada ? (
                <div className="col-span-2 sm:col-span-1">
                  <label className="label">Edad</label>
                  <div className="input bg-gray-50 text-gray-600 flex items-center">
                    {textoEdad(edadDerivada)}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Edad — Años</label>
                    <input className="input" type="number" min="0" max="30" placeholder="0" value={form.edad_anios} onChange={set('edad_anios')} />
                  </div>
                  <div>
                    <label className="label">Edad — Meses</label>
                    <input className="input" type="number" min="0" max="11" placeholder="0" value={form.edad_meses} onChange={set('edad_meses')} />
                  </div>
                </>
              )}
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
              {/* Un solo campo con dos números pegados ("3181111111-3182222222")
                  rompe el enlace de WhatsApp: normalizarTelefonoCO decide por
                  el largo del número y 20 dígitos no son un celular, así que
                  devuelve null y el botón queda apagado sin decir por qué. */}
              <div className="col-span-2">
                <label className="label">Segundo teléfono</label>
                <input className="input" placeholder="Opcional" value={form.dueno_telefono2} onChange={set('dueno_telefono2')} />
              </div>
              <div className="col-span-2">
                <label className="label">Nombre del dueño *</label>
                <input className="input" placeholder="Ej: Carlos Martínez" value={form.dueno_nombre} onChange={set('dueno_nombre')} required />
              </div>
              <div className="col-span-2">
                <label className="label">Cédula</label>
                <input className="input" placeholder="Opcional · solo números" value={form.dueno_cedula} onChange={set('dueno_cedula')} />
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
