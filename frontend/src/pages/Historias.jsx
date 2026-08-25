import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useRoutes } from 'react-router-dom';
import api from '../api/axios';
import {
  Card, Button, Badge, Topbar, Page, SectionHeader, Sparkline, EmptyState, iconBtnStyle,
} from '../components/ui';
import {
  IconFile, IconPlus, IconSearch, IconArrowLeft, IconX, IconEdit, IconTrash,
  IconSyringe, IconActivity, IconAlert, IconCheckCircle, IconChevronRight, IconCalendar,
  SpeciesAvatar, especieCfg,
} from '../components/icons';

const TIPO_REGISTRO = {
  Vacunación:  { Icon: IconSyringe,      color: 'var(--info)',      soft: 'var(--info-soft)',          ring: 'var(--info-ring)' },
  Consulta:    { Icon: IconActivity,     color: 'var(--verde-600)', soft: 'var(--verde-50)',           ring: 'var(--verde-200)' },
  Cirugía:     { Icon: IconAlert,        color: 'var(--sp-gato)',   soft: 'rgba(124,58,237,0.08)',     ring: 'rgba(124,58,237,0.25)' },
  Emergencia:  { Icon: IconAlert,        color: 'var(--danger)',    soft: 'var(--danger-soft)',        ring: 'var(--danger-ring)' },
  Control:     { Icon: IconCheckCircle,  color: 'var(--warn)',      soft: 'var(--warn-soft)',          ring: 'var(--warn-ring)' },
};

const labelInput = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
const styleInput = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
  fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function BuscarMascota() {
  const navigate = useNavigate();
  const [mascotas, setMascotas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/mascotas')
      .then(r => setMascotas(r.data))
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return mascotas;
    const q = busqueda.toLowerCase();
    return mascotas.filter(m => m.nombre?.toLowerCase().includes(q) || m.dueno_nombre?.toLowerCase().includes(q));
  }, [mascotas, busqueda]);

  return (
    <>
      <Topbar
        title="Historias clínicas"
        subtitle={`${mascotas.length} pacientes registrados`}
        actions={
          <Button variant="primary" size="md" icon={<IconPlus size={14}/>}>Nuevo registro</Button>
        }
      />
      <Page>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Total pacientes', value: mascotas.length, Icon: IconFile,     color: 'var(--text-muted)', bg: 'var(--stone-50)' },
            { label: 'Este mes',        value: '—',             Icon: IconCalendar, color: 'var(--info)',       bg: 'var(--info-soft)' },
            { label: 'Vacunaciones',    value: '—',             Icon: IconSyringe,  color: 'var(--verde-600)',  bg: 'var(--verde-50)' },
            { label: 'Cirugías',        value: '—',             Icon: IconAlert,    color: 'var(--sp-gato)',    bg: 'rgba(124,58,237,0.08)' },
          ].map((s, i) => (
            <Card key={i} padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.Icon size={17}/>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</p>
                  <p className="tabular" style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em', lineHeight: 1 }}>{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 14, position: 'relative', maxWidth: 420 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex' }}>
            <IconSearch size={14}/>
          </div>
          <input
            style={{ ...styleInput, paddingLeft: 32 }}
            placeholder="Buscar paciente por nombre o dueño..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {cargando ? (
          <Card style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span className="vp-spinner"/>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Cargando mascotas...</p>
          </Card>
        ) : error ? (
          <div style={{ padding: '12px 16px', background: 'var(--warn-soft)', border: '1px solid var(--warn-ring)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconAlert size={16} color="var(--warn)"/>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>No se pudo cargar la lista de mascotas.</p>
          </div>
        ) : filtradas.length === 0 ? (
          <EmptyState icon={<IconFile size={22}/>} title="No se encontraron mascotas" subtitle={mascotas.length === 0 ? 'No hay mascotas registradas' : 'Intenta con otro nombre'}/>
        ) : (
          <Card padding={0}>
            <SectionHeader title="Pacientes con historial" subtitle={`${filtradas.length} mostrados`}/>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {filtradas.map(m => {
                const cfg = especieCfg(m.especie);
                return (
                  <div key={m.id}
                    onClick={() => navigate(`/app/historias/${m.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: 12, borderRadius: 'var(--r-lg)',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 0.18s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = cfg.color;
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'none';
                    }}>
                    <SpeciesAvatar especie={m.especie} size={44}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.nombre}</p>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {m.raza}</span>
                      </div>
                      <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>{m.dueno_nombre}</p>
                    </div>
                    <IconChevronRight size={14} color="var(--text-disabled)"/>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}

function badgeProxDosis(proxima_dosis) {
  if (!proxima_dosis) return null;
  const hoy = new Date().toISOString().split('T')[0];
  const dias = Math.ceil((new Date(proxima_dosis + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000);
  if (dias < 0)   return { tone: 'neutral', label: 'Vencida' };
  if (dias === 0) return { tone: 'danger',  label: 'Hoy' };
  if (dias <= 7)  return { tone: 'danger',  label: `${dias}d` };
  if (dias <= 15) return { tone: 'warn',    label: `${dias}d` };
  if (dias <= 30) return { tone: 'success', label: `${dias}d` };
  return { tone: 'neutral', label: new Date(proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) };
}

function HistorialMascota() {
  const { mascotaId } = useParams();
  const navigate = useNavigate();

  const [mascota, setMascota]     = useState(null);
  const [consultas, setConsultas] = useState([]);
  const [vacunas, setVacunas]     = useState([]);
  const [tabActiva, setTabActiva] = useState('consultas');
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(false);
  const [selReg, setSelReg]       = useState(null);

  const [panelAbierto, setPanelAbierto]         = useState(false);
  const [panelTipo, setPanelTipo]               = useState('consulta');
  const [consultaEditando, setConsultaEditando] = useState(null);
  const [guardando, setGuardando]               = useState(false);
  const [errorPanel, setErrorPanel]             = useState('');
  const [stockWarnings, setStockWarnings]       = useState([]);

  const HOY = new Date().toISOString().split('T')[0];
  const FORM_C0 = { fecha: HOY, motivo: '', diagnostico: '', tratamiento: '', medicamentos: '', veterinario: '', peso: '', notas: '' };
  const FORM_V0 = { nombre: '', fecha_aplicacion: HOY, proxima_dosis: '', veterinario: '' };

  const [formC, setFormC] = useState(FORM_C0);
  const [formV, setFormV] = useState(FORM_V0);
  const [medSeleccionados, setMedSeleccionados] = useState([]);
  const [medBusqueda, setMedBusqueda]           = useState('');
  const [medSugerencias, setMedSugerencias]     = useState([]);
  const medTimeoutId = useRef(null);

  useEffect(() => () => { if (medTimeoutId.current) clearTimeout(medTimeoutId.current); }, []);

  const veterinariosUnicos = useMemo(() => {
    const vets = [...consultas.map(c => c.veterinario), ...vacunas.map(v => v.veterinario)].filter(Boolean);
    return [...new Set(vets)];
  }, [consultas, vacunas]);

  const cargarConsultas = async () => {
    const { data } = await api.get(`/historias/mascota/${mascotaId}`);
    setConsultas(data);
  };

  const cargarVacunas = async () => {
    const { data } = await api.get(`/historias/vacunas/mascota/${mascotaId}`);
    setVacunas(data);
  };

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      setError(false);
      try {
        const [mRes, cRes, vRes] = await Promise.all([
          api.get(`/mascotas/${mascotaId}`),
          api.get(`/historias/mascota/${mascotaId}`),
          api.get(`/historias/vacunas/mascota/${mascotaId}`),
        ]);
        setMascota(mRes.data);
        setConsultas(cRes.data);
        setVacunas(vRes.data);
        if (cRes.data.length > 0) setSelReg(cRes.data[0]);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [mascotaId]);

  const abrirPanelConsulta = (consulta = null) => {
    setConsultaEditando(consulta);
    setErrorPanel('');
    setFormC(consulta ? {
      fecha: consulta.fecha, motivo: consulta.motivo,
      diagnostico: consulta.diagnostico || '', tratamiento: consulta.tratamiento || '',
      medicamentos: consulta.medicamentos || '', veterinario: consulta.veterinario || '',
      peso: consulta.peso ?? '', notas: consulta.notas || '',
    } : FORM_C0);
    setMedSeleccionados([]);
    setMedBusqueda('');
    setMedSugerencias([]);
    setStockWarnings([]);
    setPanelTipo('consulta');
    setPanelAbierto(true);
  };

  const abrirPanelVacuna = () => {
    setFormV(FORM_V0);
    setErrorPanel('');
    setPanelTipo('vacuna');
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setConsultaEditando(null);
    setMedSeleccionados([]);
    setMedBusqueda('');
    setMedSugerencias([]);
  };

  const setFC = f => e => setFormC(p => ({ ...p, [f]: e.target.value }));
  const setFV = f => e => setFormV(p => ({ ...p, [f]: e.target.value }));

  const handleMedBusqueda = val => {
    setMedBusqueda(val);
    if (medTimeoutId.current) clearTimeout(medTimeoutId.current);
    if (!val.trim()) { setMedSugerencias([]); return; }
    medTimeoutId.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/inventario/buscar?q=${encodeURIComponent(val)}`);
        setMedSugerencias(data);
      } catch {}
    }, 300);
  };

  const seleccionarMed = med => {
    if (!medSeleccionados.some(m => m.id === med.id)) {
      setMedSeleccionados(s => [...s, { id: med.id, nombre: med.nombre }]);
    }
    setMedBusqueda('');
    setMedSugerencias([]);
  };

  const guardarConsulta = async e => {
    e.preventDefault();
    if (!formC.fecha || !formC.motivo || !formC.veterinario) { setErrorPanel('Fecha, motivo y veterinario son requeridos.'); return; }
    setGuardando(true); setErrorPanel('');
    try {
      const payload = {
        mascota_id: mascotaId, fecha: formC.fecha, motivo: formC.motivo,
        diagnostico: formC.diagnostico || null, tratamiento: formC.tratamiento || null,
        medicamentos: [...medSeleccionados.map(m => m.nombre), formC.medicamentos].filter(Boolean).join(', ') || null,
        veterinario: formC.veterinario,
        peso: formC.peso ? parseFloat(formC.peso) : null,
        notas: formC.notas || null,
        medicamentos_ids: consultaEditando ? null : JSON.stringify(medSeleccionados.map(m => m.id)),
      };
      if (consultaEditando) {
        await api.put(`/historias/${consultaEditando.id}`, payload);
      } else {
        const res = await api.post('/historias', payload);
        if (res.data.warnings?.length) setStockWarnings(res.data.warnings);
      }
      cerrarPanel();
      await cargarConsultas();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarConsulta = async id => {
    if (!window.confirm('¿Eliminar esta consulta? No se puede deshacer.')) return;
    try { await api.delete(`/historias/${id}`); await cargarConsultas(); }
    catch { alert('No se pudo eliminar. Intenta de nuevo.'); }
  };

  const guardarVacuna = async e => {
    e.preventDefault();
    if (!formV.nombre || !formV.fecha_aplicacion) { setErrorPanel('Nombre y fecha de aplicación son requeridos.'); return; }
    setGuardando(true); setErrorPanel('');
    try {
      await api.post('/historias/vacunas', {
        mascota_id: mascotaId, nombre: formV.nombre,
        fecha_aplicacion: formV.fecha_aplicacion,
        proxima_dosis: formV.proxima_dosis || null,
        veterinario: formV.veterinario || null,
      });
      cerrarPanel();
      await cargarVacunas();
    } catch (err) {
      setErrorPanel(err.response?.data?.error || 'Error al registrar vacuna.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarVacuna = async id => {
    if (!window.confirm('¿Eliminar esta vacuna?')) return;
    try { await api.delete(`/historias/vacunas/${id}`); await cargarVacunas(); }
    catch { alert('No se pudo eliminar. Intenta de nuevo.'); }
  };

  if (cargando) return (
    <div style={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <span className="vp-spinner"/>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Cargando historial...</p>
    </div>
  );

  if (error || !mascota) return (
    <Page>
      <div style={{ padding: '12px 16px', background: 'var(--warn-soft)', border: '1px solid var(--warn-ring)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <IconAlert size={16} color="var(--warn)"/>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>No se pudo cargar el historial de esta mascota.</p>
      </div>
      <Button variant="secondary" icon={<IconArrowLeft size={13}/>} onClick={() => navigate('/app/historias')}>Volver</Button>
    </Page>
  );

  const cfg = especieCfg(mascota.especie);
  const pesoData = consultas.filter(c => c.peso != null).slice(-6).map(c => c.peso);

  return (
    <>
      <Topbar
        breadcrumb={['Historias', mascota.nombre]}
        title={`Historia · ${mascota.nombre}`}
        subtitle={`${consultas.length} consultas · ${vacunas.length} vacunas`}
        actions={
          <>
            <Button variant="secondary" size="md" icon={<IconArrowLeft size={13}/>} onClick={() => navigate('/app/historias')}>Volver</Button>
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>}
              onClick={() => tabActiva === 'consultas' ? abrirPanelConsulta() : abrirPanelVacuna()}>
              {tabActiva === 'consultas' ? 'Nueva consulta' : 'Nueva vacuna'}
            </Button>
          </>
        }
      />
      <Page>
        {stockWarnings.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'var(--warn-soft)', border: '1px solid var(--warn-ring)', borderRadius: 'var(--r-lg)', marginBottom: 12 }}>
            <IconAlert size={15} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }}/>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>Alerta de stock</p>
              {stockWarnings.map((w, i) => <p key={i} style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--warn)' }}>• {w}</p>)}
            </div>
            <button style={iconBtnStyle} onClick={() => setStockWarnings([])}><IconX size={13}/></button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'start' }}>
          {/* Columna izquierda */}
          <div>
            {/* Hero compact */}
            <Card padding={0} style={{ marginBottom: 12 }}>
              <div style={{
                padding: 14,
                background: `linear-gradient(135deg, ${cfg.soft}, transparent)`,
                borderBottom: '1px solid var(--divider)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <SpeciesAvatar especie={mascota.especie} size={48}/>
                <div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text)' }}>{mascota.nombre}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>{cfg.label} · {mascota.raza}</p>
                </div>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Dueño', value: mascota.dueno_nombre },
                  { label: 'Edad', value: [mascota.edad_anios ? `${mascota.edad_anios}a` : '', mascota.edad_meses ? `${mascota.edad_meses}m` : ''].filter(Boolean).join(' ') || '—' },
                  { label: 'Peso actual', value: mascota.peso ? `${mascota.peso} kg` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ color: 'var(--text-faint)' }}>{label}</span>
                    <span className="tabular" style={{ fontWeight: 600, color: 'var(--text)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--stone-100)', borderRadius: 'var(--r-md)', marginBottom: 10 }}>
              {[
                { key: 'consultas', label: 'Consultas', count: consultas.length },
                { key: 'vacunas',   label: 'Vacunas',   count: vacunas.length },
              ].map(t => (
                <button key={t.key} onClick={() => setTabActiva(t.key)} style={{
                  flex: 1, padding: '5px 10px', border: 'none', cursor: 'pointer',
                  borderRadius: 6, fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  background: tabActiva === t.key ? 'var(--surface)' : 'transparent',
                  color: tabActiva === t.key ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: tabActiva === t.key ? 'var(--shadow-xs)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  {t.label}
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 99, fontSize: 10, fontWeight: 700,
                    background: tabActiva === t.key ? 'var(--verde-100)' : 'var(--stone-150)',
                    color: tabActiva === t.key ? 'var(--verde-700)' : 'var(--text-muted)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                  }}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* Timeline */}
            {tabActiva === 'consultas' && (
              <Card padding={0}>
                <SectionHeader title="Registros" subtitle={`${consultas.length} en total`}/>
                {consultas.length === 0 ? (
                  <EmptyState
                    icon={<IconFile size={18}/>}
                    title="Sin consultas"
                    subtitle="Registra la primera"
                    action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={() => abrirPanelConsulta()}>Nueva</Button>}
                  />
                ) : (
                  <div style={{ padding: 8, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 26, top: 14, bottom: 14, width: 1, background: 'var(--divider)' }}/>
                    {consultas.map(c => {
                      const tipo = c.tipo || 'Consulta';
                      const t = TIPO_REGISTRO[tipo] || TIPO_REGISTRO.Consulta;
                      const sel = selReg?.id === c.id;
                      return (
                        <button key={c.id} onClick={() => setSelReg(c)}
                          style={{
                            display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8,
                            padding: '8px 10px',
                            background: sel ? 'var(--stone-50)' : 'transparent',
                            border: sel ? '1px solid var(--border-strong)' : '1px solid transparent',
                            borderRadius: 'var(--r-md)',
                            width: '100%', textAlign: 'left', cursor: 'pointer',
                            marginBottom: 4, transition: 'all 0.15s', position: 'relative',
                          }}
                          onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'var(--stone-50)'; }}
                          onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: t.soft, border: `2px solid ${sel ? t.color : 'var(--bg)'}`,
                            color: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative', zIndex: 1,
                          }}><t.Icon size={13}/></div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{tipo}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.motivo}</p>
                            <p className="mono" style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-disabled)' }}>
                              {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {tabActiva === 'vacunas' && (
              <Card padding={0}>
                <SectionHeader title="Vacunas" subtitle={`${vacunas.length} aplicadas`}/>
                {vacunas.length === 0 ? (
                  <EmptyState
                    icon={<IconSyringe size={18}/>}
                    title="Sin vacunas"
                    subtitle="Registra la primera"
                    action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={abrirPanelVacuna}>Nueva</Button>}
                  />
                ) : (
                  <div style={{ padding: 8 }}>
                    {vacunas.map(v => {
                      const badge = badgeProxDosis(v.proxima_dosis);
                      return (
                        <div key={v.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 'var(--r-md)', marginBottom: 4,
                          border: '1px solid var(--border)',
                        }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--verde-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <IconSyringe size={14} color="var(--verde-600)"/>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{v.nombre}</p>
                            <p className="mono" style={{ margin: '1px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>
                              {new Date(v.fecha_aplicacion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          {badge && <Badge tone={badge.tone} size="sm">{badge.label}</Badge>}
                          <button style={iconBtnStyle} onClick={() => eliminarVacuna(v.id)} title="Eliminar">
                            <IconTrash size={12} color="var(--danger)"/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Columna derecha: detalle registro */}
          <div>
            {tabActiva === 'consultas' && selReg ? (
              <>
                {(() => {
                  const tipo = selReg.tipo || 'Consulta';
                  const tcfg = TIPO_REGISTRO[tipo] || TIPO_REGISTRO.Consulta;
                  return (
                    <Card padding={0}>
                      <div style={{ padding: '16px 20px', background: tcfg.soft, borderBottom: `1px solid ${tcfg.ring}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface)', border: `1.5px solid ${tcfg.color}`, color: tcfg.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <tcfg.Icon size={18}/>
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: tcfg.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{tipo}</span>
                            <h3 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>{selReg.motivo}</h3>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                              {new Date(selReg.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              {selReg.veterinario && ` · ${selReg.veterinario}`}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={iconBtnStyle} title="Editar" onClick={() => abrirPanelConsulta(selReg)}><IconEdit size={13} color="var(--text-muted)"/></button>
                            <button style={iconBtnStyle} title="Eliminar" onClick={() => eliminarConsulta(selReg.id)}><IconTrash size={13} color="var(--danger)"/></button>
                          </div>
                        </div>
                      </div>

                      {/* Vitales */}
                      {(selReg.peso || selReg.temperatura) && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '14px 20px', borderBottom: '1px solid var(--divider)', background: 'var(--stone-50)' }}>
                          {selReg.peso && (
                            <div>
                              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Peso</p>
                              <p className="tabular" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{selReg.peso} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>kg</span></p>
                            </div>
                          )}
                          {selReg.temperatura && (
                            <div>
                              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Temperatura</p>
                              <p className="tabular" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{selReg.temperatura}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>°C</span></p>
                            </div>
                          )}
                          {selReg.veterinario && (
                            <div>
                              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Veterinario</p>
                              <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selReg.veterinario}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Secciones */}
                      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {[
                          { label: 'Diagnóstico', content: selReg.diagnostico },
                          { label: 'Tratamiento', content: selReg.tratamiento },
                          { label: 'Medicamentos', content: selReg.medicamentos },
                          { label: 'Notas', content: selReg.notas },
                        ].filter(s => s.content).map(s => (
                          <div key={s.label}>
                            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</p>
                            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>{s.content}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })()}

                {/* Evolución de peso */}
                {pesoData.length >= 2 && (
                  <Card padding={0} style={{ marginTop: 12 }}>
                    <SectionHeader title="Evolución de peso" subtitle="Últimas consultas con peso registrado"/>
                    <div style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                        <p className="tabular" style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1 }}>
                          {pesoData[pesoData.length - 1]} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-faint)' }}>kg</span>
                        </p>
                      </div>
                      <Sparkline data={pesoData} width={600} height={56} color="var(--verde-500)"/>
                    </div>
                  </Card>
                )}
              </>
            ) : tabActiva === 'consultas' ? (
              <EmptyState
                icon={<IconFile size={22}/>}
                title="Sin consultas"
                subtitle="Registra la primera consulta médica"
                action={<Button variant="primary" size="md" icon={<IconPlus size={13}/>} onClick={() => abrirPanelConsulta()}>Nueva consulta</Button>}
              />
            ) : (
              <EmptyState
                icon={<IconSyringe size={22}/>}
                title="Sin vacunas"
                subtitle="Registra la primera vacuna aplicada"
                action={<Button variant="primary" size="md" icon={<IconPlus size={13}/>} onClick={abrirPanelVacuna}>Nueva vacuna</Button>}
              />
            )}
          </div>
        </div>
      </Page>

      {/* Overlay */}
      {panelAbierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 30 }} onClick={cerrarPanel}/>
      )}

      {/* Panel lateral */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: 420,
        background: 'var(--surface)', boxShadow: 'var(--shadow-xl)', zIndex: 40,
        display: 'flex', flexDirection: 'column',
        transform: panelAbierto ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        borderLeft: '1px solid var(--border)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: panelTipo === 'consulta' ? 'var(--info-soft)' : 'var(--verde-50)',
              borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: panelTipo === 'consulta' ? 'var(--info)' : 'var(--verde-600)',
            }}>
              {panelTipo === 'consulta' ? <IconActivity size={15}/> : <IconSyringe size={15}/>}
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {panelTipo === 'consulta' ? (consultaEditando ? 'Editar Consulta' : 'Nueva Consulta') : 'Nueva Vacuna'}
            </h2>
          </div>
          <button style={iconBtnStyle} onClick={cerrarPanel}><IconX size={15}/></button>
        </div>

        {panelTipo === 'consulta' && (
          <form id="form-consulta" onSubmit={guardarConsulta} style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} className="scroll-thin">
            {errorPanel && (
              <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--danger)', fontWeight: 500 }}>{errorPanel}</div>
            )}
            {[
              { label: 'Fecha *', type: 'date', key: 'fecha', required: true },
            ].map(f => (
              <div key={f.key}>
                <label style={labelInput}>{f.label}</label>
                <input type={f.type} style={styleInput} value={formC[f.key]} onChange={setFC(f.key)} required={f.required}/>
              </div>
            ))}
            <div>
              <label style={labelInput}>Motivo *</label>
              <input style={styleInput} placeholder="Ej: Control rutinario, Vacunación..." value={formC.motivo} onChange={setFC('motivo')} required/>
            </div>
            {[
              { label: 'Diagnóstico (opcional)', key: 'diagnostico' },
              { label: 'Tratamiento (opcional)', key: 'tratamiento' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelInput}>{f.label}</label>
                <textarea style={{ ...styleInput, height: 'auto', padding: '8px 10px', resize: 'none' }} rows={2} value={formC[f.key]} onChange={setFC(f.key)}/>
              </div>
            ))}
            <div>
              <label style={labelInput}>Medicamentos del inventario</label>
              {medSeleccionados.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {medSeleccionados.map(m => (
                    <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--verde-50)', color: 'var(--verde-700)', fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
                      {m.nombre}
                      <button type="button" onClick={() => setMedSeleccionados(s => s.filter(x => x.id !== m.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}>
                        <IconX size={10}/>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input style={styleInput} placeholder="Buscar medicamento del inventario..." value={medBusqueda}
                  onChange={e => handleMedBusqueda(e.target.value)}
                  onBlur={() => setTimeout(() => setMedSugerencias([]), 150)}
                  autoComplete="off"/>
                {medSugerencias.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)', zIndex: 10, maxHeight: 160, overflow: 'auto', marginTop: 4 }}>
                    {medSugerencias.slice(0, 8).map(s => (
                      <button key={s.id} type="button" onClick={() => seleccionarMed(s)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--stone-50)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.cantidad} {s.unidad}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={labelInput}>Medicamentos adicionales (texto libre)</label>
              <textarea style={{ ...styleInput, height: 'auto', padding: '8px 10px', resize: 'none' }} rows={2} value={formC.medicamentos} onChange={setFC('medicamentos')}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelInput}>Veterinario *</label>
                <input style={styleInput} list="vets-list" placeholder="Ej: Dr. García" value={formC.veterinario} onChange={setFC('veterinario')} required/>
                <datalist id="vets-list">{veterinariosUnicos.map(v => <option key={v} value={v}/>)}</datalist>
              </div>
              <div>
                <label style={labelInput}>Peso (kg)</label>
                <input type="number" step="0.1" min="0" style={styleInput} placeholder="12.5" value={formC.peso} onChange={setFC('peso')}/>
              </div>
            </div>
            <div>
              <label style={labelInput}>Notas (opcional)</label>
              <textarea style={{ ...styleInput, height: 'auto', padding: '8px 10px', resize: 'none' }} rows={2} value={formC.notas} onChange={setFC('notas')}/>
            </div>
          </form>
        )}

        {panelTipo === 'vacuna' && (
          <form id="form-vacuna" onSubmit={guardarVacuna} style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} className="scroll-thin">
            {errorPanel && (
              <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--danger)', fontWeight: 500 }}>{errorPanel}</div>
            )}
            {[
              { label: 'Nombre de la vacuna *', key: 'nombre', type: 'text', placeholder: 'Ej: Rabia, Triple viral...', required: true },
              { label: 'Fecha de aplicación *', key: 'fecha_aplicacion', type: 'date', required: true },
              { label: 'Próxima dosis (opcional)', key: 'proxima_dosis', type: 'date', required: false },
              { label: 'Veterinario (opcional)', key: 'veterinario', type: 'text', placeholder: 'Ej: Dra. López', required: false },
            ].map(f => (
              <div key={f.key}>
                <label style={labelInput}>{f.label}</label>
                <input type={f.type || 'text'} style={styleInput} placeholder={f.placeholder} value={formV[f.key]} onChange={setFV(f.key)} required={f.required}
                  list={f.key === 'veterinario' ? 'vets-list-v' : undefined}/>
                {f.key === 'veterinario' && <datalist id="vets-list-v">{veterinariosUnicos.map(v => <option key={v} value={v}/>)}</datalist>}
              </div>
            ))}
          </form>
        )}

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={cerrarPanel}>Cancelar</Button>
          <button type="submit" form={panelTipo === 'consulta' ? 'form-consulta' : 'form-vacuna'} disabled={guardando}
            style={{
              flex: 1, height: 36, borderRadius: 'var(--r-md)', border: 'none',
              background: 'var(--verde-600)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: guardando ? 'not-allowed' : 'pointer',
              opacity: guardando ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {guardando && <span className="vp-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}/>}
            {panelTipo === 'consulta' ? (consultaEditando ? 'Guardar cambios' : 'Registrar') : 'Registrar vacuna'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function Historias() {
  const elemento = useRoutes([
    { path: '/',           element: <BuscarMascota /> },
    { path: '/:mascotaId', element: <HistorialMascota /> },
  ]);
  return elemento;
}
