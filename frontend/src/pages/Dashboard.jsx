import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { openAdminWhatsApp, msgResumenDia } from '../utils/whatsapp';
import {
  Card, Badge, KPI, SectionHeader, BarChart, Donut, ProgressRing,
  Sparkline, Topbar, Page, Button, EmptyState,
} from '../components/ui';
import {
  IconCalendar, IconCheckCircle, IconPaw, IconSyringe,
  IconWhatsApp, IconPlus, IconAlert, IconArrowRight,
  SpeciesAvatar, especieCfg,
} from '../components/icons';

const ESTADO_BADGE = {
  pendiente:  { tone: 'warn',    label: 'Pendiente'  },
  confirmada: { tone: 'info',    label: 'Confirmada' },
  atendida:   { tone: 'success', label: 'Atendida'   },
  cancelada:  { tone: 'danger',  label: 'Cancelada'  },
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Agrupa las especies que devuelve el backend (texto crudo, como lo escribió
 * la veterinaria) en las categorías con color: "Hámster" y "hamster" son la
 * misma, y lo que no está en SPECIES_ICONS cae en su propia etiqueta.
 */
// Colores de reserva para especies escritas a mano: sin esto todas saldrían
// del mismo gris y el donut se vería como un solo arco.
const COLORES_EXTRA = ['var(--info)', 'var(--warn)', 'var(--sp-reptil)', 'var(--verde-500)', 'var(--sp-conejo)'];

function agruparEspecies(especies = []) {
  const mapa = new Map();
  for (const { especie, total } of especies) {
    const cfg = especieCfg(especie);
    const prev = mapa.get(cfg.plural) || { label: cfg.plural, value: 0, color: cfg.color, propia: cfg.plural === 'Otros' ? false : cfg.color === 'var(--sp-otro)' };
    prev.value += total;
    mapa.set(cfg.plural, prev);
  }
  const lista = [...mapa.values()].sort((a, b) => b.value - a.value);
  const usados = new Set(lista.filter((s) => !s.propia).map((s) => s.color));
  let i = 0;
  for (const s of lista) {
    if (!s.propia) continue;
    while (i < COLORES_EXTRA.length && usados.has(COLORES_EXTRA[i])) i += 1;
    if (i < COLORES_EXTRA.length) { s.color = COLORES_EXTRA[i]; usados.add(s.color); i += 1; }
  }
  return lista;
}

function AgendaItem({ cita, isNow = false }) {
  const especie = cita.especie || 'otro';
  const estado = ESTADO_BADGE[cita.estado] || ESTADO_BADGE.pendiente;
  const atendida = cita.estado === 'atendida';
  const hora = cita.hora || cita.hora_inicio || '';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 14,
      padding: '10px 16px', borderRadius: 'var(--r-md)',
      background: isNow ? 'var(--verde-50)' : 'transparent',
      border: isNow ? '1px solid var(--verde-200)' : '1px solid transparent',
      alignItems: 'center', cursor: 'pointer', position: 'relative', transition: 'all 0.18s',
    }}
    onMouseEnter={(e) => { if (!isNow) e.currentTarget.style.background = 'var(--stone-50)'; }}
    onMouseLeave={(e) => { if (!isNow) e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="mono tabular" style={{
        fontSize: 13, fontWeight: 600,
        color: atendida ? 'var(--text-disabled)' : 'var(--text)',
        textDecoration: atendida ? 'line-through' : 'none',
      }}>{hora}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <SpeciesAvatar especie={especie} size={32}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: atendida ? 'line-through' : 'none', opacity: atendida ? 0.6 : 1 }}>
            {cita.mascota_nombre || cita.mascota}
          </p>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cita.motivo}
            {cita.veterinario && <span style={{ color: 'var(--text-faint)' }}> · {cita.veterinario}</span>}
          </p>
        </div>
      </div>
      <Badge tone={estado.tone} dot>{estado.label}</Badge>
      {isNow && <span style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--verde-500)' }} className="anim-pulse-ring"/>}
    </div>
  );
}

export default function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard')
      .then(res => { setDatos(res.data); setCargando(false); })
      .catch(() => setCargando(false));
    api.get('/configuracion')
      .then(res => setPerfil(res.data))
      .catch(() => {});
  }, []);

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="vp-spinner"/>
      </div>
    );
  }

  const stats = datos || {
    citasHoy: 0, atendidosHoy: 0, citasAyer: 0, totalMascotas: 0, mascotasNuevasMes: 0,
    vacunasProximas: 0, vacunasUrgentes: 0, citasDelDia: [], semana: [], especies: [], semanaHoy: -1,
  };
  const progreso = stats.citasHoy > 0 ? Math.round((stats.atendidosHoy / stats.citasHoy) * 100) : 0;
  const proximaIdx = (stats.citasDelDia || []).findIndex(c => c.estado !== 'atendida');
  const especiesData = agruparEspecies(stats.especies);
  const totalEspecies = especiesData.reduce((a, s) => a + s.value, 0);
  const semana = stats.semana?.length === 7 ? stats.semana : [0, 0, 0, 0, 0, 0, 0];
  const citasSemana = semana.reduce((a, n) => a + n, 0);
  const dCitas = stats.citasHoy - (stats.citasAyer || 0);
  const nuevasMes = stats.mascotasNuevasMes || 0;
  const fechaHoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombreRaw = (perfil?.perfil_nombre || '').trim();
  const nombreDoc = nombreRaw
    ? (/^dra?\.?\s/i.test(nombreRaw) ? nombreRaw : `Dr. ${nombreRaw}`)
    : 'Doctor(a)';
  const nombreClinica = (perfil?.clinica_nombre || '').trim() || 'Tu clínica';

  return (
    <>
      <Topbar
        title={`${saludo}, ${nombreDoc}`}
        subtitle={fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1) + ' · ' + nombreClinica}
        actions={
          <>
            <Button variant="secondary" size="md" icon={<IconWhatsApp size={14}/>}
              onClick={() => openAdminWhatsApp(msgResumenDia({ citas: stats.citasHoy, vacunas: stats.vacunasProximas }))}>
              Enviar resumen
            </Button>
            <Button variant="primary" size="md" icon={<IconPlus size={14}/>} onClick={() => navigate('/app/citas')}>
              Nueva cita
            </Button>
          </>
        }
      />
      <Page>
        {stats.vacunasUrgentes > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'linear-gradient(90deg, var(--danger-soft), transparent 80%)',
            border: '1px solid var(--danger-ring)', borderRadius: 'var(--r-lg)', marginBottom: 16,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--danger-ring)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
              <IconAlert size={14}/>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--stone-800)' }}>
              <strong style={{ color: 'var(--danger)' }}>{stats.vacunasUrgentes} vacunas urgentes</strong> requieren atención hoy
            </p>
            <div style={{ flex: 1 }}/>
            <button onClick={() => navigate('/app/recordatorios')} style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: 'var(--surface)', border: '1px solid var(--danger-ring)', color: 'var(--danger)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>Revisar <IconArrowRight size={12}/></button>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          {/* Deltas y sparkline salen de la base. Donde no hay serie real no
              se dibuja gráfica: mejor un número solo que una línea inventada. */}
          <KPI label="Citas hoy" value={stats.citasHoy}
               delta={dCitas === 0 ? 'igual' : dCitas > 0 ? `+${dCitas}` : `${dCitas}`}
               deltaTone={dCitas > 0 ? 'success' : dCitas < 0 ? 'danger' : 'info'}
               deltaLabel="vs. ayer"
               spark={citasSemana > 0 ? semana : []}
               icon={<IconCalendar size={13}/>}/>
          <KPI label="Atendidos" value={stats.atendidosHoy} suffix={`/ ${stats.citasHoy}`}
               delta={`${progreso}%`} deltaTone="verde" deltaLabel="de las citas de hoy"
               icon={<IconCheckCircle size={13}/>}/>
          <KPI label="Mascotas activas" value={stats.totalMascotas}
               delta={nuevasMes > 0 ? `+${nuevasMes}` : 'sin altas'}
               deltaTone={nuevasMes > 0 ? 'success' : 'info'}
               deltaLabel="este mes"
               icon={<IconPaw size={13}/>}/>
          <KPI label="Vacunas próximas" value={stats.vacunasProximas}
               delta={`${stats.vacunasUrgentes || 0} urgentes`}
               deltaTone={stats.vacunasUrgentes > 0 ? 'danger' : 'info'}
               deltaLabel="en 3 días"
               icon={<IconSyringe size={13}/>}/>
        </div>

        {/* Agenda + Vacunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 14, marginBottom: 14 }}>
          <Card padding={0}>
            <SectionHeader
              title="Agenda de hoy"
              subtitle={`${stats.atendidosHoy} de ${stats.citasHoy} citas completadas · ${progreso}%`}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProgressRing value={progreso} size={32} thickness={4} color="var(--verde-500)"/>
                  <Button variant="ghost" size="sm" iconRight={<IconArrowRight size={12}/>} onClick={() => navigate('/app/citas')}>Ver todas</Button>
                </div>
              }
            />
            <div style={{ padding: '8px 6px', maxHeight: 480, overflow: 'auto' }} className="scroll-thin">
              {(stats.citasDelDia || []).length === 0 ? (
                <EmptyState icon={<IconCalendar size={24}/>} title="Sin citas para hoy" subtitle="Agenda una nueva cita desde el módulo de citas"
                  action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={() => navigate('/app/citas')}>Agendar</Button>}/>
              ) : (stats.citasDelDia || []).map((c, i) => (
                <AgendaItem key={c.id} cita={c} isNow={i === proximaIdx}/>
              ))}
            </div>
          </Card>

          <Card padding={0}>
            <SectionHeader
              title="Próximas vacunas"
              subtitle={`${stats.vacunasProximas} en los siguientes 30 días`}
              action={<Button variant="ghost" size="sm" iconRight={<IconArrowRight size={12}/>} onClick={() => navigate('/app/recordatorios')}>Recordatorios</Button>}
            />
            <div style={{ padding: '8px 16px 16px' }}>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 12px' }}>
                {stats.vacunasUrgentes > 0 && <><Badge tone="danger" dot>{stats.vacunasUrgentes} urgentes</Badge>{' '}</>}
                {stats.vacunasSemana > 0 && <Badge tone="warn" dot>{stats.vacunasSemana} esta semana</Badge>}
                {!stats.vacunasUrgentes && !stats.vacunasSemana && 'Todo bajo control'}
              </p>
              <button
                onClick={() => navigate('/app/recordatorios')}
                style={{
                  width: '100%', height: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: '#25D366', color: '#fff', border: '1px solid #1ebe59',
                  borderRadius: 'var(--r-md)', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1ebe59'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#25D366'}
              >
                <IconWhatsApp size={15}/>
                Enviar recordatorios
              </button>
            </div>
          </Card>
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 14 }}>
          <Card padding={0}>
            <SectionHeader title="Citas esta semana" subtitle={`Lunes a domingo · ${citasSemana} citas`}
              action={<Badge tone={citasSemana > 0 ? 'success' : 'neutral'} dot>{citasSemana > 0 ? 'Con agenda' : 'Sin citas'}</Badge>}/>
            <div style={{ padding: '16px 20px 18px' }}>
              {citasSemana === 0 ? (
                <EmptyState icon={<IconCalendar size={24}/>} title="Ninguna cita esta semana"
                  subtitle="Las barras aparecen apenas agendes la primera"/>
              ) : (
                <BarChart data={semana} labels={DIAS_SEMANA} height={140}
                  accent="var(--verde-500)" faded="var(--stone-150)" highlight={stats.semanaHoy}/>
              )}
            </div>
          </Card>

          <Card padding={0}>
            <SectionHeader title="Distribución" subtitle="Mascotas activas por especie"/>
            {especiesData.length === 0 ? (
              <div style={{ padding: 8 }}>
                <EmptyState icon={<IconPaw size={24}/>} title="Sin mascotas registradas"
                  subtitle="Registra la primera y aquí verás la distribución"
                  action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} onClick={() => navigate('/app/mascotas')}>Registrar</Button>}/>
              </div>
            ) : (
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
              <Donut segments={especiesData} size={104} thickness={14}
                center={
                  <>
                    <span className="tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{totalEspecies}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>Total</span>
                  </>
                }
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {especiesData.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}/>
                    <span style={{ flex: 1, color: 'var(--text-muted)' }}>{s.label}</span>
                    <span className="tabular" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </Card>

          <Card padding={0}>
            <SectionHeader title="Acciones rápidas"/>
            <div style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'Registrar mascota',    Icon: IconPaw,       c: 'var(--verde-500)', bg: 'var(--verde-50)',  path: '/app/mascotas' },
                { label: 'Agendar cita',         Icon: IconCalendar,  c: 'var(--info)',      bg: 'var(--info-soft)', path: '/app/citas' },
                { label: 'Historia clínica',     Icon: IconPaw,       c: 'var(--sp-gato)',   bg: 'rgba(124,58,237,0.08)', path: '/app/historias' },
                { label: 'Recordatorios WA',     Icon: IconWhatsApp,  c: '#16A34A',          bg: 'var(--verde-50)', path: '/app/recordatorios' },
              ].map((q, i) => (
                <button key={i} onClick={() => navigate(q.path)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                  padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = q.bg; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: q.bg, color: q.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <q.Icon size={14}/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{q.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </Page>
    </>
  );
}
