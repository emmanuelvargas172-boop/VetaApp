import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { VetaAppLogo } from './icons';

export default function AuthScreen({ modoInicial = 'login' }) {
  const navigate = useNavigate();
  const [modo, setModo] = useState(modoInicial); // 'login' | 'registro' | 'recuperar'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const esRegistro = modo === 'registro';
  const esRecuperar = modo === 'recuperar';

  function cambiarModo(nuevo) {
    setModo(nuevo);
    setError('');
    setAviso('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setAviso('');
    setCargando(true);
    try {
      if (esRecuperar) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/nueva-clave`,
        });
        if (error) throw error;
        // Mismo mensaje exista o no la cuenta: revelar cuáles correos están
        // registrados le daría a un atacante una lista de clientes.
        setAviso('Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja y la carpeta de spam.');
      } else if (esRegistro) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Si el proyecto tiene confirmación de correo activada, no hay sesión inmediata
        if (data.session == null) {
          setAviso('Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.');
          setModo('login');
        }
        // Si hay sesión, onAuthStateChange entra directo al Dashboard
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(traducir(err.message));
    } finally {
      setCargando(false);
    }
  }

  async function onGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app`,
        // Sin esto Google reutiliza la sesión activa y ni pregunta.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) setError(traducir(error.message));
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.logoBox}>
          <div style={S.logoBadge}>
            <VetaAppLogo size={30} />
          </div>
        </div>

        <h1 style={S.title}>VetaApp</h1>
        <p style={S.subtitle}>Gestión Veterinaria Profesional</p>

        {esRecuperar ? (
          <p style={S.instruccion}>
            Escribe el correo de tu cuenta y te enviamos un enlace para crear una contraseña nueva.
          </p>
        ) : (
          <div style={S.toggle}>
            <button
              type="button"
              onClick={() => cambiarModo('login')}
              style={{ ...S.toggleBtn, ...(!esRegistro ? S.toggleActive : {}) }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => cambiarModo('registro')}
              style={{ ...S.toggleBtn, ...(esRegistro ? S.toggleActive : {}) }}
            >
              Crear cuenta
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} style={S.form}>
          <label style={S.label}>
            Correo electrónico
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clinica@correo.com"
              style={S.input}
            />
          </label>

          {!esRecuperar && (
            <label style={S.label}>
              Contraseña
              <input
                type="password"
                required
                minLength={6}
                autoComplete={esRegistro ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={S.input}
              />
            </label>
          )}

          {error && <div style={S.error}>{error}</div>}
          {aviso && <div style={S.aviso}>{aviso}</div>}

          <button type="submit" disabled={cargando} style={{ ...S.primary, ...(cargando ? S.disabled : {}) }}>
            {cargando ? 'Un momento…' : esRecuperar ? 'Enviar enlace' : esRegistro ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>

        {modo === 'login' && (
          <button type="button" onClick={() => cambiarModo('recuperar')} style={S.enlace}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {esRecuperar ? (
          <button type="button" onClick={() => cambiarModo('login')} style={S.enlace}>
            ← Volver a iniciar sesión
          </button>
        ) : (
          <>
            <div style={S.divider}>
              <span style={S.dividerLine} />
              <span style={S.dividerText}>o</span>
              <span style={S.dividerLine} />
            </div>

            <button type="button" onClick={onGoogle} style={S.google}>
              <GoogleIcon />
              Continuar con Google
            </button>
          </>
        )}

        <p style={S.secure}>🔒 Tus datos están seguros y son solo tuyos</p>

        <button type="button" onClick={() => navigate('/')} style={S.volver}>
          ← Volver al inicio
        </button>
      </div>
    </div>
  );
}

export function traducir(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered') || m.includes('already exists')) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
  if (m.includes('provider is not enabled')) return 'Google aún no está habilitado en Supabase.';
  if (m.includes('for security purposes')) return 'Espera un minuto antes de pedir otro enlace.';
  if (m.includes('rate limit')) return 'Se enviaron demasiados correos. Intenta más tarde.';
  if (m.includes('same as the old password')) return 'La contraseña nueva debe ser distinta a la anterior.';
  if (m.includes('auth session missing') || m.includes('is invalid or has expired')) {
    return 'El enlace ya venció o se usó. Pide uno nuevo.';
  }
  return msg || 'Ocurrió un error. Intenta de nuevo.';
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

const S = {
  wrap: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'linear-gradient(160deg, #F0FDF4 0%, #FAFAF9 45%, #FAFAF9 100%)',
    fontFamily: 'var(--font-sans)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-2xl)',
    boxShadow: 'var(--shadow-lg)',
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
  },
  logoBox: { display: 'flex', justifyContent: 'center', marginBottom: 14 },
  logoBadge: {
    width: 56, height: 56, borderRadius: 16,
    background: 'var(--verde-50)', border: '1px solid var(--verde-100)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { margin: 0, textAlign: 'center', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--verde-700)' },
  subtitle: { margin: '4px 0 22px', textAlign: 'center', fontSize: 13.5, color: 'var(--text-muted)' },
  toggle: {
    display: 'flex', gap: 4, padding: 4, marginBottom: 18,
    background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-full)',
  },
  toggleBtn: {
    flex: 1, padding: '8px 0', borderRadius: 'var(--r-full)', border: 'none',
    background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  toggleActive: { background: 'var(--verde-600)', color: '#fff', boxShadow: 'var(--shadow-sm)' },
  instruccion: { margin: '0 0 18px', textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' },
  enlace: {
    margin: '14px auto 0', padding: 0, border: 'none', background: 'none',
    fontSize: 12.5, fontWeight: 600, color: 'var(--verde-700)', cursor: 'pointer',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' },
  input: {
    height: 42, padding: '0 12px', borderRadius: 'var(--r-md)',
    border: '1px solid var(--border-strong)', background: 'var(--surface)',
    fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)',
  },
  primary: {
    height: 44, marginTop: 4, borderRadius: 'var(--r-md)', border: 'none',
    background: 'var(--verde-600)', color: '#fff', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', transition: 'background 0.15s',
  },
  disabled: { opacity: 0.6, cursor: 'default' },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' },
  dividerLine: { flex: 1, height: 1, background: 'var(--border)' },
  dividerText: { fontSize: 12, color: 'var(--text-faint)' },
  google: {
    height: 44, borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  secure: { margin: '22px 0 0', textAlign: 'center', fontSize: 11.5, color: 'var(--text-faint)' },
  volver: {
    margin: '14px auto 0', padding: 0, border: 'none', background: 'none',
    fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
  },
  error: {
    padding: '9px 11px', borderRadius: 'var(--r-sm)', fontSize: 12.5,
    background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
  },
  aviso: {
    padding: '9px 11px', borderRadius: 'var(--r-sm)', fontSize: 12.5,
    background: 'var(--verde-50)', border: '1px solid var(--verde-100)', color: 'var(--verde-700)',
  },
};
