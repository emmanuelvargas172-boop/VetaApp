import { useEffect, useState } from 'react';
import { planesALaVenta, iniciarPago, enPesos, PASARELA_ACTIVA } from '../lib/pagos';
import { useAuth } from '../lib/AuthContext';
import { WHATSAPP, linkWhatsApp } from '../config/marca';
import { Button } from './ui';
import { IconCash, IconWhatsApp } from './icons';

const OPCIONES_MESES = [1, 3, 6, 12];

/**
 * Elegir plan, elegir meses, salir al checkout.
 *
 * Vive aparte porque el mismo camino de plata se usa en dos momentos muy
 * distintos: la veterinaria bloqueada que ya no tiene más remedio, y la que
 * renueva tranquila desde Ajustes antes de vencerse. Copiado en las dos
 * pantallas, cualquier arreglo tendría que acordarse de las dos.
 *
 * Ningún monto se calcula aquí. El precio sale de planes_precios solo para
 * mostrarse, y el total en pantalla es una CUENTA VISUAL: quien decide lo
 * que se cobra es abrir_pago() en la base (precio × meses) y quien lo firma
 * es la Edge Function. Cambiar el número con F12 no cambia el cobro.
 *
 * Con PASARELA_ACTIVA en false el mismo componente sigue mostrando planes y
 * precios —esa parte es cierta, sale de la base— pero el botón lleva a
 * WhatsApp en vez de al checkout. Se elige el plan igual; lo único que
 * cambia es quién ejecuta el cobro.
 */
export default function SelectorPlanes({
  planActual,
  permitirMeses = false,
  textoBoton = 'Pagar',
  onPlanesCargados,
}) {
  const { user } = useAuth();
  const [planes, setPlanes] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [meses, setMeses] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    planesALaVenta()
      .then((lista) => {
        if (!vivo) return;
        setPlanes(lista);
        // Se preselecciona el plan que ya tiene: renovar es el caso normal.
        const suyo = lista.find((p) => p.plan === planActual);
        setElegido((suyo ?? lista.find((p) => p.plan === 'completo') ?? lista[0])?.plan ?? null);
        onPlanesCargados?.(lista);
      })
      .catch(() => { /* sin lista no se ofrece comprar; el respaldo es WhatsApp */ })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [planActual, onPlanesCargados]);

  const plan = planes.find((p) => p.plan === elegido);
  const total = plan ? Number(plan.precio_centavos) * meses : 0;

  const pagar = async () => {
    if (!elegido) return;
    setYendo(true);
    setError('');
    try {
      const { url } = await iniciarPago(elegido, meses);
      // Misma pestaña a propósito: window.open lo comería el bloqueador de
      // popups en algunos navegadores y el pago moriría sin explicación.
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setYendo(false);
    }
  };

  /**
   * El camino de hoy: la veterinaria elige plan y meses acá, y lo que sale
   * por WhatsApp ya trae todo lo que hace falta para activarla a mano
   * (correo de la cuenta, plan, meses, total). Sin el correo habría que
   * preguntárselo, y cada pregunta de más es una venta que se enfría.
   */
  const pedirPorWhatsApp = () => {
    if (!plan) return;
    const lineas = [
      'Hola, quiero activar mi plan de VetaApp.',
      `Plan: ${plan.nombre_visible}`,
      permitirMeses ? `Meses: ${meses}` : null,
      `Total: ${enPesos(total)}`,
      `Cuenta: ${user?.email || '(sin sesión iniciada)'}`,
    ].filter(Boolean);
    window.open(linkWhatsApp(lineas.join('\n')), '_blank', 'noopener');
  };

  if (cargando) {
    return <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-faint)' }}>Cargando planes…</p>;
  }
  if (planes.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                {p.plan === planActual && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>
                    tu plan
                  </span>
                )}
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

      {permitirMeses && (
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            ¿Cuántos meses?
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {OPCIONES_MESES.map((n) => {
              const activo = n === meses;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMeses(n)}
                  disabled={yendo}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--r-full)',
                    border: `1px solid ${activo ? 'var(--verde-600)' : 'var(--border-strong)'}`,
                    background: activo ? 'var(--verde-600)' : 'var(--surface)',
                    color: activo ? '#fff' : 'var(--text-muted)',
                    fontSize: 12.5, fontWeight: 600, cursor: yendo ? 'default' : 'pointer',
                  }}
                >
                  {n === 1 ? '1 mes' : `${n} meses`}
                </button>
              );
            })}
          </div>
          {/* Sin descuento por volumen: el precio es lineal (precio × meses en
              abrir_pago). Se dice el total para que nadie espere una rebaja
              que la base no aplica. */}
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Total a pagar:{' '}
            <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {enPesos(total)}
            </strong>
          </p>
        </div>
      )}

      {error && (
        <p style={{
          margin: 0, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5,
          background: 'var(--danger-soft)', border: '1px solid var(--danger-ring)',
          borderRadius: 'var(--r-md)', color: 'var(--danger)',
        }}>
          {error}
        </p>
      )}

      {/* Sin pasarela se ignora `textoBoton` a propósito: las dos pantallas
          que lo pasan dicen "Pagar y desbloquear" / "Pagar y renovar", y
          apretar algo que dice pagar para terminar en un chat es la clase de
          sorpresa que hace desconfiar del resto. */}
      {PASARELA_ACTIVA ? (
        <Button
          variant="primary"
          size="lg"
          icon={<IconCash size={17} />}
          onClick={pagar}
          disabled={yendo || !elegido}
          style={{ width: '100%' }}
        >
          <span style={{ marginLeft: 8 }}>{yendo ? 'Abriendo el pago…' : textoBoton}</span>
        </Button>
      ) : (
        <div>
          <Button
            variant="wa"
            size="lg"
            icon={<IconWhatsApp size={17} />}
            onClick={pedirPorWhatsApp}
            disabled={!elegido || !WHATSAPP}
            title={WHATSAPP ? undefined : 'Falta configurar VITE_SOPORTE_WHATSAPP'}
            style={{ width: '100%' }}
          >
            <span style={{ marginLeft: 8 }}>Activar por WhatsApp</span>
          </Button>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-faint)', textAlign: 'center' }}>
            Todavía no tenemos pago en línea. Te escribimos, coordinamos el
            pago y te activamos el plan el mismo día.
          </p>
        </div>
      )}
    </div>
  );
}
