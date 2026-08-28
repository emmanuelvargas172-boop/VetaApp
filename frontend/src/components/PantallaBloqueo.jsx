import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { planesALaVenta, iniciarPago, enPesos } from '../lib/pagos';
import { Button } from './ui';
import { IconLock, IconWhatsApp, IconLogout, IconCash, VetaAppLogo } from './icons';

// Número de soporte en formato internacional, solo dígitos (VITE_SOPORTE_WHATSAPP).
const SOPORTE = (import.meta.env.VITE_SOPORTE_WHATSAPP || '').replace(/\D/g, '');

/**
 * Lo que ve una veterinaria bloqueada: suspendida a mano (inactivo), con la
 * prueba de 14 días vencida, o con la suscripción paga ya expirada. Los datos
 * no se borran en ninguno de los tres casos, solo dejan de ser accesibles
 * (RLS, ver 005_prueba.sql y 007_pagos.sql).
 *
 * Es también la caja registradora: aquí se elige el plan y se sale al
 * checkout. Ningún monto se calcula acá — el precio viene de planes_precios
 * solo para mostrarlo, y quien lo firma es la Edge Function pago-iniciar.
 * Cambiar el número con F12 no cambia lo que se cobra.
 */
export default function PantallaBloqueo() {
  const { user, perfil, signOut, pruebaVencida, suscripcionVencida } = useAuth();

  const [planes, setPlanes] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [cargandoPlanes, setCargandoPlanes] = useState(true);
  const [yendo, setYendo] = useState(false);
  const [errorPago, setErrorPago] = useState('');

  useEffect(() => {
    let vivo = true;
    planesALaVenta()
      .then((lista) => {
        if (!vivo) return;
        setPlanes(lista);
        // Se preselecciona el plan que ya tenía: renovar es el caso normal.
        const suyo = lista.find((p) => p.plan === perfil?.plan);
        setElegido((suyo ?? lista.find((p) => p.plan === 'completo') ?? lista[0])?.plan ?? null);
      })
      .catch(() => { /* sin lista solo queda WhatsApp; no es un error que mostrar */ })
      .finally(() => { if (vivo) setCargandoPlanes(false); });
    return () => { vivo = false; };
  }, [perfil?.plan]);

  const pagar = async () => {
    if (!elegido) return;
    setYendo(true);
    setErrorPago('');
    try {
      const { url } = await iniciarPago(elegido, 1);
      // Misma pestaña a propósito: window.open lo comería el bloqueador de
      // popups en algunos navegadores y el pago moriría sin explicación.
      window.location.href = url;
    } catch (e) {
      setErrorPago(e.message);
      setYendo(false);
    }
  };

  const abrirWhatsApp = () => {
    const msg = pruebaVencida
      ? `Hola, se me acabaron los 14 días de prueba de VetaApp (${user?.email || ''}). Quiero activar mi plan.`
      : `Hola, mi cuenta de VetaApp (${user?.email || ''}) está suspendida. Quiero reactivarla.`;
    window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const titulo = pruebaVencida
    ? 'Se acabaron tus 14 días de prueba'
    : suscripcionVencida
      ? 'Se venció tu plan'
      : 'Tu acceso está suspendido';

  const texto = pruebaVencida
    ? 'Elige tu plan y sigue trabajando con toda la información que ya cargaste.'
    : suscripcionVencida
      ? 'Renueva para volver a entrar. Nada se borró: tus mascotas, historias y citas siguen ahí.'
      : 'Por favor comunícate con nosotros para reactivar tu cuenta.';

  // El selector solo aparece cuando comprar tiene sentido. A una cuenta
  // suspendida a mano (inactivo) la desbloquea el admin, no un pago.
  const puedeComprar = (pruebaVencida || suscripcionVencida) && planes.length > 0;

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
            {titulo}
          </h1>

          <p style={{
            margin: '10px 0 0', fontSize: 14, lineHeight: 1.55,
            color: 'var(--text-muted)',
          }}>
            {texto}
          </p>

          {user?.email && (
            <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--text-faint)' }}>
              Sesión: <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{user.email}</span>
            </p>
          )}

          {puedeComprar && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22, textAlign: 'left' }}>
              {planes.map((p) => {
                const activo = p.plan === elegido;
                return (
                  <button
                    key={p.plan}
                    type="button"
                    onClick={() => setElegido(p.plan)}
                    disabled={yendo}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '13px 15px', borderRadius: 'var(--r-lg)',
                      border: `1.5px solid ${activo ? 'var(--verde-500)' : 'var(--border)'}`,
                      background: activo ? 'var(--verde-50)' : 'var(--surface)',
                      cursor: yendo ? 'default' : 'pointer', textAlign: 'left',
                      font: 'inherit', color: 'var(--text)', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: activo ? 700 : 500 }}>
                      {p.nombre_visible}
                    </span>
                    <span style={{
                      fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                      color: activo ? 'var(--verde-700)' : 'var(--text-muted)',
                    }}>
                      {enPesos(p.precio_centavos)}<span style={{ fontWeight: 500, fontSize: 12 }}> /mes</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {errorPago && (
            <p style={{
              margin: '14px 0 0', padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5,
              background: 'var(--danger-soft)', border: '1px solid var(--danger-ring)',
              borderRadius: 'var(--r-md)', color: 'var(--danger)', textAlign: 'left',
            }}>
              {errorPago}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
            {puedeComprar && (
              <Button
                variant="primary"
                size="lg"
                icon={<IconCash size={17} />}
                onClick={pagar}
                disabled={yendo || cargandoPlanes || !elegido}
                style={{ width: '100%' }}
              >
                <span style={{ marginLeft: 8 }}>
                  {yendo ? 'Abriendo el pago…' : 'Pagar un mes'}
                </span>
              </Button>
            )}

            <Button
              variant={puedeComprar ? 'secondary' : 'wa'}
              size="lg"
              icon={<IconWhatsApp size={17} />}
              onClick={abrirWhatsApp}
              disabled={!SOPORTE}
              title={SOPORTE ? undefined : 'Falta configurar VITE_SOPORTE_WHATSAPP'}
              style={{ width: '100%' }}
            >
              <span style={{ marginLeft: 8 }}>
                {puedeComprar ? 'Prefiero escribirles' : 'Contactar por WhatsApp'}
              </span>
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
