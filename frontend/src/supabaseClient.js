// ============================================================================
// Cliente Supabase — usado pelo frontend (login Google + dados por usuário).
// Configure as variáveis no arquivo .env (dev) e nas Environment Variables
// da Vercel (produção):
//   REACT_APP_SUPABASE_URL=https://SEU-PROJETO.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOi... (chave "anon public")
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL || '';
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!url || !anon) {
  // Não quebra o build; apenas avisa no console para facilitar o diagnóstico.
  console.warn(
    '[Supabase] REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY não configuradas. ' +
    'Login e dados não vão funcionar até preencher o .env / Vercel.'
  );
}

export const isSupabaseConfigured = () => Boolean(url && anon);

export const supabase = isSupabaseConfigured()
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
