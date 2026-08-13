import { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import {
  Card, Button, Badge, Topbar, Page, EmptyState, iconBtnStyle,
} from '../components/ui';
import {
  IconCalendar, IconPlus, IconChevronLeft, IconChevronRight,
  IconX, IconPhone, IconWhatsApp, IconTrash, IconSearch, IconClock,
  SpeciesAvatar,
} from '../components/icons';

const TIPOS_MOTIVO = [
  { id: 'vacunacion',      label: 'Vacunación',        color: 'var(--info)',      soft: 'var(--info-soft)' },
  { id: 'consulta',        label: 'Consulta',          color: 'var(--verde-600)', soft: 'var(--verde-50)' },
  { id: 'desparasitacion', label: 'Desparasitación',   color: 'var(--warn)',      soft: 'var(--warn-soft)' },
  { id: 'bano',            label: 'Baño / Peluquería', color: 'var(--sp-gato)',   soft: 'rgba(124,58,237,0.08)' },
  { id: 'cirugia',         label: 'Cirugía',           color: 'var(--sp-gato)',   soft: 'rgba(124,58,237,0.08)' },
  { id: 'emergencia',      label: 'Emergencia',        color: 'var(--danger)',    soft: 'var(--danger-soft)' },
  { id: 'control',         label: 'Control',           color: 'var(--warn)',      soft: 'var(--warn-soft)' },
];

const MES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIA_NOMBRES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESPECIES_EMOJI = { perro: '🐶', gato: '🐱', ave: '🐦', conejo: '🐰', reptil: '🦎', otro: '🐾' };

function buildGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function tipoConfig(tipo) {
  return TIPOS_MOTIVO.find(t => t.id === tipo) || TIPOS_MOTIVO[1];
}

function waLink(t) {
  const tel = (t.dueno_telefono || '').replace(/\D/g, '');
  const fechaLabel = new Date(t.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const msg = `Hola ${t.dueno_nombre}, le recordamos que ${t.mascota_nombre} tiene programado su tratamiento el ${fechaLabel}${t.hora ? ` a las ${t.hora}` : ''}. 🐾 VetaApp`;
  return `https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`;
}

function EventDetailModal({ t, onClose, onDelete }) {
  const cfg = tipoConfig(t.tipo);
  const fechaFmt = new Date(t.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const edadStr = [
    t.edad_anios ? `${t.edad_anios} año${t.edad_anios !== 1 ? 's' : ''}` : '',
    t.edad_meses ? `${t.edad_meses} mes${t.edad_meses !== 1 ? 'es' : ''}` : '',
  ].filter(Boolean).join(' ') || '—';

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 30 }} onClick={onClose}/>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-xl)',
          width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto',
          border: '1px solid var(--border)',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: `3px solid ${cfg.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge tone="neutral" style={{ background: cfg.soft, color: cfg.color, border: 'none', fontSize: 11, fontWeight: 600 }}>
                {cfg.label}
              </Badge>
              {t.hora && (
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconClock size={12}/> {t.hora}
                </span>
              )}
            </div>
            <button style={iconBtnStyle} onClick={onClose}><IconX size={15}/></button>
          </div>

          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Fecha */}
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Fecha</p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{fechaFmt}</p>
            </div>

            <div style={{ borderTop: '1px solid var(--border)' }}/>

            {/* Mascota */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Mascota</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SpeciesAvatar especie={t.especie} size={44}/>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t.mascota_nombre}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.especie} · {t.raza}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{edadStr}{t.mascota_peso ? ` · ${t.mascota_peso} kg` : ''}</p>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)' }}/>

            {/* Dueño */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Dueño</p>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.dueno_nombre}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  <IconPhone size={13}/> {t.dueno_telefono}
                </span>
                <a href={waLink(t)} target="_blank" rel="noreferrer">
                  <Button variant="wa" size="sm" icon={<IconWhatsApp size={12}/>}>Notificar</Button>
                </a>
              </div>
            </div>

            {t.notas && (
              <p style={{ margin: 0, padding: '10px 12px', background: 'var(--stone-50)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic', border: '1px solid var(--border)' }}>{t.notas}</p>
            )}
          </div>

          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <Button variant="danger" size="sm" icon={<IconTrash size={13}/>} onClick={() => { onDelete(t.id); onClose(); }}>
              Eliminar
            </Button>
            <div style={{ marginLeft: 'auto' }}>
              <a href={waLink(t)} target="_blank" rel="noreferrer">
                <Button variant="wa" size="md" icon={<IconWhatsApp size={13}/>}>WhatsApp</Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const FORM_VACIO = { mascota_id: '', mascota_label: '', tipo: 'vacunacion', fecha: '', hora: '', notas: '' };

export default function Calendario() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState('mes');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [tratamientos, setTratamientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [mascotas, setMascotas] = useState([]);
  const [busqMascota, setBusqMascota] = useState('');
  const [form, setForm] = useState(FORM_VACIO);
  const [formError, setFormError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const cargar = async () => {
    setCargando(true);
    try {
      const params = filtroTipo ? { tipo: filtroTipo } : {};
      if (viewMode === 'mes') {
        params.mes = `${year}-${String(month + 1).padStart(2, '0')}`;
        const { data } = await api.get('/tratamientos', { params });
        setTratamientos(data);
      } else {
        params.dias = 30;
        const { data } = await api.get('/tratamientos/proximos', { params });
        setTratamientos(data);
      }
    } catch {
      setTratamientos([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [currentMonth, viewMode, filtroTipo]);

  const byDate = useMemo(() => {
    const map = {};
    for (const t of tratamientos) {
      if (!map[t.fecha]) map[t.fecha] = [];
      map[t.fecha].push(t);
    }
    return map;
  }, [tratamientos]);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);
  const selectedEvents = selectedDay ? (byDate[selectedDay] || []) : [];

  const navMes = (delta) => {
    setCurrentMonth(new Date(year, month + delta, 1));
    setSelectedDay(null);
  };

  const abrirModal = (fecha = '') => {
    setForm({ ...FORM_VACIO, fecha });
    setBusqMascota('');
    setFormError('');
    if (mascotas.length === 0) {
      api.get('/mascotas').then(r => setMascotas(r.data)).catch(() => {});
    }
    setShowModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.mascota_id || !form.fecha) { setFormError('Mascota y fecha son requeridos.'); return; }
    setGuardando(true);
    setFormError('');
    try {
      await api.post('/tratamientos', {
        mascota_id: form.mascota_id,
        tipo: form.tipo,
        fecha: form.fecha,
        hora: form.hora || null,
        notas: form.notas || null,
      });
      setShowModal(false);
      cargar();
    } catch {
      setFormError('Error al guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este tratamiento?')) return;
    await api.delete(`/tratamientos/${id}`);
    cargar();
  };

  const mascotasFiltradas = useMemo(() => {
    if (!busqMascota.trim()) return mascotas.slice(0, 8);
    const q = busqMascota.toLowerCase();
    return mascotas.filter(m => m.nombre.toLowerCase().includes(q) || m.dueno_nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [mascotas, busqMascota]);

  return (
    <>
      <Topbar
        title="Calendario"
        subtitle={`Tratamientos · ${MES_NOMBRES[month]} ${year}`}
        actions={
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: 4, background: 'var(--stone-100)', borderRadius: 'var(--r-md)',
            }}>
              {[{ id: 'mes', label: 'Mes' }, { id: 'lista', label: 'Próximos 30 días' }].map(v => (
                <button key={v.id} onClick={() => { setViewMode(v.id); setSelectedDay(null); }} style={{
                  padding: '4px 12px', border: 'none', cursor: 'pointer',
                  borderRadius: 6, fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  background: viewMode === v.id ? 'var(--surface)' : 'transparent',
                  color: viewMode === v.id ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: viewMode === v.id ? 'var(--shadow-xs)' : 'none',
                }}>{v.label}</button>
              ))}
            </div>
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>} onClick={() => abrirModal(todayStr)}>
              Nuevo tratamiento
            </Button>
          </>
        }
      />

      <Page>
        {/* Filtros tipo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroTipo('')} style={{
            padding: '4px 12px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 600, transition: 'all 0.15s',
            background: !filtroTipo ? 'var(--text)' : 'var(--stone-100)',
            color: !filtroTipo ? '#fff' : 'var(--text-muted)',
          }}>Todos</button>
          {TIPOS_MOTIVO.slice(0, 4).map(t => (
            <button key={t.id} onClick={() => setFiltroTipo(filtroTipo === t.id ? '' : t.id)} style={{
              padding: '4px 12px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 600, transition: 'all 0.15s',
              background: filtroTipo === t.id ? t.soft : 'var(--stone-100)',
              color: filtroTipo === t.id ? t.color : 'var(--text-muted)',
              outline: filtroTipo === t.id ? `1px solid ${t.color}` : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {viewMode === 'mes' ? (
          <div style={{ display: 'grid', gridTemplateColumns: selectedDay ? '1fr 340px' : '1fr', gap: 14, alignItems: 'start' }}>
            {/* Calendario */}
            <Card padding={0}>
              {/* Nav mes */}
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button style={iconBtnStyle} onClick={() => navMes(-1)}><IconChevronLeft size={15}/></button>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text)' }}>
                    {MES_NOMBRES[month]} {year}
                  </h2>
                  <button style={iconBtnStyle} onClick={() => navMes(1)}><IconChevronRight size={15}/></button>
                  <Button variant="ghost" size="sm" onClick={() => { setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayStr); }}>
                    Hoy
                  </Button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {TIPOS_MOTIVO.slice(0, 4).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }}/>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--stone-50)' }}>
                {DIA_NOMBRES.map((d, i) => (
                  <div key={i} style={{
                    padding: '8px 10px', fontSize: 10.5, fontWeight: 700,
                    color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase',
                    borderRight: i < 6 ? '1px solid var(--divider)' : 'none',
                  }}>{d}</div>
                ))}
              </div>

              {cargando ? (
                <div style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span className="vp-spinner"/>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Cargando...</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {grid.map((d, i) => {
                    if (!d) return (
                      <div key={i} style={{
                        minHeight: 96, background: 'var(--stone-50)',
                        borderRight: (i % 7) < 6 ? '1px solid var(--divider)' : 'none',
                        borderBottom: '1px solid var(--divider)',
                      }}/>
                    );
                    const dStr = toDateStr(year, month, d);
                    const eventos = byDate[dStr] || [];
                    const isToday = dStr === todayStr;
                    const isSel = dStr === selectedDay;
                    const isFinde = (i % 7) >= 5;
                    return (
                      <div key={i}
                        onClick={() => setSelectedDay(isSel ? null : dStr)}
                        style={{
                          minHeight: 96, padding: '6px 8px',
                          borderRight: (i % 7) < 6 ? '1px solid var(--divider)' : 'none',
                          borderBottom: '1px solid var(--divider)',
                          background: isSel ? 'var(--verde-50)' : isFinde ? 'var(--stone-50)' : 'var(--surface)',
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'var(--stone-100)'; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = isFinde ? 'var(--stone-50)' : 'var(--surface)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="tabular" style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: '50%',
                            fontSize: 12, fontWeight: isToday ? 700 : 600,
                            background: isToday ? 'var(--verde-600)' : 'transparent',
                            color: isToday ? '#fff' : (isFinde ? 'var(--text-faint)' : 'var(--text)'),
                          }}>{d}</span>
                          {eventos.length > 0 && (
                            <span className="tabular" style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>
                              {eventos.length}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {eventos.slice(0, 3).map((ev, j) => {
                            const tc = tipoConfig(ev.tipo);
                            return (
                              <div key={j} style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '2px 5px',
                                background: tc.soft,
                                borderRadius: 4,
                                borderLeft: `2px solid ${tc.color}`,
                                overflow: 'hidden',
                              }}>
                                {ev.hora && <span className="mono" style={{ fontSize: 9, color: tc.color, fontWeight: 600, flexShrink: 0 }}>{ev.hora}</span>}
                                <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ev.mascota_nombre}
                                </span>
                              </div>
                            );
                          })}
                          {eventos.length > 3 && (
                            <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontWeight: 600, padding: '0 5px' }}>+{eventos.length - 3} más</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Side panel */}
            {selectedDay && (
              <Card padding={0} style={{ position: 'sticky', top: 16 }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {selectedDay === todayStr ? 'Hoy' : DIA_NOMBRES[new Date(selectedDay + 'T12:00').getDay() === 0 ? 6 : new Date(selectedDay + 'T12:00').getDay() - 1]}
                    </p>
                    <h3 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text)' }}>
                      {parseInt(selectedDay.split('-')[2])} de {MES_NOMBRES[parseInt(selectedDay.split('-')[1]) - 1].toLowerCase()}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {selectedEvents.length} {selectedEvents.length === 1 ? 'tratamiento' : 'tratamientos'}
                    </p>
                  </div>
                  <button style={iconBtnStyle} onClick={() => setSelectedDay(null)}><IconX size={14}/></button>
                </div>

                {selectedEvents.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendar size={20}/>}
                    title="Sin tratamientos"
                    subtitle="No hay nada programado para este día"
                    action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={() => abrirModal(selectedDay)}>Agregar</Button>}
                  />
                ) : (
                  <div style={{ padding: 8, maxHeight: 520, overflow: 'auto' }} className="scroll-thin">
                    {selectedEvents.map((ev, i) => {
                      const tc = tipoConfig(ev.tipo);
                      return (
                        <div key={i}
                          onClick={() => setSelectedEvent(ev)}
                          style={{
                            display: 'grid', gridTemplateColumns: '44px 1fr',
                            gap: 10, padding: 10,
                            borderRadius: 'var(--r-md)', cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <div className="mono tabular" style={{ fontSize: 12, fontWeight: 600, color: tc.color, textAlign: 'center', paddingTop: 6 }}>
                            {ev.hora || '—'}
                          </div>
                          <div style={{ padding: '8px 10px', background: tc.soft, borderLeft: `3px solid ${tc.color}`, borderRadius: 'var(--r-sm)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <SpeciesAvatar especie={ev.especie} size={20}/>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ev.mascota_nombre}</p>
                            </div>
                            <p style={{ margin: 0, fontSize: 11.5, color: tc.color, fontWeight: 600 }}>{tc.label}</p>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => abrirModal(selectedDay)}
                      style={{
                        width: '100%', margin: '4px 0', padding: '10px',
                        border: '2px dashed var(--border)', borderRadius: 'var(--r-md)',
                        background: 'transparent', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 12.5, fontWeight: 500, color: 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--verde-400)'; e.currentTarget.style.color = 'var(--verde-600)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                      <IconPlus size={13}/> Agregar tratamiento
                    </button>
                  </div>
                )}
              </Card>
            )}
          </div>
        ) : (
          /* Vista lista próximos 30 días */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cargando ? (
              <Card style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <span className="vp-spinner"/>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Cargando...</p>
              </Card>
            ) : tratamientos.length === 0 ? (
              <EmptyState
                icon={<IconCalendar size={22}/>}
                title="Sin tratamientos próximos"
                subtitle="No hay tratamientos programados en los próximos 30 días"
                action={<Button variant="primary" size="md" icon={<IconPlus size={13}/>} onClick={() => abrirModal(todayStr)}>Nuevo tratamiento</Button>}
              />
            ) : (
              (() => {
                const groups = {};
                for (const t of tratamientos) {
                  if (!groups[t.fecha]) groups[t.fecha] = [];
                  groups[t.fecha].push(t);
                }
                return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, evs]) => {
                  const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
                  const isToday = fecha === todayStr;
                  return (
                    <div key={fecha}>
                      <p style={{ margin: '0 0 6px 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {fechaLabel}
                        {isToday && <Badge tone="verde" size="sm" dot>Hoy</Badge>}
                      </p>
                      <Card padding={0} style={{ marginBottom: 10 }}>
                        {evs.map((ev, i) => {
                          const tc = tipoConfig(ev.tipo);
                          return (
                            <div key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 16px',
                                borderBottom: i < evs.length - 1 ? '1px solid var(--divider)' : 'none',
                                cursor: 'pointer', transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                              <div style={{ width: 3, alignSelf: 'stretch', background: tc.color, borderRadius: 2, flexShrink: 0 }}/>
                              {ev.hora && (
                                <span className="mono tabular" style={{ fontSize: 12, fontWeight: 600, color: tc.color, flexShrink: 0, minWidth: 44 }}>{ev.hora}</span>
                              )}
                              <SpeciesAvatar especie={ev.especie} size={32}/>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ev.mascota_nombre}</p>
                                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>{ev.dueno_nombre}</p>
                              </div>
                              <Badge tone="neutral" style={{ background: tc.soft, color: tc.color, border: 'none', fontSize: 11 }}>{tc.label}</Badge>
                              <a href={waLink(ev)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                <button style={{ ...iconBtnStyle, color: '#25D366' }}><IconWhatsApp size={13}/></button>
                              </a>
                            </div>
                          );
                        })}
                      </Card>
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}
      </Page>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          t={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={(id) => { eliminar(id); setSelectedEvent(null); }}
        />
      )}

      {/* Create Modal */}
      {showModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 30 }} onClick={() => setShowModal(false)}/>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{
              background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-xl)',
              width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto',
              border: '1px solid var(--border)',
            }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Nuevo Tratamiento</h2>
                <button style={iconBtnStyle} onClick={() => setShowModal(false)}><IconX size={15}/></button>
              </div>

              <form onSubmit={guardar} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {formError && (
                  <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--danger)', fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                {/* Mascota */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Mascota *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex' }}>
                      <IconSearch size={13}/>
                    </div>
                    <input
                      style={{
                        width: '100%', height: 36, paddingLeft: 32, paddingRight: 12,
                        border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                        fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                      placeholder="Buscar mascota..."
                      value={busqMascota}
                      onChange={e => { setBusqMascota(e.target.value); setForm(f => ({ ...f, mascota_id: '', mascota_label: '' })); }}
                    />
                    {busqMascota && !form.mascota_id && mascotasFiltradas.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)',
                        zIndex: 10, maxHeight: 160, overflow: 'auto', marginTop: 4,
                      }}>
                        {mascotasFiltradas.map(m => (
                          <button key={m.id} type="button"
                            onClick={() => {
                              setForm(f => ({ ...f, mascota_id: m.id, mascota_label: `${m.nombre}` }));
                              setBusqMascota(`${ESPECIES_EMOJI[m.especie] || '🐾'} ${m.nombre} — ${m.dueno_nombre}`);
                            }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', border: 'none', background: 'transparent',
                              cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <SpeciesAvatar especie={m.especie} size={28}/>
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.nombre}</p>
                              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>{m.dueno_nombre}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tipo */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Tipo de Tratamiento *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {TIPOS_MOTIVO.slice(0, 4).map(t => (
                      <button key={t.id} type="button"
                        onClick={() => setForm(f => ({ ...f, tipo: t.id }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 'var(--r-md)',
                          border: `1.5px solid ${form.tipo === t.id ? t.color : 'var(--border)'}`,
                          background: form.tipo === t.id ? t.soft : 'transparent',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          fontSize: 12, fontWeight: 600,
                          color: form.tipo === t.id ? t.color : 'var(--text-muted)',
                        }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }}/>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fecha + Hora */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[{ label: 'Fecha *', type: 'date', key: 'fecha' }, { label: 'Hora', type: 'time', key: 'hora' }].map(field => (
                    <div key={field.key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{field.label}</label>
                      <input type={field.type}
                        value={form[field.key]}
                        onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                        required={field.key === 'fecha'}
                        style={{
                          width: '100%', height: 36, padding: '0 10px',
                          border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                          fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Notas */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notas</label>
                  <textarea
                    rows={2}
                    placeholder="Observaciones opcionales..."
                    value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                      fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
                      outline: 'none', resize: 'none', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</Button>
                  <Button variant="primary" type="submit" style={{ flex: 1 }} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
