import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { Card, SectionHeader, BarChart, Button, EmptyState } from './ui';
import { IconCash, IconChart, IconArrowUp, IconArrowDown, IconRefresh } from './icons';
import { fmtCOP, isoLocal, sumar, fmtFechaCorta } from '../utils/caja';

const diaCorto = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const inicioMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const inicioMesAnterior = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() - 1, 1);
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

export default function ReportesCaja() {
  const [cobros, setCobros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Filtro de período: por defecto el mes en curso.
  const [desde, setDesde] = useState(isoLocal(inicioMes()));
  const [hasta, setHasta] = useState(isoLocal());
  const [periodo, setPeriodo] = useState([]);
  const [cargandoPeriodo, setCargandoPeriodo] = useState(false);

  // Base fija: desde el inicio del mes anterior. Cubre los KPIs, la gráfica
  // de 7 días y la comparación mensual con una sola consulta.
  const cargar = () => {
    setCargando(true);
    api.get(`/cobros?desde=${isoLocal(inicioMesAnterior())}&hasta=${isoLocal()}`)
      .then((r) => { setCobros(r.data || []); setError(null); })
      .catch((e) => setError(e?.response?.data?.error || 'No se pudieron cargar los reportes'))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const cargarPeriodo = () => {
    setCargandoPeriodo(true);
    api.get(`/cobros?desde=${desde}&hasta=${hasta}`)
      .then((r) => setPeriodo(r.data || []))
      .catch(() => setPeriodo([]))
      .finally(() => setCargandoPeriodo(false));
  };

  useEffect(cargarPeriodo, []);

  const m = useMemo(() => {
    const hoyIso = isoLocal();
    const dia = (c) => isoLocal(new Date(c.fecha));

    const deHoy = cobros.filter((c) => dia(c) === hoyIso);

    // Últimos 7 días, incluido hoy.
    const dias = Array.from({ length: 7 }, (_, i) => haceDias(6 - i));
    const serie = dias.map((d) => {
      const iso = isoLocal(d);
      return { iso, fecha: d, total: sumar(cobros.filter((c) => dia(c) === iso)) };
    });

    const iniMes = isoLocal(inicioMes());
    const iniPrev = isoLocal(inicioMesAnterior());
    const delMes = cobros.filter((c) => dia(c) >= iniMes);
    const delPrev = cobros.filter((c) => dia(c) >= iniPrev && dia(c) < iniMes);

    const totalMes = sumar(delMes);
    const totalPrev = sumar(delPrev);
    const variacion = totalPrev > 0 ? ((totalMes - totalPrev) / totalPrev) * 100 : null;

    return {
      hoy: sumar(deHoy),
      cobrosHoy: deHoy.length,
      semana: serie.reduce((a, s) => a + s.total, 0),
      serie,
      totalMes, totalPrev, variacion,
    };
  }, [cobros]);

  // Ranking de servicios del período filtrado.
  const ranking = useMemo(() => {
    const acc = new Map();
    for (const c of periodo) {
      for (const s of (Array.isArray(c.servicios) ? c.servicios : [])) {
        const prev = acc.get(s.nombre) || { nombre: s.nombre, veces: 0, total: 0 };
        prev.veces += 1;
        prev.total += Number(s.precio) || 0;
        acc.set(s.nombre, prev);
      }
    }
    return [...acc.values()].sort((a, b) => b.veces - a.veces);
  }, [periodo]);

  if (cargando) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="vp-spinner" /></div>;
  }
  if (error) {
    return <EmptyState icon={<IconChart size={22} />} title="No se pudieron cargar los reportes" subtitle={error}
      action={<Button variant="secondary" icon={<IconRefresh size={14} />} onClick={cargar}><span style={{ marginLeft: 6 }}>Reintentar</span></Button>} />;
  }

  const maxRanking = Math.max(...ranking.map((r) => r.veces), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <Tarjeta label="Ingresos de hoy" valor={fmtCOP(m.hoy)} nota={`${m.cobrosHoy} ${m.cobrosHoy === 1 ? 'cobro' : 'cobros'}`} />
        <Tarjeta label="Últimos 7 días" valor={fmtCOP(m.semana)} />
        <Tarjeta
          label="Este mes"
          valor={fmtCOP(m.totalMes)}
          variacion={m.variacion}
          nota={m.variacion === null ? 'sin datos del mes anterior' : `vs. ${fmtCOP(m.totalPrev)} el mes pasado`}
        />
      </div>

      {/* Gráfica 7 días */}
      <Card padding={0}>
        <SectionHeader title="Ingresos por día" subtitle="Últimos 7 días" />
        <div style={{ padding: '10px 18px 16px' }}>
          {m.serie.every((s) => s.total === 0) ? (
            <p style={{ margin: 0, padding: '30px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
              Todavía no hay cobros registrados en la semana.
            </p>
          ) : (
            <>
              <BarChart
                data={m.serie.map((s) => s.total)}
                labels={m.serie.map((s) => diaCorto[s.fecha.getDay()])}
                height={150}
                accent="var(--verde-500)"
                faded="var(--verde-100)"
                highlight={6}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtFechaCorta(m.serie[0].fecha)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>hoy</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Filtro de período + ranking */}
      <Card padding={0}>
        <SectionHeader
          title="Servicios del período"
          subtitle={`${periodo.length} ${periodo.length === 1 ? 'cobro' : 'cobros'} · ${fmtCOP(sumar(periodo))}`}
        />
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--divider)',
        }}>
          <CampoFecha label="Desde" value={desde} onChange={setDesde} />
          <CampoFecha label="Hasta" value={hasta} onChange={setHasta} />
          <Button variant="secondary" onClick={cargarPeriodo} disabled={cargandoPeriodo}>
            {cargandoPeriodo ? 'Buscando…' : 'Aplicar'}
          </Button>
        </div>

        <div style={{ padding: '6px 18px 16px' }}>
          {ranking.length === 0 ? (
            <p style={{ margin: 0, padding: '30px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
              No hay cobros en este período.
            </p>
          ) : ranking.map((r, i) => (
            <div key={r.nombre} style={{ padding: '9px 0', borderBottom: i < ranking.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.nombre}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {r.veces}× · <strong className="tabular" style={{ color: 'var(--text)' }}>{fmtCOP(r.total)}</strong>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--verde-50)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  width: `${(r.veces / maxRanking) * 100}%`, height: '100%',
                  background: i === 0 ? 'var(--verde-500)' : 'var(--verde-300)',
                  borderRadius: 999, transition: 'width 0.4s',
                }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tarjeta({ label, valor, nota, variacion }) {
  const sube = variacion != null && variacion >= 0;
  const Flecha = sube ? IconArrowUp : IconArrowDown;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{
          width: 26, height: 26, borderRadius: 8, background: 'var(--verde-50)',
          border: '1px solid var(--verde-200)', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--verde-600)', flexShrink: 0,
        }}>
          <IconCash size={14} />
        </div>
      </div>
      <div className="tabular" style={{ marginTop: 8, fontSize: 25, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
        {valor}
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {variacion != null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 12, fontWeight: 700,
            color: sube ? 'var(--success)' : 'var(--danger)',
          }}>
            <Flecha size={13} />
            {Math.abs(variacion).toFixed(0)}%
          </span>
        )}
        {nota && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{nota}</span>}
      </div>
    </Card>
  );
}

const CampoFecha = ({ label, value, onChange }) => (
  <div>
    <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {label}
    </label>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 10px', height: 36, fontSize: 13,
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r-md)', color: 'var(--text)', outline: 'none',
      }}
    />
  </div>
);
