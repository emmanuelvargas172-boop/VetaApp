// ============================================================
// VetaApp · components/SubirArchivo.jsx
// El formulario de la pestaña "Archivos": elegir un PDF y subirlo.
//
// Antes se llamaba ArchivosMascota.jsx y hacía tres cosas —listar, subir,
// borrar—. La lista y el borrado se mudaron a ArchivosAgrupados.jsx, que
// vive en la columna derecha. El nombre cambió con el archivo: uno que se
// siga llamando "ArchivosMascota" y ya no liste archivos es un nombre que
// miente.
//
// Ninguna decisión vive acá: el límite lo decide limites.js, la redacción
// textos.js, y el orden de bucket-y-fila las rutas de api/axios.js. Este
// archivo es la pantalla, y como no hay jsdom en este proyecto, lo que no
// se pueda probar no puede decidir nada.
//
// Props:
//   mascotaId — id numérico de la mascota (lo pasa Historias.jsx).
//   archivos  — el arreglo que ya cargó el padre. Este componente NO lo
//               carga: lo necesita para contar —el cupo y el veredicto se
//               calculan contra cuántos hay—, y si lo cargara por su
//               cuenta el badge de la pestaña y este conteo podrían
//               discrepar.
//   onCambio  — callback sin argumentos que el padre llama para recargar.
//               Se invoca después de cada subida exitosa.
// ============================================================

import { useState, useRef } from 'react';
import api from '../api/axios';
import { Card, Button, SectionHeader } from './ui';
import { IconPlus } from './icons';
import { TIPOS, fmtBytes } from '../archivos/textos.js';
import { revisarArchivo, MAX_POR_MASCOTA, MAX_BYTES, MOTIVO_CUPO } from '../archivos/limites.js';

// Copiado de Historias.jsx:22-28. Mismo look en todos los formularios del
// módulo: etiqueta en mayúscula pequeña y campo de altura fija.
const labelInput = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
};
const styleInput = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
  fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

// El estado inicial del formulario. Se separa en una constante para poder
// volver acá después de subir sin olvidar ningún campo.
const FORM0 = { tipo: 'examenes', descripcion: '', fecha_documento: '' };

export default function SubirArchivo({ mascotaId, archivos, onCambio }) {
  const [form, setForm]         = useState(FORM0);
  const [archivo, setArchivo]   = useState(null);    // File | null
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef(null);

  // true cuando la mascota ya alcanzó el máximo. En ese estado se desactiva
  // todo el formulario y se muestra el mensaje correspondiente.
  const lleno = archivos.length >= MAX_POR_MASCOTA;

  // El veredicto se calcula en cada render, no solo al submit. Así el motivo
  // de rechazo aparece en el momento en que la clínica elige el archivo —
  // cuando todavía tiene el explorador abierto y puede elegir otro— y no
  // después de que le dio al botón de subir.
  //
  // revisarArchivo corre TAMBIÉN en la ruta POST /archivos. Que corra en los
  // dos lugares no es duplicación: acá le evita a la clínica esperar a que
  // suba un PDF de 12 MB para enterarse de que no pasa; la ruta lo hace para
  // que ninguna pantalla futura pueda saltarse el chequeo.
  const veredicto = archivo ? revisarArchivo(archivo, archivos.length) : null;

  const elegir = (e) => {
    // Limpiar el error de la subida anterior al elegir archivo nuevo, para
    // que la clínica no vea dos mensajes a la vez.
    setError('');
    setArchivo(e.target.files?.[0] ?? null);
  };

  const limpiar = () => {
    setForm(FORM0);
    setArchivo(null);
    // El <input type="file"> no se resetea cambiando estado React: el DOM
    // guarda la referencia al archivo. Sin esto, subir el mismo archivo dos
    // veces seguidas no dispara el onChange la segunda vez.
    if (inputRef.current) inputRef.current.value = '';
  };

  const subir = async (e) => {
    e.preventDefault();
    // veredicto null significa que no hay archivo elegido; el botón debería
    // estar desactivado, pero se valida igual para ser seguros.
    if (!veredicto?.ok || subiendo) return;

    setSubiendo(true);
    setError('');
    try {
      await api.post('/archivos', {
        archivo,
        mascota_id: mascotaId,
        tipo: form.tipo,
        descripcion: form.descripcion.trim() || null,
        fecha_documento: form.fecha_documento || null,
        // El conteo con el que se pintó esta lista. El trigger de 015 es la
        // última defensa ante una carrera entre pestañas; este valor es para
        // que el mensaje sea útil en el caso normal.
        cuantos_hay: archivos.length,
      });
      limpiar();
      await onCambio();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Card padding={0}>
      <SectionHeader
        title="Subir documento"
        subtitle={`${archivos.length} de ${MAX_POR_MASCOTA} · solo PDF, hasta ${fmtBytes(MAX_BYTES)} cada uno`}
      />

      {/* El formulario está a la vista y no detrás de un botón "Agregar":
          la pestaña se abre para subir algo, y un paso de más entre el
          escáner y el PDF es el paso donde la clínica desiste. */}
      <form onSubmit={subir} style={{ padding: '14px 18px' }}>
        <div style={{ marginBottom: 10 }}>
          <label style={labelInput}>Archivo PDF</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={elegir}
            disabled={lleno || subiendo}
            style={{ ...styleInput, height: 'auto', padding: 8 }}
          />
        </div>

        {/* El motivo del rechazo va pegado al input, no abajo del botón:
            es donde está mirando la clínica cuando acaba de elegir. */}
        {veredicto && !veredicto.ok && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--danger)' }}>
            {veredicto.motivo}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelInput}>Qué es</label>
            {/* Las opciones salen de TIPOS — las seis llaves del check de 015.
                No hay ninguna lista paralela en este archivo. Es la misma
                lista, en el mismo orden, que usa agruparPorTipo para armar
                las secciones de la derecha. */}
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              disabled={lleno || subiendo}
              style={styleInput}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>
          <div>
            {/* "opcional" en la etiqueta, no un asterisco en los obligatorios:
                así se lee lo que se puede saltar, que es lo que acelera la
                subida. */}
            <label style={labelInput}>Fecha del documento (opcional)</label>
            <input
              type="date"
              value={form.fecha_documento}
              onChange={(e) => setForm({ ...form, fecha_documento: e.target.value })}
              disabled={lleno || subiendo}
              style={styleInput}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelInput}>Descripción (opcional)</label>
          <input
            type="text"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Hemograma completo"
            disabled={lleno || subiendo}
            style={styleInput}
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<IconPlus size={13} />}
          disabled={lleno || subiendo || !veredicto?.ok}
        >
          {subiendo ? 'Subiendo…' : 'Subir documento'}
        </Button>

        {/* Cuando la mascota está en el tope, el aviso reemplaza al del archivo:
            el botón ya está desactivado y el motivo tiene que estar visible sin
            tener que elegir un archivo para verlo. */}
        {lleno && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {MOTIVO_CUPO}
          </p>
        )}

        {/* El error de SUBIDA se queda en esta columna, pegado al formulario
            que lo produjo. El de borrado vive en ArchivosAgrupados, al lado
            de la lista. Antes compartían un mismo slot porque los dos
            estaban en el mismo componente. */}
        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>
        )}
      </form>
    </Card>
  );
}
