import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ultimoPago, enPesos } from '../lib/pagos';
import { Button } from '../components/ui';
import {
  IconCheckCircle, IconAlert, IconClock, IconWhatsApp, IconArrowRight, VetaAppLogo,
} from '../components/icons';

const SOPORTE = (import.meta.env.VITE_SOPORTE_WHATSAPP || '').replace(/\D/g, '');

// Cada cuánto y cuántas veces se pregunta si el pago ya quedó.
// 3s × 20 = un minuto. Wompi suele mandar el webhook en segundos, pero
// PSE puede demorarse más; por eso al agotarse no se dice "falló" sino
// "se está confirmando".
const CADA_MS = 3000;
const INTENTOS = 20;

/**
 * A dónde vuelve la veterinaria después de pagar en Wompi.
 *
 * ============ LO IMPORTANTE DE ESTA PÁGINA ============
 * Llegar aquí NO significa que se pagó.
 *
 * Esta URL es una navegación del navegador: cualquiera la puede escribir
 * a mano, y Wompi también redirige aquí cuando la tarjeta fue rechazada.
 * Si activáramos la cuenta al aterrizar, cualquiera se activaría el plan
 * escribiendo /app/pago en la barra de direcciones.
 *
 * Quien activa es el webhook (pago-webhook), que llega por detrás con
 * firma verificada. Esta página solo MIRA la tabla `pagos` esperando a
 * que ese webhook aterrice, y muestra lo que diga la base de datos.
 * ======================================================
 */
export default function Pago() {
  const navigate = useNavigate();
  const { recargarPerfil } = useAuth();

  const [estado, setEstado] = useState('esperando'); // esperando|ok|rechazado|demorado|error
  const [pago, setPago] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const intentos = useRef(0);

  useEffect(() => {
    let vivo = true;
    let timer;

    const preguntar = async () => {
      try {
        const fila = await ultimoPago();
        if (!vivo) return;
        if (fila) setPago(fila);

        if (fila?.estado === 'APPROVED') {
          // El perfil cambió en la base (plan y suscripcion_hasta): hay
          // que releerlo o la app seguiría creyendo que está bloqueada.
          await recargarPerfil();
          if (vivo) setEstado('ok');
          return;
        }

        if (fila && ['DECLINED', 'VOIDED', 'ERROR'].includes(fila.estado)) {
          if (vivo) setEstado('rechazado');
          return;
        }

        intentos.current += 1;
        if (intentos.current >= INTENTOS) {
          if (vivo) setEstado('demorado');
          return;
        }
        timer = setTimeout(preguntar, CADA_MS);
      } catch (e) {
        if (!vivo) return;
        setMensaje(e.message);
        setEstado('error');
      }
    };

    preguntar();
    return () => { vivo = false; clearTimeout(timer); };
  }, [recargarPerfil]);

  const escribirSoporte = () => {
    const texto = `Hola, hice un pago en VetaApp (referencia ${pago?.referencia || 'sin referencia'}) y quiero confirmar que quedó registrado.`;
    window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  const vistas = {
    esperando: {
      color: 'var(--verde-700)', fondo: 'var(--verde-50)', borde: 'var(--verde-200)',
      icono: <Girando />,
      titulo: 'Confirmando tu pago',
      texto: 'Estamos esperando la confirmación del banco. No cierres esta página; suele tardar unos segundos.',
    },
    ok: {
      color: 'var(--verde-700)', fondo: 'var(--verde-50)', borde: 'var(--verde-200)',
      icono: <IconCheckCircle size={28} stroke={1.6} />,
      titulo: '¡Listo! Tu plan quedó activo',
      texto: 'Ya puedes seguir trabajando con toda tu información.',
    },
    rechazado: {
      color: 'var(--danger)', fondo: 'var(--danger-soft)', borde: 'var(--danger-ring)',
      icono: <IconAlert size={28} stroke={1.6} />,
      titulo: 'El pago no se completó',
      texto: 'El banco no aprobó la transacción. No se te cobró nada; puedes intentarlo de nuevo con otro medio de pago.',
    },
    demorado: {
      color: 'var(--text-muted)', fondo: 'var(--stone-100)', borde: 'var(--border-strong)',
      icono: <IconClock size={28} stroke={1.6} />,
      titulo: 'Tu pago se está confirmando',
      texto: 'Algunos medios (como PSE) demoran más. Apenas el banco confirme, tu plan se activa solo. Si en un rato sigue igual, escríbenos.',
    },
    error: {
      color: 'var(--danger)', fondo: 'var(--danger-soft)', borde: 'var(--danger-ring)',
      icono: <IconAlert size={28} stroke={1.6} />,
      titulo: 'No pudimos consultar tu pago',
      texto: mensaje || 'Vuelve a intentarlo en un momento.',
    },
  };

  const v = vistas[estado];

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
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
            background: v.fondo, border: `1px solid ${v.borde}`, color: v.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {v.icono}
          </div>

          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            color: 'var(--text)', letterSpacing: '-0.02em',
          }}>
            {v.titulo}
          </h1>

          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {v.texto}
          </p>

          {pago && (
            <p style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
              {enPesos(pago.monto_centavos)} · plan {pago.plan} · {pago.meses}{' '}
              {pago.meses === 1 ? 'mes' : 'meses'}
              <br />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pago.referencia}</span>
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
            {estado === 'ok' && (
              <Button
                variant="primary" size="lg" style={{ width: '100%' }}
                iconRight={<IconArrowRight size={16} />}
                onClick={() => navigate('/app', { replace: true })}
              >
                <span style={{ marginRight: 8 }}>Entrar a VetaApp</span>
              </Button>
            )}

            {(estado === 'rechazado' || estado === 'error') && (
              <Button
                variant="primary" size="lg" style={{ width: '100%' }}
                onClick={() => navigate('/app', { replace: true })}
              >
                Volver a intentar
              </Button>
            )}

            {(estado === 'demorado' || estado === 'rechazado' || estado === 'error') && SOPORTE && (
              <Button
                variant="wa" size="lg" style={{ width: '100%' }}
                icon={<IconWhatsApp size={17} />}
                onClick={escribirSoporte}
              >
                <span style={{ marginLeft: 8 }}>Escribirnos por WhatsApp</span>
              </Button>
            )}
          </div>
        </div>

        {estado === 'esperando' && (
          <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
            Tu plan se activa cuando el banco confirma, no cuando vuelves a esta página.
          </p>
        )}
      </div>
    </div>
  );
}

function Girando() {
  return (
    <>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        border: '3px solid var(--verde-100)', borderTopColor: 'var(--verde-500)',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
