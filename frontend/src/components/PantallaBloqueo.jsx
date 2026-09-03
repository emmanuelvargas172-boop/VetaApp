import { useCallback, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import SelectorPlanes from './SelectorPlanes';
import { Button } from './ui';
import { IconLock, IconWhatsApp, IconLogout, VetaAppLogo } from './icons';
import { WHATSAPP, linkWhatsApp } from '../config/marca';
import { PASARELA_ACTIVA } from '../lib/pagos';

const SOPORTE = WHATSAPP;

/**
 * Lo que ve una veterinaria bloqueada: suspendida a mano (inactivo), con la
 * prueba de 14 días vencida, o con la suscripción paga ya expirada. Los datos
 * no se borran en ninguno de los tres casos, solo dejan de ser accesibles
 * (RLS, ver 005_prueba.sql y 007_pagos.sql).
 *
 * Es también la caja registradora: aquí se elige el plan. Mientras
 * PASARELA_ACTIVA sea false la compra sale por WhatsApp y la activa el admin
 * a mano; cuando se prenda, el mismo selector saldrá al checkout. Ningún
 * monto se calcula acá — el precio viene de planes_precios solo para
 * mostrarlo, y quien lo firma es la Edge Function pago-iniciar. Cambiar el
 * número con F12 no cambia lo que se cobra.
 */
export default function PantallaBloqueo() {
  const { user, perfil, signOut, pruebaVencida, suscripcionVencida } = useAuth();

  // Solo para saber si hubo planes que ofrecer: cambia el texto del botón de
  // WhatsApp (respaldo vs. única salida). El pago lo maneja SelectorPlanes.
  const [hayPlanes, setHayPlanes] = useState(false);
  // useCallback porque SelectorPlanes la tiene en las dependencias de su
  // efecto: una función nueva en cada render volvería a pedir los planes sin
  // parar.
  const alCargarPlanes = useCallback((lista) => setHayPlanes(lista.length > 0), []);

  const abrirWhatsApp = () => {
    const msg = pruebaVencida
      ? `Hola, se me acabaron los 14 días de prueba de VetaApp (${user?.email || ''}). Quiero activar mi plan.`
      : `Hola, mi cuenta de VetaApp (${user?.email || ''}) está suspendida. Quiero reactivarla.`;
    window.open(linkWhatsApp(msg), '_blank', 'noopener');
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
  const ofrecerPago = pruebaVencida || suscripcionVencida;

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

          {ofrecerPago && (
            <div style={{ marginTop: 22, textAlign: 'left' }}>
              <SelectorPlanes
                planActual={perfil?.plan}
                permitirMeses
                textoBoton="Pagar y desbloquear"
                onPlanesCargados={alCargarPlanes}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
            {/* Sin pasarela, el botón del selector YA es de WhatsApp: repetirlo
                aquí dejaría dos botones verdes iguales y la veterinaria tendría
                que adivinar cuál es cuál. Solo se muestra cuando el selector
                lleva al checkout (respaldo) o cuando no hubo planes que
                ofrecer (única salida). */}
            {(!hayPlanes || PASARELA_ACTIVA) && (
              <Button
                variant={hayPlanes ? 'secondary' : 'wa'}
                size="lg"
                icon={<IconWhatsApp size={17} />}
                onClick={abrirWhatsApp}
                disabled={!SOPORTE}
                title={SOPORTE ? undefined : 'Falta configurar VITE_SOPORTE_WHATSAPP'}
                style={{ width: '100%' }}
              >
                <span style={{ marginLeft: 8 }}>
                  {hayPlanes ? 'Prefiero escribirles' : 'Contactar por WhatsApp'}
                </span>
              </Button>
            )}

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
