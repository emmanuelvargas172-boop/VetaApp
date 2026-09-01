import { useAuth } from '../lib/AuthContext';
import { Button, Page } from './ui';
import { IconLock, IconWhatsApp } from './icons';
import { WHATSAPP, linkWhatsApp } from '../config/marca';

const SOPORTE = WHATSAPP;

const NOMBRE_PLAN = { fichas: 'Esencial', completo: 'Avanzado', facturacion: 'Facturación' };

/**
 * Lo que ve alguien del plan Esencial si entra por URL a un módulo que su plan
 * no incluye. No es seguridad — RLS ya devuelve cero filas y rechaza los
 * inserts (004_planes.sql). Esto solo evita una pantalla vacía sin explicación.
 */
export default function ModuloNoIncluido({ titulo, descripcion, planNecesario = 'completo' }) {
  const { user, plan } = useAuth();

  const abrirWhatsApp = () => {
    const msg = `Hola, tengo VetaApp en el plan ${NOMBRE_PLAN[plan] || plan} (${user?.email || ''}) `
      + `y quiero pasarme al plan ${NOMBRE_PLAN[planNecesario]} para usar ${titulo}.`;
    window.open(linkWhatsApp(msg), '_blank', 'noopener');
  };

  return (
    <Page>
      <div style={{
        maxWidth: 460, margin: '48px auto 0', textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', padding: '32px 28px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18, margin: '0 auto 18px',
          background: 'var(--verde-50)', border: '1px solid var(--verde-200)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--verde-700)',
        }}>
          <IconLock size={26} stroke={1.6} />
        </div>

        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {titulo} viene con el plan {NOMBRE_PLAN[planNecesario]}
        </h1>

        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {descripcion}
        </p>

        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
          Tu plan actual: <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{NOMBRE_PLAN[plan] || plan}</span>
        </p>

        <Button
          variant="wa"
          size="lg"
          icon={<IconWhatsApp size={17} />}
          onClick={abrirWhatsApp}
          disabled={!SOPORTE}
          title={SOPORTE ? undefined : 'Falta configurar VITE_SOPORTE_WHATSAPP'}
          style={{ width: '100%', marginTop: 24 }}
        >
          <span style={{ marginLeft: 8 }}>Quiero cambiar de plan</span>
        </Button>
      </div>
    </Page>
  );
}
