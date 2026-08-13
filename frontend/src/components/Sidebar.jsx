import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  IconDashboard, IconPaw, IconFile, IconCalendar, IconCalDays,
  IconBell, IconSettings, IconSearch, VetaAppLogo,
} from './icons';
import { useAuth } from '../lib/AuthContext';

const IconLogout = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const NAV = [
  { path: '/app',           id: 'dashboard',     label: 'Resumen',       Icon: IconDashboard },
  { path: '/app/mascotas',     id: 'mascotas',      label: 'Mascotas',      Icon: IconPaw },
  { path: '/app/historias',    id: 'historias',     label: 'Historias',     Icon: IconFile },
  { path: '/app/citas',        id: 'citas',         label: 'Citas',         Icon: IconCalendar },
  { path: '/app/calendario',   id: 'calendario',    label: 'Calendario',    Icon: IconCalDays },
  { path: '/app/recordatorios',id: 'recordatorios', label: 'Recordatorios', Icon: IconBell, count: 4 },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const email = user?.email || '';
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    api.get('/configuracion').then(res => setPerfil(res.data)).catch(() => {});
  }, []);

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
        {NAV.map(({ path, id, label, Icon, count }) => {
          const active = isActive(path);
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
