import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { IconCash } from './icons';

// Cuántos días antes empieza a avisarse que la suscripción paga se acaba.
// Suficiente para alcanzar a pagar sin que la barra se vuelva parte del
// paisaje y deje de leerse.
const DIAS_AVISO = 7;

/**
 * La cuenta atrás, arriba de todo.
 *
 * Nadie debería quedarse bloqueado de sorpresa. El día que se vence, la
 * cuenta deja de abrir (esta_activo() en 005_prueba.sql y 007_pagos.sql) y
 * la app muestra la pantalla de bloqueo — así que el aviso tiene que estar
 * a la vista desde antes.
 *
 * Cubre los dos vencimientos, que antes no era así: la prueba de 14 días y
 * la suscripción paga. Faltaba el segundo, y era el peor de los dos: a la
 * veterinaria que ya pagó una vez se le acababa el plan sin ningún aviso.
 *
 * El botón lleva a Ajustes → Plan y pagos, que es donde se puede renovar
 * sin tener que esperar a quedar bloqueada.
 */
export default function AvisoPrueba() {
  const navigate = useNavigate();
  const { enPrueba, diasPrueba, diasSuscripcion, perfil } = useAuth();

  const avisoPrueba = enPrueba && diasPrueba !== null && diasPrueba > 0;
  const avisoPago =
    !enPrueba &&
    perfil?.estado_suscripcion === 'activo' &&
    diasSuscripcion !== null &&
    diasSuscripcion > 0 &&
    diasSuscripcion <= DIAS_AVISO;

  if (!avisoPrueba && !avisoPago) return null;

  const dias = avisoPrueba ? diasPrueba : diasSuscripcion;
  const urgente = dias <= 3;

  const titulo = avisoPrueba
    ? (dias === 1 ? 'Último día de prueba' : `Te quedan ${dias} días de prueba`)
    : (dias === 1 ? 'Tu plan vence mañana' : `Tu plan vence en ${dias} días`);

  const detalle = avisoPrueba
    ? 'Después de eso la cuenta se bloquea, pero tu información queda guardada.'
    : 'Renueva antes y no pierdes nada: los meses se suman a los días que te quedan.';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 20px', fontSize: 12.5,
      borderBottom: '1px solid var(--border)',
      background: urgente ? 'var(--danger-soft, #FEF2F2)' : 'var(--verde-50)',
      color: urgente ? 'var(--danger, #B91C1C)' : 'var(--verde-700)',
    }}>
      <span style={{ fontWeight: 600 }}>{titulo}</span>
      <span style={{ opacity: 0.85 }}>{detalle}</span>
      <button
        onClick={() => navigate('/app/configuracion?tab=plan')}
        style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', fontSize: 12, fontWeight: 600,
          border: '1px solid currentColor', borderRadius: 'var(--r-md)',
          background: 'transparent', color: 'inherit', cursor: 'pointer',
        }}
      >
        <IconCash size={13} />
        {avisoPrueba ? 'Activar mi plan' : 'Renovar ahora'}
      </button>
    </div>
  );
}
