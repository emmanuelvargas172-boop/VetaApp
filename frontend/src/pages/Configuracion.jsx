import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../lib/AuthContext';
import { getAdminPhone, saveAdminPhone } from '../utils/whatsapp';
import SelectorPlanes from '../components/SelectorPlanes';
import {
  Card, Button, Badge, Topbar, Page, iconBtnStyle,
} from '../components/ui';
import {
  IconCheck, IconCheckCircle, IconBell, IconWhatsApp, IconActivity,
  IconPlus, IconPaw, IconUser, IconMore, IconCash,
} from '../components/icons';

/* ─── helpers ────────────────────────────────────────────────────── */
function Toggle({ value, onChange }) {
  const [v, setV] = useState(value ?? false);
  const cur = onChange ? value : v;
  return (
    <button
      type="button"
      onClick={() => onChange ? onChange(!value) : setV(!v)}
      style={{
        width: 36, height: 20, padding: 2,
        background: cur ? 'var(--verde-500)' : 'var(--stone-300)',
        border: 'none', borderRadius: 'var(--r-full)',
        cursor: 'pointer', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center',
        justifyContent: cur ? 'flex-end' : 'flex-start',
        transition: 'all 0.18s',
      }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'all 0.18s' }}/>
    </button>
  );
}

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      marginBottom: 8,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>{desc}</p>
      </div>
      <Toggle value={value} onChange={onChange}/>
    </div>
  );
}

const fieldStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  height: 36, background: 'var(--surface)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)',
  color: 'var(--text)', outline: 'none', transition: 'all 0.15s',
  boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
};

// Campo controlado (value + onChange)
function ConfigField({ label, value, onChange, mono = false, textarea = false, placeholder = '' }) {
  const focusStyle = { borderColor: 'var(--verde-500)', boxShadow: 'var(--shadow-focus)' };
  const blurStyle  = { borderColor: 'var(--border-strong)', boxShadow: 'none' };
  const font = mono ? 'var(--font-mono)' : 'var(--font-sans)';
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {textarea ? (
        <textarea value={value ?? ''} onChange={onChange} rows={3} placeholder={placeholder}
          style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.5, fontFamily: font }}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
        />
      ) : (
        <input value={value ?? ''} onChange={onChange} placeholder={placeholder}
          style={{ ...fieldStyle, fontFamily: font }}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
        />
      )}
    </div>
  );
}

function ConfigSection({ title, subtitle, action, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--divider)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text)' }}>{title}</h3>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ─── Tabs ───────────────────────────────────────────────────────── */
const TABS = [
  { id: 'clinica',  label: 'Clínica',        Icon: IconPaw },
  { id: 'perfil',   label: 'Perfil',         Icon: IconUser },
  { id: 'plan',     label: 'Plan y pagos',   Icon: IconCash },
  { id: 'equipo',   label: 'Equipo',         Icon: IconUser },
  { id: 'notif',    label: 'Notificaciones', Icon: IconBell },
  { id: 'whatsapp', label: 'WhatsApp',       Icon: IconWhatsApp },
  { id: 'datos',    label: 'Datos y backups',Icon: IconActivity },
];

const FECHA_LARGA = { day: 'numeric', month: 'long', year: 'numeric' };

/**
 * Renovar ANTES de vencerse.
 *
 * Hasta ahora el único lugar donde se podía pagar era la pantalla de
 * bloqueo, o sea que había que dejar la clínica a oscuras para poder pagar.
 * Absurdo para quien quiere estar al día.
 *
 * Se puede prometer sin miedo que renovar antes no cuesta días, porque la
 * base lo garantiza: registrar_pago_aprobado() usa
 *   greatest(coalesce(suscripcion_hasta, now()), now()) + meses
 * o sea que los meses se SUMAN a lo que quedaba. Si la fecha ya venció,
 * cuentan desde hoy.
 */
function SeccionPlan({ perfil, plan, enPrueba, diasPrueba, diasSuscripcion }) {
  const hasta = perfil?.suscripcion_hasta ? new Date(perfil.suscripcion_hasta) : null;
  const estado = perfil?.estado_suscripcion;

  // Vale la pena avisar cuando ya falta poco; antes de eso solo estorba.
  const porVencer = diasSuscripcion !== null && diasSuscripcion <= 10;

  return (
    <ConfigSection
      title="Tu plan"
      subtitle="Renueva cuando quieras: los meses se suman a los días que te queden.">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', marginBottom: 16,
        background: porVencer ? 'var(--danger-soft)' : 'var(--verde-50)',
        border: `1px solid ${porVencer ? 'var(--danger-ring)' : 'var(--verde-200)'}`,
        borderRadius: 'var(--r-md)',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: 'var(--surface)',
          color: porVencer ? 'var(--danger)' : 'var(--verde-600)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCash size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
            Plan {plan}
            {enPrueba && <span style={{ textTransform: 'none', fontWeight: 500 }}> · en prueba gratis</span>}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
            {enPrueba && diasPrueba !== null
              ? `Te ${diasPrueba === 1 ? 'queda 1 día' : `quedan ${diasPrueba} días`} de prueba.`
              : estado === 'activo' && hasta && diasSuscripcion !== null
                ? `Activo hasta el ${hasta.toLocaleDateString('es-CO', FECHA_LARGA)} · ${diasSuscripcion === 1 ? 'queda 1 día' : `quedan ${diasSuscripcion} días`}.`
                : estado === 'activo' && !hasta
                  ? 'Activo sin fecha de vencimiento.'
                  : 'Sin suscripción activa.'}
          </p>
        </div>
      </div>

      <SelectorPlanes
        planActual={plan}
        permitirMeses
        textoBoton="Pagar y renovar"
      />

      <p style={{ margin: '14px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-faint)' }}>
        El pago se hace en Wompi. Tu plan se activa cuando el banco confirma,
        no cuando vuelves a esta página; con PSE puede tardar unos minutos.
      </p>
    </ConfigSection>
  );
}

const CFG_DEFAULT = {
  perfil_nombre: '', tarjeta_profesional: '', correo: '', telefono: '', especialidad: '', foto_url: '',
  clinica_nombre: '', nit: '', direccion: '', telefono_principal: '', correo_contacto: '',
  notif_recordatorio_auto: true, notif_whatsapp: true, notif_email: false, notif_sonido: true,
};

// null → '' para inputs controlados
function normalizar(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === null ? '' : v;
  return out;
}

export default function Configuracion() {
  const { user, perfil, plan, enPrueba, diasPrueba, diasSuscripcion } = useAuth();
  // ?tab=plan permite enlazar directo desde el aviso de vencimiento.
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  const [tab, setTab] = useState(TABS.some((t) => t.id === pedida) ? pedida : 'clinica');

  const irA = (id) => {
    setTab(id);
    // Se limpia el parámetro para que recargar no devuelva siempre a la
    // pestaña del enlace.
    if (params.has('tab')) { params.delete('tab'); setParams(params, { replace: true }); }
  };
  const [cfg, setCfg] = useState(CFG_DEFAULT);
  const [guardando, setGuardando] = useState(false);
  const [okMsg, setOkMsg] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoRef = useRef();

  // WhatsApp admin phone (localStorage, como antes)
  const [telefono, setTelefono] = useState('');
  const [guardadoWa, setGuardadoWa] = useState(false);

  useEffect(() => {
    setTelefono(getAdminPhone());
    api.get('/configuracion')
      .then(res => { if (res.data) setCfg(c => ({ ...c, ...normalizar(res.data) })); })
      .catch(() => {});
  }, []);

  const upd = (k) => (e) => setCfg(c => ({ ...c, [k]: e.target.value }));
  const updBool = (k) => (v) => setCfg(c => ({ ...c, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const { user_id, updated_at, ...payload } = cfg;
      await api.put('/configuracion', payload);
      setOkMsg(true);
      setTimeout(() => setOkMsg(false), 2500);
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudieron guardar los cambios');
    }
    setGuardando(false);
  };

  const cambiarFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const fd = new FormData();
      fd.append('foto', file);
      const { data } = await api.post('/configuracion/foto', fd);
      setCfg(c => ({ ...c, foto_url: data.url }));
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo subir la foto');
    }
    setSubiendoFoto(false);
    e.target.value = '';
  };

  const guardarTelefono = () => {
    if (!telefono.replace(/\D/g, '')) return;
    saveAdminPhone(telefono);
    setGuardadoWa(true);
    setTimeout(() => setGuardadoWa(false), 3000);
  };

  const inicial = ((cfg.perfil_nombre || user?.email || '?').trim()[0] || '?').toUpperCase();

  return (
    <>
      <Topbar
        title="Ajustes"
        subtitle="Configuración de la clínica, perfil y notificaciones"
        actions={
          <Button
            variant={okMsg ? 'secondary' : 'primary'}
            size="md"
            icon={okMsg ? <IconCheckCircle size={14}/> : <IconCheck size={14}/>}
            disabled={guardando}
            onClick={guardar}>
            {guardando ? 'Guardando…' : okMsg ? '¡Guardado!' : 'Guardar cambios'}
          </Button>
        }
      />
      <Page>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
          {/* Nav lateral */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TABS.map(s => (
              <button key={s.id} onClick={() => irA(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: tab === s.id ? 'var(--surface)' : 'transparent',
                border: `1px solid ${tab === s.id ? 'var(--border)' : 'transparent'}`,
                borderRadius: 'var(--r-md)',
                fontSize: 13, fontWeight: tab === s.id ? 600 : 500,
                color: tab === s.id ? 'var(--text)' : 'var(--text-muted)',
                cursor: 'pointer', textAlign: 'left',
                boxShadow: tab === s.id ? 'var(--shadow-xs)' : 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (tab !== s.id) e.currentTarget.style.background = 'var(--stone-100)'; }}
              onMouseLeave={(e) => { if (tab !== s.id) e.currentTarget.style.background = 'transparent'; }}>
                <s.Icon size={15} color={tab === s.id ? 'var(--verde-600)' : 'var(--text-muted)'}/>
                {s.label}
              </button>
            ))}
          </nav>

          {/* Contenido */}
          <div style={{ maxWidth: 700 }}>
            {tab === 'clinica' && (
              <ConfigSection
                title="Información de la clínica"
                subtitle="Datos que aparecen en mensajes y documentos enviados a los dueños">
                <ConfigField label="Nombre de la clínica" value={cfg.clinica_nombre} onChange={upd('clinica_nombre')} placeholder="Ej: Clínica Veterinaria Central"/>
                <ConfigField label="NIT" value={cfg.nit} onChange={upd('nit')} mono placeholder="900.456.123-4"/>
                <ConfigField label="Dirección" value={cfg.direccion} onChange={upd('direccion')} placeholder="Cra 11 #93-45, Bogotá"/>
                <ConfigField label="Teléfono principal" value={cfg.telefono_principal} onChange={upd('telefono_principal')} mono placeholder="+57 1 234 5678"/>
                <ConfigField label="Correo de contacto" value={cfg.correo_contacto} onChange={upd('correo_contacto')} placeholder="contacto@clinica.co"/>
              </ConfigSection>
            )}

            {tab === 'perfil' && (
              <ConfigSection title="Mi perfil" subtitle="Información personal del veterinario">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: cfg.foto_url ? `center/cover no-repeat url(${cfg.foto_url})` : 'linear-gradient(135deg, var(--verde-400), var(--verde-700))',
                    color: '#fff', fontSize: 22, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{cfg.foto_url ? '' : inicial}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{cfg.perfil_nombre || 'Tu nombre'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
                  </div>
                  <input ref={fotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={cambiarFoto}/>
                  <Button variant="secondary" size="sm" disabled={subiendoFoto} onClick={() => fotoRef.current?.click()}>
                    {subiendoFoto ? 'Subiendo…' : 'Cambiar foto'}
                  </Button>
                </div>
                <ConfigField label="Nombre completo" value={cfg.perfil_nombre} onChange={upd('perfil_nombre')} placeholder="Ej: Camilo Vega Martínez"/>
                <ConfigField label="Tarjeta profesional" value={cfg.tarjeta_profesional} onChange={upd('tarjeta_profesional')} mono placeholder="VET-COL 12345"/>
                <ConfigField label="Correo" value={cfg.correo} onChange={upd('correo')} placeholder={user?.email || 'correo@clinica.co'}/>
                <ConfigField label="Teléfono" value={cfg.telefono} onChange={upd('telefono')} mono placeholder="+57 300 123 4567"/>
                <ConfigField label="Especialidad" value={cfg.especialidad} onChange={upd('especialidad')} placeholder="Medicina interna y cirugía menor"/>
              </ConfigSection>
            )}

            {tab === 'plan' && (
              <SeccionPlan
                perfil={perfil}
                plan={plan}
                enPrueba={enPrueba}
                diasPrueba={diasPrueba}
                diasSuscripcion={diasSuscripcion}
              />
            )}

            {tab === 'equipo' && (
              <ConfigSection title="Miembros del equipo" subtitle="Gestión de equipo (próximamente)"
                action={<Button variant="primary" size="sm" icon={<IconPlus size={12}/>} disabled>Invitar</Button>}>
                <div style={{ padding: '18px 16px', background: 'var(--stone-50)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  La gestión de equipo aún no está disponible. Por ahora cada cuenta es una veterinaria independiente.
                </div>
              </ConfigSection>
            )}

            {tab === 'notif' && (
              <ConfigSection title="Notificaciones" subtitle="Define cómo y cuándo recibir alertas del sistema">
                <ToggleRow label="Recordatorios de vacuna automáticos" desc="Envía mensajes 7 días antes" value={cfg.notif_recordatorio_auto} onChange={updBool('notif_recordatorio_auto')}/>
                <ToggleRow label="Notificaciones WhatsApp"             desc="Recibir alertas en tu teléfono"      value={cfg.notif_whatsapp} onChange={updBool('notif_whatsapp')}/>
                <ToggleRow label="Notificaciones por correo"           desc="Resumen diario por email"            value={cfg.notif_email}    onChange={updBool('notif_email')}/>
                <ToggleRow label="Sonidos de alerta"                   desc="Reproducir tonos para citas próximas" value={cfg.notif_sonido}   onChange={updBool('notif_sonido')}/>
                <p style={{ margin: '6px 2px 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
                  Recuerda pulsar <strong>Guardar cambios</strong> arriba para conservar estas preferencias.
                </p>
              </ConfigSection>
            )}

            {tab === 'whatsapp' && (
              <>
                {/* Admin phone — funcional (localStorage) */}
                <ConfigSection
                  title="Número del administrador"
                  subtitle="Número que recibe las notificaciones automáticas de la clínica">
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      Número de WhatsApp (con código de país)
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--stone-50)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>+</div>
                      <input
                        type="tel"
                        style={{ ...fieldStyle, flex: 1 }}
                        placeholder="573001234567 (incluye código de país)"
                        value={telefono}
                        onChange={(e) => { setTelefono(e.target.value); setGuardadoWa(false); }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--verde-500)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
                      />
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
                      Colombia: <span className="mono">573001234567</span> · México: <span className="mono">521234567890</span>
                    </p>
                  </div>

                  <Button
                    variant={guardadoWa ? 'secondary' : 'primary'}
                    size="md"
                    icon={guardadoWa ? <IconCheckCircle size={14}/> : <IconWhatsApp size={13}/>}
                    disabled={!telefono.replace(/\D/g, '')}
                    onClick={guardarTelefono}>
                    {guardadoWa ? '¡Guardado!' : 'Guardar número'}
                  </Button>

                  {guardadoWa && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--verde-50)', border: '1px solid var(--verde-200)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--verde-700)', fontWeight: 500 }}>
                      Número guardado. Los botones "Notificar por WhatsApp" usarán este número.
                    </div>
                  )}
                </ConfigSection>
              </>
            )}

            {tab === 'datos' && (
              <ConfigSection title="Respaldo de datos" subtitle="Tus datos están en la nube (Supabase)">
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--verde-50)',
                  border: '1px solid var(--verde-200)',
                  borderRadius: 'var(--r-md)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', color: 'var(--verde-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconCheckCircle size={16}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Guardado en la nube</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>Todos tus datos se guardan automáticamente en tu cuenta de Supabase.</p>
                  </div>
                </div>
              </ConfigSection>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
