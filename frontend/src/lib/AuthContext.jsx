import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext({
  user: null,
  session: null,
  perfil: null,
  esAdmin: false,
  bloqueado: false,
  loading: true,
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
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, email, nombre, rol, estado_suscripcion, fecha_registro')
      .eq('id', id)
      .maybeSingle();

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

  const value = {
    session,
    user: session?.user ?? null,
    perfil,
    esAdmin: perfil?.rol === 'admin',
    bloqueado: perfil?.rol === 'veterinaria' && perfil?.estado_suscripcion === 'inactivo',
    loading: loading || !perfilListo,
    signOut: () => supabase.auth.signOut(),
    recargarPerfil: () => cargarPerfil(uidActual.current),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
