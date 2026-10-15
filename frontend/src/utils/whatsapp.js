const PHONE_KEY = 'vetaapp_admin_phone';

// wa.me exige el número con indicativo y sin signos. Los teléfonos se
// escriben a mano en la ficha del dueño, así que llegan de todas las
// formas: "310 555 1234", "+57 310...", "0057310...", "(1) 234 5678".
// Antes se pegaba "57" al frente siempre y los que ya lo traían quedaban
// como 5757310... → enlace roto sin aviso.
// Devuelve null cuando no hay con qué armar un número válido.
export function normalizarTelefonoCO(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0057')) d = d.slice(4);      // marcación internacional vieja
  else if (d.startsWith('057')) d = d.slice(1);
  if (d.length === 10 && d.startsWith('3')) return `57${d}`;   // celular
  if (d.length === 12 && d.startsWith('57')) return d;         // ya trae indicativo
  if (d.length === 8 || d.length === 7) return null;           // fijo sin indicativo: WhatsApp no aplica
  // Fuera de Colombia (u otro largo): se respeta tal cual si es plausible.
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export const getAdminPhone = () => localStorage.getItem(PHONE_KEY) || '';
export const saveAdminPhone = (phone) => localStorage.setItem(PHONE_KEY, phone.replace(/\D/g, ''));

export const openAdminWhatsApp = (message) => {
  const phone = getAdminPhone();
  if (!phone) {
    alert('⚠️ Configura el número de WhatsApp del administrador en Ajustes (ícono ⚙️ en el sidebar).');
    return;
  }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
};

export const msgNuevaCita = ({ mascota, dueno, fecha, hora }) =>
  `📅 Nueva cita: ${mascota} de ${dueno} para el ${fecha} a las ${hora}`;

export const msgVacunaUrgente = ({ mascota, dueno, dias }) =>
  `💉 Vacuna urgente: ${mascota} de ${dueno} vence en ${dias} día${dias !== 1 ? 's' : ''}`;

// Mensaje que recibe el dueño de la mascota. Se guarda tal cual en la
// tabla `avisos` para que quede constancia de qué se dijo, no solo de que
// se escribió a alguien.
export const msgRecordatorioVacuna = (item) => {
  const fecha = new Date(item.proxima_dosis + 'T12:00:00')
    .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Hola ${item.dueno_nombre}, le recordamos que ${item.mascota_nombre} tiene pendiente su vacuna de ${item.nombre} el ${fecha}. Por favor comuníquese con nosotros para agendar su cita. 🐾`;
};

// Mensaje que recibe el dueño para recordarle la cita. Vive acá y no suelto
// en la página de Citas porque es el mismo caso que la vacuna: texto que sale
// a nombre de la clínica y que, si algún día cambia, tiene que cambiar en un
// solo lugar.
//
// La fecha se escribe con día y mes en letras: "15 de octubre" no se confunde
// con nada, mientras que 15/10 y 10/15 sí. El mediodía en el `new Date` evita
// que la zona horaria corra la fecha un día para atrás.
export const msgRecordatorioCita = (cita) => {
  // Sin fecha se omite en vez de escribir "Invalid Date". La columna está en
  // NOT NULL, así que no debería pasar, pero este texto sale a un cliente de
  // la clínica y no es donde se quiere averiguar que la hipótesis era falsa.
  const d = cita.fecha ? new Date(cita.fecha + 'T12:00:00') : null;
  const fecha = d && !isNaN(d)
    ? ` el ${d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : '';
  const hora = cita.hora ? ` a las ${cita.hora}` : '';
  const motivo = cita.motivo ? ` para ${cita.motivo.toLowerCase()}` : '';
  return `Hola ${cita.dueno_nombre}, le recordamos la cita de ${cita.mascota_nombre}${motivo}${fecha}${hora}. 🐾`;
};

// null si el teléfono no sirve, para que la UI pueda deshabilitar el botón
// en vez de abrir una pestaña con un error de WhatsApp.
export const linkWhatsApp = (telefono, mensaje) => {
  const tel = normalizarTelefonoCO(telefono);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : null;
};

export const msgResumenDia = ({ citas, vacunas }) =>
  `📊 Resumen VetaApp: ${citas} cita${citas !== 1 ? 's' : ''} hoy, ${vacunas} vacuna${vacunas !== 1 ? 's' : ''} próximas`;
