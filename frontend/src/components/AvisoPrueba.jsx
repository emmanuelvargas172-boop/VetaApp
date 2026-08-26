import { useAuth } from '../lib/AuthContext';
import { IconWhatsApp } from './icons';

const SOPORTE = (import.meta.env.VITE_SOPORTE_WHATSAPP || '').replace(/\D/g, '');

/**
 * Barra de la prueba gratis. Nadie debería quedarse bloqueado de sorpresa:
 * el día 15 la cuenta deja de abrir (esta_activo() en 005_prueba.sql), así
 * que la cuenta atrás tiene que estar a la vista desde antes.
 */
export default function AvisoPrueba() {
  const { enPrueba, diasPrueba, user } = useAuth();

  if (!enPrueba || diasPrueba === null || diasPrueba <= 0) return null;

  const urgente = diasPrueba <= 3;

  const abrirWhatsApp = () => {
    const msg = `Hola, estoy en la prueba de VetaApp (${user?.email || ''}) y quiero activar mi plan.`;
    window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 20px', fontSize: 12.5,
      borderBottom: '1px solid var(--border)',
      background: urgente ? 'var(--danger-soft, #FEF2F2)' : 'var(--verde-50)',
      color: urgente ? 'var(--danger, #B91C1C)' : 'var(--verde-700)',
    }}>
      <span style={{ fontWeight: 600 }}>
        {diasPrueba === 1 ? 'Último día de prueba' : `Te quedan ${diasPrueba} días de prueba`}
      </span>
      <span style={{ opacity: 0.85 }}>
        Después de eso la cuenta se bloquea, pero tu información queda guardada.
      </span>
      <button
        onClick={abrirWhatsApp}
        disabled={!SOPORTE}
        style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', fontSize: 12, fontWeight: 600,
          border: '1px solid currentColor', borderRadius: 'var(--r-md)',
          background: 'transparent', color: 'inherit', cursor: 'pointer',
        }}
      >
        <IconWhatsApp size={13} />
        Activar mi plan
      </button>
    </div>
  );
}
