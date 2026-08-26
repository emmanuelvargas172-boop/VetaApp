import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Mascotas from './pages/Mascotas';
import Historias from './pages/Historias';
import Citas from './pages/Citas';
import Calendario from './pages/Calendario';
import Recordatorios from './pages/Recordatorios';
import Operaciones from './pages/Operaciones';
import Caja from './pages/Caja';
import Configuracion from './pages/Configuracion';
import Landing from './pages/Landing';
import Legal from './pages/Legal';
import NuevaClave from './pages/NuevaClave';
import Admin from './pages/Admin';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AuthScreen from './components/AuthScreen';
import PantallaBloqueo from './components/PantallaBloqueo';
import ModuloNoIncluido from './components/ModuloNoIncluido';
import AvisoPrueba from './components/AvisoPrueba';

function Splash() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--verde-100)', borderTopColor: 'var(--verde-500)', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/**
 * Módulo que depende del plan. Si el plan no lo incluye se muestra la
 * pantalla de cambio de plan en vez de la página.
 *
 * Esto NO es la seguridad: quien bloquea de verdad es RLS (004_planes.sql),
 * porque desde la consola del navegador se puede llamar a supabase-js sin
 * pasar por React. Aquí solo se evita mostrar una página vacía.
 */
function ConPlan({ modulo, titulo, descripcion, children }) {
  const { tieneModulo } = useAuth();
  if (tieneModulo(modulo)) return children;
  return <ModuloNoIncluido titulo={titulo} descripcion={descripcion} />;
}

/** La app privada: sidebar + páginas. Vive bajo /app. */
function AppShell() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <AvisoPrueba />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mascotas/*" element={<Mascotas />} />
          <Route path="/historias/*" element={<Historias />} />
          <Route path="/citas/*" element={<Citas />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/recordatorios" element={
            <ConPlan
              modulo="recordatorios"
              titulo="Recordatorios"
              descripcion="Avisa a tus clientes de las próximas dosis y controles sin revisar carpeta por carpeta."
            ><Recordatorios /></ConPlan>
          } />
          <Route path="/operaciones" element={
            <ConPlan
              modulo="inventario"
              titulo="El inventario"
              descripcion="Controla medicamentos, vacunas e insumos, con alertas cuando algo se está acabando."
            ><Operaciones /></ConPlan>
          } />
          <Route path="/caja" element={
            <ConPlan
              modulo="caja"
              titulo="Caja y reportes"
              descripcion="Registra cobros, imprime recibos y mira cuánto entró en el mes."
            ><Caja /></ConPlan>
          } />
          <Route path="/configuracion" element={<Configuracion />} />
        </Routes>
      </main>
    </div>
  );
}

/**
 * Puerta de /app:
 *  - sin sesión → login (recordando a dónde quería entrar)
 *  - rol admin  → panel de administración en vez del dashboard
 *  - suscripción inactiva → pantalla de bloqueo
 */
function Privado({ children }) {
  const { loading, session, esAdmin, bloqueado } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  if (esAdmin) return <Admin />;
  if (bloqueado) return <PantallaBloqueo />;
  return children;
}

/** Login / registro. Con sesión activa entra directo al panel. */
function Publico({ modo }) {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (session) return <Navigate to={location.state?.desde || '/app'} replace />;
  return <AuthScreen modoInicial={modo} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Publico modo="login" />} />
          <Route path="/registro" element={<Publico modo="registro" />} />
          {/* Fuera de <Publico>: el enlace de recuperación ya trae sesión y
              esa puerta lo mandaría al panel sin dejarlo cambiar la clave. */}
          <Route path="/nueva-clave" element={<NuevaClave />} />
          <Route path="/privacidad" element={<Legal doc="privacidad" />} />
          <Route path="/terminos" element={<Legal doc="terminos" />} />
          <Route path="/app/*" element={<Privado><AppShell /></Privado>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
