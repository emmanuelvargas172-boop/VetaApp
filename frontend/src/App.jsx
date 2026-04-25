import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Mascotas from './pages/Mascotas';
import Historias from './pages/Historias';
import Citas from './pages/Citas';
import Recordatorios from './pages/Recordatorios';
import Operaciones from './pages/Operaciones';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mascotas/*" element={<Mascotas />} />
            <Route path="/historias/*" element={<Historias />} />
            <Route path="/citas/*" element={<Citas />} />
            <Route path="/recordatorios" element={<Recordatorios />} />
            <Route path="/operaciones" element={<Operaciones />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
