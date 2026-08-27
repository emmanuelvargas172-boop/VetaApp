import { useState, useEffect } from 'react';
import api from '../api/axios';
import {
  openAdminWhatsApp, msgVacunaUrgente,
  linkWhatsApp, msgRecordatorioVacuna, normalizarTelefonoCO,
} from '../utils/whatsapp';
import {
  Card, Button, Badge, Topbar, Page, SectionHeader, ProgressRing,
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

// "hoy" / "ayer" / "hace 4 días" a partir del timestamp del último aviso.
function haceCuanto(iso) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

function urgencia(dias) {
  if (dias === 0)  return { tone: 'danger',  label: 'Hoy',      color: 'var(--danger)',   bg: 'var(--danger-soft)',  ring: 'var(--danger-ring)',  group: 'urgentes' };
  if (dias <= 7)   return { tone: 'danger',  label: `${dias}d`, color: 'var(--danger)',   bg: 'var(--danger-soft)',  ring: 'var(--danger-ring)',  group: 'urgentes' };
  if (dias <= 15)  return { tone: 'warn',    label: `${dias}d`, color: 'var(--warn)',     bg: 'var(--warn-soft)',    ring: 'var(--warn-ring)',    group: 'proximas' };
  return             { tone: 'success', label: `${dias}d`, color: 'var(--verde-600)', bg: 'var(--verde-50)',     ring: 'var(--verde-200)',    group: 'enplazo' };
}

function RecordatorioRow({ item, seleccion, onToggle, onEnviar }) {
  const dias = calcDias(item.proxima_dosis);
  const u = urgencia(dias);
  const checked = seleccion.has(item.id);
  const fechaFmt = new Date(item.proxima_dosis + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  const telOk = !!normalizarTelefonoCO(item.dueno_telefono);
  const avisado = haceCuanto(item.avisado_at);

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
        <p className="mono" style={{ margin: '1px 0 0', fontSize: 11, color: telOk ? 'var(--text-faint)' : 'var(--warn)' }}>
          {item.dueno_telefono || 'Sin teléfono'}{item.dueno_telefono && !telOk ? ' · no sirve para WhatsApp' : ''}
        </p>
      </div>

      {/* Urgencia + acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: 'right' }}>
          <Badge tone={u.tone} dot>{u.label === 'Hoy' ? 'Hoy' : `En ${u.label.replace('d', ' días')}`}</Badge>
          <p style={{ margin: '3px 0 0', fontSize: 10.5, color: 'var(--text-faint)' }}>{fechaFmt}</p>
          {avisado && (
            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--verde-600)', fontWeight: 600 }}>
              Avisado {avisado}
            </p>
          )}
        </div>
        <Button
          variant="wa" size="sm" icon={<IconWhatsApp size={12}/>}
          disabled={!telOk}
          title={telOk ? 'Abre WhatsApp con el mensaje escrito' : 'El teléfono del dueño no sirve para WhatsApp'}
          onClick={() => onEnviar(item)}>
          {avisado ? 'Reenviar' : 'Enviar'}
        </Button>
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

function Group({ titulo, items, tone, descripcion, seleccion, onToggle, onEnviar }) {
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
      {items.map(item => <RecordatorioRow key={item.id} item={item} seleccion={seleccion} onToggle={onToggle} onEnviar={onEnviar}/>)}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Envío guiado                                                        */
/*                                                                     */
/* WhatsApp no permite enviar mensajes desde la web sin la API de       */
/* negocio de Meta (número verificado, plantillas aprobadas y cobro por */
/* conversación). Lo único que se puede hacer desde el navegador es     */
/* abrir el chat con el texto ya escrito, y eso exige un clic real por  */
/* cada destinatario: si se abrieran diez pestañas de golpe el          */
/* navegador bloquea las nueve últimas. Por eso este panel: la lista se */
/* recorre de a uno, la veterinaria da un clic por dueño, y cada envío  */
/* queda registrado en `avisos`.                                        */
/* ------------------------------------------------------------------ */

function PanelEnvio({ cola, indice, enviados, onEnviar, onSaltar, onCerrar }) {
  const item = cola[indice];
  const terminado = !item;
  const tel = item ? normalizarTelefonoCO(item.dueno_telefono) : null;

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
      <Card
        onClick={(e) => e.stopPropagation()}
        padding={0}
        style={{ width: '100%', maxWidth: 480, animation: 'fadeIn 0.15s ease-out' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Enviar recordatorios</p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
              {terminado ? 'Lista terminada' : `${indice + 1} de ${cola.length} · ${enviados} enviados`}
            </p>
          </div>
          <Badge tone={terminado ? 'success' : 'verde'}>{enviados}/{cola.length}</Badge>
        </div>

        {terminado ? (
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--verde-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <IconCheckCircle size={24} color="var(--verde-500)"/>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {enviados} recordatorio{enviados !== 1 ? 's' : ''} enviado{enviados !== 1 ? 's' : ''}
            </p>
            <p style={{ margin: '4px 0 14px', fontSize: 12.5, color: 'var(--text-faint)' }}>
              Quedan registrados para no repetirlos durante los próximos 7 días.
            </p>
            <Button variant="primary" size="md" onClick={onCerrar}>Cerrar</Button>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <SpeciesAvatar especie={item.especie} size={40}/>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.mascota_nombre}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {item.dueno_nombre} · <span className="mono">{item.dueno_telefono || 'sin teléfono'}</span>
                  </p>
                </div>
              </div>

              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Mensaje
              </p>
              <div style={{ padding: '10px 12px', background: 'var(--verde-50)', border: '1px solid var(--verde-200)', borderRadius: 'var(--r-md)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)' }}>
                {msgRecordatorioVacuna(item)}
              </div>

              {!tel && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--warn-soft)', border: '1px solid var(--warn-ring)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--warn)' }}>
                  El teléfono de {item.dueno_nombre} no sirve para WhatsApp. Corrígelo en la ficha del dueño.
                </div>
              )}
              {item.avisado_at && (
                <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Ya se le avisó {haceCuanto(item.avisado_at)}.
                </p>
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={onCerrar}>Cancelar</Button>
              <span style={{ flex: 1 }}/>
              <Button variant="secondary" size="sm" onClick={onSaltar}>Saltar</Button>
              <Button
                variant="wa" size="md" icon={<IconWhatsApp size={13}/>}
                disabled={!tel}
                onClick={() => onEnviar(item)}>
                Abrir WhatsApp
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function Recordatorios() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [filtroDias, setFiltroDias] = useState(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());
  // Envío guiado: cola de destinatarios, en cuál va y cuántos se enviaron.
  const [cola, setCola] = useState(null);
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState(0);

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
  // Solo tiene sentido "enviar" a quien tiene un número que WhatsApp acepte.
  const enviables = data.filter(r => normalizarTelefonoCO(r.dueno_telefono));
  const seleccionEnviable = enviables.filter(r => seleccion.has(r.id));
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

  // Abre el chat y registra el aviso. window.open tiene que ejecutarse
  // dentro del clic, antes de cualquier await: si se espera al insert, el
  // navegador ya no considera la apertura provocada por el usuario y la
  // bloquea como popup.
  const enviarUno = (item) => {
    const mensaje = msgRecordatorioVacuna(item);
    const url = linkWhatsApp(item.dueno_telefono, mensaje);
    if (!url) return false;
    window.open(url, '_blank', 'noopener');
    // El registro va en segundo plano. Si falla (módulo sin migrar, red
    // caída) no se le dice nada a la veterinaria: el mensaje ya se abrió y
    // culparla por un fallo nuestro no aporta.
    api.post('/recordatorios/avisos', {
      vacuna_id: item.id,
      mascota_nombre: item.mascota_nombre,
      dueno_nombre: item.dueno_nombre,
      telefono: item.dueno_telefono,
      mensaje,
    }).catch((e) => console.warn('[avisos] no se registró el aviso:', e?.message));
    // Optimista: la fila se marca como avisada sin esperar al servidor.
    const ahora = new Date().toISOString();
    setRecordatorios(rs => rs.map(r => (r.id === item.id ? { ...r, avisado_at: ahora } : r)));
    return true;
  };

  const abrirEnvio = (items) => {
    if (items.length === 0) return;
    setCola(items);
    setIndice(0);
    setEnviados(0);
  };

  const enviarDeLaCola = (item) => {
    if (enviarUno(item)) setEnviados(n => n + 1);
    setIndice(i => i + 1);
  };

  const cerrarEnvio = () => {
    setCola(null);
    setSeleccion(new Set());
    // Relee para traer los avisado_at reales y recalcular el badge.
    if (enviados > 0) cargar();
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
          <Button
            variant="primary" size="md" icon={<IconWhatsApp size={13}/>}
            disabled={enviables.length === 0}
            title={enviables.length === 0 ? 'No hay dueños con WhatsApp en esta lista' : 'Recorre la lista de a uno, un clic por dueño'}
            onClick={() => abrirEnvio(enviables)}>
            Enviar todos ({enviables.length})
          </Button>
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

        {/* Decir qué hace el botón. WhatsApp no deja enviar sin la API de
            negocio de Meta, y prometer envío solo para que la veterinaria
            descubra que no pasó nada es peor que no prometerlo. */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9,
          padding: '9px 14px', marginBottom: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
        }}>
          <IconWhatsApp size={14} color="#25D366"/>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            VetaApp abre WhatsApp con el mensaje ya escrito y guarda a quién le escribiste;
            el envío lo confirmas tú desde WhatsApp. Los avisados no vuelven a aparecer como
            pendientes durante 7 días.
          </p>
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
            <Button
              variant="wa" size="sm" icon={<IconWhatsApp size={13}/>}
              disabled={seleccionEnviable.length === 0}
              onClick={() => abrirEnvio(seleccionEnviable)}>
              Enviar mensajes ({seleccionEnviable.length})
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
            <Group titulo="Urgentes" items={urgentes} tone="danger"  descripcion="Hoy y dentro de 7 días"    seleccion={seleccion} onToggle={toggle} onEnviar={enviarUno}/>
            <Group titulo="Próximas" items={proximas}  tone="warn"   descripcion="Entre 8 y 15 días"         seleccion={seleccion} onToggle={toggle} onEnviar={enviarUno}/>
            <Group titulo="En plazo" items={enplazo}   tone="success" descripcion="Entre 16 y 30 días"       seleccion={seleccion} onToggle={toggle} onEnviar={enviarUno}/>
          </>
        )}
      </Page>

      {cola && (
        <PanelEnvio
          cola={cola} indice={indice} enviados={enviados}
          onEnviar={enviarDeLaCola}
          onSaltar={() => setIndice(i => i + 1)}
          onCerrar={cerrarEnvio}
        />
      )}
    </>
  );
}
