const PHONE_KEY = 'vetaapp_admin_phone';

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

export const msgResumenDia = ({ citas, vacunas }) =>
  `📊 Resumen VetaApp: ${citas} cita${citas !== 1 ? 's' : ''} hoy, ${vacunas} vacuna${vacunas !== 1 ? 's' : ''} próximas`;
