import { useState, useEffect } from 'react';
import api from '../api/axios';
import { openAdminWhatsApp, msgVacunaUrgente } from '../utils/whatsapp';
import {
  Card, Button, Badge, Topbar, Page, SectionHeader, ProgressRing, iconBtnStyle,
} from '../components/ui';
import {
  IconCheck, IconAlert, IconClock, IconCheckCircle, IconWhatsApp, IconBell,
  SpeciesAvatar, IconSyringe,
} from '../components/icons';

function calcDias(proxima_dosis) {
  const hoy = new Date().toISOString().split('T')[0];
  return Math.ceil(
    (new Date(proxima_dosis + 'T12:00:00') - new Date(hoy + 'T12:00:00'))
    / (1000 * 60 * 60 * 24)
  );
}

function urgencia(dias) {
  if (dias === 0)  return { tone: 'danger',  label: 'Hoy',      color: 'var(--danger)',   bg: 'var(--danger-soft)',  ring: 'var(--danger-ring)',  group: 'urgentes' };
  if (dias <= 7)   return { tone: 'danger',  label: `${dias}d`, color: 'var(--danger)',   bg: 'var(--danger-soft)',  ring: 'var(--danger-ring)',  group: 'urgentes' };
  if (dias <= 15)  return { tone: 'warn',    label: `${dias}d`, color: 'var(--warn)',     bg: 'var(--warn-soft)',    ring: 'var(--warn-ring)',    group: 'proximas' };
  return             { tone: 'success', label: `${dias}d`, color: 'var(--verde-600)', bg: 'var(--verde-50)',     ring: 'var(--verde-200)',    group: 'enplazo' };
}

function waLink(item) {
  const tel = (item.dueno_telefono || '').replace(/\D/g, '');
  const fecha = new Date(item.proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const msg = `Hola ${item.dueno_nombre}, le recordamos que ${item.mascota_nombre} tiene pendiente su vacuna de ${item.nombre} el ${fecha}. Por favor comuníquese con nosotros para agendar su cita. 🐾`;
  return `https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`;
}

function RecordatorioRow({ item, seleccion, onToggle }) {
  const dias = calcDias(item.proxima_dosis);
  const u = urgencia(dias);
  const checked = seleccion.has(item.id);
  const fechaFmt = new Date(item.proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      onClick={() => onToggle(item.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 1.4fr 1fr auto',
        gap: 14,
        padding: '12px 16px',
        background: checked ? 'var(--verde-50)' : 'transparent',
        borderBottom: '1px solid var(--divider)',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = 'var(--stone-50)'; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = 'transparent'; }}>
      {/* Checkbox */}
      <div style={{
        width: 18, height: 18, borderRadius: 5,
        border: `1.5px solid ${checked ? 'var(--verde-600)' : 'var(--border-strong)'}`,
        background: checked ? 'var(--verde-600)' : 'var(--surface)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'all 0.15s',
      }}>
        {checked && <IconCheck size={11} color="#fff" stroke={2.5}/>}
      </div>

      {/* Mascota */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <SpeciesAvatar especie={item.especie} size={36}/>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.mascota_nombre}</p>
          <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>{item.raza || item.especie}</p>
        </div>
      </div>

      {/* Vacuna */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconSyringe size={12} color="var(--info)"/>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{item.nombre}</p>
        </div>
        {item.ultima_aplicacion && (
          <p className="mono" style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>
            Última: {new Date(item.ultima_aplicacion + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Dueño */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.dueno_nombre}
        </p>
        <p className="mono" style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>{item.dueno_telefono}</p>
      </div>

      {/* Urgencia + acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: 'right' }}>
          <Badge tone={u.tone} dot>{u.label === 'Hoy' ? 'Hoy' : `En ${u.label.replace('d', ' días')}`}</Badge>
          <p style={{ margin: '3px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>{fechaFmt}</p>
        </div>
        <a href={waLink(item)} target="_blank" rel="noreferrer">
          <Button variant="wa" size="sm" icon={<IconWhatsApp size={12}/>}>Enviar</Button>
        </a>
        {dias <= 7 && (
          <Button variant="secondary" size="sm" icon={<IconBell size={12}/>}
            onClick={() => openAdminWhatsApp(msgVacunaUrgente({ mascota: item.mascota_nombre, dueno: item.dueno_nombre, dias }))}>
            Admin
          </Button>
        )}
      </div>
    </div>
  );
}

function Group({ titulo, items, tone, descripcion, seleccion, onToggle }) {
  if (items.length === 0) return null;
  const toneColors = {
    danger:  { color: 'var(--danger)',   bg: 'var(--danger-soft)', ring: 'var(--danger-ring)',  Icon: IconAlert },
    warn:    { color: 'var(--warn)',     bg: 'var(--warn-soft)',   ring: 'var(--warn-ring)',    Icon: IconClock },
    success: { color: 'var(--verde-600)',bg: 'var(--verde-50)',    ring: 'var(--verde-200)',    Icon: IconCheckCircle },
  };
  const c = toneColors[tone];
  return (
    <Card padding={0} style={{ marginBottom: 14 }}>
      <div style={{
        padding: '12px 16px',
        background: c.bg,
        borderBottom: `1px solid ${c.ring}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'var(--surface)', border: `1px solid ${c.ring}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: c.color,
          }}>
            <c.Icon size={13}/>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color, letterSpacing: '-0.005em' }}>{titulo}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{descripcion}</p>
          </div>
        </div>
        <Badge tone={tone}>{items.length}</Badge>
      </div>
      {items.map(item => <RecordatorioRow key={item.id} item={item} seleccion={seleccion} onToggle={onToggle}/>)}
    </Card>
  );
}

export default function Recordatorios() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [filtroDias, setFiltroDias] = useState(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const { data } = await api.get('/recordatorios/vacunas', { params: { dias: filtroDias } });
      setRecordatorios(data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); setSeleccion(new Set()); }, [filtroDias]);

  const data = recordatorios.map(r => ({ ...r, _dias: calcDias(r.proxima_dosis) })).sort((a, b) => a._dias - b._dias);
  const urgentes = data.filter(r => urgencia(r._dias).group === 'urgentes');
  const proximas = data.filter(r => urgencia(r._dias).group === 'proximas');
  const enplazo  = data.filter(r => urgencia(r._dias).group === 'enplazo');

  const toggle = (id) => setSeleccion(s => {
    const ns = new Set(s);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    return ns;
  });

  const toggleAll = () => {
    if (seleccion.size === data.length) setSeleccion(new Set());
    else setSeleccion(new Set(data.map(r => r.id)));
  };

  return (
    <>
      <Topbar
        title="Recordatorios WhatsApp"
        subtitle={
          cargando
            ? 'Cargando...'
            : `${data.length} vacunas próximas · ${urgentes.length} urgentes · ${proximas.length} esta quincena`
        }
        actions={
          <>
            <Button variant="primary" size="md" icon={<IconWhatsApp size={13}/>}>
              Enviar todos ({data.length})
            </Button>
          </>
        }
      />
      <Page>
        {/* Stats + filtros */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
          <Card padding={0}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18 }}>
              <ProgressRing
                value={data.length} max={20} size={72} thickness={8}
                color="var(--verde-500)"
                label={<span className="tabular" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{data.length}</span>}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pendientes</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text)', lineHeight: 1.2 }}>
                  {data.length} recordatorios{' '}
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-faint)' }}>en {filtroDias} días</span>
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <Badge tone="danger" dot>{urgentes.length} urgentes</Badge>
                  <Badge tone="warn" dot>{proximas.length} próximas</Badge>
                  <Badge tone="success" dot>{enplazo.length} en plazo</Badge>
                </div>
              </div>
            </div>
          </Card>

          <Card padding={0}>
            <SectionHeader title="Rango de búsqueda"/>
            <div style={{ padding: '12px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[7, 15, 30, 60].map(d => (
                  <button key={d} onClick={() => setFiltroDias(d)} style={{
                    flex: 1, padding: '10px 8px',
                    background: filtroDias === d ? 'var(--verde-50)' : 'var(--surface)',
                    border: `1px solid ${filtroDias === d ? 'var(--verde-500)' : 'var(--border)'}`,
                    color: filtroDias === d ? 'var(--verde-700)' : 'var(--text-muted)',
                    borderRadius: 'var(--r-md)',
                    fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <p className="tabular" style={{ margin: 0, fontSize: 16, lineHeight: 1, fontWeight: 700 }}>{d}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 500, opacity: 0.7 }}>días</p>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'var(--warn-soft)', border: '1px solid var(--warn-ring)', borderRadius: 'var(--r-lg)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconAlert size={16} color="var(--warn)"/>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>No se pudo conectar al servidor.</p>
          </div>
        )}

        {/* Bulk action toolbar */}
        {seleccion.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'var(--verde-50)',
            border: '1px solid var(--verde-200)',
            borderRadius: 'var(--r-lg)',
            marginBottom: 12,
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <Badge tone="verde">{seleccion.size} seleccionados</Badge>
            <span style={{ flex: 1 }}/>
            <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Set())}>Limpiar</Button>
            <Button variant="wa" size="sm" icon={<IconWhatsApp size={13}/>}>
              Enviar mensajes ({seleccion.size})
            </Button>
          </div>
        )}

        {/* Select all toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          marginBottom: 12,
        }}>
          <button onClick={toggleAll} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px',
            background: 'transparent', border: 'none',
            cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 4,
              border: `1.5px solid ${seleccion.size === data.length && data.length > 0 ? 'var(--verde-600)' : 'var(--border-strong)'}`,
              background: seleccion.size === data.length && data.length > 0 ? 'var(--verde-600)' : 'var(--surface)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {seleccion.size === data.length && data.length > 0 && <IconCheck size={10} color="#fff" stroke={2.5}/>}
            </div>
            Seleccionar todos
          </button>
          <span style={{ width: 1, height: 16, background: 'var(--border)' }}/>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {cargando ? 'Cargando...' : `${data.length} registros`}
          </span>
        </div>

        {cargando ? (
          <Card style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span className="vp-spinner"/>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Cargando recordatorios...</p>
          </Card>
        ) : data.length === 0 ? (
          <Card padding={0} style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--verde-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <IconCheckCircle size={28} color="var(--verde-500)"/>
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Todo al día</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>No hay vacunas próximas en los próximos {filtroDias} días</p>
          </Card>
        ) : (
          <>
            <Group titulo="Urgentes" items={urgentes} tone="danger"  descripcion="Hoy y dentro de 7 días"    seleccion={seleccion} onToggle={toggle}/>
            <Group titulo="Próximas" items={proximas}  tone="warn"   descripcion="Entre 8 y 15 días"         seleccion={seleccion} onToggle={toggle}/>
            <Group titulo="En plazo" items={enplazo}   tone="success" descripcion="Entre 16 y 30 días"       seleccion={seleccion} onToggle={toggle}/>
          </>
        )}
      </Page>
    </>
  );
}
