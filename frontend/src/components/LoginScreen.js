import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';

// Tela de entrada — login por email/senha (contas pré-criadas) + opção Google.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const configured = isSupabaseConfigured();

  async function loginSenha(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Sucesso: o onAuthStateChange no App carrega o painel.
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos.'
        : (err.message || 'Falha ao entrar.'));
      setLoading(false);
    }
  }

  async function loginGoogle() {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Falha ao iniciar o login com Google.');
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#fafafa',
    padding: '11px 12px', borderRadius: 0, fontSize: 14, outline: 'none', marginBottom: 12,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 0, padding: '40px 36px', width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <img src="/logo-miner.jpg" alt="Friendly Miner" style={{ width: 56, height: 56, objectFit: 'cover', border: '2px solid #10b981', boxShadow: '0 0 12px rgba(16,185,129,0.25)', marginBottom: 20 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', margin: '0 0 6px' }}>Friendly Miner</h1>
        <p style={{ fontSize: 14, color: '#a1a1aa', margin: '0 0 28px' }}>Entre para acessar seus leads</p>

        {!configured && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12, padding: 12, marginBottom: 20, textAlign: 'left' }}>
            ⚠️ Supabase não configurado. Defina <code>REACT_APP_SUPABASE_URL</code> e
            <code> REACT_APP_SUPABASE_ANON_KEY</code> nas variáveis de ambiente.
          </div>
        )}

        <form onSubmit={loginSenha}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email (ex: adm1@teste.com)" autoComplete="username"
            style={inputStyle} disabled={loading || !configured} required
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="senha" autoComplete="current-password"
            style={inputStyle} disabled={loading || !configured} required
          />
          <button
            type="submit" disabled={loading || !configured}
            style={{
              width: '100%', background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff',
              border: 'none', padding: '12px 18px', borderRadius: 0,
              cursor: (loading || !configured) ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, opacity: (loading || !configured) ? 0.6 : 1,
            }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#27272a' }} />
          <span style={{ fontSize: 11, color: '#52525b' }}>ou</span>
          <div style={{ flex: 1, height: 1, background: '#27272a' }} />
        </div>

        <button
          onClick={loginGoogle} disabled={loading || !configured}
          style={{
            width: '100%', background: '#fff', color: '#18181b', border: 'none',
            padding: '11px 18px', borderRadius: 0, cursor: (loading || !configured) ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            opacity: (loading || !configured) ? 0.6 : 1,
          }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? 'Redirecionando...' : 'Entrar com Google'}
        </button>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 16 }}>{error}</p>}

        <p style={{ color: '#3f3f46', fontSize: 11, marginTop: 28, lineHeight: 1.6 }}>
          A mineração de leads é feita pela extensão do Chrome no seu computador.
          Aqui você acompanha e gerencia os resultados — de qualquer dispositivo.
        </p>
      </div>
    </div>
  );
}
