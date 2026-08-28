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

    let { data, error } = await leer('id, email, nombre, rol, estado_suscripcion, plan, prueba_hasta, suscripcion_hasta, fecha_registro');
    // Si el deploy del frontend va por delante de las migraciones 004/005/007,
    // las columnas `plan`, `prueba_hasta` o `suscripcion_hasta` todavía no
    // existen. Se reintenta sin ellas para no dejar a nadie sin perfil (y sin
    // panel de admin).
    if (error) {
      ({ data, error } = await leer('id, email, nombre, rol, estado_suscripcion, plan, prueba_hasta, fecha_registro'));
    }
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

  // Prueba gratis. Espejo de esta_activo() en 005_prueba.sql: quien bloquea
  // de verdad es RLS, esto solo decide qué pantalla se muestra.
  const enPrueba = perfil?.estado_suscripcion === 'prueba';
  const finPrueba = perfil?.prueba_hasta ? new Date(perfil.prueba_hasta) : null;
  // Sin fecha se trata como vigente: no bloquear por un dato incompleto.
  const pruebaVencida = enPrueba && !!finPrueba && finPrueba.getTime() <= Date.now();
  const diasPrueba = enPrueba && finPrueba
    ? Math.ceil((finPrueba.getTime() - Date.now()) / 86400000)
    : null;

  // Suscripción paga. Espejo del caso 'activo' de esta_activo() en
  // 007_pagos.sql, que ahora sí vence.
  //
  // Sin esto la app mentiría de la peor forma: la base cerraría la puerta
  // (RLS) pero React seguiría mostrando el panel, y un USING en false no
  // da error — devuelve cero filas. La veterinaria vería su clínica vacía,
  // como si se le hubieran borrado los datos, en vez de "se venció tu plan".
  //
  // suscripcion_hasta null = sin vencimiento: es el caso de las cuentas
  // que activó el admin a mano y de todas las anteriores a 007.
  const finSuscripcion = perfil?.suscripcion_hasta ? new Date(perfil.suscripcion_hasta) : null;
  const suscripcionVencida =
    perfil?.estado_suscripcion === 'activo' &&
    !!finSuscripcion && finSuscripcion.getTime() <= Date.now();
  const diasSuscripcion = finSuscripcion && !suscripcionVencida
    ? Math.ceil((finSuscripcion.getTime() - Date.now()) / 86400000)
    : null;

  // Estable mientras no cambien plan ni rol: si cambiara en cada render,
  // los efectos que dependen de ella se dispararían en bucle.
  const tieneModulo = useCallback(
    (modulo) => esAdmin || (MODULOS_POR_PLAN[plan] ?? MODULOS_POR_PLAN.completo).includes(modulo),
    [esAdmin, plan],
  );

  const value = {
    session,
    user: session?.user ?? null,
    perfil,
    plan,
    esAdmin,
    enPrueba,
    diasPrueba,
    pruebaVencida,
    suscripcionVencida,
    diasSuscripcion,
    bloqueado:
      perfil?.rol === 'veterinaria' &&
      (perfil?.estado_suscripcion === 'inactivo' || pruebaVencida || suscripcionVencida),
    tieneModulo,
    loading: loading || !perfilListo,
    signOut: () => supabase.auth.signOut(),
    recargarPerfil: () => cargarPerfil(uidActual.current),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
