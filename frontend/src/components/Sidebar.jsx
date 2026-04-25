import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PawPrint, FileText, Calendar, Bell, Package } from 'lucide-react';

const navItems = [
  { path: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/mascotas',      icon: PawPrint,         label: 'Mascotas' },
  { path: '/historias',     icon: FileText,          label: 'Historias' },
  { path: '/citas',         icon: Calendar,          label: 'Citas' },
  { path: '/recordatorios', icon: Bell,              label: 'Recordatorios' },
  { path: '/operaciones',   icon: Package,           label: 'Operaciones', hasBadge: true },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const [alertaCount, setAlertaCount] = useState(0);

  useEffect(() => {
    fetch('http://localhost:3001/api/inventario/alertas')
      .then(r => r.json())
      .then(data => setAlertaCount(data.count ?? 0))
      .catch(() => {});
  }, [pathname]);

  const isActive = (path) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <aside className="w-64 bg-verde-oscuro flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-3 border-b border-verde-medio/40">
        <div className="w-9 h-9 bg-verde-claro rounded-lg flex items-center justify-center">
          <PawPrint className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-white text-lg font-bold leading-none">VetaApp</span>
          <p className="text-green-400 text-xs mt-0.5">Gestión veterinaria</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ path, icon: Icon, label, hasBadge = false }) => (
          <Link
            key={path}
            to={path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
              isActive(path)
                ? 'bg-verde-claro text-white shadow-sm'
                : 'text-green-300 hover:bg-verde-medio/50 hover:text-white'
            }`}
          >
            <span className="relative flex-shrink-0">
              <Icon
                className={`w-5 h-5 ${isActive(path) ? 'text-white' : 'text-green-400 group-hover:text-white'}`}
                strokeWidth={isActive(path) ? 2.5 : 2}
              />
              {hasBadge && alertaCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                  {alertaCount}
                </span>
              )}
            </span>
            <span className="font-medium text-sm">{label}</span>
            {isActive(path) && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
            )}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-verde-medio/40">
        <p className="text-green-500 text-xs">VetaApp MVP v1.0</p>
        <p className="text-green-600 text-xs mt-0.5">© 2025</p>
      </div>
    </aside>
  );
}
