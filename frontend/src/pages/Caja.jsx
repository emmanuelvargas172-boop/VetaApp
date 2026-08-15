import { useEffect, useState } from 'react';
import api from '../api/axios';
import { Topbar, Page, Card, Button, Badge, EmptyState, SectionHeader } from '../components/ui';
import { IconPlus, IconCash, IconChart, IconReceipt, IconRefresh } from '../components/icons';
import ModalCobro from '../components/ModalCobro';
import ReportesCaja from '../components/ReportesCaja';
import Recibo from '../components/Recibo';
import { fmtCOP, fmtHora, labelMetodo, isoLocal, sumar } from '../utils/caja';

const tonoMetodo = { efectivo: 'verde', transferencia: 'info', nequi: 'warn', tarjeta: 'neutral' };

export default function Caja() {
  const [tab, setTab] = useState('caja');
  const [cobros, setCobros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(false);
  const [recibo, setRecibo] = useState(null);

  const cargarHoy = () => {
    setCargando(true);
    const hoy = isoLocal();
    api.get(`/cobros?desde=${hoy}&hasta=${hoy}`)
      .then((r) => { setCobros(r.data || []); setError(null); })
      .catch((e) => setError(e?.response?.data?.error || 'No se pudieron cargar los cobros'))
      .finally(() => setCargando(false));
  };

  useEffect(cargarHoy, []);

  const alCrear = (cobro) => {
    setModal(false);
    setCobros((cs) => [cobro, ...cs]);
    setRecibo(cobro);
  };

  return (
    <>
      <Topbar
        title="Caja y Reportes"
        subtitle="Cobros del día e ingresos de la clínica"
        actions={
          tab === 'caja' && (
            <Button variant="primary" size="lg" icon={<IconPlus size={15} />} onClick={() => setModal(true)}>
              <span style={{ marginLeft: 7 }}>Nuevo cobro</span>
            </Button>
          )
        }
      />

      <Page>
        {/* Pestañas */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <Pestana activa={tab === 'caja'} onClick={() => setTab('caja')} icon={<IconCash size={15} />}>Caja</Pestana>
          <Pestana activa={tab === 'reportes'} onClick={() => setTab('reportes')} icon={<IconChart size={15} />}>Reportes</Pestana>
        </div>

        {tab === 'reportes' ? <ReportesCaja /> : (
          <Card padding={0}>
            <SectionHeader
              title="Cobros de hoy"
              subtitle={`${cobros.length} ${cobros.length === 1 ? 'cobro registrado' : 'cobros registrados'}`}
              action={
                <Button variant="ghost" size="sm" icon={<IconRefresh size={14} />} onClick={cargarHoy} title="Actualizar" />
              }
            />

            {cargando ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}><div className="vp-spinner" /></div>
            ) : error ? (
              <EmptyState
                icon={<IconCash size={22} />}
                title="No se pudieron cargar los cobros"
                subtitle={error}
                action={<Button variant="secondary" onClick={cargarHoy}>Reintentar</Button>}
              />
            ) : cobros.length === 0 ? (
              <EmptyState
                icon={<IconCash size={22} />}
                title="Sin cobros hoy"
                subtitle="Registra el primer cobro del día y se genera el recibo automáticamente."
                action={<Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setModal(true)}><span style={{ marginLeft: 6 }}>Nuevo cobro</span></Button>}
              />
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr>
                        <Th>Hora</Th>
                        <Th>Mascota</Th>
                        <Th>Dueño</Th>
                        <Th>Servicios</Th>
                        <Th align="right">Total</Th>
                        <Th>Pago</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {cobros.map((c, i) => (
                        <tr key={c.id} style={{ background: i % 2 ? 'var(--surface-muted)' : 'var(--surface)' }}>
                          <Td><span className="tabular" style={{ color: 'var(--text-muted)' }}>{fmtHora(c.fecha)}</span></Td>
                          <Td><strong style={{ fontWeight: 600 }}>{c.mascota_nombre}</strong></Td>
                          <Td><span style={{ color: 'var(--text-muted)' }}>{c.dueno_nombre || '—'}</span></Td>
                          <Td>
                            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                              {(Array.isArray(c.servicios) ? c.servicios : []).map((s) => s.nombre).join(', ') || '—'}
                            </span>
                          </Td>
                          <Td align="right">
                            <span className="tabular" style={{ fontWeight: 700 }}>{fmtCOP(c.total)}</span>
                          </Td>
                          <Td><Badge tone={tonoMetodo[c.metodo_pago] || 'neutral'} size="sm">{labelMetodo(c.metodo_pago)}</Badge></Td>
                          <Td align="right">
                            <Button variant="ghost" size="sm" icon={<IconReceipt size={15} />} title="Ver recibo" onClick={() => setRecibo(c)} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total del día */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 12,
                  padding: '14px 18px', borderTop: '2px solid var(--verde-200)', background: 'var(--verde-50)',
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--verde-700)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Total del día
                  </span>
                  <span className="tabular" style={{ fontSize: 22, fontWeight: 800, color: 'var(--verde-700)', letterSpacing: '-0.02em' }}>
                    {fmtCOP(sumar(cobros))}
                  </span>
                </div>
              </>
            )}
          </Card>
        )}
      </Page>

      {modal && <ModalCobro onCerrar={() => setModal(false)} onCreado={alCrear} />}
      {recibo && <Recibo cobro={recibo} onCerrar={() => setRecibo(null)} />}
    </>
  );
}

const Pestana = ({ activa, onClick, icon, children }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
      background: 'none', border: 'none',
      color: activa ? 'var(--verde-700)' : 'var(--text-faint)',
      borderBottom: `2px solid ${activa ? 'var(--verde-600)' : 'transparent'}`,
      marginBottom: -1, transition: 'color 0.15s',
    }}
  >
    {icon}{children}
  </button>
);

const Th = ({ children, align = 'left' }) => (
  <th style={{
    textAlign: align, padding: '10px 14px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }}>{children}</th>
);

const Td = ({ children, align = 'left' }) => (
  <td style={{
    padding: '11px 14px', fontSize: 13, color: 'var(--text)',
    textAlign: align, borderBottom: '1px solid var(--divider)', verticalAlign: 'middle',
  }}>{children}</td>
);
