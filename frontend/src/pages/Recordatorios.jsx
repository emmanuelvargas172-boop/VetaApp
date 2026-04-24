import { Bell, Construction } from 'lucide-react';

export default function Recordatorios() {
  return (
    <div className="p-6 flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
        <Bell className="w-8 h-8 text-orange-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Recordatorios WhatsApp</h1>
      <p className="text-gray-400 mt-2 max-w-sm">
        Módulo en construcción. Aquí verás las vacunas próximas a vencer y podrás notificar a los dueños por WhatsApp.
      </p>
      <span className="mt-4 inline-flex items-center gap-2 bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2 rounded-full">
        <Construction className="w-4 h-4" /> Próximamente
      </span>
    </div>
  );
}
