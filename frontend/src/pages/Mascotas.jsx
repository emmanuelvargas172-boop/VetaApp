import { useState, useEffect } from 'react';
import api from '../api/axios';
import ModalMascota from '../components/ModalMascota';
import {
  Card, Badge, SectionHeader, Topbar, Page, Button, UIInput, EmptyState, iconBtnStyle, Sparkline,
} from '../components/ui';
import {
  SpeciesAvatar, SPECIES_ICONS,
  IconPaw, IconPlus, IconFilter, IconSearch, IconEdit, IconTrash, IconWhatsApp,
  IconChevronRight, IconArrowLeft, IconCalendar, IconFile, IconSyringe, IconBell,
  IconClock, IconWeight, IconPhone, IconMapPin, IconActivity, IconAlert,
} from '../components/icons';

const FILTROS = [
  { id: 'todas', label: 'Todas' },
  { id: 'perro', label: 'Perros' },
  { id: 'gato', label: 'Gatos' },
  { id: 'ave', label: 'Aves' },
  { id: 'conejo', label: 'Conejos' },
  { id: 'reptil', label: 'Reptiles' },
];

function formatEdad(anios, meses) {
  const a = Number(anios) || 0;
  const m = Number(meses) || 0;
  if (a === 0 && m === 0) return '—';
  if (a === 0) return `${m}m`;
  if (m === 0) return `${a}a`;
  return `${a}a ${m}m`;
}

function FilterChip({ active, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 'var(--r-full)',
      border: `1px solid ${active ? 'var(--verde-600)' : 'var(--border-strong)'}`,
      background: active ? 'var(--verde-600)' : 'var(--surface)',
      color: active ? '#fff' : 'var(--text-muted)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    }}
    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--verde-500)'; e.currentTarget.style.color = 'var(--text)'; } }}
    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
    >
      {children}
      {count !== undefined && (
        <span className="tabular" style={{ fontSize: 10.5, padding: '1px 5px', borderRadius: 'var(--r-full)', background: active ? 'rgba(255,255,255,0.18)' : 'var(--stone-100)', color: active ? '#fff' : 'var(--text-faint)' }}>
          {count}
        </span>
      )}
    </button>
  );
}

function MascotaRow({ m, onClick }) {
  const cfg = SPECIES_ICONS[m.especie] || SPECIES_ICONS.otro;
  const [hover, setHover] = useState(false);
  const edad = formatEdad(m.edad_anios, m.edad_meses);
  const waLink = `https://wa.me/57${(m.dueno_telefono || '').replace(/\D/g, '')}`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.9fr 1.8fr 1fr auto',
        gap: 16, padding: '11px 16px',
        background: hover ? 'var(--stone-50)' : 'transparent',
        borderBottom: '1px solid var(--divider)',
        alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <SpeciesAvatar especie={m.especie} size={38}/>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: hover ? 'var(--verde-700)' : 'var(--text)', letterSpacing: '-0.01em', transition: 'color 0.15s' }}>{m.nombre}</p>
          <p className="mono" style={{ margin: '1px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>
            MASC-{String(m.id).padStart(4, '0')}
          </p>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }}/>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{cfg.label}</span>
        </div>
        <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>{m.raza || '—'}</p>
      </div>
      <div>
        <p className="tabular" style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{edad}</p>
        <p className="tabular" style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>{m.peso ? `${m.peso} kg` : '—'}</p>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.dueno_nombre || '—'}</p>
        <p className="mono" style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>{m.dueno_telefono || ''}</p>
      </div>
      <div>
        <Badge tone="neutral" size="sm">Registrado</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
        <button title="Editar" style={iconBtnStyle}><IconEdit size={14} color="var(--text-muted)"/></button>
        {m.dueno_telefono && (
          <a href={waLink} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ ...iconBtnStyle, color: '#25D366', textDecoration: 'none' }}>
            <IconWhatsApp size={12}/>
          </a>
        )}
        <button title="Eliminar" style={iconBtnStyle}><IconTrash size={14} color="var(--danger)"/></button>
        <span style={{ marginLeft: 4 }}><IconChevronRight size={14} color="var(--text-disabled)"/></span>
      </div>
    </div>
  );
}

function MascotaPerfil({ mascota, onBack }) {
  const cfg = SPECIES_ICONS[mascota.especie] || SPECIES_ICONS.otro;
  const Icon = cfg.Icon;
  const [tab, setTab] = useState('resumen');
  const edad = formatEdad(mascota.edad_anios, mascota.edad_meses);
  const waLink = `https://wa.me/57${(mascota.dueno_telefono || '').replace(/\D/g, '')}`;

  function Tab({ id, children, count }) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 2px', marginRight: 24,
        background: 'transparent', border: 'none',
        fontSize: 13, fontWeight: 600,
        color: active ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
        borderBottom: `2px solid ${active ? 'var(--verde-600)' : 'transparent'}`,
        marginBottom: -1, transition: 'all 0.15s',
      }}>
        {children}
        {count !== undefined && (
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 5px', borderRadius: 'var(--r-full)', background: active ? 'var(--verde-100)' : 'var(--stone-100)', color: active ? 'var(--verde-700)' : 'var(--text-faint)' }}>{count}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <Topbar
        breadcrumb={['Mascotas', mascota.nombre]}
        title={mascota.nombre}
        subtitle={`${cfg.label} · ${mascota.raza || ''} · ID MASC-${String(mascota.id).padStart(4, '0')}`}
        actions={
          <>
            <Button variant="secondary" size="md" icon={<IconArrowLeft size={13}/>} onClick={onBack}>Volver</Button>
            <Button variant="secondary" size="md" icon={<IconEdit size={13}/>}>Editar</Button>
            <Button variant="primary" size="md" icon={<IconCalendar size={13}/>}>Agendar cita</Button>
          </>
        }
      />
      <Page>
        {/* Hero */}
        <div style={{
          position: 'relative', padding: '20px 24px',
          background: `linear-gradient(135deg, ${cfg.soft}, transparent 80%)`,
          border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', marginBottom: 14, overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -20, top: -10, opacity: 0.08 }}>
            <Icon size={200} color={cfg.color}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, background: cfg.soft, border: `2px solid ${cfg.color}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <Icon size={50} color={cfg.color}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text)' }}>{mascota.nombre}</h2>
                <Badge tone="verde" dot>Activa</Badge>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{cfg.label} · {mascota.raza || '—'}</p>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              {[
                { label: 'Edad',  value: edad,                   Icon: IconClock },
                { label: 'Peso',  value: mascota.peso ? `${mascota.peso} kg` : '—', Icon: IconWeight },
              ].map((v, i) => (
                <div key={i} style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <v.Icon size={11} color="var(--text-faint)"/>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{v.label}</span>
                  </div>
                  <p className="tabular" style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-0.015em' }}>{v.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: 16, padding: '0 4px' }}>
          <Tab id="resumen">Resumen</Tab>
          <Tab id="vacunas">Vacunas</Tab>
          <Tab id="citas">Próximas citas</Tab>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
          <div>
            {tab === 'resumen' && (
              <Card padding={0}>
                <SectionHeader title="Control de peso" subtitle="Histórico (mock)"/>
                <div style={{ padding: 18 }}>
                  <p className="tabular" style={{ margin: 0, fontSize: 30, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em', lineHeight: 1 }}>
                    {mascota.peso || '—'} <span style={{ fontSize: 14, color: 'var(--text-faint)', fontWeight: 500 }}>kg</span>
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <Sparkline data={[3.8, 3.9, 4.0, 4.1, 4.0, mascota.peso || 4]} width={600} height={70} color="var(--verde-500)"/>
                  </div>
                </div>
              </Card>
            )}
            {tab !== 'resumen' && (
              <EmptyState icon={<IconCalendar size={24}/>} title="Sin registros" subtitle={`No hay datos en esta sección para ${mascota.nombre}`}
                action={<Button variant="primary" size="md" icon={<IconPlus size={14}/>}>Agregar</Button>}/>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card padding={0}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--verde-400), var(--verde-700))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                  {(mascota.dueno_nombre || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', fontWeight: 500 }}>Dueño responsable</p>
                  <p style={{ margin: '1px 0 0', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{mascota.dueno_nombre || '—'}</p>
                </div>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mascota.dueno_telefono && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--stone-50)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <IconPhone size={13}/>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teléfono</p>
                      <p className="mono" style={{ margin: '1px 0 0', fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{mascota.dueno_telefono}</p>
                    </div>
                  </div>
                )}
                {mascota.dueno_direccion && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--stone-50)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <IconMapPin size={13}/>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dirección</p>
                      <p style={{ margin: '1px 0 0', fontSize: 12.5, color: 'var(--text)' }}>{mascota.dueno_direccion}</p>
                    </div>
                  </div>
                )}
                {mascota.dueno_telefono && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" style={{
                    marginTop: 4, height: 36, width: '100%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#25D366', color: '#fff', border: '1px solid #1ebe59',
                    borderRadius: 'var(--r-md)', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', transition: 'background 0.15s', textDecoration: 'none',
                  }}>
                    <IconWhatsApp size={14}/>
                    Enviar mensaje
                  </a>
                )}
              </div>
            </Card>

            <Card padding={0}>
              <SectionHeader title="Acciones"/>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { Icon: IconCalendar, label: 'Agendar cita',       color: 'var(--info)' },
                  { Icon: IconFile,     label: 'Nueva historia',      color: 'var(--sp-gato)' },
                  { Icon: IconSyringe,  label: 'Registrar vacuna',    color: 'var(--verde-600)' },
                  { Icon: IconBell,     label: 'Crear recordatorio',  color: 'var(--warn)' },
                ].map((a, i) => (
                  <button key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', background: 'transparent', border: 'none',
                    borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'background 0.15s', fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-50)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <a.Icon size={15} color={a.color}/>
                    <span style={{ flex: 1 }}>{a.label}</span>
                    <IconChevronRight size={13} color="var(--text-disabled)"/>
                  </button>
                ))}
              </div>
            </Card>

            <Card style={{ background: 'var(--stone-50)' }}>
              <p className="mono" style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>ID DEL REGISTRO</p>
              <p className="mono" style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>MASC-{String(mascota.id).padStart(4, '0')}</p>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}

export default function Mascotas() {
  const [mascotas, setMascotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [perfilActivo, setPerfilActivo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);

  const cargar = () => {
    api.get('/mascotas')
      .then(res => { setMascotas(res.data || []); setCargando(false); })
      .catch(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  if (perfilActivo) {
    return <MascotaPerfil mascota={perfilActivo} onBack={() => setPerfilActivo(null)}/>;
  }

  const filtradas = mascotas.filter(m => {
    if (filtro !== 'todas' && m.especie !== filtro) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return (m.nombre || '').toLowerCase().includes(q) ||
             (m.dueno_nombre || '').toLowerCase().includes(q) ||
             (m.raza || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = FILTROS.reduce((acc, f) => {
    acc[f.id] = f.id === 'todas' ? mascotas.length : mascotas.filter(m => m.especie === f.id).length;
    return acc;
  }, {});

  return (
    <>
      <Topbar
        title="Mascotas"
        subtitle={`${mascotas.length} pacientes registrados`}
        actions={
          <>
            <Button variant="secondary" size="md" icon={<IconFilter size={13}/>}>Filtros</Button>
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>} onClick={() => { setEditando(null); setModalOpen(true); }}>Registrar mascota</Button>
          </>
        }
      />
      <Page>
        {/* Search + filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <UIInput
            placeholder="Buscar por nombre, dueño, raza..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            icon={<IconSearch size={14}/>}
            style={{ width: 340 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {FILTROS.map(f => (
              <FilterChip key={f.id} active={filtro === f.id} onClick={() => setFiltro(f.id)} count={counts[f.id]}>
                {f.label}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Species mini-stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
          {['perro','gato','ave','conejo','reptil'].map(esp => {
            const cfg = SPECIES_ICONS[esp];
            const count = mascotas.filter(m => m.especie === esp).length;
            const isActive = filtro === esp;
            return (
              <button key={esp} onClick={() => setFiltro(filtro === esp ? 'todas' : esp)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: isActive ? cfg.soft : 'var(--surface)',
                  border: `1px solid ${isActive ? cfg.color : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--stone-50)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: cfg.soft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <cfg.Icon size={20} color={cfg.color}/>
                </div>
                <div>
                  <p className="tabular" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{count}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>{cfg.label}s</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <Card padding={0}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.9fr 1.8fr 1fr auto',
            gap: 16, padding: '10px 16px',
            background: 'var(--stone-50)', borderBottom: '1px solid var(--border)',
            fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <span>Mascota</span><span>Especie / Raza</span><span>Edad / Peso</span>
            <span>Dueño</span><span>Estado</span><span style={{ minWidth: 110 }}></span>
          </div>

          {cargando ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <div className="vp-spinner"/>
            </div>
          ) : filtradas.length === 0 ? (
            <EmptyState
              icon={<IconPaw size={26}/>}
              title="Sin resultados"
              subtitle={busqueda ? `No encontramos mascotas que coincidan con "${busqueda}"` : 'No hay mascotas en esta categoría'}
              action={filtro !== 'todas' || busqueda ? <Button variant="secondary" size="sm" onClick={() => { setFiltro('todas'); setBusqueda(''); }}>Limpiar filtros</Button> : null}
            />
          ) : filtradas.map(m => (
            <MascotaRow key={m.id} m={m} onClick={() => setPerfilActivo(m)}/>
          ))}
        </Card>
      </Page>

      <ModalMascota
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={cargar}
        mascotaEditar={editando}
      />
    </>
  );
}
