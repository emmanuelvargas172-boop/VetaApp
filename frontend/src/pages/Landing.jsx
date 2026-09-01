import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { VetaAppLogo } from '../components/icons';
import { useAuth } from '../lib/AuthContext';
import { planIncluye } from '../lib/planes';
import {
  MARCA, EMAIL_CONTACTO as EMAIL, WHATSAPP_VISIBLE, linkWhatsApp,
} from '../config/marca';
import '../styles/landing.css';

/* ------------------------------------------------------------------ */
/* Datos de la página                                                  */
/* ------------------------------------------------------------------ */

const BENEFICIOS = [
  { emoji: '📅', titulo: 'Agenda de Citas',        texto: 'Organiza tu día. Nunca más una cita perdida o duplicada.' },
  { emoji: '🐾', titulo: 'Historias Clínicas',     texto: 'El historial completo de cada mascota, siempre a mano.' },
  { emoji: '💬', titulo: 'Recordatorios WhatsApp', texto: 'VetaApp arma la lista y el mensaje; tú envías con un clic y queda registrado a quién le escribiste.' },
  { emoji: '💊', titulo: 'Inventario',             texto: 'Controla medicamentos y stock. Alertas cuando algo se agota.' },
  { emoji: '💰', titulo: 'Caja y Reportes',        texto: 'Cobra, genera recibos e imprime. Lleva la caja de tu clínica.' },
  { emoji: '📊', titulo: 'Reportes',               texto: 'Mira tus ingresos, tus servicios más pedidos y crece con datos.' },
];

const PASOS = [
  { n: '1', titulo: 'Regístrate',            texto: 'Crea tu cuenta con correo o Google en segundos.' },
  { n: '2', titulo: 'Carga tus mascotas',    texto: 'Agrega pacientes y sus dueños.' },
  { n: '3', titulo: 'Empieza a gestionar',   texto: 'Agenda, cobra y envía recordatorios.' },
];

// Los planes se separan por lo que hace la app, no por cuántas mascotas caben:
// muchas veterinarias ya facturan por otro lado y solo necesitan organizarse.
// Ninguno limita mascotas ni usuarios.
//
// OJO con el desfase entre `id` y `nombre`: los ids siguen diciendo 'fichas'
// y 'completo' mientras que en pantalla se lee Esencial y Avanzado. No es
// un descuido, es a propósito (009_nombres_planes.sql). Esos ids están
// cableados en tiene_modulo(), en las políticas RLS, en el check
// perfiles_plan_check y en el plan que hoy tiene guardado cada cuenta viva.
// Cambiarlos para que "combinen" sería una migración con riesgo de dejar
// veterinarias fuera de su propio plan, a cambio de nada que el usuario vea.
// Un identificador interno feo es gratis; uno que cambia es caro.
const PLANES = [
  {
    id: 'fichas',
    nombre: 'Esencial',
    precio: '69.000',
    resumen: 'Si ya facturas por otro lado',
    popular: false,
    features: [
      'Mascotas, dueños e historias clínicas',
      'Citas y calendario',
      'Vacunas y control de peso',
      'Mascotas y usuarios sin límite',
      'Soporte por WhatsApp',
    ],
  },
  {
    id: 'completo',
    nombre: 'Avanzado',
    precio: '99.000',
    resumen: 'La clínica entera en un solo lugar',
    popular: true,
    features: [
      'Todo lo de Esencial',
      '+ Recordatorios de vacunas por WhatsApp',
      '+ Caja: cobros y recibos',
      '+ Inventario de medicamentos e insumos',
      '+ Reportes de ingresos',
    ],
  },
  {
    id: 'facturacion',
    nombre: 'Facturación',
    precio: '149.000',
    resumen: 'Cuando necesitas facturar electrónicamente',
    popular: false,
    // Todavía no está construido. Se muestra sin botón de pago para no
    // cobrar por algo que la app no hace.
    proximamente: true,
    features: [
      'Todo lo de Avanzado',
      '+ Facturación electrónica DIAN',
      '+ Resolución y numeración',
      '+ Envío automático al cliente',
    ],
  },
];

/**
 * El detalle largo de cada plan.
 *
 * La tabla de tres columnas de arriba sirve para comparar de un vistazo,
 * pero no alcanza para decidir: una veterinaria que nunca usó un software
 * no sabe qué significa "inventario" en la práctica ni por qué le costaría
 * $30.000 más al mes. Esto lo cuenta en el idioma en que ella lo vive.
 *
 * IMPORTANTE — esto no es material de marketing suelto. La diferencia real
 * entre Esencial y Avanzado son EXACTAMENTE tres módulos, y así está escrito
 * en tiene_modulo() (006_avisos.sql):
 *
 *   inventario    → completo, facturacion
 *   caja          → completo, facturacion
 *   recordatorios → completo, facturacion
 *   else true     → mascotas, historias, citas, vacunas, calendario
 *
 * Todo lo que se prometa acá tiene que caer de ese lado. Si mañana un
 * módulo cambia de plan en esa función, este texto queda mintiendo.
 */
const DETALLE_PLANES = [
  {
    id: 'fichas',
    nombre: 'Esencial',
    precio: '69.000',
    para: 'Para el consultorio que todavía trabaja con cuaderno, Excel o memoria.',
    dia:
      'Llega Michi con vómito. Buscas su nombre y en dos segundos tienes todo: ' +
      'qué le diagnosticaste en marzo, qué le recetaste, cuánto pesaba, qué ' +
      'vacunas lleva y cuándo toca la próxima. No dependes de acordarte ni de ' +
      'encontrar la hoja.',
    gana: [
      ['Nunca más pierdes una historia', 'El cuaderno se moja, se pierde o se lo lleva alguien. Esto no.'],
      ['Atiendes con el antecedente en frente', 'Menos repetir exámenes, menos preguntarle al dueño lo que ya te dijo.'],
      ['El dueño te ve organizado', 'Sacar el historial completo en el momento vale más que cualquier aviso.'],
      ['Sin límite de mascotas ni de usuarios', 'No te cobramos por crecer. Registra las que sean.'],
    ],
    noIncluye:
      'No lleva la plata ni el stock: no cobra, no hace recibos, no controla ' +
      'medicamentos y no manda recordatorios. Si eso ya lo resuelves por otro ' +
      'lado, este plan te sirve tal cual.',
  },
  {
    id: 'completo',
    nombre: 'Avanzado',
    precio: '99.000',
    para: 'Para la clínica que además de atender, vende, cobra y quiere que el cliente vuelva.',
    dia:
      'Mismo caso de Michi, pero además: le cobras la consulta y sale el recibo, ' +
      'el antiparasitario que usaste se descuenta solo del inventario, y el mes ' +
      'entrante la app te arma la lista de a quiénes les toca vacuna con el ' +
      'mensaje listo para mandar por WhatsApp.',
    gana: [
      ['Los clientes vuelven', 'El recordatorio de vacuna es plata que ya era tuya y se estaba perdiendo porque nadie se acordó.'],
      ['Sabes cuánto entró', 'Caja y reportes: qué se cobró, qué servicio es el que más te mueve.'],
      ['No se te acaba nada de sorpresa', 'Inventario con alerta cuando algo se está agotando.'],
      ['Una sola cuenta para todo', 'Deja de cuadrar la clínica entre tres cuadernos y un Excel.'],
    ],
    // El argumento honesto: la diferencia se paga sola con un cliente que vuelve.
    vale:
      'Son $30.000 más al mes. Una sola vacuna que se hubiera perdido y volvió ' +
      'por el recordatorio ya lo pagó.',
  },
];

/**
 * Lo único que de verdad cambia entre los dos planes vendibles.
 *
 * Los ✓ y los — NO se escriben a mano: cada fila declara DE QUÉ MÓDULO
 * depende, y quien responde es planIncluye() sobre el mismo mapa que usa
 * la app para esconder menús (lib/planes.js, espejo de tiene_modulo()
 * en 006_avisos.sql).
 *
 * Antes los booleanos estaban a dedo. Funcionaba, pero el día que un
 * módulo cambiara de plan había que acordarse de venir a esta página, y
 * de eso no se acuerda nadie. Una tabla de precios que miente es peor
 * que no tenerla: el cliente paga por lo que leyó.
 *
 * `modulo: null` = va en todos los planes (el `else true` de la función).
 * Cuatro filas para tres módulos porque "Reportes de ingresos" es parte
 * de Caja: se nombran aparte porque el cliente los pide aparte.
 */
const COMPARACION = [
  { que: 'Mascotas, dueños e historias clínicas', modulo: null },
  { que: 'Citas y calendario',                    modulo: null },
  { que: 'Vacunas y control de peso',             modulo: null },
  { que: 'Mascotas y usuarios sin límite',        modulo: null },
  { que: 'Descarga de tus datos en CSV',          modulo: null },
  { que: 'Recordatorios por WhatsApp',            modulo: 'recordatorios' },
  { que: 'Caja, cobros y recibos',                modulo: 'caja' },
  { que: 'Inventario de medicamentos',            modulo: 'inventario' },
  { que: 'Reportes de ingresos',                  modulo: 'caja' },
];

/** ¿La fila entra en el plan? Sin módulo, entra en todos. */
const filaEnPlan = (f, id) => f.modulo === null || planIncluye(id, f.modulo);

// Estaban escritos a mano aquí; ahora salen de config/marca.js, que es
// el único sitio donde vive el contacto. Se conservan los nombres viejos
// para no tocar el JSX de más abajo.
const EMAIL_CONTACTO = EMAIL;
const WHATSAPP_CONTACTO = WHATSAPP_VISIBLE;
const WHATSAPP_LINK = linkWhatsApp();

/* ------------------------------------------------------------------ */
/* Animación de entrada al hacer scroll                                */
/* ------------------------------------------------------------------ */

function useRevealOnScroll() {
  const root = useRef(null);

  useEffect(() => {
    const nodos = root.current?.querySelectorAll('.lp-reveal');
    if (!nodos?.length) return;

    // Sin IntersectionObserver o con "reduce motion": mostrar todo de una.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') {
      nodos.forEach((n) => n.classList.add('is-visible'));
      return;
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            obs.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    nodos.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  return root;
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const root = useRevealOnScroll();

  // Scroll suave solo mientras la landing está montada (no afecta a la app).
  useEffect(() => {
    document.documentElement.classList.add('lp-smooth');
    return () => document.documentElement.classList.remove('lp-smooth');
  }, []);

  const irARegistro = () => navigate('/registro');
  const irALogin = () => navigate('/login');
  const irAlPanel = () => navigate('/app');

  return (
    <div className="lp-root" ref={root}>
      {/* ---------------------------------------------------------- */}
      {/* 1. NAVBAR                                                   */}
      {/* ---------------------------------------------------------- */}
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a className="lp-brand" href="#top" aria-label="VetaApp — inicio">
            <span className="lp-brand-badge"><VetaAppLogo size={22} /></span>
            <span className="lp-brand-name">VetaApp</span>
          </a>

          <nav className="lp-nav-links" aria-label="Secciones">
            <a href="#beneficios">Beneficios</a>
            <a href="#planes">Planes</a>
            <a href="#contacto">Contacto</a>
          </nav>

          <div className="lp-nav-actions">
            {session ? (
              <button className="lp-btn lp-btn-primary" onClick={irAlPanel}>Ir a mi panel</button>
            ) : (
              <>
                <button className="lp-btn lp-btn-ghost" onClick={irALogin}>Iniciar sesión</button>
                <button className="lp-btn lp-btn-primary" onClick={irARegistro}>Prueba gratis</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/* 2. HERO                                                     */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-hero" id="top">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy lp-reveal">
            <span className="lp-eyebrow">🐾 Software para clínicas veterinarias</span>
            <h1 className="lp-h1">El sistema de gestión que tu veterinaria necesita</h1>
            <p className="lp-lead">
              Citas, historias clínicas, recordatorios por WhatsApp, inventario y caja.
              Todo en un solo lugar, desde cualquier dispositivo.
            </p>

            <div className="lp-hero-cta">
              {session ? (
                <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={irAlPanel}>Ir a mi panel</button>
              ) : (
                <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={irARegistro}>
                  Empieza gratis 14 días
                </button>
              )}
            </div>

            <p className="lp-fineprint">Sin tarjeta de crédito · Configúralo en 5 minutos</p>
          </div>

          <div className="lp-hero-visual lp-reveal">
            <MockupDashboard />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 3. BENEFICIOS                                               */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-section" id="beneficios">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-kicker">Beneficios</span>
            <h2 className="lp-h2">Todo lo que tu clínica necesita</h2>
            <p className="lp-section-sub">
              Un solo sistema para la operación diaria: desde que suena el teléfono hasta que se
              entrega el recibo.
            </p>
          </div>

          <div className="lp-grid-3">
            {BENEFICIOS.map((b, i) => (
              <article className="lp-card lp-reveal" key={b.titulo} style={{ transitionDelay: `${i * 60}ms` }}>
                <span className="lp-card-emoji" aria-hidden="true">{b.emoji}</span>
                <h3 className="lp-card-title">{b.titulo}</h3>
                <p className="lp-card-text">{b.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 4. CÓMO FUNCIONA                                            */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-section lp-section-alt" id="como-funciona">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-kicker">Cómo funciona</span>
            <h2 className="lp-h2">Listo en tres pasos</h2>
          </div>

          <ol className="lp-pasos">
            {PASOS.map((p, i) => (
              <li className="lp-paso lp-reveal" key={p.n} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="lp-paso-num">{p.n}</span>
                <h3 className="lp-card-title">{p.titulo}</h3>
                <p className="lp-card-text">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 5. PLANES                                                   */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-section" id="planes">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-kicker">Planes</span>
            <h2 className="lp-h2">Planes que se ajustan a tu clínica</h2>
            <p className="lp-section-sub">Precios en pesos colombianos. Cambia o cancela cuando quieras.</p>
          </div>

          <div className="lp-grid-planes">
            {PLANES.map((plan, i) => (
              <article
                key={plan.id}
                className={`lp-plan lp-reveal${plan.popular ? ' lp-plan-popular' : ''}${plan.proximamente ? ' lp-plan-pronto' : ''}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {plan.popular && <span className="lp-badge">MÁS POPULAR</span>}
                {plan.proximamente && <span className="lp-badge lp-badge-pronto">DISPONIBLE PRONTO</span>}

                <h3 className="lp-plan-nombre">{plan.nombre}</h3>
                <p className="lp-plan-resumen">{plan.resumen}</p>

                <p className="lp-plan-precio">
                  <span className="lp-plan-moneda">$</span>
                  <span className="lp-plan-monto">{plan.precio}</span>
                  <span className="lp-plan-periodo">/mes</span>
                </p>

                <ul className="lp-plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>
                      <CheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.proximamente ? (
                  <a
                    className="lp-btn lp-btn-block lp-btn-outline"
                    href={`${WHATSAPP_LINK}?text=${encodeURIComponent('Hola, me interesa el plan Facturación de VetaApp. Avísenme cuando esté listo.')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Avísenme cuando esté
                  </a>
                ) : (
                  <button
                    className={`lp-btn lp-btn-block ${plan.popular ? 'lp-btn-primary' : 'lp-btn-outline'}`}
                    onClick={irARegistro}
                  >
                    Empezar
                  </button>
                )}
              </article>
            ))}
          </div>

          <p className="lp-planes-nota lp-reveal">
            Esencial y Avanzado incluyen 14 días de prueba gratis, sin tarjeta. El plan Facturación
            todavía está en construcción: déjanos tu contacto y te avisamos apenas esté listo.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 5b. EL DETALLE: ¿CUÁL ME SIRVE?                             */}
      {/* Las tarjetas de arriba comparan; esto explica. Una          */}
      {/* veterinaria que nunca usó un software no decide con una     */}
      {/* lista de viñetas.                                          */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-section lp-section-alt" id="detalle-planes">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-kicker">En detalle</span>
            <h2 className="lp-h2">¿Cuál me sirve a mí?</h2>
            <p className="lp-section-sub">
              La diferencia no es cuántas mascotas caben —  en eso los dos son ilimitados.
              Es cuánto de tu clínica quieres meter adentro.
            </p>
          </div>

          <div className="lp-detalle-grid">
            {DETALLE_PLANES.map((p, i) => (
              <article
                key={p.id}
                className={`lp-detalle lp-reveal${p.id === 'completo' ? ' lp-detalle-destacado' : ''}`}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <header className="lp-detalle-head">
                  <h3 className="lp-detalle-nombre">{p.nombre}</h3>
                  <span className="lp-detalle-precio">${p.precio}<small>/mes</small></span>
                </header>

                <p className="lp-detalle-para">{p.para}</p>

                <div className="lp-detalle-dia">
                  <span className="lp-detalle-dia-label">Un día con este plan</span>
                  <p>{p.dia}</p>
                </div>

                <ul className="lp-detalle-gana">
                  {p.gana.map(([titulo, texto]) => (
                    <li key={titulo}>
                      <CheckIcon />
                      <span>
                        <strong>{titulo}.</strong> {texto}
                      </span>
                    </li>
                  ))}
                </ul>

                {p.vale && <p className="lp-detalle-vale">{p.vale}</p>}
                {p.noIncluye && (
                  <p className="lp-detalle-no">
                    <strong>Lo que no incluye: </strong>{p.noIncluye}
                  </p>
                )}
              </article>
            ))}
          </div>

          {/* La tabla es el resumen honesto: se ve de un golpe que casi todo
              está en los dos, y que lo que cambia son cuatro líneas. */}
          <div className="lp-tabla-wrap lp-reveal">
            <table className="lp-tabla">
              <thead>
                <tr>
                  <th>Qué incluye</th>
                  <th>Esencial</th>
                  <th>Avanzado</th>
                </tr>
              </thead>
              <tbody>
                {COMPARACION.map((f) => {
                  const enEsencial = filaEnPlan(f, 'fichas');
                  const enAvanzado = filaEnPlan(f, 'completo');
                  return (
                    <tr key={f.que}>
                      <td>{f.que}</td>
                      <td className={enEsencial ? 'lp-si' : 'lp-no'}>{enEsencial ? '✓' : '—'}</td>
                      <td className={enAvanzado ? 'lp-si' : 'lp-no'}>{enAvanzado ? '✓' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Verificado antes de prometerlo:
              · 004_planes.sql:28 — perfiles.plan nace `default 'completo'`,
                así que la prueba de 14 días sí trae todo.
              · bajar a Esencial no borra: las filas de inventario y caja se
                quedan en la base, RLS solo deja de mostrarlas. Al volver a
                Avanzado reaparecen. Por eso se dice "vuelven a aparecer" y
                no "se guardan", que sonaría a respaldo. */}
          <p className="lp-planes-nota lp-reveal">
            ¿No sabes cuál? Empieza con los 14 días gratis: traen todo el plan Avanzado,
            sin tarjeta. Si al final no usaste caja ni inventario, te pasas a Esencial y pagas
            menos. Y si algún día vuelves a Avanzado, tu inventario y tus cobros vuelven a
            aparecer: bajarse de plan no borra nada.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 6. LLAMADO FINAL                                            */}
      {/* ---------------------------------------------------------- */}
      <section className="lp-cta">
        <div className="lp-container lp-cta-inner lp-reveal">
          <h2 className="lp-cta-title">Empieza a gestionar tu veterinaria hoy</h2>
          <p className="lp-cta-sub">14 días gratis. Sin tarjeta de crédito.</p>
          <button className="lp-btn lp-btn-white lp-btn-lg" onClick={irARegistro}>
            Crear mi cuenta gratis
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 7. FOOTER                                                   */}
      {/* ---------------------------------------------------------- */}
      <footer className="lp-footer" id="contacto">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <a className="lp-brand" href="#top" aria-label="VetaApp — inicio">
              <span className="lp-brand-badge"><VetaAppLogo size={20} /></span>
              <span className="lp-brand-name">VetaApp</span>
            </a>
            <p className="lp-footer-tagline">Gestión veterinaria profesional.</p>
          </div>

          <nav className="lp-footer-links" aria-label="Enlaces del pie">
            <a href="#beneficios">Beneficios</a>
            <a href="#planes">Planes</a>
            <button type="button" className="lp-linklike" onClick={irALogin}>Iniciar sesión</button>
            <Link to="/privacidad">Política de privacidad</Link>
            <Link to="/terminos">Términos y condiciones</Link>
          </nav>

          <div className="lp-footer-contacto">
            <p className="lp-footer-label">Contacto</p>
            <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>
            <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer">WhatsApp {WHATSAPP_CONTACTO}</a>
          </div>
        </div>

        <div className="lp-container lp-footer-legal">
          <p>© 2026 VetaApp · Hecho en Colombia 🇨🇴</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas visuales                                                     */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--verde-100)" />
      <path d="M8 12.5l2.6 2.6L16 9.5" stroke="var(--verde-600)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mockup estático del dashboard (placeholder, no datos reales). */
function MockupDashboard() {
  const barras = [42, 68, 55, 88, 61, 74, 96];

  return (
    <div className="lp-mock" role="img" aria-label="Vista previa del panel de VetaApp">
      <div className="lp-mock-bar">
        <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
        {/* Etiqueta, no dirección. Antes decía el dominio real, que hoy
            lleva el nombre de la cuenta de Cloudflare adentro y no tiene
            por qué salir en una página de ventas. Tampoco se pone un
            dominio bonito que todavía no se compró: sería anunciar una
            dirección donde no hay nada. Cuando DOMINIO sea propio, aquí
            puede volver a ir la dirección de verdad. */}
        <span className="lp-mock-url">{MARCA} · Panel</span>
      </div>

      <div className="lp-mock-body">
        <aside className="lp-mock-side">
          <span className="lp-mock-logo"><VetaAppLogo size={16} /></span>
          <span className="lp-mock-nav is-on" />
          <span className="lp-mock-nav" />
          <span className="lp-mock-nav" />
          <span className="lp-mock-nav" />
          <span className="lp-mock-nav" />
        </aside>

        <div className="lp-mock-main">
          <div className="lp-mock-head">
            <span className="lp-mock-title" />
            <span className="lp-mock-pill" />
          </div>

          <div className="lp-mock-stats">
            {[
              { k: 'Citas hoy', v: '12' },
              { k: 'Pacientes', v: '348' },
              { k: 'Ingresos', v: '$2.4M' },
            ].map((s) => (
              <div className="lp-mock-stat" key={s.k}>
                <span className="lp-mock-stat-k">{s.k}</span>
                <span className="lp-mock-stat-v">{s.v}</span>
              </div>
            ))}
          </div>

          <div className="lp-mock-panels">
            <div className="lp-mock-chart">
              <span className="lp-mock-stat-k">Atenciones por día</span>
              <div className="lp-mock-bars">
                {barras.map((h, i) => (
                  <span key={i} className="lp-mock-barra" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>

            <div className="lp-mock-list">
              <span className="lp-mock-stat-k">Próximas citas</span>
              {['🐕 Rocky · 9:00', '🐈 Michi · 10:30', '🐇 Nube · 11:15'].map((t) => (
                <div className="lp-mock-row" key={t}>
                  <span className="lp-mock-row-txt">{t}</span>
                  <span className="lp-mock-row-tag" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
