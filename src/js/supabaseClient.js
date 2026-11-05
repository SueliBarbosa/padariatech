import { createClient } from '@supabase/supabase-js';

// As variáveis com prefixo VITE_ são expostas publicamente pelo bundler Vite no navegador
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Atenção: VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não foram configuradas. ' +
    'Certifique-se de configurar o arquivo .env ou as variáveis de ambiente na Vercel.'
  );
}

// Criação da instância singleton do cliente Supabase com persistência de sessão em localStorage
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
