import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falla temprano y claro si falta el .env
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en frontend/.env');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Solo en desarrollo: expone el cliente para depurar desde la consola del navegador.
if (import.meta.env.DEV) {
  window.supabase = supabase;
}

export default supabase;
