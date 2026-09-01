import { Link } from 'react-router-dom';
import { VetaAppLogo } from '../components/icons';
import { EMAIL_CONTACTO, WHATSAPP_VISIBLE } from '../config/marca';

// Un contrato que da un correo al que nadie contesta no sirve de nada, y
// aquí es donde se ejercen los derechos de la Ley 1581. Por eso sale del
// mismo sitio que el resto del contacto y no de una copia escrita a mano.
const CORREO = EMAIL_CONTACTO;
const WHATSAPP = WHATSAPP_VISIBLE;
const ACTUALIZADO = '20 de agosto de 2026';

/* ------------------------------------------------------------------ */
/* Piezas de texto                                                     */
/* ------------------------------------------------------------------ */

function H({ children }) {
  return <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-2">{children}</h2>;
}

function P({ children }) {
  return <p className="text-gray-700 leading-relaxed mb-3">{children}</p>;
}

function Lista({ items }) {
  return (
    <ul className="list-disc pl-6 mb-3 space-y-1 text-gray-700 leading-relaxed">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Contenidos                                                          */
/* ------------------------------------------------------------------ */

function Privacidad() {
  return (
    <>
      <P>
        Esta política explica qué datos personales trata VetaApp, con qué finalidad y qué derechos
        tienes sobre ellos. Está redactada conforme a la Ley 1581 de 2012 y el Decreto 1074 de 2015
        de la República de Colombia.
      </P>

      <H>1. Quién es responsable</H>
      <P>
        VetaApp es un software de gestión para clínicas veterinarias, operado por Emmanuel Vargas
        desde Colombia. Puedes contactarnos en <a className="text-emerald-700 underline" href={`mailto:${CORREO}`}>{CORREO}</a> o
        por WhatsApp al {WHATSAPP}.
      </P>

      <H>2. Dos roles distintos</H>
      <P>
        Es importante distinguir de quién son los datos:
      </P>
      <Lista items={[
        'Datos de la clínica y de sus usuarios (nombre, correo, teléfono, plan contratado): VetaApp actúa como responsable del tratamiento.',
        'Datos de las mascotas y de sus dueños que la clínica carga en el sistema: la clínica es la responsable y VetaApp actúa únicamente como encargado. VetaApp no usa esos datos para fines propios ni los comercializa.',
      ]} />

      <H>3. Qué datos tratamos</H>
      <Lista items={[
        'De la cuenta: nombre, correo electrónico y, si inicias sesión con Google, tu nombre y foto de perfil de Google. No accedemos a tu correo de Gmail ni a ningún otro dato de tu cuenta de Google.',
        'De la operación de la clínica: mascotas, dueños, historias clínicas, citas, recordatorios, inventario y movimientos de caja que la clínica registre.',
        'Técnicos: registros de acceso y errores necesarios para operar y asegurar el servicio.',
      ]} />
      <P>
        No solicitamos ni almacenamos datos de tarjetas de crédito. Los pagos se acuerdan por fuera
        de la plataforma.
      </P>

      <H>4. Para qué los usamos</H>
      <Lista items={[
        'Prestar el servicio: autenticar tu acceso y guardar la información de tu clínica.',
        'Enviar recordatorios a los dueños de mascotas cuando la clínica lo solicita expresamente.',
        'Facturar y controlar el estado de la suscripción.',
        'Dar soporte técnico y comunicar cambios relevantes del servicio.',
        'Cumplir obligaciones legales.',
      ]} />

      <H>5. Con quién los compartimos</H>
      <P>
        No vendemos ni cedemos datos personales. Nos apoyamos en proveedores de infraestructura que
        los tratan por cuenta nuestra:
      </P>
      <Lista items={[
        'Supabase: base de datos y autenticación.',
        'Cloudflare: alojamiento y entrega de la aplicación.',
        'Google: inicio de sesión, únicamente si eliges esa opción.',
      ]} />
      <P>
        Estos proveedores operan servidores fuera de Colombia, por lo que existe transferencia
        internacional de datos. Al usar VetaApp autorizas dicha transferencia.
      </P>

      <H>6. Seguridad</H>
      <P>
        El acceso a los datos está restringido a nivel de base de datos mediante políticas por
        clínica: una clínica no puede leer ni modificar la información de otra, aunque lo intente
        por fuera de la interfaz. Las conexiones viajan cifradas mediante HTTPS. Ningún sistema es
        infalible, pero aplicamos medidas razonables acordes al riesgo.
      </P>

      <H>7. Tus derechos</H>
      <P>Como titular de datos personales puedes:</P>
      <Lista items={[
        'Conocer, actualizar y rectificar tus datos.',
        'Solicitar prueba de la autorización otorgada.',
        'Ser informado sobre el uso que se les ha dado.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio.',
        'Revocar la autorización o solicitar la supresión de tus datos, cuando no exista un deber legal o contractual que lo impida.',
      ]} />
      <P>
        Para ejercerlos escribe a <a className="text-emerald-700 underline" href={`mailto:${CORREO}`}>{CORREO}</a>.
        Respondemos en los plazos que fija la ley: quince días hábiles para consultas y quince días
        hábiles para reclamos, prorrogables.
      </P>
      <P>
        Si eres dueño de una mascota y tus datos están en VetaApp, quien los cargó fue tu clínica
        veterinaria. Dirígete a ella en primer lugar; si no obtienes respuesta, escríbenos y
        trasladamos la solicitud.
      </P>

      <H>8. Cuánto tiempo los conservamos</H>
      <P>
        Mientras la cuenta esté activa y durante el tiempo adicional que exija la ley. Antes de
        cancelar puedes descargar toda la información de tu clínica desde{' '}
        <span className="font-medium">Configuración → Datos y backups</span>; después de cancelar
        puedes pedirnos la exportación o la eliminación escribiendo a{' '}
        <a className="text-emerald-700 underline" href={`mailto:${CORREO}`}>{CORREO}</a>.
      </P>

      <H>9. Menores de edad</H>
      <P>VetaApp está dirigido a profesionales. No recolectamos datos de menores de edad de forma consciente.</P>

      <H>10. Cambios</H>
      <P>
        Si modificamos esta política publicaremos la nueva versión en esta misma dirección y
        actualizaremos la fecha. Los cambios sustanciales se avisarán por correo.
      </P>
    </>
  );
}

function Terminos() {
  return (
    <>
      <P>
        Estos términos regulan el uso de VetaApp. Al crear una cuenta aceptas lo aquí descrito. Si
        no estás de acuerdo, no uses el servicio.
      </P>

      <H>1. Qué es VetaApp</H>
      <P>
        Un software en la nube para que clínicas veterinarias gestionen citas, mascotas, historias
        clínicas, recordatorios, inventario y caja. Se contrata por suscripción mensual.
      </P>

      <H>2. Tu cuenta</H>
      <Lista items={[
        'Debes ser mayor de edad y dar información veraz al registrarte.',
        'Eres responsable de tus credenciales y de todo lo que ocurra bajo tu cuenta.',
        'Una cuenta corresponde a una clínica. Los límites de usuarios y de mascotas dependen del plan contratado.',
      ]} />

      <H>3. Prueba, precios y pago</H>
      <Lista items={[
        'La prueba gratuita dura catorce días y no requiere tarjeta.',
        'Los precios se publican en pesos colombianos en la página de planes y se cobran por mes anticipado.',
        'El pago se acuerda y se confirma de forma directa, por fuera de la plataforma. VetaApp no procesa pagos ni almacena datos de tarjetas.',
        'Podemos ajustar los precios avisando con treinta días de anticipación.',
      ]} />

      <H>4. Suspensión por falta de pago</H>
      <P>
        Si la suscripción no se paga, la cuenta puede quedar suspendida. Durante la suspensión no se
        puede consultar ni registrar información —tampoco descargarla desde la aplicación—, pero los
        datos no se borran: se conservan durante sesenta días para que puedas ponerte al día o
        pedirnos una copia por correo, que te enviamos sin costo. Pasado ese plazo podemos
        eliminarlos de forma definitiva. Por eso conviene descargar tus datos mientras la cuenta
        esté al día.
      </P>

      <H>5. Uso aceptable</H>
      <P>No está permitido:</P>
      <Lista items={[
        'Intentar acceder a datos de otra clínica o vulnerar los controles de seguridad.',
        'Revender, sublicenciar o dar acceso a terceros ajenos a tu clínica.',
        'Cargar contenido ilegal, ni usar el sistema para enviar comunicaciones no solicitadas.',
        'Sobrecargar la infraestructura de forma deliberada.',
      ]} />
      <P>El incumplimiento puede llevar a la suspensión inmediata de la cuenta.</P>

      <H>6. Responsabilidad clínica</H>
      <P>
        VetaApp es una herramienta administrativa y de registro. No es un dispositivo médico ni
        emite diagnósticos. Las decisiones clínicas, los tratamientos y el cumplimiento de las
        normas del ejercicio veterinario son responsabilidad exclusiva del profesional que usa el
        sistema.
      </P>

      <H>7. Tus datos</H>
      <P>
        La información que cargas sigue siendo tuya. Puedes descargarla tú mismo cuando quieras,
        en archivos CSV que abren en Excel o Google Sheets, desde{' '}
        <span className="font-medium">Configuración → Datos y backups</span>. No necesitas pedirnos
        permiso ni esperar respuesta, y no depende de tu plan. Los archivos incluyen dueños,
        mascotas, historias clínicas, vacunas, tratamientos, citas, inventario y cobros; no incluyen
        imágenes ni archivos adjuntos. Te recomendamos descargar una copia cada cierto tiempo y
        guardarla fuera de VetaApp.
      </P>

      <H>8. Disponibilidad</H>
      <P>
        Trabajamos para mantener el servicio disponible, pero no garantizamos operación
        ininterrumpida. Puede haber cortes por mantenimiento, fallas de proveedores o causas fuera
        de nuestro control. No ofrecemos, por ahora, un acuerdo de nivel de servicio con
        compensación.
      </P>

      <H>9. Límite de responsabilidad</H>
      <P>
        En la medida permitida por la ley, la responsabilidad total de VetaApp frente a cualquier
        reclamación se limita al valor pagado por el servicio en los tres meses anteriores al hecho.
        No respondemos por lucro cesante ni por pérdidas indirectas.
      </P>

      <H>10. Terminación</H>
      <P>
        Puedes cancelar cuando quieras escribiendo a <a className="text-emerald-700 underline" href={`mailto:${CORREO}`}>{CORREO}</a>.
        No hay permanencia mínima. Los meses ya pagados no se reembolsan. Nosotros podemos terminar
        el contrato por incumplimiento grave de estos términos o por falta de pago sostenida.
      </P>

      <H>11. Cambios</H>
      <P>
        Podemos actualizar estos términos. Publicaremos la nueva versión aquí y avisaremos por
        correo cuando el cambio sea sustancial. Seguir usando el servicio implica aceptarlo.
      </P>

      <H>12. Ley aplicable</H>
      <P>
        Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia se
        someterá a los jueces competentes del domicilio de VetaApp.
      </P>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

const DOCS = {
  privacidad: { titulo: 'Política de Privacidad', Cuerpo: Privacidad },
  terminos: { titulo: 'Términos y Condiciones', Cuerpo: Terminos },
};

export default function Legal({ doc }) {
  const { titulo, Cuerpo } = DOCS[doc];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-900 font-semibold">
            <VetaAppLogo size={22} />
            <span>VetaApp</span>
          </Link>
          <Link to="/" className="text-sm text-emerald-700 hover:underline">Volver al inicio</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        <p className="text-sm text-gray-500 mt-1">Última actualización: {ACTUALIZADO}</p>
        <div className="mt-6">
          <Cuerpo />
        </div>
      </main>

      <footer className="border-t border-gray-200 mt-10">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
          <span>© 2026 VetaApp</span>
          <Link to="/privacidad" className="hover:underline">Privacidad</Link>
          <Link to="/terminos" className="hover:underline">Términos</Link>
          <a href={`mailto:${CORREO}`} className="hover:underline">{CORREO}</a>
        </div>
      </footer>
    </div>
  );
}
