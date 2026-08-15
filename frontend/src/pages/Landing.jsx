import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { VetaAppLogo } from '../components/icons';
import { useAuth } from '../lib/AuthContext';
import '../styles/landing.css';

/* ------------------------------------------------------------------ */
/* Datos de la página                                                  */
/* ------------------------------------------------------------------ */

const BENEFICIOS = [
  { emoji: '📅', titulo: 'Agenda de Citas',        texto: 'Organiza tu día. Nunca más una cita perdida o duplicada.' },
  { emoji: '🐾', titulo: 'Historias Clínicas',     texto: 'El historial completo de cada mascota, siempre a mano.' },
  { emoji: '💬', titulo: 'Recordatorios WhatsApp', texto: 'Avisa a los dueños de vacunas próximas con un clic. Menos ausencias, más ingresos.' },
  { emoji: '💊', titulo: 'Inventario',             texto: 'Controla medicamentos y stock. Alertas cuando algo se agota.' },
  { emoji: '💰', titulo: 'Caja y Reportes',        texto: 'Cobra, genera recibos e imprime. Lleva la caja de tu clínica.' },
  { emoji: '📊', titulo: 'Reportes',               texto: 'Mira tus ingresos, tus servicios más pedidos y crece con datos.' },
];

const PASOS = [
  { n: '1', titulo: 'Regístrate',            texto: 'Crea tu cuenta con correo o Google en segundos.' },
  { n: '2', titulo: 'Carga tus mascotas',    texto: 'Agrega pacientes y sus dueños.' },
  { n: '3', titulo: 'Empieza a gestionar',   texto: 'Agenda, cobra y envía recordatorios.' },
];

const PLANES = [
  {
    id: 'esencial',
    nombre: 'Esencial',
    precio: '69.000',
    resumen: 'Para clínicas que arrancan',
    popular: false,
    features: [
      'Hasta 200 mascotas',
      'Citas, Mascotas, Historias, Recordatorios WhatsApp',
      '1 veterinario',
      'Soporte por correo',
    ],
  },
  {
    id: 'profesional',
    nombre: 'Profesional',
    precio: '119.000',
    resumen: 'La opción de la mayoría',
    popular: true,
    features: [
      'Mascotas ilimitadas',
      'Todo lo del Esencial',
      '+ Caja, Reportes e Inventario',
      'Hasta 3 veterinarios',
      'Soporte prioritario por WhatsApp',
    ],
  },
  {
    id: 'clinica',
    nombre: 'Clínica',
    precio: '199.000',
    resumen: 'Para equipos grandes',
    popular: false,
    features: [
      'Todo ilimitado',
      '+ Reportes y estadísticas',
      '+ Exportar a Excel',
      'Usuarios ilimitados',
      'Soporte + capacitación',
    ],
  },
];

const EMAIL_CONTACTO = 'hola@vetaapp.co';
const WHATSAPP_CONTACTO = '+57 300 123 4567';
const WHATSAPP_LINK = 'https://wa.me/573001234567';

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
                className={`lp-plan lp-reveal${plan.popular ? ' lp-plan-popular' : ''}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {plan.popular && <span className="lp-badge">MÁS POPULAR</span>}

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

                <button
                  className={`lp-btn lp-btn-block ${plan.popular ? 'lp-btn-primary' : 'lp-btn-outline'}`}
                  onClick={irARegistro}
                >
                  Empezar
                </button>
              </article>
            ))}
          </div>

          <p className="lp-planes-nota lp-reveal">
            Todos los planes incluyen 14 días de prueba gratis. Paga el año y llévate 2 meses gratis.
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
        <span className="lp-mock-url">vetaapp.co/app</span>
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
