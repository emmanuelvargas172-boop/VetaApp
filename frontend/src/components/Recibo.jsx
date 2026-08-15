import { useEffect, useState } from 'react';
import api from '../api/axios';
import { Button } from './ui';
import { VetaAppLogo, IconPrint, IconX } from './icons';
import { fmtCOP, fmtFecha, fmtHora, labelMetodo } from '../utils/caja';

/**
 * Recibo de control interno, imprimible con window.print().
 * La clase `recibo-print` es la que index.css deja visible al imprimir:
 * todo lo demás se oculta. Ver el bloque @media print.
 */
export default function Recibo({ cobro, onCerrar }) {
  const [clinica, setClinica] = useState(null);

  useEffect(() => {
    api.get('/configuracion').then((r) => setClinica(r.data)).catch(() => {});
  }, []);

  if (!cobro) return null;

  const servicios = Array.isArray(cobro.servicios) ? cobro.servicios : [];
  const hayDescuento = Number(cobro.descuento) > 0;

  return (
    <div
      className="no-print"
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(15, 23, 20, 0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, margin: 'auto' }}>
        <div
          className="recibo-print"
          style={{
            background: '#fff', borderRadius: 'var(--r-xl)',
            padding: '28px 26px', color: '#111',
            boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.25))',
          }}
        >
          {/* Encabezado */}
          <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '2px solid #1B4332' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <VetaAppLogo size={30} />
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1B4332' }}>
              {clinica?.clinica_nombre || 'VetaApp'}
            </p>
            {clinica?.direccion && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555' }}>{clinica.direccion}</p>
            )}
            {clinica?.telefono_principal && (
              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#555' }}>Tel. {clinica.telefono_principal}</p>
            )}
          </div>

          <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
            <p style={{
              margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '0.18em',
              color: '#1B4332',
            }}>
              RECIBO
            </p>
            {cobro.numero != null && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#666' }}>N.º {cobro.numero}</p>
            )}
          </div>

          {/* Datos */}
          <div style={{ fontSize: 12, color: '#333', padding: '12px 0', borderBottom: '1px dashed #ccc' }}>
            <Fila k="Fecha" v={`${fmtFecha(cobro.fecha)} · ${fmtHora(cobro.fecha)}`} />
            <Fila k="Mascota" v={cobro.mascota_nombre || '—'} />
            <Fila k="Dueño" v={cobro.dueno_nombre || '—'} />
          </div>

          {/* Servicios */}
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 10, color: '#777', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 6 }}>Servicio</th>
                <th style={{ textAlign: 'right', fontSize: 10, color: '#777', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 6 }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12.5, color: '#222', padding: '4px 0' }}>{s.nombre}</td>
                  <td style={{ fontSize: 12.5, color: '#222', padding: '4px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCOP(s.precio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div style={{ borderTop: '1px dashed #ccc', paddingTop: 10 }}>
            {hayDescuento && (
              <>
                <Fila k="Subtotal" v={fmtCOP(cobro.subtotal)} />
                <Fila k={`Descuento (${cobro.descuento}%)`} v={`− ${fmtCOP(cobro.subtotal - cobro.total)}`} />
              </>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginTop: 8, paddingTop: 10, borderTop: '2px solid #1B4332',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1B4332' }}>TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#1B4332', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCOP(cobro.total)}
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#444', textAlign: 'right' }}>
              Pago en <strong>{labelMetodo(cobro.metodo_pago)}</strong>
            </p>
          </div>

          <p style={{
            margin: '22px 0 0', paddingTop: 12, borderTop: '1px solid #eee',
            fontSize: 9.5, lineHeight: 1.5, color: '#888', textAlign: 'center',
          }}>
            Documento de control interno. No válido como factura electrónica ante la DIAN.
          </p>
        </div>

        {/* Acciones: fuera del recibo, no se imprimen */}
        <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
          <Button variant="primary" size="lg" icon={<IconPrint size={16} />} onClick={() => window.print()}>
            <span style={{ marginLeft: 7 }}>Imprimir</span>
          </Button>
          <Button variant="secondary" size="lg" icon={<IconX size={16} />} onClick={onCerrar}>
            <span style={{ marginLeft: 7 }}>Cerrar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

const Fila = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2.5px 0' }}>
    <span style={{ fontSize: 12, color: '#777' }}>{k}</span>
    <span style={{ fontSize: 12, color: '#222', fontWeight: 500, textAlign: 'right' }}>{v}</span>
  </div>
);
