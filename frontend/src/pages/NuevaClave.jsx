import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { traducir } from '../components/AuthScreen';
import { VetaAppLogo } from '../components/icons';

export default function NuevaClave() {
  const navigate = useNavigate();
  const { loading, session } = useAuth();
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (password !== repetir) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      navigate('/app', { replace: true });
    } catch (err) {
      setError(traducir(err.message));
      setCargando(false);
    }
  }

  if (loading) return <Marco><p style={S.texto}>Verificando el enlace…</p></Marco>;

  // El enlace del correo trae el token en el hash; supabase-js lo canjea por
  // una sesión al cargar. Sin sesión, el enlace venció o ya se usó.
  if (!session) {
    return (
      <Marco>
        <h1 style={S.titulo}>Enlace vencido</h1>
        <p style={S.texto}>
          Este enlace ya se usó o pasó su tiempo de validez. Pide uno nuevo desde la pantalla de
          inicio de sesión.
        </p>
        <Link to="/login" style={S.boton}>Ir a iniciar sesión</Link>
      </Marco>
    );
  }

  return (
    <Marco>
      <h1 style={S.titulo}>Crear contraseña nueva</h1>
      <p style={S.texto}>Elige una contraseña de al menos 6 caracteres.</p>

      <form onSubmit={onSubmit} style={S.form}>
        <label style={S.label}>
          Contraseña nueva
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={S.input}
          />
        </label>

        <label style={S.label}>
          Repite la contraseña
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            placeholder="••••••••"
            style={S.input}
          />
        </label>

        {error && <div style={S.error}>{error}</div>}

        <button type="submit" disabled={cargando} style={{ ...S.primary, ...(cargando ? S.disabled : {}) }}>
          {cargando ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </Marco>
  );
}

function Marco({ children }) {
  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.logoBox}>
          <div style={S.logoBadge}>
            <VetaAppLogo size={30} />
          </div>
        </div>
        {children}
      </div>
    </div>
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
  titulo: { margin: 0, textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--verde-700)' },
  texto: { margin: '8px 0 20px', textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' },
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
    cursor: 'pointer',
  },
  disabled: { opacity: 0.6, cursor: 'default' },
  boton: {
    height: 44, borderRadius: 'var(--r-md)', background: 'var(--verde-600)', color: '#fff',
    fontSize: 14, fontWeight: 700, textDecoration: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  error: {
    padding: '9px 11px', borderRadius: 'var(--r-sm)', fontSize: 12.5,
    background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
  },
};
