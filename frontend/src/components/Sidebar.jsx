import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  IconDashboard, IconPaw, IconFile, IconCalendar, IconCalDays,
  IconBell, IconSettings, IconSearch, IconBox, IconCash, IconMore, IconX,
  VetaAppLogo,
} from './icons';
import { useAuth } from '../lib/AuthContext';

const IconLogout = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/** Cuántas pestañas caben abajo en un celular sin que el texto se parta.
 *  El quinto lugar lo ocupa siempre "Más": nada queda inalcanzable. */
const PESTANAS_MOVIL = 4;

const NAV = [
  { path: '/app',           id: 'dashboard',     label: 'Resumen',       Icon: IconDashboard },
  { path: '/app/mascotas',     id: 'mascotas',      label: 'Mascotas',      Icon: IconPaw },
  { path: '/app/historias',    id: 'historias',     label: 'Historias',     Icon: IconFile },
  { path: '/app/citas',        id: 'citas',         label: 'Citas',         Icon: IconCalendar },
  { path: '/app/calendario',   id: 'calendario',    label: 'Calendario',    Icon: IconCalDays },
  { path: '/app/recordatorios',id: 'recordatorios', label: 'Recordatorios', Icon: IconBell, modulo: 'recordatorios' },
  { path: '/app/operaciones',  id: 'operaciones',   label: 'Operaciones',   Icon: IconBox, modulo: 'inventario' },
  { path: '/app/caja',         id: 'caja',          label: 'Caja y Reportes', Icon: IconCash, modulo: 'caja' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut, tieneModulo } = useAuth();
  const verRecordatorios = tieneModulo('recordatorios');
  const email = user?.email || '';
  const [perfil, setPerfil] = useState(null);
  // Vacunas urgentes de verdad (hoy y los próximos 7 días), el mismo criterio
  // que usa la página de Recordatorios. Antes el badge decía 4 siempre.
  const [urgentes, setUrgentes] = useState(0);

  useEffect(() => {
    api.get('/configuracion').then(res => setPerfil(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!verRecordatorios) { setUrgentes(0); return; }
    let vivo = true;
    const cargar = () => api.get('/recordatorios/pendientes')
      .then(res => { if (vivo) setUrgentes(res.data?.urgentes || 0); })
      .catch(() => {});
    cargar();
    // Sin websockets: se refresca al volver a la pestaña y cada 5 minutos,
    // que para un contador de vacunas es más que suficiente.
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    const t = setInterval(cargar, 5 * 60 * 1000);
    return () => { vivo = false; document.removeEventListener('visibilitychange', alVolver); clearInterval(t); };
  }, [verRecordatorios]);

  const nombre = (perfil?.perfil_nombre || '').trim();
  const fotoUrl = perfil?.foto_url || '';
  const displayName = nombre || email || 'Cuenta';
  const inicial = ((nombre || email || '?').trim()[0] || '?').toUpperCase();

  const isActive = (path) => path === '/app' ? pathname === '/app' || pathname === '/app/' : pathname.startsWith(path);

  return (
    <aside style={{
      width: collapsed ? 68 : 240,
      flexShrink: 0,
      height: '100%',
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '18px 0' : '18px 18px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'var(--verde-50)', border: '1px solid var(--verde-100)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <VetaAppLogo size={22}/>
        </div>
        {!collapsed && (
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, letterSpacing: '-0.015em', color: 'var(--text)' }}>VetaApp</p>
            <p style={{ margin: '1px 0 0', fontSize: 10.5, fontWeight: 500, color: 'var(--text-faint)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Clínica</p>
          </div>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ padding: '0 12px 14px' }}>
          <div style={{
            width: '100%', height: 32,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 10px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer',
          }}>
            <IconSearch size={13}/>
            <span style={{ flex: 1 }}>Buscar…</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--stone-100)', color: 'var(--text-faint)' }}>⌘K</span>
          </div>
        </div>
      )}

      {!collapsed && (
        <p style={{ margin: '4px 18px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-disabled)', textTransform: 'uppercase' }}>Operación</p>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Los módulos que el plan no incluye ni se muestran. El bloqueo real
            está en RLS (004_planes.sql); esto es solo para no ofrecer
            botones que la base de datos va a rechazar. */}
        {NAV.filter(({ modulo }) => !modulo || tieneModulo(modulo)).map(({ path, id, label, Icon }) => {
          const active = isActive(path);
          const count = id === 'recordatorios' ? urgentes : 0;
          return (
            <button
              key={id}
              onClick={() => navigate(path)}
              title={collapsed ? label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '8px 0' : '7px 10px',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: active ? 'var(--shadow-xs)' : 'none',
                fontSize: 13, fontWeight: active ? 600 : 500,
                cursor: 'pointer', width: '100%', textAlign: 'left',
                position: 'relative', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--stone-100)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {active && (
                <span style={{
                  position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 18, borderRadius: '0 3px 3px 0',
                  background: 'var(--verde-500)',
                }}/>
              )}
              <Icon size={17} color={active ? 'var(--verde-600)' : 'currentColor'} stroke={active ? 2 : 1.75}/>
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>
                  {count > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 'var(--r-full)',
                      background: active ? 'var(--verde-100)' : 'var(--stone-150)',
                      color: active ? 'var(--verde-700)' : 'var(--text-muted)',
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{count}</span>
                  )}
                </>
              )}
            </button>
          );
        })}

        <div style={{ flex: 1 }}/>

        <button
          onClick={() => navigate('/app/configuracion')}
          style={{
            display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '7px 10px',
            borderRadius: 'var(--r-md)', border: 'none',
            background: pathname === '/app/configuracion' ? 'var(--stone-100)' : 'transparent',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--stone-100)'}
          onMouseLeave={(e) => e.currentTarget.style.background = pathname === '/app/configuracion' ? 'var(--stone-100)' : 'transparent'}
        >
          <IconSettings size={17}/>
          {!collapsed && <span>Ajustes</span>}
        </button>
      </nav>

      {/* User footer */}
      <div style={{
        margin: 8,
        padding: collapsed ? 6 : 10,
        display: 'flex', alignItems: 'center', gap: 10,
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: fotoUrl
              ? `center/cover no-repeat url(${fotoUrl})`
              : 'linear-gradient(135deg, var(--verde-500), var(--verde-700))',
            color: '#fff', fontSize: 12, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}
        >{fotoUrl ? '' : inicial}</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
              <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre ? email : 'Sesión activa'}</p>
            </div>
            <button
              onClick={signOut}
              title="Cerrar sesión"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, flexShrink: 0,
                borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#B91C1C'; e.currentTarget.style.borderColor = '#FECACA'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <IconLogout size={15} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * La misma navegación, pero abajo, para celular.
 *
 * No es el `<aside>` con otro ancho: una barra lateral de 240px en una
 * pantalla de 390px se come dos tercios del ancho, así que en móvil se
 * cambia de eje. `App.jsx` decide cuál de los dos monta.
 *
 * Solo caben cuatro pestañas. Las demás (calendario, recordatorios,
 * inventario, caja, ajustes) viven detrás de "Más", que abre una hoja
 * desde abajo. Nada se esconde: lo que el plan incluye, se alcanza.
 */
export function BarraInferior() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut, tieneModulo } = useAuth();
  const [hoja, setHoja] = useState(false);

  const visibles = NAV.filter(({ modulo }) => !modulo || tieneModulo(modulo));
  const fijas = visibles.slice(0, PESTANAS_MOVIL);
  const resto = visibles.slice(PESTANAS_MOVIL);

  const isActive = (path) =>
    path === '/app' ? pathname === '/app' || pathname === '/app/' : pathname.startsWith(path);

  // Si la página abierta está dentro de "Más", el botón se marca activo:
  // sin esto el usuario ve la barra sin ninguna pestaña encendida y no
  // sabe dónde está parado.
  const enResto = resto.some(({ path }) => isActive(path)) || pathname === '/app/configuracion';

  const ir = (path) => { setHoja(false); navigate(path); };

  const pestana = (activa) => ({
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 3,
    // 52px de alto: por debajo de eso el dedo falla. Es el mínimo táctil.
    minHeight: 52,
    padding: '6px 2px',
    border: 'none', background: 'transparent',
    color: activa ? 'var(--verde-700)' : 'var(--text-muted)',
    fontSize: 10, fontWeight: activa ? 700 : 500,
    cursor: 'pointer',
  });

  return (
    <>
      {hoja && (
        <div
          onClick={() => setHoja(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,20,0.45)', zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              background: 'var(--surface)',
              borderRadius: '16px 16px 0 0',
              borderTop: '1px solid var(--border)',
              padding: '10px 12px calc(14px + env(safe-area-inset-bottom))',
              maxHeight: '75vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>VetaApp</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email || 'Sesión activa'}
                </p>
              </div>
              <button
                onClick={() => setHoja(false)}
                aria-label="Cerrar"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <IconX size={15} />
              </button>
            </div>

            {[...resto, { path: '/app/configuracion', id: 'configuracion', label: 'Ajustes', Icon: IconSettings }].map(({ path, id, label, Icon }) => {
              const activa = isActive(path);
              return (
                <button
                  key={id}
                  onClick={() => ir(path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', minHeight: 48, padding: '0 8px',
                    border: 'none', borderRadius: 'var(--r-md)',
                    background: activa ? 'var(--verde-50)' : 'transparent',
                    color: activa ? 'var(--verde-700)' : 'var(--text)',
                    fontSize: 14, fontWeight: activa ? 700 : 500,
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <Icon size={19} color="currentColor" />
                  {label}
                </button>
              );
            })}

            <button
              onClick={signOut}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', minHeight: 48, padding: '0 8px', marginTop: 6,
                border: 'none', borderTop: '1px solid var(--divider)', borderRadius: 0,
                background: 'transparent', color: 'var(--danger)',
                fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
              }}
            >
              <IconLogout size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <nav style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        // La franja del iPhone tapa la última fila si no se reserva.
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 30,
      }}>
        {fijas.map(({ path, id, label, Icon }) => {
          const activa = isActive(path) && !hoja;
          return (
            <button key={id} onClick={() => ir(path)} style={pestana(activa)}>
              <Icon size={20} color={activa ? 'var(--verde-600)' : 'currentColor'} stroke={activa ? 2 : 1.75} />
              <span>{label}</span>
            </button>
          );
        })}
        <button onClick={() => setHoja(h => !h)} style={pestana(hoja || enResto)}>
          <IconMore size={20} color={hoja || enResto ? 'var(--verde-600)' : 'currentColor'} />
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}
