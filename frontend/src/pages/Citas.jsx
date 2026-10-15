import { useState, useEffect, useMemo } from 'react';
import api from '../api/axios';
import { useEsMovil } from '../lib/useEsMovil';
import {
  Card, Badge, SectionHeader, Topbar, Page, Button, UIInput, EmptyState, iconBtnStyle,
} from '../components/ui';
import {
  SpeciesAvatar, especieCfg,
  IconCalendar, IconCalDays, IconPlus, IconSearch, IconClock, IconCheck,
  IconCheckCircle, IconWhatsApp, IconEdit, IconMore, IconX, IconChevronDown,
  IconAlert, IconPaw, IconSyringe,
} from '../components/icons';

const ESTADO_CITA = {
  pendiente:  { tone: 'warn',    label: 'Pendiente'  },
  confirmada: { tone: 'info',    label: 'Confirmada' },
  atendida:   { tone: 'success', label: 'Atendida'   },
  cancelada:  { tone: 'danger',  label: 'Cancelada'  },
};

const TRANSICIONES = {
  pendiente:  ['confirmada', 'atendida', 'cancelada'],
  confirmada: ['atendida', 'cancelada'],
  atendida:   [],
  cancelada:  [],
};

// La tabla `citas` tiene mascota_id, veterinario, fecha, hora y motivo en NOT
// NULL (001_init.sql), así que los cinco se validan antes de enviar: si falta
// uno, Postgres rechaza la fila y el mensaje que vuelve no le dice nada a la
// veterinaria. `notas` es la única opcional.
const FORM_VACIO = { mascota_id: '', veterinario: '', fecha: '', hora: '09:00', motivo: '', notas: '' };

// Lo que se ve en el campo de búsqueda cuando ya hay una mascota elegida. El
// dueño va al lado del nombre porque en una clínica hay tres Michis y el
// nombre solo no distingue cuál.
const etiquetaMascota = (m) =>
  `${especieCfg(m.especie).emoji} ${m.nombre}${m.dueno_nombre ? ` — ${m.dueno_nombre}` : ''}`;

export default function Citas() {
  const [citas, setCitas]             = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState(false);
  const [filtroFecha, setFiltroFecha] = useState('hoy');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [citaEditando, setCitaEditando] = useState(null);
  const [dropdownEstadoId, setDropdownEstadoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(FORM_VACIO);
  const [mascotas, setMascotas] = useState([]);
  // Hace falta además de la lista: con solo `mascotas.length === 0` no se
  // distingue "todavía no cargó" de "la clínica no tiene ninguna", y el panel
  // terminaba diciendo que la mascota no existe mientras aún iba en camino.
  const [mascotasEstado, setMascotasEstado] = useState('pendiente'); // pendiente|cargando|listo|error
  const [busqMascota, setBusqMascota] = useState('');
  const [mascotaFoco, setMascotaFoco] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState('');
  const esMovil = useEsMovil();

  const hoy = new Date().toISOString().split('T')[0];

  const cargar = async () => {
    setCargando(true); setError(false);
    try {
      const params = {};
      if (filtroFecha === 'hoy') params.fecha = hoy;
      if (filtroFecha === 'semana') params.semana = hoy;
      if (filtroEstado !== 'todos') params.estado = filtroEstado;
      const { data } = await api.get('/citas', { params });
      setCitas(data);
    } catch { setError(true); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, [filtroFecha, filtroEstado]);

  const citasFiltradas = citas.filter(c => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (c.mascota_nombre || '').toLowerCase().includes(q) ||
           (c.motivo || '').toLowerCase().includes(q) ||
           (c.veterinario || '').toLowerCase().includes(q);
  });

  const stats = {
    total: citasFiltradas.length,
    pendientes: citasFiltradas.filter(c => c.estado === 'pendiente').length,
    confirmadas: citasFiltradas.filter(c => c.estado === 'confirmada').length,
    atendidas: citasFiltradas.filter(c => c.estado === 'atendida').length,
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    setDropdownEstadoId(null);
    try {
      await api.patch(`/citas/${id}/estado`, { estado: nuevoEstado });
      setCitas(prev => prev.map(c => c.id === id ? { ...c, estado: nuevoEstado } : c));
    } catch { alert('No se pudo actualizar el estado'); }
  };

  /**
   * Abre el panel, ya sea para crear o para editar.
   *
   * Las mascotas se piden acá y no en el `useEffect` de la página porque la
   * lista completa solo hace falta cuando se va a agendar. Quien entra a ver
   * las citas del día no paga esa consulta. Se cachea: una vez cargada, abrir
   * el panel otra vez no vuelve a pedirla.
   */
  const abrirPanel = (cita = null) => {
    setCitaEditando(cita);
    setForm(cita ? {
      mascota_id:  cita.mascota_id,
      veterinario: cita.veterinario || '',
      fecha:       cita.fecha || hoy,
      hora:        cita.hora || '09:00',
      motivo:      cita.motivo || '',
      notas:       cita.notas || '',
    } : { ...FORM_VACIO, fecha: hoy });
    // Al editar, el campo arranca con la mascota escrita para que no parezca
    // que se perdió. La lista no se abre porque mascota_id ya viene puesto.
    setBusqMascota(cita ? etiquetaMascota({
      especie: cita.especie, nombre: cita.mascota_nombre, dueno_nombre: cita.dueno_nombre,
    }) : '');
    setMascotaFoco(false);
    setFormError('');
    if (mascotasEstado !== 'listo') {
      setMascotasEstado('cargando');
      api.get('/mascotas')
        .then(r => { setMascotas(r.data); setMascotasEstado('listo'); })
        .catch(() => setMascotasEstado('error'));
    }
    setPanelAbierto(true);
  };

  // Se corta en 8: la lista va dentro de un panel de 384px y más de ocho
  // obligan a desplazar, que con el dedo es peor que volver a escribir.
  const mascotasFiltradas = useMemo(() => {
    if (!busqMascota.trim()) return mascotas.slice(0, 8);
    const q = busqMascota.toLowerCase();
    return mascotas.filter(m =>
      (m.nombre || '').toLowerCase().includes(q) ||
      (m.dueno_nombre || '').toLowerCase().includes(q),
    ).slice(0, 8);
  }, [mascotas, busqMascota]);

  const guardar = async () => {
    // Se valida mascota_id y no el texto del campo: la veterinaria puede
    // haber escrito "Michi" sin elegir de la lista, y una cita necesita el id.
    if (!form.mascota_id)         return setFormError('Elija la mascota de la lista.');
    if (!form.fecha || !form.hora) return setFormError('Falta la fecha o la hora.');
    if (!form.motivo.trim())      return setFormError('Escriba el motivo de la cita.');
    if (!form.veterinario.trim()) return setFormError('Escriba quién la atiende.');

    setGuardando(true); setFormError('');
    try {
      const cuerpo = {
        mascota_id:  form.mascota_id,
        veterinario: form.veterinario.trim(),
        fecha:       form.fecha,
        hora:        form.hora,
        motivo:      form.motivo.trim(),
        notas:       form.notas.trim() || null,
      };
      // El estado se manda tal cual estaba: el PUT lo sobrescribe, y sin esto
      // una cita ya confirmada volvería a quedar pendiente al corregirle la
      // hora. El cambio de estado tiene su propio camino (`cambiarEstado`).
      if (citaEditando) await api.put(`/citas/${citaEditando.id}`, { ...cuerpo, estado: citaEditando.estado });
      else              await api.post('/citas', cuerpo);
      setPanelAbierto(false);
      cargar();
    } catch {
      setFormError('No se pudo guardar. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Topbar
        title="Citas"
        subtitle={`${citasFiltradas.length} citas · ${stats.atendidas} completadas · ${stats.pendientes + stats.confirmadas} restantes`}
        actions={
          <>
            <Button variant="secondary" size="md" icon={<IconCalDays size={13}/>}>Ver calendario</Button>
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>} onClick={() => abrirPanel()}>
              Nueva cita
            </Button>
          </>
        }
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Page>
          {/* Tabs fecha */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: 4,
            background: 'var(--stone-100)', borderRadius: 'var(--r-md)',
            width: 'fit-content', marginBottom: 14,
          }}>
            {[{ id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Esta semana' }, { id: 'mes', label: 'Este mes' }, { id: 'todas', label: 'Todas' }].map(t => (
              <button key={t.id} onClick={() => setFiltroFecha(t.id)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none',
                background: filtroFecha === t.id ? 'var(--surface)' : 'transparent',
                color: filtroFecha === t.id ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 12.5, fontWeight: 600,
                boxShadow: filtroFecha === t.id ? 'var(--shadow-xs)' : 'none',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Status cards */}
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Pendientes',  value: stats.pendientes,  tone: 'warn',    Icon: IconClock,        filter: 'pendiente' },
              { label: 'Confirmadas', value: stats.confirmadas, tone: 'info',    Icon: IconCheck,        filter: 'confirmada' },
              { label: 'Atendidas',   value: stats.atendidas,   tone: 'success', Icon: IconCheckCircle, filter: 'atendida' },
              { label: 'Total',       value: stats.total,       tone: 'neutral', Icon: IconCalendar,     filter: 'todos' },
            ].map((s) => {
              const colorMap = { warn: 'var(--warn)', info: 'var(--info)', success: 'var(--verde-600)', neutral: 'var(--text-muted)' };
              const bgMap    = { warn: 'var(--warn-soft)', info: 'var(--info-soft)', success: 'var(--verde-50)', neutral: 'var(--stone-50)' };
              const active = filtroEstado === s.filter;
              return (
                <button key={s.label} onClick={() => setFiltroEstado(s.filter)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: active ? bgMap[s.tone] : 'var(--surface)',
                  border: `1px solid ${active ? colorMap[s.tone] : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.18s', boxShadow: active ? 'none' : 'var(--shadow-xs)',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: bgMap[s.tone], color: colorMap[s.tone], display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <s.Icon size={16}/>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</p>
                    <p className="tabular" style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* List */}
          <Card padding={0}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--stone-50)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Agenda</h3>
                <Badge tone="neutral" size="sm">{citasFiltradas.length} citas</Badge>
              </div>
              <UIInput icon={<IconSearch size={13}/>} placeholder="Buscar cita..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 220 }}/>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', background: 'var(--warn-soft)', border: '0 0 1px 0 solid var(--warn-ring)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconAlert size={14} color="var(--warn)"/>
                <span style={{ fontSize: 12.5, color: 'var(--warn)' }}>No se pudo conectar al servidor</span>
              </div>
            )}

            {cargando ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><div className="vp-spinner"/></div>
            ) : citasFiltradas.length === 0 ? (
              <EmptyState icon={<IconCalendar size={24}/>} title="Sin citas" subtitle="No hay citas que coincidan con los filtros aplicados"
                action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={() => abrirPanel()}>Nueva cita</Button>}/>
            ) : citasFiltradas.map((c, i) => {
              const especie = c.especie || 'otro';
              const estado = ESTADO_CITA[c.estado] || ESTADO_CITA.pendiente;
              const atendida = c.estado === 'atendida';
              const hora = c.hora || c.hora_inicio || '';
              const transiciones = TRANSICIONES[c.estado] || [];
              return (
                <div key={c.id} style={{
                  // Los seis bloques (hora, mascota, motivo, veterinario,
                  // estado, acciones) no caben en fila en un celular: en una
                  // sola columna cada uno queda en su renglón y se lee.
                  display: 'grid',
                  gridTemplateColumns: esMovil ? '1fr' : '70px 1fr 1fr 130px 110px auto',
                  gap: esMovil ? 8 : 16, padding: esMovil ? '12px 14px' : '12px 16px',
                  borderBottom: i < citasFiltradas.length - 1 ? '1px solid var(--divider)' : 'none',
                  alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s', position: 'relative',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <div style={{
                    padding: '6px 10px',
                    background: atendida ? 'var(--stone-100)' : 'var(--verde-50)',
                    border: `1px solid ${atendida ? 'var(--border)' : 'var(--verde-200)'}`,
                    borderRadius: 'var(--r-md)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'fit-content',
                  }}>
                    <span className="mono tabular" style={{ fontSize: 12.5, fontWeight: 600, color: atendida ? 'var(--text-faint)' : 'var(--verde-700)' }}>{hora}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <SpeciesAvatar especie={especie} size={34}/>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: atendida ? 'line-through' : 'none', opacity: atendida ? 0.6 : 1 }}>{c.mascota_nombre || '—'}</p>
                      <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.raza || ''}{c.dueno ? ` · ${c.dueno}` : ''}</p>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.motivo || '—'}</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, var(--verde-400), var(--verde-700))', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {(c.veterinario || 'V').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.veterinario || '—'}</span>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <span style={{ cursor: transiciones.length > 0 ? 'pointer' : 'default' }}
                      onClick={(e) => { e.stopPropagation(); if (transiciones.length > 0) setDropdownEstadoId(dropdownEstadoId === c.id ? null : c.id); }}>
                      <Badge tone={estado.tone} dot>{estado.label}</Badge>
                    </span>
                    {dropdownEstadoId === c.id && transiciones.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
                        background: 'var(--surface)', border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', minWidth: 140,
                      }}
                      onClick={e => e.stopPropagation()}>
                        {transiciones.map(est => (
                          <button key={est} onClick={() => cambiarEstado(c.id, est)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '8px 12px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <Badge tone={ESTADO_CITA[est]?.tone || 'neutral'} size="sm" dot>{ESTADO_CITA[est]?.label || est}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button style={iconBtnStyle} title="WhatsApp"><IconWhatsApp size={12}/></button>
                    <button style={iconBtnStyle} title="Editar" onClick={(e) => { e.stopPropagation(); abrirPanel(c); }}><IconEdit size={13} color="var(--text-muted)"/></button>
                    <button style={iconBtnStyle} title="Más"><IconMore size={14} color="var(--text-muted)"/></button>
                  </div>
                </div>
              );
            })}
          </Card>
        </Page>

        {/* Panel lateral nueva cita */}
        {panelAbierto && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(28,25,23,0.4)', backdropFilter: 'blur(2px)',
          }}
          onClick={() => setPanelAbierto(false)}>
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              // Ancho fijo de 384px: en un celular el formulario quedaba
              // cortado por la derecha. Ahí ocupa la pantalla completa.
              width: esMovil ? '100%' : 384, background: 'var(--surface)',
              borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={e => e.stopPropagation()}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--verde-50)', border: '1px solid var(--verde-200)', color: 'var(--verde-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconCalendar size={16}/>
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em' }}>{citaEditando ? 'Editar cita' : 'Nueva cita'}</h2>
                  <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>Programa una consulta veterinaria</p>
                </div>
                <button onClick={() => setPanelAbierto(false)} style={iconBtnStyle}><IconX size={14} color="var(--text-muted)"/></button>
              </div>
              <div style={{ flex: 1, padding: 22, overflow: 'auto' }} className="scroll-thin">
                {formError && (
                  <div style={{
                    marginBottom: 14, padding: '9px 12px', fontSize: 12.5,
                    background: 'var(--danger-soft)', border: '1px solid var(--danger-ring)',
                    borderRadius: 'var(--r-md)', color: 'var(--danger)',
                  }}>
                    {formError}
                  </div>
                )}

                <FormField label="Mascota" required>
                  {/* onFocus/onBlur van en el contenedor y no en el input
                      porque FormInput ya usa los suyos para el borde verde y
                      los pisa. En React estos dos eventos burbujean, así que
                      desde acá se entera igual.

                      El onMouseDown evita que el clic en una opción saque el
                      foco antes de que corra el onClick: sin eso la lista se
                      cierra y la mascota nunca queda elegida. */}
                  <div style={{ position: 'relative' }}
                    onFocus={() => setMascotaFoco(true)}
                    onBlur={() => setMascotaFoco(false)}
                    onMouseDown={e => { if (e.target.closest?.('button')) e.preventDefault(); }}>
                    <FormInput
                      placeholder="Buscar por mascota o por dueño..."
                      value={busqMascota}
                      // Escribir borra la mascota elegida: si no, se podría
                      // dejar el nombre de una y guardar el id de otra.
                      onChange={e => { setBusqMascota(e.target.value); setForm(f => ({ ...f, mascota_id: '' })); }}
                    />
                    {/* Con el campo vacío también se abre: al entrar a agendar
                        lo primero que se quiere ver es a quién se puede citar,
                        no tener que adivinar el nombre para que aparezca. */}
                    {(mascotaFoco || busqMascota) && !form.mascota_id && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)',
                        zIndex: 10, maxHeight: 180, overflow: 'auto',
                      }}>
                        {mascotasFiltradas.length === 0 ? (
                          <p style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-faint)' }}>
                            {mascotasEstado === 'cargando' ? 'Cargando las mascotas...'
                              : mascotasEstado === 'error' ? 'No se pudo cargar la lista. Cierre y vuelva a abrir.'
                              : mascotas.length === 0 ? 'Todavía no hay mascotas registradas. Regístrela en Pacientes.'
                              : 'Ninguna mascota se llama así.'}
                          </p>
                        ) : mascotasFiltradas.map(m => (
                          <button key={m.id} type="button"
                            onClick={() => {
                              setForm(f => ({ ...f, mascota_id: m.id }));
                              setBusqMascota(etiquetaMascota(m));
                            }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', border: 'none', background: 'transparent',
                              cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--stone-50)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
                </FormField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FormField label="Fecha" required>
                    <FormInput type="date" value={form.fecha}
                      onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}/>
                  </FormField>
                  <FormField label="Hora" required>
                    <FormInput type="time" value={form.hora} mono
                      onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}/>
                  </FormField>
                </div>
                <FormField label="Veterinario" required>
                  <FormInput placeholder="Dr. Vega" value={form.veterinario}
                    onChange={e => setForm(f => ({ ...f, veterinario: e.target.value }))}/>
                </FormField>
                <FormField label="Motivo" required>
                  <FormInput placeholder="Vacunación, control general..." value={form.motivo}
                    onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}/>
                </FormField>
                <FormField label="Notas adicionales">
                  <FormInput textarea placeholder="Información relevante para el veterinario..." value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}/>
                </FormField>
              </div>
              <div style={{ padding: '14px 22px', borderTop: '1px solid var(--divider)', background: 'var(--stone-50)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" onClick={() => setPanelAbierto(false)} disabled={guardando}>Cancelar</Button>
                <Button variant="primary" onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando...' : citaEditando ? 'Guardar cambios' : 'Crear cita'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {dropdownEstadoId && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setDropdownEstadoId(null)}/>}
      </div>
    </>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function FormInput({ textarea, mono, ...props }) {
  const base = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-md)', color: 'var(--text)', outline: 'none',
    transition: 'all 0.15s', lineHeight: 1.5,
  };
  const onFocus = (e) => { e.currentTarget.style.borderColor = 'var(--verde-500)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; };
  const onBlur  = (e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'none'; };
  if (textarea) return <textarea {...props} rows={2} onFocus={onFocus} onBlur={onBlur} style={{ ...base, resize: 'vertical' }}/>;
  return <input {...props} onFocus={onFocus} onBlur={onBlur} style={{ ...base, height: 36 }}/>;
}
