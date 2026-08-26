import { useAuth } from '../lib/AuthContext';
import { Button } from './ui';
import { IconLock, IconWhatsApp, IconLogout, VetaAppLogo } from './icons';

// Número de soporte en formato internacional, solo dígitos (VITE_SOPORTE_WHATSAPP).
const SOPORTE = (import.meta.env.VITE_SOPORTE_WHATSAPP || '').replace(/\D/g, '');

/**
 * Lo que ve una veterinaria bloqueada: suspendida a mano (inactivo) o con
 * la prueba de 14 días ya vencida. Los datos no se borran en ninguno de
 * los dos casos, solo dejan de ser accesibles (RLS, ver 005_prueba.sql).
 */
export default function PantallaBloqueo() {
  const { user, signOut, pruebaVencida } = useAuth();

  const abrirWhatsApp = () => {
    const msg = pruebaVencida
      ? `Hola, se me acabaron los 14 días de prueba de VetaApp (${user?.email || ''}). Quiero activar mi plan.`
      : `Hola, mi cuenta de VetaApp (${user?.email || ''}) está suspendida. Quiero reactivarla.`;
    window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <VetaAppLogo size={34} />
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)',
          padding: '32px 28px', textAlign: 'center',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, margin: '0 auto 18px',
            background: 'var(--verde-50)', border: '1px solid var(--verde-200)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--verde-700)',
          }}>
            <IconLock size={28} stroke={1.6} />
          </div>

          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            color: 'var(--text)', letterSpacing: '-0.02em',
          }}>
            {pruebaVencida ? 'Se acabaron tus 14 días de prueba' : 'Tu acceso está suspendido'}
          </h1>

          <p style={{
            margin: '10px 0 0', fontSize: 14, lineHeight: 1.55,
            color: 'var(--text-muted)',
          }}>
            {pruebaVencida
              ? 'Escríbenos para elegir tu plan y seguir usando VetaApp con la misma información.'
              : 'Por favor comunícate con nosotros para reactivar tu cuenta.'}
          </p>

          {user?.email && (
            <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
              Sesión: <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{user.email}</span>
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
            <Button
              variant="wa"
              size="lg"
              icon={<IconWhatsApp size={17} />}
              onClick={abrirWhatsApp}
              disabled={!SOPORTE}
              title={SOPORTE ? undefined : 'Falta configurar VITE_SOPORTE_WHATSAPP'}
              style={{ width: '100%' }}
            >
              <span style={{ marginLeft: 8 }}>{pruebaVencida ? 'Quiero activar mi plan' : 'Contactar por WhatsApp'}</span>
            </Button>

            <Button
              variant="secondary"
              size="lg"
              icon={<IconLogout size={16} />}
              onClick={signOut}
              style={{ width: '100%' }}
            >
              <span style={{ marginLeft: 8 }}>Cerrar sesión</span>
            </Button>
          </div>
        </div>

        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          Tus datos siguen guardados. Se restauran apenas se reactive la cuenta.
        </p>
      </div>
    </div>
  );
}
