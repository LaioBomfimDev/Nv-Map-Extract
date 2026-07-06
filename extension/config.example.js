// ============================================================================
// MODELO de configuração da extensão.
// Copie este arquivo para `config.js` e preencha com os dados do seu projeto.
//   SUPABASE_URL      -> Supabase > Project Settings > API > Project URL
//   SUPABASE_ANON_KEY -> Supabase > Project Settings > API > anon public
//   APP_URL           -> a URL do painel (Vercel em produção; localhost em dev)
// ⚠️ Ao mudar a APP_URL, atualize também os "matches" em manifest.json.
// (A chave "anon" é pública por design — protegida por RLS.)
// ============================================================================
const FM_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE_A_CHAVE_ANON_AQUI',
  APP_URL: 'http://localhost:3008',
};
