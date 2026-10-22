// ============================================================
// VetaApp · components/ArchivosAgrupados.jsx
// Los PDF de una mascota, en la columna derecha, partidos en secciones.
//
// Salió de ArchivosMascota.jsx (hoy SubirArchivo.jsx), que listaba y subía
// en la misma tarjeta. Se separó cuando la lista se mudó a la derecha: el
// formulario y la lista pasaron a ser dos pantallas en dos columnas, y
// cada una se quedó con su estado. Acá viven `abriendo`, `borrando` y el
// archivo que el modal está preguntando si borrar; en SubirArchivo quedó
// lo del formulario.
//
// QUÉ ARCHIVOS SE VEN Y EN QUÉ ORDEN no se decide acá: lo decide
// `agruparPorTipo` (archivos/textos.js), que es una función pura y por eso
// tiene pruebas. Este archivo es el pincel. Sin jsdom en el proyecto, lo
// que viva en el JSX no se puede probar, así que acá no puede vivir nada
// que importe.
//
// Props:
//   archivos — la lista plana que cargó Historias.jsx. Llega ordenada por
//              created_at desc desde GET /archivos/mascota/:id, y ese
//              orden se respeta dentro de cada sección.
//   onCambio — para recargar después de un borrado exitoso.
// ============================================================

import { useState } from 'react';
import api from '../api/axios';
import { Card, Button, SectionHeader, iconBtnStyle } from './ui';
import ConfirmDialog from './ConfirmDialog';
import { IconFile, IconTrash, IconArrowRight } from './icons';
import { agruparPorTipo, textoArchivo, fmtBytes, preguntaBorrado } from '../archivos/textos.js';

export default function ArchivosAgrupados({ archivos, onCambio }) {
  const [error, setError]       = useState('');
  const [abriendo, setAbriendo] = useState(null);    // id del archivo que se está abriendo
  const [borrando, setBorrando] = useState(null);    // id del archivo que se está borrando
  // La fila que el modal está preguntando si borrar. Se guarda el objeto
  // entero y no el id porque el texto de la pregunta nombra el archivo y
  // su tipo, y buscarlo de nuevo en la lista para redactar la pregunta es
  // una búsqueda que puede no encontrar nada si la lista se recargó.
  const [porBorrar, setPorBorrar] = useState(null);  // archivo | null

  const grupos = agruparPorTipo(archivos);

  // La URL firmada se pide acá, en el clic, y se usa de inmediato. Vive
  // 300 s y NO se guarda en ningún estado: un estado con URLs firmadas
  // adentro es una lista de llaves que se van venciendo mientras la pestaña
  // está abierta. Cinco minutos después el botón abrirá un error 403.
  const abrir = async (a) => {
    setAbriendo(a.id);
    setError('');
    try {
      const { data } = await api.get(`/archivos/${a.id}/url`);
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo abrir el archivo');
    } finally {
      setAbriendo(null);
    }
  };

  // Borrar un documento clínico no se deshace. El botón de la fila no
  // borra: abre la pregunta. Quien borra es `confirmarBorrado`, y solo lo
  // llama el botón rojo del modal.
  const borrar = (a) => {
    setError('');
    setPorBorrar(a);
  };

  const confirmarBorrado = async () => {
    const a = porBorrar;
    if (!a || borrando) return;

    setBorrando(a.id);
    setError('');
    try {
      await api.delete(`/archivos/${a.id}`);
      // El modal se cierra recién acá, con el borrado ya hecho. Cerrarlo
      // antes del await lo dejaría desaparecer mientras la petición todavía
      // va en camino, y un error de red se mostraría sin nada en pantalla
      // que explique a qué archivo se refiere.
      setPorBorrar(null);
      await onCambio();
    } catch (err) {
      setPorBorrar(null);
      setError(err.response?.data?.error || 'No se pudo borrar el archivo');
    } finally {
      setBorrando(null);
    }
  };

  return (
    <Card padding={0}>
      <SectionHeader
        title="Documentos"
        subtitle={
          grupos.length === 1
            ? `${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`
            : `${archivos.length} archivos en ${grupos.length} secciones`
        }
      />

      {/* El error de borrado vive en esta columna, al lado de la lista que
          lo produjo. El de subida está en SubirArchivo, pegado al
          formulario. Separados a propósito: con las dos pantallas lado a
          lado, un error de borrado apareciendo abajo del formulario de
          subida se lee como si la subida hubiera fallado. */}
      {error && (
        <p style={{ margin: 0, padding: '10px 18px', fontSize: 12.5, color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {grupos.map((g) => (
        <div key={g.valor}>
          {/* El encabezado de la sección. Pegajoso no: la columna puede
              scrollear sola y un encabezado flotando sobre el formulario de
              la izquierda se ve roto. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', background: 'var(--stone-50)',
            borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)',
          }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {g.etiqueta}
            </span>
            {/* El conteo de la sección. Sin él, "Chequeo general" con seis
                archivos y con uno se ven igual hasta que se cuentan a ojo. */}
            <span className="tabular" style={{ fontSize: 10.5, color: 'var(--text-disabled)' }}>
              {g.archivos.length}
            </span>
          </div>

          {g.archivos.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 18px', borderBottom: '1px solid var(--divider)',
              }}
            >
              {/* Ícono de documento, igual al que usa la topbar de Historias
                  para los archivos adjuntos: contexto visual inmediato. */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'var(--stone-50)', border: '1px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-disabled)',
              }}>
                <IconFile size={15} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* `nombre` puede ser largo; el ellipsis evita que empuje los
                    botones fuera de la tarjeta. */}
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.nombre}
                </div>
                {/* textoArchivo produce "Exámenes de laboratorio · 12 ene 2024 · Hemograma".
                    El tipo se repite con el encabezado de la sección, y se deja:
                    quien scrollea hasta la mitad de una sección larga ya no tiene
                    el encabezado a la vista, y es la misma función de texto que
                    usa el modal de borrado. */}
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {textoArchivo(a)} · {fmtBytes(a.peso_bytes)}
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={<IconArrowRight size={12} />}
                onClick={() => abrir(a)}
                disabled={abriendo === a.id}
                title="Abrir el PDF en otra pestaña"
              >
                {abriendo === a.id ? 'Abriendo…' : 'Abrir'}
              </Button>

              {/* Botón de ícono para borrar — mismo patrón que las filas de
                  vacunas y de historia clínica en Historias.jsx. iconBtnStyle
                  se importa de ui.jsx. */}
              <button
                onClick={() => borrar(a)}
                disabled={borrando === a.id}
                title="Borrar este archivo"
                style={{ ...iconBtnStyle, color: 'var(--danger)' }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      ))}

      <ConfirmDialog
        abierto={!!porBorrar}
        {...preguntaBorrado(porBorrar)}
        textoConfirmar="Borrar"
        onConfirmar={confirmarBorrado}
        onCancelar={() => setPorBorrar(null)}
        ocupado={borrando !== null}
      />
    </Card>
  );
}
