import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Qué módulos incluye cada plan. Es el espejo de tiene_modulo() en
// 004_planes.sql: aquí solo sirve para esconder menús — quien bloquea de
// verdad es RLS, porque con F12 cualquiera llama a supabase-js directo.
const MODULOS_POR_PLAN = {
  fichas:      [],   // mascotas, historias, citas, vacunas y calendario van en todos los planes
  completo:    ['inventario', 'caja', 'recordatorios'],
  facturacion: ['inventario', 'caja', 'recordatorios', 'facturacion'],
};

const AuthContext = createContext({
  user: null,
  session: null,
  perfil: null,
  plan: 'completo',
  esAdmin: false,
  bloqueado: false,
  loading: true,
  tieneModulo: () => true,
  signOut: () => {},
  recargarPerfil: () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);      // sesión
  const [perfilListo, setPerfilListo] = useState(false);
  const uidActual = useRef(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const uid = session?.user?.id ?? null;

  // Trae rol y estado de suscripción. Ignora respuestas de un usuario
  // que ya no es el actual (cambio de sesión a media petición).
  const cargarPerfil = useCallback(async (id) => {
    if (!id) {
      setPerfil(null);
      setPerfilListo(true);
      return;
    }
    const leer = (cols) =>
      supabase.from('perfiles').select(cols).eq('id', id).maybeSingle();

    let { data, error } = await leer('id, email, nombre, rol, estado_suscripcion, plan, fecha_registro');
    // Si el deploy del frontend va por delante de la migración 004, la
    // columna `plan` todavía no existe. Se reintenta sin ella para no
    // dejar a nadie sin perfil (y sin panel de admin) por ese desfase.
    if (error) {
      ({ data, error } = await leer('id, email, nombre, rol, estado_suscripcion, fecha_registro'));
    }

    if (uidActual.current !== id) return;
    // Sin perfil (o tabla aún sin migrar) se entra normal: nunca dejar a
    // alguien fuera por un fallo de lectura.
    if (error) console.error('[auth] no se pudo leer el perfil:', error.message);
    setPerfil(data ?? null);
    setPerfilListo(true);
  }, []);

  useEffect(() => {
    uidActual.current = uid;
    setPerfilListo(false);
    cargarPerfil(uid);
  }, [uid, cargarPerfil]);

  const esAdmin = perfil?.rol === 'admin';
  // Sin columna `plan` (migración aún sin correr) se asume 'completo':
  // el criterio de siempre es no dejar a nadie fuera por una lectura fallida.
  const plan = perfil?.plan || 'completo';

  const value = {
    session,
    user: session?.user ?? null,
    perfil,
    plan,
    esAdmin,
    bloqueado: perfil?.rol === 'veterinaria' && perfil?.estado_suscripcion === 'inactivo',
    tieneModulo: (modulo) =>
      esAdmin || (MODULOS_POR_PLAN[plan] ?? MODULOS_POR_PLAN.completo).includes(modulo),
    loading: loading || !perfilListo,
    signOut: () => supabase.auth.signOut(),
    recargarPerfil: () => cargarPerfil(uidActual.current),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
